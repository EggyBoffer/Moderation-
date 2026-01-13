const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { getGuildConfig } = require("../storage/guildConfig");
const { getBotMeta } = require("../storage/botMeta");

function yn(v) {
  return v ? "✅ Yes" : "❌ No";
}

function fmtId(label, id) {
  return id ? `${label}: \`${id}\`` : `${label}: (not set)`;
}

async function fetchChannel(guild, id) {
  if (!id) return null;
  return guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
}

async function fetchRole(guild, id) {
  if (!id) return null;
  return guild.roles.cache.get(id) || (await guild.roles.fetch(id).catch(() => null));
}

function channelPermsSummary(channel, me) {
  const perms = channel.permissionsFor(me);
  if (!perms) return { view: false, send: false, embed: false, attach: false, history: false, manage: false };
  return {
    view: perms.has(PermissionFlagsBits.ViewChannel),
    send: perms.has(PermissionFlagsBits.SendMessages),
    embed: perms.has(PermissionFlagsBits.EmbedLinks),
    attach: perms.has(PermissionFlagsBits.AttachFiles),
    history: perms.has(PermissionFlagsBits.ReadMessageHistory),
    manage: perms.has(PermissionFlagsBits.ManageChannels),
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("diagnose")
    .setDescription("Check Moderation+ configuration and permissions for this server."),

  async execute(interaction, client) {
    try {
      if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this in a server.");

      await deferEphemeral(interaction);

      const meta = getBotMeta();
      const cfg = getGuildConfig(interaction.guildId);
      const guild = interaction.guild;

      const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
      if (!me) return interaction.editReply("I couldn't fetch my member record in this server.");

      const botPerms = me.permissions;

      const checks = [];

      const admin = botPerms.has(PermissionFlagsBits.Administrator);
      const manageGuild = botPerms.has(PermissionFlagsBits.ManageGuild);
      const manageRoles = botPerms.has(PermissionFlagsBits.ManageRoles);
      const manageChannels = botPerms.has(PermissionFlagsBits.ManageChannels);
      const viewAudit = botPerms.has(PermissionFlagsBits.ViewAuditLog);
      const sendMessages = botPerms.has(PermissionFlagsBits.SendMessages);
      const embedLinks = botPerms.has(PermissionFlagsBits.EmbedLinks);
      const readHistory = botPerms.has(PermissionFlagsBits.ReadMessageHistory);

      const logChannelId = cfg.logChannelId || null;
      const welcomeChannelId = cfg.welcomeChannelId || null;

      const tickets = cfg.tickets && typeof cfg.tickets === "object" ? cfg.tickets : null;
      const ticketsEnabled = Boolean(tickets?.enabled);
      const ticketsCategoryId = tickets?.categoryId || null;
      const ticketsLogId = tickets?.logChannelId || null;
      const ticketsStaffRoleId = tickets?.staffRoleId || null;

      const countsCategoryId = cfg.countsCategoryId || null;

      const logChannel = await fetchChannel(guild, logChannelId);
      const welcomeChannel = await fetchChannel(guild, welcomeChannelId);
      const ticketsCategory = await fetchChannel(guild, ticketsCategoryId);
      const ticketsLogChannel = await fetchChannel(guild, ticketsLogId);
      const ticketsStaffRole = await fetchRole(guild, ticketsStaffRoleId);
      const countsCategory = await fetchChannel(guild, countsCategoryId);

      const topRoleOk = (() => {
        const top = me.roles?.highest;
        if (!top) return false;
        return true;
      })();

      checks.push({
        name: "Core Permissions",
        value: [
          `Administrator: ${yn(admin)}`,
          `Manage Server: ${yn(manageGuild)}`,
          `Manage Roles: ${yn(manageRoles)}`,
          `Manage Channels: ${yn(manageChannels)}`,
          `View Audit Log: ${yn(viewAudit)}`,
          `Send Messages: ${yn(sendMessages)}`,
          `Embed Links: ${yn(embedLinks)}`,
          `Read Message History: ${yn(readHistory)}`,
          `Has a top role: ${yn(topRoleOk)}`,
        ].join("\n"),
      });

      checks.push({
        name: "Configured IDs",
        value: [
          fmtId("Log Channel", logChannelId),
          fmtId("Welcome Channel", welcomeChannelId),
          fmtId("Stat Counts Category", countsCategoryId),
          fmtId("Tickets Enabled", ticketsEnabled ? "true" : null),
          ticketsEnabled ? fmtId("Tickets Category", ticketsCategoryId) : null,
          ticketsEnabled ? fmtId("Tickets Log Channel", ticketsLogId) : null,
          ticketsEnabled ? fmtId("Tickets Staff Role", ticketsStaffRoleId) : null,
        ].filter(Boolean).join("\n"),
      });

      if (logChannelId) {
        const exists = Boolean(logChannel);
        const typeOk = logChannel?.isTextBased?.() && !logChannel?.isDMBased?.();
        const perms = logChannel && channelPermsSummary(logChannel, me);
        checks.push({
          name: "Moderation Logs",
          value: [
            `Channel exists: ${yn(exists)}`,
            `Text channel: ${yn(Boolean(typeOk))}`,
            logChannel && perms
              ? `Can view/send/embed: ${yn(perms.view)} / ${yn(perms.send)} / ${yn(perms.embed)}`
              : null,
          ].filter(Boolean).join("\n"),
        });
      }

      if (welcomeChannelId) {
        const exists = Boolean(welcomeChannel);
        const typeOk = welcomeChannel?.isTextBased?.() && !welcomeChannel?.isDMBased?.();
        const perms = welcomeChannel && channelPermsSummary(welcomeChannel, me);
        checks.push({
          name: "Welcome System",
          value: [
            `Channel exists: ${yn(exists)}`,
            `Text channel: ${yn(Boolean(typeOk))}`,
            welcomeChannel && perms
              ? `Can view/send/embed: ${yn(perms.view)} / ${yn(perms.send)} / ${yn(perms.embed)}`
              : null,
          ].filter(Boolean).join("\n"),
        });
      }

      if (countsCategoryId) {
        const exists = Boolean(countsCategory);
        const typeOk = countsCategory?.type === ChannelType.GuildCategory;
        checks.push({
          name: "Stat Counts",
          value: [
            `Category exists: ${yn(exists)}`,
            `Is category: ${yn(Boolean(typeOk))}`,
            `Manage Channels needed: ${yn(manageChannels || admin)}`,
          ].join("\n"),
        });
      }

      if (ticketsEnabled) {
        const catExists = Boolean(ticketsCategory);
        const catOk = ticketsCategory?.type === ChannelType.GuildCategory;
        const logExists = Boolean(ticketsLogChannel);
        const logOk = ticketsLogChannel?.isTextBased?.() && !ticketsLogChannel?.isDMBased?.();
        const staffRoleExists = Boolean(ticketsStaffRole);

        const tLogPerms = ticketsLogChannel && channelPermsSummary(ticketsLogChannel, me);

        checks.push({
          name: "Tickets",
          value: [
            `Category exists: ${yn(catExists)}`,
            `Is category: ${yn(Boolean(catOk))}`,
            `Log channel exists: ${yn(logExists)}`,
            `Log is text: ${yn(Boolean(logOk))}`,
            tLogPerms
              ? `Ticket log perms view/send/embed/attach: ${yn(tLogPerms.view)} / ${yn(tLogPerms.send)} / ${yn(tLogPerms.embed)} / ${yn(tLogPerms.attach)}`
              : null,
            `Staff role exists: ${yn(staffRoleExists)}`,
            `Manage Channels needed: ${yn(manageChannels || admin)}`,
            `Read History needed (transcripts): ${yn(readHistory || admin)}`,
          ].filter(Boolean).join("\n"),
        });
      }

      const warnings = [];
      if (logChannelId && (!logChannel || !logChannel?.isTextBased?.())) warnings.push("Log channel is set but missing/invalid.");
      if (ticketsEnabled) {
        if (!ticketsCategory || ticketsCategory?.type !== ChannelType.GuildCategory) warnings.push("Tickets category is missing/invalid.");
        if (!ticketsLogChannel || !ticketsLogChannel?.isTextBased?.()) warnings.push("Tickets log channel is missing/invalid.");
        if (!manageChannels && !admin) warnings.push("Bot lacks Manage Channels (tickets/statcounts/timechannels will fail).");
        if (!readHistory && !admin) warnings.push("Bot lacks Read Message History (ticket transcripts may be incomplete).");
      }

      const embed = new EmbedBuilder()
        .setTitle(`🩺 ${meta.name || "Moderation+"} — Diagnose`)
        .setDescription(
          [
            `Server: **${guild.name}**`,
            `Bot: **${client.user?.tag || "Unknown"}**`,
            `Version: \`${meta.version || "Unknown"}\``,
            warnings.length ? "" : "\n✅ No obvious issues detected.",
            warnings.length ? `\n⚠️ Findings:\n${warnings.map((w) => `• ${w}`).join("\n")}` : "",
          ].filter(Boolean).join("\n")
        )
        .setTimestamp(new Date());

      for (const c of checks.slice(0, 10)) embed.addFields({ name: c.name, value: c.value });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("❌ Error running /diagnose:", err);
      try {
        if (interaction.deferred || interaction.replied) return interaction.editReply("Something went wrong running diagnose.");
        return replyEphemeral(interaction, "Something went wrong running diagnose.");
      } catch {}
    }
  },
};
