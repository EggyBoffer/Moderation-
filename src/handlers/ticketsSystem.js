const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require("discord.js");

const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");
const { replyEphemeral } = require("./interactionReply");

const ID_CREATE = "tickets:create";
const ID_CLAIM = "tickets:claim";
const ID_UNCLAIM = "tickets:unclaim";
const ID_REQUEST_CLOSE = "tickets:request_close";
const ID_CLOSE = "tickets:close";
const ID_ESCALATE = "tickets:escalate";
const ID_ESC_ACCEPT_PREFIX = "tickets:esc_accept:";
const MODAL_CREATE = "tickets:create_modal";
const MODAL_CLOSE = "tickets:close_modal";

function nowIso() {
  return new Date().toISOString();
}

function truthy(v) {
  if (typeof v !== "string") return false;
  return ["1", "true", "yes", "y", "on"].includes(v.toLowerCase().trim());
}

function getTicketsCfg(guildId) {
  const cfg = getGuildConfig(guildId);
  const t = cfg.tickets || {};
  return { cfg, t };
}

function canManageTickets(member) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  return false;
}

function isSupportStaff(member, t) {
  if (!member || !t?.staffRoleId) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;
  return member.roles?.cache?.has?.(t.staffRoleId);
}

function isEscalationManager(member, t) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;
  if (t?.escalationManagerRoleId && member.roles?.cache?.has?.(t.escalationManagerRoleId)) return true;
  return false;
}

function hasEscalationConfigured(t) {
  return Boolean(t?.escalationRoleId && t?.escalatedCategoryId);
}

function fmtTicketName(guild, user, t, customName) {
  const safeCustom = String(customName || "").trim().slice(0, 60);
  if (safeCustom) return safeCustom.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "").slice(0, 60);

  const mode = t?.namingMode || "number";
  if (mode === "username") {
    const uname = String(user?.username || "user").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "").slice(0, 24);
    return `ticket-${uname || "user"}`;
  }

  const n = Number.isFinite(t?.nextNumber) ? t.nextNumber : 1;
  const padded = String(n).padStart(4, "0");
  return `ticket-${padded}`;
}

function buildControls(t, ticketState, escalatedByTag) {
  const claimedById = ticketState?.claimedById || null;
  const escalatedById = ticketState?.escalatedById || null;

  const claimLabel = claimedById ? `Claimed` : "Claim";
  const claimStyle = claimedById ? ButtonStyle.Secondary : ButtonStyle.Primary;

  const escalateVisible = hasEscalationConfigured(t);
  const escalated = Boolean(escalatedById);

  const escalateBtn = new ButtonBuilder()
    .setCustomId(ID_ESCALATE)
    .setStyle(escalated ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setLabel(escalated ? `Escalated by ${escalatedByTag || "staff"}` : "Escalate");

  if (!escalateVisible) escalateBtn.setDisabled(true);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(ID_CLAIM).setStyle(claimStyle).setLabel(claimLabel),
    new ButtonBuilder().setCustomId(ID_UNCLAIM).setStyle(ButtonStyle.Secondary).setLabel("Unclaim"),
    escalateBtn
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(ID_REQUEST_CLOSE).setStyle(ButtonStyle.Secondary).setLabel("Request Close"),
    new ButtonBuilder().setCustomId(ID_CLOSE).setStyle(ButtonStyle.Danger).setLabel("Close (Staff)")
  );

  return [row1, row2];
}

function buildTicketOpenEmbed(guild, user, ticketName) {
  return new EmbedBuilder()
    .setTitle("Support Ticket")
    .setDescription(`Ticket: **${ticketName}**\nUser: <@${user.id}>`)
    .setColor(0x5865f2)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ size: 128 }) || undefined })
    .setTimestamp(new Date());
}

async function sendTicketLog(client, guildId, t, payload) {
  const channelId = t?.logChannelId;
  if (!channelId) return null;

  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));

  if (!channel?.isTextBased?.()) return null;

  try {
    return await channel.send({ ...payload, allowedMentions: { parse: [] } });
  } catch {
    return null;
  }
}

