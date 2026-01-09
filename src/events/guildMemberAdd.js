const { Events, EmbedBuilder } = require("discord.js");
const { sendToGuildLog } = require("../handlers/logChannel");

// Invite cache lives on the client so it's shared across events/modules
// client.inviteCache: Map<guildId, Collection<code, invite>>
async function ensureInviteCache(client, guild) {
  if (!client.inviteCache) client.inviteCache = new Map();
  if (!client.vanityUsesCache) client.vanityUsesCache = new Map();

  // If we already have a snapshot, don't refetch here
  if (client.inviteCache.has(guild.id)) return;

  try {
    const invites = await guild.invites.fetch();
    client.inviteCache.set(guild.id, invites);
  } catch {
    // No perms or not available
    client.inviteCache.set(guild.id, null);
  }

  try {
    const vanity = await guild.fetchVanityData();
    if (typeof vanity?.uses === "number") client.vanityUsesCache.set(guild.id, vanity.uses);
  } catch {
    // Vanity not enabled or no perms
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(client, member) {
    const guild = member.guild;

    // Ensure we have *some* baseline cache
    await ensureInviteCache(client, guild);

    // Discord sometimes updates invite uses slightly after the memberAdd event
    await sleep(1200);

    let invitedByLine = "**Invited by:** Unknown";
    let inviteCodeLine = "";

    const before = client.inviteCache.get(guild.id);

    // Fetch current invites
    let after = null;
    try {
      after = await guild.invites.fetch();
      client.inviteCache.set(guild.id, after);
    } catch {
      after = null;
      client.inviteCache.set(guild.id, null);
    }

    // Detect used invite by comparing "uses"
    if (before && after) {
      const used = after.find((inv) => {
        const prev = before.get(inv.code);
        const prevUses = prev?.uses ?? 0;
        const nowUses = inv.uses ?? 0;
        return nowUses > prevUses;
      });

      if (used) {
        const inviter = used.inviter;
        invitedByLine = inviter
          ? `**Invited by:** <@${inviter.id}> (${inviter.tag})`
          : "**Invited by:** Unknown";
        inviteCodeLine = `\n**Invite code:** \`${used.code}\``;
      }
    }

    // If we didn't detect a code, check vanity URL usage
    if (inviteCodeLine === "") {
      const vanityBefore = client.vanityUsesCache?.get(guild.id);

      try {
        const vanity = await guild.fetchVanityData();
        if (typeof vanity?.uses === "number") {
          client.vanityUsesCache.set(guild.id, vanity.uses);

          if (typeof vanityBefore === "number" && vanity.uses > vanityBefore) {
            invitedByLine = "**Join method:** Vanity URL";
          } else if (before === null) {
            invitedByLine = "**Invited by:** Unknown (missing Manage Server permission)";
          } else {
            invitedByLine = "**Invited by:** Unknown";
          }
        }
      } catch {
        if (before === null) {
          invitedByLine = "**Invited by:** Unknown (missing Manage Server permission)";
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("Member Joined")
      .setDescription(`**User:** ${member.user.tag}\n**ID:** ${member.id}`)
      .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
      .setAuthor({
        name: member.guild.name,
        iconURL: member.guild.iconURL({ size: 128 }) || undefined,
      })
      .setTimestamp(new Date());

    await sendToGuildLog(client, guild.id, { embeds: [embed] });
  },
};
