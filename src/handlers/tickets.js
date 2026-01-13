const {
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");

const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");
const { baseEmbed, setActor } = require("./logEmbeds");

const OPEN_MODAL_ID = "tickets:openModal";
const CLOSE_MODAL_ID = "tickets:closeModal";
const REQUEST_CLOSE_MODAL_ID = "tickets:requestCloseModal";

const PANEL_BTN_ID = "tickets:create";
const REQUEST_CLOSE_BTN = "tickets:reqclose";
const CLAIM_BTN = "tickets:claim";
const CLOSE_BTN = "tickets:close";

function truthyEnv(v) {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().trim();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return null;
}

function safeSlug(input) {
  const s = String(input || "").trim().toLowerCase();
  const cleaned = s.replace(/[^a-z0-9-_ ]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  return cleaned.slice(0, 60);
}

function pad4(n) {
  return String(n).padStart(4, "0");
}

function ensureTickets(cfg) {
  const t = cfg.tickets && typeof cfg.tickets === "object" ? cfg.tickets : null;
  if (!t) return null;

  return {
    enabled: Boolean(t.enabled),
    categoryId: t.categoryId || null,
    staffRoleId: t.staffRoleId || null,
    logChannelId: t.logChannelId || null,
    namingMode: t.namingMode === "username" ? "username" : "number",
    allowMultiplePerUser: Boolean(t.allowMultiplePerUser),
    nextNumber: Number.isFinite(t.nextNumber) ? t.nextNumber : 1,
    byUser: t.byUser && typeof t.byUser === "object" ? t.byUser : {},
    byChannel: t.byChannel && typeof t.byChannel === "object" ? t.byChannel : {},
    panelChannelId: t.panelChannelId || null,
    panelMessageId: t.panelMessageId || null,
  };
}

function setTickets(guildId, next) {
  setGuildConfig(guildId, { tickets: next });
  return next;
}

function buildOpenModal() {
  const modal = new ModalBuilder().setCustomId(OPEN_MODAL_ID).setTitle("Create a Ticket");

  const nameInput = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Ticket name (optional)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(60)
    .setPlaceholder("e.g. billing-help or bug-report");

  const msgInput = new TextInputBuilder()
    .setCustomId("message")
    .setLabel("What do you need help with? (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(msgInput)
  );

  return modal;
}

function buildRequestCloseModal() {
  const modal = new ModalBuilder().setCustomId(REQUEST_CLOSE_MODAL_ID).setTitle("Request Ticket Closure");

  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Why should this ticket be closed?")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(800);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  return modal;
}

function buildStaffCloseModal() {
  const modal = new ModalBuilder().setCustomId(CLOSE_MODAL_ID).setTitle("Close Ticket (Staff)");

  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Reason for closing")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(800);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  return modal;
}

function ticketControlsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(REQUEST_CLOSE_BTN).setLabel("Request Close").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CLAIM_BTN).setLabel("Claim").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CLOSE_BTN).setLabel("Close (Staff)").setStyle(ButtonStyle.Danger)
  );
}

function isStaff(member, t) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (t.staffRoleId && member.roles?.cache?.has(t.staffRoleId)) return true;
  return false;
}

function getAllowMultiple(t) {
  const env = truthyEnv(process.env.TICKETS_ALLOW_MULTIPLE);
  if (typeof env === "boolean") return env;
  return Boolean(t.allowMultiplePerUser);
}

async function sendToTicketLog(client, guild, t, payload) {
  const channelId = t.logChannelId;
  if (!channelId) return;

  const channel =
    guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));

  if (!channel?.isTextBased?.()) return;

  const safe = typeof payload === "string" ? { content: payload, allowedMentions: { parse: [] } } : { ...payload, allowedMentions: { parse: [] } };
  await channel.send(safe).catch(() => null);
}