async function fetchTranscript(channel) {
  const lines = [];
  let lastId = null;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;

    const arr = Array.from(batch.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    for (const m of arr) {
      const ts = new Date(m.createdTimestamp).toISOString();
      const author = m.author ? `${m.author.tag}` : "Unknown";
      const content = (m.content || "").replace(/\r?\n/g, " ").trim();
      const att = m.attachments?.size ? ` attachments:${m.attachments.size}` : "";
      lines.push(`[${ts}] ${author}: ${content}${att}`);
    }

    lastId = arr[0]?.id;
    if (batch.size < 100) break;
  }

  const text = lines.join("\n").slice(0, 1900000);
  return Buffer.from(text || "Transcript unavailable.", "utf8");
}

function addSupportMember(ticketState, userId) {
  const ids = Array.isArray(ticketState.supportIds) ? ticketState.supportIds : [];
  if (!ids.includes(userId)) ids.push(userId);
  ticketState.supportIds = ids;
}

async function applyEscalation(guild, channel, t) {
  const staffRoleId = t.staffRoleId;
  const escalationRoleId = t.escalationRoleId;

  const overwrites = channel.permissionOverwrites;

  if (staffRoleId) {
    await overwrites.edit(staffRoleId, { ViewChannel: false }).catch(() => null);
  }
  if (escalationRoleId) {
    await overwrites.edit(escalationRoleId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => null);
  }

  if (t.escalatedCategoryId && channel.parentId !== t.escalatedCategoryId) {
    await channel.setParent(t.escalatedCategoryId, { lockPermissions: false }).catch(() => null);
  }
}

async function handleCreate(interaction, client) {
  if (!interaction.inGuild()) return;

  const { t } = getTicketsCfg(interaction.guildId);
  if (!t?.enabled || !t.categoryId || !t.staffRoleId || !t.logChannelId) {
    return interaction.reply({ content: "Tickets aren’t configured on this server.", ephemeral: true });
  }

  const modal = new ModalBuilder().setCustomId(MODAL_CREATE).setTitle("Create Ticket");
  const nameInput = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("Ticket name (optional)")
    .setPlaceholder("e.g. login-issue")
    .setRequired(false)
    .setStyle(TextInputStyle.Short);

  modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
  return interaction.showModal(modal);
}

async function handleCreateModal(interaction, client) {
  if (!interaction.inGuild()) return;

  const { cfg, t } = getTicketsCfg(interaction.guildId);
  if (!t?.enabled || !t.categoryId || !t.staffRoleId || !t.logChannelId) {
    return interaction.reply({ content: "Tickets aren’t configured on this server.", ephemeral: true });
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return interaction.reply({ content: "Couldn’t fetch your member record.", ephemeral: true });

  const envMulti = truthy(process.env.TICKETS_ALLOW_MULTIPLE);
  const allowMultiResolved = typeof envMulti === "boolean" ? envMulti : Boolean(t.allowMultiplePerUser);

  const byUser = t.byUser || {};
  const existing = byUser[interaction.user.id];
  if (!allowMultiResolved && existing?.channelId) {
    const ch = interaction.guild.channels.cache.get(existing.channelId) || (await interaction.guild.channels.fetch(existing.channelId).catch(() => null));
    if (ch) return interaction.reply({ content: `You already have an open ticket: <#${ch.id}>`, ephemeral: true });
  }

  const customName = interaction.fields.getTextInputValue("name");
  const ticketName = fmtTicketName(interaction.guild, interaction.user, t, customName);

  const category = interaction.guild.channels.cache.get(t.categoryId) || (await interaction.guild.channels.fetch(t.categoryId).catch(() => null));
  if (!category || category.type !== ChannelType.GuildCategory) {
    return interaction.reply({ content: "Ticket category no longer exists.", ephemeral: true });
  }

  const staffRoleId = t.staffRoleId;

  const me = interaction.guild.members.me;
  if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({ content: "I need Manage Channels to create ticket channels.", ephemeral: true });
  }

  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
    { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];

  const channel = await interaction.guild.channels
    .create({
      name: ticketName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
    })
    .catch(() => null);

  if (!channel) return interaction.reply({ content: "Failed to create ticket channel.", ephemeral: true });

  const nextTickets = { ...(cfg.tickets || {}) };
  const nextNumber = Number.isFinite(nextTickets.nextNumber) ? nextTickets.nextNumber : 1;

  const ticketState = {
    channelId: channel.id,
    userId: interaction.user.id,
    createdAt: nowIso(),
    name: ticketName,
    claimedById: null,
    supportIds: [],
    closeRequestedById: null,
    escalatedById: null,
    escalatedAt: null,
    escalationAcceptedById: null,
  };

  if ((t.namingMode || "number") === "number" && !String(customName || "").trim()) {
    nextTickets.nextNumber = nextNumber + 1;
  }

  nextTickets.byUser = { ...(nextTickets.byUser || {}), [interaction.user.id]: { channelId: channel.id } };
  nextTickets.byChannel = { ...(nextTickets.byChannel || {}), [channel.id]: ticketState };

  setGuildConfig(interaction.guildId, { tickets: nextTickets });

  const openEmbed = buildTicketOpenEmbed(interaction.guild, interaction.user, ticketName);
  const controls = buildControls(t, ticketState, null);

  const controlMsg = await channel.send({ embeds: [openEmbed], components: controls }).catch(() => null);
  if (controlMsg) {
    const refreshed = getGuildConfig(interaction.guildId).tickets || nextTickets;
    const st = (refreshed.byChannel || {})[channel.id] || ticketState;
    st.controlMessageId = controlMsg.id;
    refreshed.byChannel = { ...(refreshed.byChannel || {}), [channel.id]: st };
    setGuildConfig(interaction.guildId, { tickets: refreshed });
  }

  await channel.send({ content: `<@${interaction.user.id}> Thanks! A support member will be with you shortly.`, allowedMentions: { users: [interaction.user.id] } }).catch(() => null);

  await sendTicketLog(client, interaction.guildId, t, {
    embeds: [
      new EmbedBuilder()
        .setTitle("Ticket Opened")
        .setDescription(`User: <@${interaction.user.id}>\nChannel: <#${channel.id}>\nName: **${ticketName}**`)
        .setColor(0x5865f2)
        .setTimestamp(new Date()),
    ],
  });

  return interaction.reply({ content: `✅ Ticket created: <#${channel.id}>`, ephemeral: true });
}

