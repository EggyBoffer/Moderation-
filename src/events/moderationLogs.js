const { Events, AuditLogEvent } = require("discord.js");
const { sendToGuildLog } = require("../handlers/logChannel");
const { baseEmbed, setActor } = require("../handlers/logEmbeds");
const { clip } = require("../handlers/text");

async function findAuditEntry(guild, type, predicate) {
  try {
    const audits = await guild.fetchAuditLogs({ limit: 8, type });
    const entries = [...audits.entries.values()];
    for (const entry of entries) {
      if (predicate(entry)) return entry;
    }
  } catch {
    
  }
  return null;
}

function isRecent(entry, seconds = 15) {
  if (!entry?.createdTimestamp) return false;
  return Date.now() - entry.createdTimestamp < seconds * 1000;
}

module.exports = {
  register(client) {
    
    client.on(Events.GuildBanAdd, async (ban) => {
      const guild = ban.guild;
      const user = ban.user;

      const entry = await findAuditEntry(
        guild,
        AuditLogEvent.MemberBanAdd,
        (e) => e.target?.id === user.id && isRecent(e)
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
        (e) => e.target?.id === user.id && isRecent(e)
      );

      const embed = baseEmbed("Member Unbanned")
        .setDescription(`**User:** ${user.tag}\n**User ID:** ${user.id}`);

      if (entry) {
        setActor(embed, entry.executor);
        if (entry.reason) embed.addFields({ name: "Reason", value: clip(entry.reason, 1024) });
      }

      await sendToGuildLog(client, guild.id, { embeds: [embed] });
    });

    
    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
      try {
        const oldTs = oldMember.communicationDisabledUntilTimestamp ?? null;
        const newTs = newMember.communicationDisabledUntilTimestamp ?? null;

        
        if (oldTs !== newTs) {
          const guild = newMember.guild;
          const target = newMember.user;

          const entry = await findAuditEntry(
            guild,
            AuditLogEvent.MemberUpdate,
            (e) => e.target?.id === target.id && isRecent(e)
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
        }

        
        const oldSet = new Set(oldMember.roles.cache.map((r) => r.id));
        const newSet = new Set(newMember.roles.cache.map((r) => r.id));

        const added = [...newSet].filter((id) => !oldSet.has(id));
        const removed = [...oldSet].filter((id) => !newSet.has(id));

        if (added.length === 0 && removed.length === 0) return;

        const guild = newMember.guild;
        const user = newMember.user;

        
        const entry = await findAuditEntry(
          guild,
          AuditLogEvent.MemberRoleUpdate,
          (e) => e.target?.id === user.id && isRecent(e)
        );

        const embed = baseEmbed("Member Roles Updated")
          .setDescription(`**User:** ${user.tag}\n**User ID:** ${user.id}`);

        if (added.length) {
          embed.addFields({
            name: "Roles Added",
            value: added.map((id) => `<@&${id}>`).join("\n").slice(0, 1024),
            inline: false,
          });
        }

        if (removed.length) {
          embed.addFields({
            name: "Roles Removed",
            value: removed.map((id) => `<@&${id}>`).join("\n").slice(0, 1024),
            inline: false,
          });
        }

        if (entry) {
          setActor(embed, entry.executor);
          if (entry.reason) embed.addFields({ name: "Reason", value: clip(entry.reason, 1024) });
        }

        await sendToGuildLog(client, guild.id, { embeds: [embed] });
      } catch (err) {
        console.error("❌ GuildMemberUpdate (timeout/roles) log error:", err);
      }
    });

    
    client.on(Events.GuildMemberRemove, async (member) => {
      try {
        const guild = member.guild;

        const entry = await findAuditEntry(
          guild,
          AuditLogEvent.MemberKick,
          (e) => e.target?.id === member.id && isRecent(e)
        );

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

    
    
    

    client.on(Events.RoleCreate, async (role) => {
      const guild = role.guild;

      const entry = await findAuditEntry(
        guild,
        AuditLogEvent.RoleCreate,
        (e) => e.target?.id === role.id && isRecent(e)
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
        (e) => e.target?.id === role.id && isRecent(e)
      );

      const embed = baseEmbed("Role Deleted")
        .setDescription(`**Role:** ${role.name}\n**Role ID:** ${role.id}`);

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, guild.id, { embeds: [embed] });
    });

    client.on(Events.RoleUpdate, async (oldRole, newRole) => {
      const guild = newRole.guild;

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
        (e) => e.target?.id === newRole.id && isRecent(e)
      );

      const embed = baseEmbed("Role Updated")
        .setDescription(`**Role:** ${newRole.name}\n**Role ID:** ${newRole.id}`)
        .addFields({ name: "Changes", value: clip(changes.join("\n"), 1024) });

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, guild.id, { embeds: [embed] });
    });

    
    
    

    client.on(Events.ChannelCreate, async (channel) => {
      if (!channel.guild) return;

      const entry = await findAuditEntry(
        channel.guild,
        AuditLogEvent.ChannelCreate,
        (e) => e.target?.id === channel.id && isRecent(e)
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
        (e) => e.target?.id === channel.id && isRecent(e)
      );

      const embed = baseEmbed("Channel Deleted")
        .setDescription(`**Channel:** #${channel.name ?? "unknown"}\n**Channel ID:** ${channel.id}`);

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, channel.guild.id, { embeds: [embed] });
    });

    client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
      if (!newChannel.guild) return;

      const changes = [];

      if (oldChannel.name !== newChannel.name) {
        changes.push(`Name: \`${oldChannel.name}\` → \`${newChannel.name}\``);
      }

      
      const oldTopic = oldChannel.topic ?? null;
      const newTopic = newChannel.topic ?? null;
      if (oldTopic !== newTopic) changes.push("Topic changed");

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
        (e) => e.target?.id === newChannel.id && isRecent(e)
      );

      const embed = baseEmbed("Channel Updated")
        .setDescription(`**Channel:** <#${newChannel.id}>\n**Channel ID:** ${newChannel.id}`)
        .addFields({ name: "Changes", value: clip(changes.join("\n"), 1024) });

      if (entry) setActor(embed, entry.executor);

      await sendToGuildLog(client, newChannel.guild.id, { embeds: [embed] });
    });

    console.log("🛡️ moderationLogs module registered (roles + channels).");
  },
};
