const {
  Events,
  AuditLogEvent,
  ChannelType,
} = require("discord.js");

const { sendToGuildLog } = require("../handlers/logChannel");
const { baseEmbed, setActor } = require("../handlers/logEmbeds");
const { clip } = require("../handlers/text");

// Helper: fetch the most recent relevant audit log entry and sanity-check it
async function findAuditEntry(guild, type, predicate) {
  try {
    const audits = await guild.fetchAuditLogs({ limit: 6, type });
    const entries = [...audits.entries.values()];
    for (const entry of entries) {
      if (predicate(entry)) return entry;
    }
  } catch (e) {
    // Missing perms or transient error
  }
  return null;
}

module.exports = {
  name: "moderationLogs",
  once: false,

  // This module registers multiple listeners itself
  // Our eventLoader expects { name, execute }, so we use execute() to attach listeners.
  execute(client) {
    // --- Bans / Unbans ---
    client.on(Events.GuildBanAdd, async (ban) => {
      const guild = ban.guild;
      const user = ban.user;

      const entry = await findAuditEntry(
        guild,
        AuditLogEvent.MemberBanAdd,
        (e) => e.target?.id === user.id
      );

      const embed = baseEmbed("Member Banned")
        .setDescription(`**User:** ${user.tag}\n**User ID:** ${user.id}`);

      if (entry) {
        setActor(embed, entry.executor);
        if (entry.reason) embed.addFields({ name: "Reason", value: clip(entry.reason, 1024) });
      }

      await sendToGuildLog(client, guild.id, { embeds: [embed] });
    });

    client.on(Events.GuildBanRemove, async (ban) => {
      const guild = ban.guild;
      const user = ban.user;

      const entry = await findAuditEntry(
        guild,
        AuditLogEvent.MemberBanRemove,
        (e) => e.target?.id === user.id
      );

      const embed = baseEmbed("Member Unbanned")
        .setDescription(`**User:** ${user.tag}\n**User ID:** ${user.id}`);

      if (entry) {
        setActor(embed, entry.executor);
        if (entry.reason) embed.addFields({ name: "Reason", value: clip(entry.reason, 1024) });
      }

      await sendToGuildLog(client, guild.id, { embeds: [embed] });
    });

    // --- Timeouts (member updates) ---
    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
      try {
        const oldTs = oldMember.communicationDisabledUntilTimestamp ?? null;
        const newTs = newMember.communicationDisabledUntilTimestamp ?? null;

        if (oldTs === newTs) return;

        const guild = newMember.guild;
        const target = newMember.user;

        const entry = await findAuditEntry(
          guild,
          AuditLogEvent.MemberUpdate,
          (e) => e.target?.id === target.id
        );

        const embed = baseEmbed(newTs ? "Member Timed Out" : "Timeout Removed")
          .setDescription(`**User:** ${target.tag}\n**User ID:** ${target.id}`);

        if (newTs) {
          embed.addFields({
            name: "Until",
            value: `<t:${Math.floor(newTs / 1000)}:F>`,
            inline: false,
          });
        }

        if (entry) {
          setActor(embed, entry.executor);
          if (entry.reason) embed.addFields({ name: "Reason", value: clip(entry.reason, 1024) });
        }

        await sendToGuildLog(client, guild.id, { embeds: [embed] });
      } catch (err) {
        console.error("❌ GuildMemberUpdate (timeout) log error:", err);
      }
    });

    // --- Kicks (detected via member remove + audit log) ---
    client.on(Events.GuildMemberRemove, async (member) => {
      try {
        const guild = member.guild;

        // Check audit logs for a kick targeting this user very recently
        const entry = await findAuditEntry(
          guild,
          AuditLogEvent.MemberKick,
          (e) => e.target?.id === member.id
        );

        // If there is no kick entry, it's just a leave; your separate join/leave logs already cover that.
        if (!entry) return;

        const targetTag = member.user?.tag ?? "Unknown user";

        const embed = baseEmbed("Member Kicked")
          .setDescription(`**User:** ${targetTag}\n**User ID:** ${member.id}`);

        setActor(embed, entry.executor);
        if (entry.reason) embed.addFields({ name: "Reason", value: clip(entry.reason, 1024) });

        await sendToGuildLog(client, guild.id, { embeds: [embed] });
      } catch (err) {
        console.error("❌ GuildMemberRemove (kick) log error:", err);
      }
    });

    // --- Role logs ---
    client.on(Events.RoleCreate, async (role) => {
      const guild = role.guild;

      const entry = await findAuditEntry(
        guild,
        AuditLogEvent.RoleCreate,
        (e) => e.target?.id === role.id
      );

      const embed = baseEmbed("Role Created")
        .setDescription(`**Role:** ${role.name}\n**Role ID:** ${role.id}`);

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, guild.id, { embeds: [embed] });
    });

    client.on(Events.RoleDelete, async (role) => {
      const guild = role.guild;

      const entry = await findAuditEntry(
        guild,
        AuditLogEvent.RoleDelete,
        (e) => e.target?.id === role.id
      );

      const embed = baseEmbed("Role Deleted")
        .setDescription(`**Role:** ${role.name}\n**Role ID:** ${role.id}`);

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, guild.id, { embeds: [embed] });
    });

    client.on(Events.RoleUpdate, async (oldRole, newRole) => {
      const guild = newRole.guild;

      // Only log meaningful changes (name/permissions/colour/hoist/mentionable)
      const changes = [];
      if (oldRole.name !== newRole.name) changes.push(`Name: \`${oldRole.name}\` → \`${newRole.name}\``);
      if (oldRole.hexColor !== newRole.hexColor) changes.push(`Color: \`${oldRole.hexColor}\` → \`${newRole.hexColor}\``);
      if (oldRole.hoist !== newRole.hoist) changes.push(`Hoist: \`${oldRole.hoist}\` → \`${newRole.hoist}\``);
      if (oldRole.mentionable !== newRole.mentionable) changes.push(`Mentionable: \`${oldRole.mentionable}\` → \`${newRole.mentionable}\``);
      if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push("Permissions changed");

      if (changes.length === 0) return;

      const entry = await findAuditEntry(
        guild,
        AuditLogEvent.RoleUpdate,
        (e) => e.target?.id === newRole.id
      );

      const embed = baseEmbed("Role Updated")
        .setDescription(`**Role:** ${newRole.name}\n**Role ID:** ${newRole.id}`)
        .addFields({ name: "Changes", value: clip(changes.join("\n"), 1024) });

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, guild.id, { embeds: [embed] });
    });

    // --- Channel logs ---
    client.on(Events.ChannelCreate, async (channel) => {
      if (!channel.guild) return;

      const entry = await findAuditEntry(
        channel.guild,
        AuditLogEvent.ChannelCreate,
        (e) => e.target?.id === channel.id
      );

      const embed = baseEmbed("Channel Created")
        .setDescription(`**Channel:** <#${channel.id}>\n**Channel ID:** ${channel.id}`);

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, channel.guild.id, { embeds: [embed] });
    });

    client.on(Events.ChannelDelete, async (channel) => {
      if (!channel.guild) return;

      const entry = await findAuditEntry(
        channel.guild,
        AuditLogEvent.ChannelDelete,
        (e) => e.target?.id === channel.id
      );

      const embed = baseEmbed("Channel Deleted")
        .setDescription(`**Channel:** #${channel.name ?? "unknown"}\n**Channel ID:** ${channel.id}`);

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, channel.guild.id, { embeds: [embed] });
    });

    client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
      if (!newChannel.guild) return;

      // Skip tiny/noise updates: only name/topic/nsfw/rate limit
      const changes = [];
      if (oldChannel.name !== newChannel.name) changes.push(`Name: \`${oldChannel.name}\` → \`${newChannel.name}\``);

      // Topic only exists on text/announcement/forums
      if (typeof oldChannel.topic !== "undefined" || typeof newChannel.topic !== "undefined") {
        const o = oldChannel.topic ?? "";
        const n = newChannel.topic ?? "";
        if (o !== n) changes.push(`Topic changed`);
      }

      if (typeof oldChannel.nsfw !== "undefined" && oldChannel.nsfw !== newChannel.nsfw) {
        changes.push(`NSFW: \`${oldChannel.nsfw}\` → \`${newChannel.nsfw}\``);
      }

      if (typeof oldChannel.rateLimitPerUser !== "undefined" &&
          oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
        changes.push(`Slowmode: \`${oldChannel.rateLimitPerUser}s\` → \`${newChannel.rateLimitPerUser}s\``);
      }

      if (changes.length === 0) return;

      const entry = await findAuditEntry(
        newChannel.guild,
        AuditLogEvent.ChannelUpdate,
        (e) => e.target?.id === newChannel.id
      );

      const embed = baseEmbed("Channel Updated")
        .setDescription(`**Channel:** <#${newChannel.id}>\n**Channel ID:** ${newChannel.id}`)
        .addFields({ name: "Changes", value: clip(changes.join("\n"), 1024) });

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, newChannel.guild.id, { embeds: [embed] });
    });

    // --- Webhooks ---
    client.on(Events.WebhooksUpdate, async (channel) => {
      // This event only tells you "something changed"; use audit logs for detail
      if (!channel.guild) return;

      const entry = await findAuditEntry(
        channel.guild,
        AuditLogEvent.WebhookCreate,
        () => true
      ) || await findAuditEntry(
        channel.guild,
        AuditLogEvent.WebhookUpdate,
        () => true
      ) || await findAuditEntry(
        channel.guild,
        AuditLogEvent.WebhookDelete,
        () => true
      );

      const embed = baseEmbed("Webhooks Updated")
        .setDescription(`**Channel:** <#${channel.id}>\n**Channel ID:** ${channel.id}\nA webhook was created/updated/deleted.`);

      if (entry) {
        setActor(embed, entry.executor);
        if (entry.reason) embed.addFields({ name: "Reason", value: clip(entry.reason, 1024) });
      }

      await sendToGuildLog(client, channel.guild.id, { embeds: [embed] });
    });

    // --- Emojis ---
    client.on(Events.GuildEmojiCreate, async (emoji) => {
      const guild = emoji.guild;
      const entry = await findAuditEntry(guild, AuditLogEvent.EmojiCreate, (e) => e.target?.id === emoji.id);

      const embed = baseEmbed("Emoji Created")
        .setDescription(`**Name:** ${emoji.name}\n**ID:** ${emoji.id}`);

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, guild.id, { embeds: [embed] });
    });

    client.on(Events.GuildEmojiDelete, async (emoji) => {
      const guild = emoji.guild;
      const entry = await findAuditEntry(guild, AuditLogEvent.EmojiDelete, (e) => e.target?.id === emoji.id);

      const embed = baseEmbed("Emoji Deleted")
        .setDescription(`**Name:** ${emoji.name}\n**ID:** ${emoji.id}`);

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, guild.id, { embeds: [embed] });
    });

    client.on(Events.GuildEmojiUpdate, async (oldEmoji, newEmoji) => {
      const guild = newEmoji.guild;
      if (oldEmoji.name === newEmoji.name) return;

      const entry = await findAuditEntry(guild, AuditLogEvent.EmojiUpdate, (e) => e.target?.id === newEmoji.id);

      const embed = baseEmbed("Emoji Updated")
        .setDescription(`**ID:** ${newEmoji.id}`)
        .addFields({ name: "Change", value: `Name: \`${oldEmoji.name}\` → \`${newEmoji.name}\`` });

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, guild.id, { embeds: [embed] });
    });

    // --- Server (guild) update ---
    client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
      const changes = [];
      if (oldGuild.name !== newGuild.name) changes.push(`Name: \`${oldGuild.name}\` → \`${newGuild.name}\``);
      if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.push(`Verification level changed`);
      if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) changes.push(`Content filter changed`);

      if (changes.length === 0) return;

      const entry = await findAuditEntry(newGuild, AuditLogEvent.GuildUpdate, () => true);

      const embed = baseEmbed("Server Updated")
        .setDescription(`**Server:** ${newGuild.name}\n**ID:** ${newGuild.id}`)
        .addFields({ name: "Changes", value: clip(changes.join("\n"), 1024) });

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, newGuild.id, { embeds: [embed] });
    });

    console.log("🛡️ moderationLogs module attached listeners.");
  },
};