async function updateControlsMessage(guild, t, ticketState, escalatedByTag) {
  const channel =
    guild.channels.cache.get(ticketState.channelId) ||
    (await guild.channels.fetch(ticketState.channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return;

  const msgId = ticketState.controlMessageId;
  if (!msgId) return;

  const msg = await channel.messages.fetch(msgId).catch(() => null);
  if (!msg) return;

  const rows = buildControls(t, ticketState, escalatedByTag);
  await msg.edit({ components: rows }).catch(() => null);
}

async function handleClaim(interaction, client) {
  if (!interaction.inGuild()) return;

  const { cfg, t } = getTicketsCfg(interaction.guildId);
  if (!t?.enabled) return interaction.reply({ content: "Tickets aren’t enabled.", ephemeral: true });

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isSupportStaff(member, t)) return interaction.reply({ content: "Only support staff can do that.", ephemeral: true });

  const st = (t.byChannel || {})[interaction.channelId];
  if (!st) return interaction.reply({ content: "This channel isn’t a ticket.", ephemeral: true });

  if (st.claimedById) {
    return interaction.reply({ content: "Ticket already claimed.", ephemeral: true });
  }

  st.claimedById = interaction.user.id;
  addSupportMember(st, interaction.user.id);

  const nextTickets = { ...t, byChannel: { ...(t.byChannel || {}), [interaction.channelId]: st } };
  setGuildConfig(interaction.guildId, { tickets: nextTickets });

  await interaction.channel.send({ content: `✅ Ticket claimed by <@${interaction.user.id}>`, allowedMentions: { users: [interaction.user.id] } }).catch(() => null);

  await updateControlsMessage(interaction.guild, t, st, null);

  await sendTicketLog(client, interaction.guildId, t, {
    embeds: [
      new EmbedBuilder()
        .setTitle("Ticket Claimed")
        .setDescription(`Staff: <@${interaction.user.id}>\nChannel: <#${interaction.channelId}>`)
        .setColor(0x57f287)
        .setTimestamp(new Date()),
    ],
  });

  return interaction.reply({ content: "✅ Claimed.", ephemeral: true });
}

async function handleUnclaim(interaction, client) {
  if (!interaction.inGuild()) return;

  const { t } = getTicketsCfg(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isSupportStaff(member, t)) return interaction.reply({ content: "Only support staff can do that.", ephemeral: true });

  const st = (t.byChannel || {})[interaction.channelId];
  if (!st) return interaction.reply({ content: "This channel isn’t a ticket.", ephemeral: true });

  if (!st.claimedById) return interaction.reply({ content: "Ticket isn’t claimed.", ephemeral: true });
  if (st.claimedById !== interaction.user.id && !member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: "Only the claimer (or server manager) can unclaim.", ephemeral: true });
  }

  st.claimedById = null;

  setGuildConfig(interaction.guildId, {
    tickets: { ...t, byChannel: { ...(t.byChannel || {}), [interaction.channelId]: st } },
  });

  await interaction.channel.send({ content: `ℹ️ Ticket unclaimed by <@${interaction.user.id}>`, allowedMentions: { users: [interaction.user.id] } }).catch(() => null);

  await updateControlsMessage(interaction.guild, t, st, null);

  return interaction.reply({ content: "✅ Unclaimed.", ephemeral: true });
}

