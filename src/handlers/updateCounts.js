const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

// Throttle updates per guild to avoid spam renames when Discord fires events in bursts
const lastRun = new Map();
const MIN_INTERVAL_MS = 10_000;

function makeName(label, n) {
  return `${label} ${n}`;
}

async function ensureVoiceStatChannel(guild, categoryId, channelId, name, everyoneRoleId) {
  let ch = null;

  if (channelId) {
    ch =
      guild.channels.cache.get(channelId) ||
      (await guild.channels.fetch(channelId).catch(() => null));

    if (ch && ch.type !== ChannelType.GuildVoice) {
      ch = null;
    }
  }

  if (!ch) {
    // Create channel
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
    // Ensure correct parent (if category exists)
    if (categoryId && ch.parentId !== categoryId) {
      await ch.setParent(categoryId).catch(() => null);
    }

    // Keep it “display-only”
    await ch.permissionOverwrites
      .edit(everyoneRoleId, {
        Connect: false,
        Speak: false,
      })
      .catch(() => null);

    // Rename if needed
    if (ch.name !== name) {
      await ch.setName(name).catch(() => null);
    }
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
  if (!categoryId) return;

  // Validate category still exists & is accessible
  const category =
    guild.channels.cache.get(categoryId) ||
    (await guild.channels.fetch(categoryId).catch(() => null));
  if (!category || category.type !== ChannelType.GuildCategory) {
    // Category missing/deleted or not accessible → don't hard-crash
    console.warn(`⚠️ Counts category missing/invalid for guild ${guild.id}.`);
    return;
  }

  // Bot needs Manage Channels to create/rename channels
  let me = guild.members.me;
  if (!me) me = await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) return;

  const total = guild.memberCount ?? 0;

  let bots = 0;
  let humans = 0;

  // Attempt full fetch for accurate split
  try {
    const members = await guild.members.fetch();
    bots = members.filter((m) => m.user?.bot).size;
    humans = members.size - bots;
  } catch {
    // Fallback to cache (better than forcing bots=0)
    const cached = guild.members.cache;
    if (cached && cached.size > 0) {
      bots = cached.filter((m) => m.user?.bot).size;
      humans = cached.size - bots;
    } else {
      humans = Math.max(0, total);
      bots = 0;
    }
  }

  const everyoneRoleId = guild.roles.everyone.id;

  const membersLabel = cfg.countsMembersLabel || "👥 Members:";
  const humansLabel = cfg.countsHumansLabel || "🧍 Users:";
  const botsLabel = cfg.countsBotsLabel || "🤖 Bots:";

  const membersName = makeName(membersLabel, total);
  const humansName = makeName(humansLabel, humans);
  const botsName = makeName(botsLabel, bots);

  // Create/update channels safely
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

  // Persist IDs
  setGuildConfig(guild.id, {
    countsMembersChannelId: membersCh.id,
    countsHumansChannelId: humansCh.id,
    countsBotsChannelId: botsCh.id,
  });
}

module.exports = { updateCountsForGuild };
