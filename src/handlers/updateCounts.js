const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

// Throttle updates per guild to avoid spam renames when Discord fires events in bursts
const lastRun = new Map();
const MIN_INTERVAL_MS = 10_000;

function makeName(label, n) {
  return `${label} ${n}`;
}

async function ensureVoiceStatChannel(guild, categoryId, channelId, name, everyoneRoleId) {
  // Try fetch existing channel
  let ch = null;

  if (channelId) {
    ch = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
    if (ch && ch.type !== ChannelType.GuildVoice) {
      // Wrong type; discard and recreate
      ch = null;
    }
  }

  if (!ch) {
    ch = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: categoryId || null,
      permissionOverwrites: [
        {
          id: everyoneRoleId,
          deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
        },
      ],
    });
  } else {
    // Ensure correct parent + permissions
    if (categoryId && ch.parentId !== categoryId) {
      await ch.setParent(categoryId).catch(() => null);
    }

    // Keep it “display-only”
    await ch.permissionOverwrites.edit(everyoneRoleId, {
      Connect: false,
      Speak: false,
    }).catch(() => null);
  }

  // Rename if needed
  if (ch.name !== name) {
    await ch.setName(name).catch(() => null);
  }

  return ch;
}

/**
 * Updates per-guild member count channels.
 * Uses guild.memberCount for total, and fetches member list to get bots/users split.
 */
async function updateCountsForGuild(guild, { force = false } = {}) {
  const now = Date.now();
  const last = lastRun.get(guild.id) || 0;
  if (!force && now - last < MIN_INTERVAL_MS) return;
  lastRun.set(guild.id, now);

  const cfg = getGuildConfig(guild.id);

  const categoryId = cfg.countsCategoryId;
  const enabled = Boolean(categoryId); // “enabled if category set”
  if (!enabled) return;

  // Bot needs Manage Channels to create/rename channels
  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) return;

  // Total members is accurate
  const total = guild.memberCount ?? 0;

  // Bots/users requires member list. We fetch to be accurate.
  // On huge servers this can be heavier; we throttle and only do it on join/leave/ready/refresh.
  let bots = 0;
  let humans = 0;

  try {
    const members = await guild.members.fetch();
    bots = members.filter((m) => m.user?.bot).size;
    humans = members.size - bots;
  } catch {
    // Fallback if fetch fails: we can’t split reliably
    humans = Math.max(0, total);
    bots = 0;
  }

  const everyoneRoleId = guild.roles.everyone.id;

  const membersLabel = cfg.countsMembersLabel || "👥 Members:";
  const humansLabel = cfg.countsHumansLabel || "🧍 Users:";
  const botsLabel = cfg.countsBotsLabel || "🤖 Bots:";

  const membersName = makeName(membersLabel, total);
  const humansName = makeName(humansLabel, humans);
  const botsName = makeName(botsLabel, bots);

  const membersCh = await ensureVoiceStatChannel(
    guild,
    categoryId,
    cfg.countsMembersChannelId,
    membersName,
    everyoneRoleId
  );

  const humansCh = await ensureVoiceStatChannel(
    guild,
    categoryId,
    cfg.countsHumansChannelId,
    humansName,
    everyoneRoleId
  );

  const botsCh = await ensureVoiceStatChannel(
    guild,
    categoryId,
    cfg.countsBotsChannelId,
    botsName,
    everyoneRoleId
  );

  // Persist IDs (merge patch)
  setGuildConfig(guild.id, {
    countsMembersChannelId: membersCh.id,
    countsHumansChannelId: humansCh.id,
    countsBotsChannelId: botsCh.id,
  });
}

module.exports = { updateCountsForGuild };