async function handleRequestClose(interaction) {
  if (!interaction.inGuild()) return;

  const { t } = getTicketsCfg(interaction.guildId);
  const st = (t.byChannel || {})[interaction.channelId];
  if (!st) return interaction.reply({ content: "This channel isn’t a ticket.", ephemeral: true });

  if (interaction.user.id !== st.userId) return interaction.reply({ content: "Only the ticket owner can request close.", ephemeral: true });

  st.closeRequestedById = interaction.user.id;

  setGuildConfig(interaction.guildId, {
    tickets: { ...t, byChannel: { ...(t.byChannel || {}), [interaction.channelId]: st } },
  });

  await interaction.channel.send({ content: `🔒 Close requested by <@${interaction.user.id}>. Staff must confirm.`, allowedMentions: { users: [interaction.user.id] } }).catch(() => null);
  return interaction.reply({ content: "✅ Close requested.", ephemeral: true });
}

async function handleClose(interaction) {
  if (!interaction.inGuild()) return;

  const { t } = getTicketsCfg(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isSupportStaff(member, t)) return interaction.reply({ content: "Only support staff can close tickets.", ephemeral: true });

  const st = (t.byChannel || {})[interaction.channelId];
  if (!st) return interaction.reply({ content: "This channel isn’t a ticket.", ephemeral: true });

  const modal = new ModalBuilder().setCustomId(MODAL_CLOSE).setTitle("Close Ticket");
  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Reason for closing")
    .setRequired(true)
    .setStyle(TextInputStyle.Paragraph);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  return interaction.showModal(modal);
}

async function closeTicketCore({ client, guild, channel, t, st, closerId, reason, silent, forceClose }) {
  const userId = st.userId;
  const user = await client.users.fetch(userId).catch(() => null);

  const transcriptBuf = await fetchTranscript(channel).catch(() => null);
  const transcriptFile = transcriptBuf ? new AttachmentBuilder(transcriptBuf, { name: `ticket-${channel.id}.txt` }) : null;

  const supportIds = Array.isArray(st.supportIds) ? st.supportIds : [];
  const claimedById = st.claimedById || null;
  if (claimedById && !supportIds.includes(claimedById)) supportIds.push(claimedById);
  if (closerId && !supportIds.includes(closerId)) supportIds.push(closerId);

  const isEscalated = Boolean(st.escalatedById);

  if (!silent && user) {
    const supportMentions = supportIds.length ? supportIds.map((id) => `<@${id}>`).join(", ") : "Support team";
    const body = isEscalated
      ? `Your escalated ticket has been completed by <@${closerId}>.\nSupported by: ${supportMentions}\nReason: ${reason}`
      : `Your ticket has been closed by <@${closerId}>.\nSupported by: ${supportMentions}\nReason: ${reason}`;

    await user.send({ content: body, files: transcriptFile ? [transcriptFile] : [] }).catch(() => null);
  }

  const logTitle = forceClose ? "Ticket Force Closed" : "Ticket Closed";
  const logColor = forceClose ? 0xed4245 : 0x5865f2;

  const logEmbed = new EmbedBuilder()
    .setTitle(logTitle)
    .setDescription(
      `User: <@${userId}>\nChannel: #${channel.name}\nCloser: <@${closerId}>\nReason: ${reason}\nEscalated: ${isEscalated ? "✅" : "❌"}`
    )
    .setColor(logColor)
    .setTimestamp(new Date());

  await sendTicketLog(client, guild.id, t, {
    embeds: [logEmbed],
    files: transcriptFile ? [transcriptFile] : [],
  });

  const nextByChannel = { ...(t.byChannel || {}) };
  const nextByUser = { ...(t.byUser || {}) };
  delete nextByChannel[channel.id];
  if (nextByUser[userId]?.channelId === channel.id) delete nextByUser[userId];

  setGuildConfig(guild.id, {
    tickets: {
      ...t,
      byChannel: nextByChannel,
      byUser: nextByUser,
    },
  });

  await channel.delete().catch(() => null);
}

