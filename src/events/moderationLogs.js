const { Events, AuditLogEvent } = require("discord.js");
const { sendToGuildLog } = require("../handlers/logChannel");
const { baseEmbed, setActor } = require("../handlers/logEmbeds");
const { clip } = require("../handlers/text");

async function findAuditEntry(guild, type, predicate) {
  try {
    const audits = await guild.fetchAuditLogs({ limit: 6, type });
    const entries = [...audits.entries.values()];
    for (const entry of entries) {
      if (predicate(entry)) return entry;
    }
  } catch {}
  return null;
}

module.exports = {
  register(client) {
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
        console.error("❌ Timeout logging error:", err);
      }
    });

    // --- Kicks (member remove + audit log) ---
    client.on(Events.GuildMemberRemove, async (member) => {
      try {
        const guild = member.guild;

        const entry = await findAuditEntry(
          guild,
          AuditLogEvent.MemberKick,
          (e) => e.target?.id === member.id
        );

        if (!entry) return; // normal leave handled elsewhere

        const targetTag = member.user?.tag ?? "Unknown user";
        const embed = baseEmbed("Member Kicked")
          .setDescription(`**User:** ${targetTag}\n**User ID:** ${member.id}`);

        setActor(embed, entry.executor);
        if (entry.reason) embed.addFields({ name: "Reason", value: clip(entry.reason, 1024) });

        await sendToGuildLog(client, guild.id, { embeds: [embed] });
      } catch (err) {
        console.error("❌ Kick logging error:", err);
      }
    });

    console.log("🛡️ moderationLogs module registered.");
  },
};
