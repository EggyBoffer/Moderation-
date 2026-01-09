const { Events, EmbedBuilder } = require("discord.js");
const { sendToGuildLog } = require("../handlers/logChannel");
const { getGuildConfig } = require("../storage/guildConfig");

const DEFAULT_WELCOME =
  "👋 Welcome {user} to **{server}**! You are member #{memberCount}. Please read {rules}.";

function renderWelcomeMessage(template, member) {
  const rulesChannel =
    member.guild.channels.cache.find(
      (c) => c?.name === "rules" && c?.isTextBased?.()
    ) || null;

  return String(template || DEFAULT_WELCOME)
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{memberCount}", String(member.guild.memberCount))
    .replaceAll("{rules}", rulesChannel ? `<#${rulesChannel.id}>` : "the rules");
}

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
    if (typeof vanity?.uses === "number") {
      client.vanityUsesCache.set(guild.id, vanity.uses);
    }
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

    // Welcome message (if configured)
    try {
      const cfg = getGuildConfig(guild.id);
      const channelId = cfg?.welcomeChannelId;

      if (channelId) {
        const channel =
          guild.channels.cache.get(channelId) ||
          (await guild.channels.fetch(channelId).catch(() => null));

        if (channel?.isTextBased?.()) {
          const template = cfg?.welcomeMessage || DEFAULT_WELCOME;
          const rendered = renderWelcomeMessage(template, member);

          const welcomeEmbed = new EmbedBuilder()
            .setTitle("Welcome!")
            .setDescription(rendered)
            .setColor(0x57F287) // Discord-ish green
            .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
            .setAuthor({
              name: guild.name,
              iconURL: guild.iconURL({ size: 128 }) || undefined,
            })
            .setTimestamp(new Date());

          await channel.send({ embeds: [welcomeEmbed] });
        }
      }
    } catch (err) {
      console.error("❌ Welcome message failed:", err);
    }

    // Ensure we have *some* baseline cache
    await ensureInviteCache(client, guild);

    // Discord sometimes updates invite uses slightly after the memberAdd event
    await sleep(2000);

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
      .setDescription(
        `**User:** ${member.user.tag}\n` +
          `**ID:** ${member.id}\n` +
          `${invitedByLine}${inviteCodeLine}`
      )
      .setColor(0x57F287) // green for joins
      .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
      .setAuthor({
        name: guild.name,
        iconURL: guild.iconURL({ size: 128 }) || undefined,
      })
      .setTimestamp(new Date());

    await sendToGuildLog(client, guild.id, { embeds: [embed] });
  },
};