async function handleCloseModal(interaction, client) {
  if (!interaction.inGuild()) return;

  const { t } = getTicketsCfg(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isSupportStaff(member, t)) return interaction.reply({ content: "Only support staff can close tickets.", ephemeral: true });

  const st = (t.byChannel || {})[interaction.channelId];
  if (!st) return interaction.reply({ content: "This channel isn’t a ticket.", ephemeral: true });

  const reason = String(interaction.fields.getTextInputValue("reason") || "").trim().slice(0, 1500);
  if (!reason) return interaction.reply({ content: "Reason required.", ephemeral: true });

  await interaction.reply({ content: "✅ Closing ticket...", ephemeral: true });

  const channel = interaction.channel;
  await closeTicketCore({
    client,
    guild: interaction.guild,
    channel,
    t,
    st,
    closerId: interaction.user.id,
    reason,
    silent: false,
    forceClose: false,
  });
}

async function handleEscalate(interaction, client) {
  if (!interaction.inGuild()) return;

  const { t } = getTicketsCfg(interaction.guildId);
  if (!t?.enabled) return interaction.reply({ content: "Tickets aren’t enabled.", ephemeral: true });

  if (!hasEscalationConfigured(t)) {
    return interaction.reply({ content: "Escalation isn’t configured on this server.", ephemeral: true });
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isSupportStaff(member, t)) return interaction.reply({ content: "Only support staff can escalate tickets.", ephemeral: true });

  const st = (t.byChannel || {})[interaction.channelId];
  if (!st) return interaction.reply({ content: "This channel isn’t a ticket.", ephemeral: true });

  if (st.escalatedById) {
    return interaction.reply({ content: "Ticket already escalated.", ephemeral: true });
  }

  st.escalatedById = interaction.user.id;
  st.escalatedAt = nowIso();
  addSupportMember(st, interaction.user.id);

  setGuildConfig(interaction.guildId, {
    tickets: { ...t, byChannel: { ...(t.byChannel || {}), [interaction.channelId]: st } },
  });

  const mode = t.escalationMode || "automatic";

  if (mode === "automatic") {
    await applyEscalation(interaction.guild, interaction.channel, t);
    await interaction.channel.send({ content: `🟢 Ticket escalated by <@${interaction.user.id}>`, allowedMentions: { users: [interaction.user.id] } }).catch(() => null);
    await updateControlsMessage(interaction.guild, t, st, interaction.user.tag);
    await sendTicketLog(client, interaction.guildId, t, {
      embeds: [
        new EmbedBuilder()
          .setTitle("Ticket Escalated (Automatic)")
          .setDescription(`By: <@${interaction.user.id}>\nChannel: <#${interaction.channelId}>`)
          .setColor(0x57f287)
          .setTimestamp(new Date()),
      ],
    });
    return interaction.reply({ content: "✅ Escalated.", ephemeral: true });
  }

  const mgrRoleId = t.escalationManagerRoleId;
  if (!mgrRoleId) {
    await interaction.channel.send({ content: `🟡 Escalation requested by <@${interaction.user.id}> (no manager role set)`, allowedMentions: { users: [interaction.user.id] } }).catch(() => null);
    await updateControlsMessage(interaction.guild, t, st, interaction.user.tag);
    return interaction.reply({ content: "✅ Escalation requested.", ephemeral: true });
  }

  const acceptId = `${ID_ESC_ACCEPT_PREFIX}${interaction.channelId}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(acceptId).setStyle(ButtonStyle.Success).setLabel("Accept Escalation")
  );

  await sendTicketLog(client, interaction.guildId, t, {
    content: `<@&${mgrRoleId}> Manual escalation requested by <@${interaction.user.id}> for <#${interaction.channelId}>`,
    components: [row],
  });

  await interaction.channel.send({ content: `🟡 Escalation requested by <@${interaction.user.id}>. Waiting for acceptance.`, allowedMentions: { users: [interaction.user.id] } }).catch(() => null);
  await updateControlsMessage(interaction.guild, t, st, interaction.user.tag);

  return interaction.reply({ content: "✅ Escalation requested.", ephemeral: true });
}