async function createTicketChannel(interaction, t, requestedName, firstMessage) {
  const guild = interaction.guild;
  const opener = interaction.user;

  const allowMultiple = getAllowMultiple(t);
  const existing = t.byUser[opener.id];

  if (!allowMultiple && existing) {
    const ch = guild.channels.cache.get(existing) || (await guild.channels.fetch(existing).catch(() => null));
    if (ch) return { ok: false, msg: `You already have an open ticket: <#${ch.id}>` };
  }

  const category =
    guild.channels.cache.get(t.categoryId) || (await guild.channels.fetch(t.categoryId).catch(() => null));

  if (!category || category.type !== ChannelType.GuildCategory) {
    return { ok: false, msg: "Ticket category not found. Ask an admin to re-run `/tickets setup`." };
  }

  const me = guild.members.me;
  if (!me) return { ok: false, msg: "Bot member not available." };

  const ticketId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  const baseName = requestedName ? safeSlug(requestedName) : "";
  let channelName = "";

  if (t.namingMode === "username") {
    channelName = baseName ? `ticket-${baseName}` : `ticket-${safeSlug(opener.username) || "user"}`;
  } else {
    const num = pad4(t.nextNumber);
    channelName = baseName ? `ticket-${num}-${baseName}` : `ticket-${num}`;
  }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: opener.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  if (t.staffRoleId) {
    overwrites.push({
      id: t.staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: channelName.slice(0, 90),
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    topic: `Ticket ${ticketId} • Opener: ${opener.id}`,
  });

  const next = { ...t };
  if (t.namingMode === "number") next.nextNumber = t.nextNumber + 1;

  if (!allowMultiple) next.byUser = { ...next.byUser, [opener.id]: channel.id };
  next.byChannel = {
    ...next.byChannel,
    [channel.id]: {
      ticketId,
      openerId: opener.id,
      createdAt: new Date().toISOString(),
      closeRequested: null,
      claimedBy: null,
    },
  };

  setTickets(guild.id, next);

  const intro = new EmbedBuilder()
    .setTitle("🎫 Ticket Created")
    .setDescription(
      [
        `Hello <@${opener.id}> — thanks for reaching out.`,
        "Describe your issue below and a staff member will respond.",
        "",
        t.staffRoleId ? `Staff: <@&${t.staffRoleId}>` : null,
        `Ticket ID: \`${ticketId}\``,
        firstMessage ? "" : null,
        firstMessage ? `**User note:**\n${firstMessage}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .setColor(0x57f287)
    .setTimestamp(new Date());

  await channel.send({ embeds: [intro], components: [ticketControlsRow()] }).catch(() => null);

  const log = baseEmbed("Ticket Created").setDescription(
    `Channel: <#${channel.id}>\nOpener: <@${opener.id}>\nTicket ID: \`${ticketId}\``
  );
  setActor(log, opener);
  await sendToTicketLog(interaction.client, guild, next, { embeds: [log] });

  return { ok: true, channelId: channel.id };
}

async function fetchTranscriptText(channel) {
  const lines = [];
  let lastId = null;
  let fetched = 0;
  const MAX = 1000;

  while (fetched < MAX) {
    const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;

    const arr = Array.from(batch.values());
    lastId = arr[arr.length - 1].id;
    fetched += arr.length;

    for (const m of arr) {
      const ts = m.createdAt ? m.createdAt.toISOString() : new Date().toISOString();
      const author = m.author ? `${m.author.tag} (${m.author.id})` : "Unknown";
      const content = m.content || "";
      const attachments = m.attachments?.size
        ? ` [attachments: ${Array.from(m.attachments.values()).map((a) => a.url).join(", ")}]`
        : "";
      lines.push(`[${ts}] ${author}: ${content}${attachments}`);
    }

    if (batch.size < 100) break;
  }

  lines.reverse();
  return lines.join("\n");
}

async function requestClose(client, interaction, t, meta) {
  if (interaction.user.id !== meta.openerId) {
    return interaction.reply({ content: "Only the ticket opener can request closure.", flags: 64 }).catch(() => null);
  }

  return interaction.showModal(buildRequestCloseModal()).catch(() => null);
}

async function claimTicket(client, interaction, t, meta) {
  const member = interaction.member;
  if (!isStaff(member, t)) {
    return interaction.reply({ content: "Only staff can claim tickets.", flags: 64 }).catch(() => null);
  }

  const next = { ...t };
  next.byChannel = { ...next.byChannel };
  next.byChannel[interaction.channelId] = { ...meta, claimedBy: interaction.user.id };
  setTickets(interaction.guildId, next);

  await interaction.reply({ content: `🧷 Ticket claimed by <@${interaction.user.id}>.`, flags: 64 }).catch(() => null);

  const log = baseEmbed("Ticket Claimed").setDescription(
    `Channel: <#${interaction.channelId}>\nClaimed by: <@${interaction.user.id}>\nTicket ID: \`${meta.ticketId}\``
  );
  setActor(log, interaction.user);
  await sendToTicketLog(client, interaction.guild, next, { embeds: [log] });
}

async function staffClose(client, interaction, t, meta) {
  const member = interaction.member;
  if (!isStaff(member, t)) {
    return interaction.reply({ content: "Only staff can close tickets.", flags: 64 }).catch(() => null);
  }

  return interaction.showModal(buildStaffCloseModal()).catch(() => null);
}

async function dmOpenerOnClose(client, guild, t, meta, reason, transcriptFile) {
  const user = await client.users.fetch(meta.openerId).catch(() => null);
  if (!user) return;

  const logsMention = t.logChannelId ? `<#${t.logChannelId}>` : "the ticket logs channel";

  const embed = new EmbedBuilder()
    .setTitle("🎫 Your ticket was closed")
    .setDescription(
      [
        `Server: **${guild.name}**`,
        `Ticket ID: \`${meta.ticketId}\``,
        "",
        `Reason: ${reason}`,
        "",
        `You can view ticket logs here: ${logsMention}`,
      ].join("\n")
    )
    .setColor(0x5865f2)
    .setTimestamp(new Date());

  await user.send({ embeds: [embed], files: transcriptFile ? [transcriptFile] : [] }).catch(() => null);
}

async function closeTicketFinal(client, interaction, t, meta, reason) {
  await interaction.deferReply({ flags: 64 }).catch(() => null);

  const channel = interaction.channel;
  const guild = interaction.guild;

  const transcriptText = await fetchTranscriptText(channel);
  const fileName = `ticket-${meta.ticketId}-transcript.txt`;
  const transcriptFile = new AttachmentBuilder(Buffer.from(transcriptText || "(no messages)", "utf8"), { name: fileName });

  const embed = baseEmbed("Ticket Closed").setDescription(
    [
      `Channel: #${channel.name} (\`${channel.id}\`)`,
      `Opener: <@${meta.openerId}>`,
      `Closed by: <@${interaction.user.id}>`,
      `Ticket ID: \`${meta.ticketId}\``,
      "",
      `Reason: ${reason}`,
    ].join("\n")
  );
  setActor(embed, interaction.user);

  await sendToTicketLog(client, guild, t, { embeds: [embed], files: [transcriptFile] });
  await dmOpenerOnClose(client, guild, t, meta, reason, transcriptFile);

  const allowMultiple = getAllowMultiple(t);

  const next = { ...t };
  next.byChannel = { ...next.byChannel };
  delete next.byChannel[channel.id];

  if (!allowMultiple) {
    next.byUser = { ...next.byUser };
    if (next.byUser[meta.openerId] === channel.id) delete next.byUser[meta.openerId];
  }

  setTickets(guild.id, next);

  await interaction.editReply("✅ Ticket closed.").catch(() => null);
  await channel.delete().catch(() => null);
}

async function handleTicketButton(client, interaction) {
  if (!interaction.inGuild()) return;

  const cfg = getGuildConfig(interaction.guildId);
  const t = ensureTickets(cfg);
  if (!t?.enabled) return;

  if (interaction.customId === PANEL_BTN_ID) return interaction.showModal(buildOpenModal()).catch(() => null);

  const meta = t.byChannel[interaction.channelId];
  if (!meta) {
    return interaction.reply({ content: "This doesn’t look like a ticket channel.", flags: 64 }).catch(() => null);
  }

  if (interaction.customId === REQUEST_CLOSE_BTN) return requestClose(client, interaction, t, meta);
  if (interaction.customId === CLAIM_BTN) return claimTicket(client, interaction, t, meta);
  if (interaction.customId === CLOSE_BTN) return staffClose(client, interaction, t, meta);
}

async function handleTicketModal(client, interaction) {
  if (!interaction.inGuild()) return;

  const cfg = getGuildConfig(interaction.guildId);
  const t = ensureTickets(cfg);
  if (!t?.enabled) return;

  if (interaction.customId === OPEN_MODAL_ID) {
    const requestedName = interaction.fields.getTextInputValue("title") || "";
    const firstMessage = interaction.fields.getTextInputValue("message") || "";

    await interaction.deferReply({ flags: 64 }).catch(() => null);
    const res = await createTicketChannel(interaction, t, requestedName, firstMessage);
    if (!res.ok) return interaction.editReply(res.msg).catch(() => null);
    return interaction.editReply(`✅ Ticket created: <#${res.channelId}>`).catch(() => null);
  }

  const meta = t.byChannel[interaction.channelId];
  if (!meta) {
    return interaction.reply({ content: "This doesn’t look like a ticket channel.", flags: 64 }).catch(() => null);
  }

  if (interaction.customId === REQUEST_CLOSE_MODAL_ID) {
    const reason = interaction.fields.getTextInputValue("reason") || "No reason provided";

    if (interaction.user.id !== meta.openerId) {
      return interaction.reply({ content: "Only the ticket opener can request closure.", flags: 64 }).catch(() => null);
    }

    const next = { ...t };
    next.byChannel = { ...next.byChannel };
    next.byChannel[interaction.channelId] = {
      ...meta,
      closeRequested: { by: interaction.user.id, reason, at: new Date().toISOString() },
    };
    setTickets(interaction.guildId, next);

    const ping = t.staffRoleId ? `<@&${t.staffRoleId}>` : "";
    await interaction.channel.send(
      [
        `📌 Close requested by <@${interaction.user.id}>.`,
        `Reason: ${reason}`,
        ping ? `Staff: ${ping} (please review and close if appropriate)` : "Staff: please review and close if appropriate",
      ].join("\n")
    ).catch(() => null);

    const log = baseEmbed("Ticket Close Requested").setDescription(
      `Channel: <#${interaction.channelId}>\nRequested by: <@${interaction.user.id}>\nTicket ID: \`${meta.ticketId}\`\nReason: ${reason}`
    );
    setActor(log, interaction.user);
    await sendToTicketLog(client, interaction.guild, next, { embeds: [log] });

    return interaction.reply({ content: "✅ Close request sent to staff.", flags: 64 }).catch(() => null);
  }

  if (interaction.customId === CLOSE_MODAL_ID) {
    const member = interaction.member;
    if (!isStaff(member, t)) {
      return interaction.reply({ content: "Only staff can close tickets.", flags: 64 }).catch(() => null);
    }

    const reason = interaction.fields.getTextInputValue("reason") || "No reason provided";
    return closeTicketFinal(client, interaction, t, meta, reason);
  }
}

module.exports = {
  handleTicketButton,
  handleTicketModal,
};