async function handleEscalationAccept(interaction, client, targetChannelId) {
  if (!interaction.inGuild()) return;

  const { t } = getTicketsCfg(interaction.guildId);
  if (!t?.enabled) return interaction.reply({ content: "Tickets aren’t enabled.", ephemeral: true });

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isEscalationManager(member, t)) return interaction.reply({ content: "You can’t accept escalations.", ephemeral: true });

  const st = (t.byChannel || {})[targetChannelId];
  if (!st) return interaction.reply({ content: "That ticket no longer exists.", ephemeral: true });

  if (st.escalationAcceptedById) {
    return interaction.reply({ content: "Escalation already accepted.", ephemeral: true });
  }

  const channel =
    interaction.guild.channels.cache.get(targetChannelId) ||
    (await interaction.guild.channels.fetch(targetChannelId).catch(() => null));
  if (!channel?.isTextBased?.()) return interaction.reply({ content: "Ticket channel not found.", ephemeral: true });

  st.escalationAcceptedById = interaction.user.id;
  addSupportMember(st, interaction.user.id);

  setGuildConfig(interaction.guildId, {
    tickets: { ...t, byChannel: { ...(t.byChannel || {}), [targetChannelId]: st } },
  });

  await applyEscalation(interaction.guild, channel, t);

  await channel.send({ content: `🟢 Escalation accepted by <@${interaction.user.id}>.`, allowedMentions: { users: [interaction.user.id] } }).catch(() => null);
  await updateControlsMessage(interaction.guild, t, st, null);

  try {
    const msg = interaction.message;
    if (msg?.edit) {
      await msg.edit({ components: [] }).catch(() => null);
    }
  } catch {}

  return interaction.reply({ content: "✅ Escalation accepted.", ephemeral: true });
}

async function forceClose(interaction, client, reason) {
  if (!interaction.inGuild()) return;

  const { t } = getTicketsCfg(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!isSupportStaff(member, t)) return replyEphemeral(interaction, "Only support staff can do that.");

  const channel = interaction.channel;
  const st = (t.byChannel || {})[channel.id];
  if (!st) return replyEphemeral(interaction, "This channel isn’t a ticket.");

  await replyEphemeral(interaction, "✅ Force closing ticket...");

  await closeTicketCore({
    client,
    guild: interaction.guild,
    channel,
    t,
    st,
    closerId: interaction.user.id,
    reason: reason || "Force closed.",
    silent: true,
    forceClose: true,
  });
}

async function handleTicketInteraction(client, interaction) {
  if (interaction.isButton()) {
    const id = interaction.customId || "";

    if (id === ID_CREATE) return handleCreate(interaction, client);
    if (id === ID_CLAIM) return handleClaim(interaction, client);
    if (id === ID_UNCLAIM) return handleUnclaim(interaction, client);
    if (id === ID_REQUEST_CLOSE) return handleRequestClose(interaction, client);
    if (id === ID_CLOSE) return handleClose(interaction, client);
    if (id === ID_ESCALATE) return handleEscalate(interaction, client);

    if (id.startsWith(ID_ESC_ACCEPT_PREFIX)) {
      const targetChannelId = id.slice(ID_ESC_ACCEPT_PREFIX.length);
      if (!targetChannelId) return interaction.reply({ content: "Malformed escalation accept.", ephemeral: true });
      return handleEscalationAccept(interaction, client, targetChannelId);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === MODAL_CREATE) return handleCreateModal(interaction, client);
    if (interaction.customId === MODAL_CLOSE) return handleCloseModal(interaction, client);
  }

  return false;
}

module.exports = { handleTicketInteraction, forceClose };
