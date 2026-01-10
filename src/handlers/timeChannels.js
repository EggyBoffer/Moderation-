const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

// Throttle updates per guild so we don't spam channel renames
const lastRun = new Map();
const MIN_INTERVAL_MS = 10_000;

function safeLabel(s, fallback) {
  const v = String(s || "").trim();
  return v ? v : fallback;
}

function formatTimeForZone(timeZone, locale = "en-GB") {
  try {
    // Example: "18:05"
    const fmt = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return fmt.format(new Date());
  } catch {
    return null;
  }
}

function buildChannelName(label, timeStr) {
  const l = String(label || "").trim();
  const t = String(timeStr || "").trim();

  // If label already ends with punctuation like ":" then keep it nice
  // "Skinner time:" -> "Skinner time: 18:05"
  // Otherwise use a separator
  const endsWithColon = l.endsWith(":");
  const endsWithDash = l.endsWith("—") || l.endsWith("-");

  let name = "";
  if (endsWithColon) name = `${l} ${t}`;
  else if (endsWithDash) name = `${l} ${t}`;
  else name = `${l} — ${t}`;

  // Discord channel names max 100 chars
  return name.length > 96 ? name.slice(0, 96) : name;
}

async function ensureVoiceTimeChannel(guild, categoryId, channelId, name) {
  let ch = null;

  if (channelId) {
    ch =
      guild.channels.cache.get(channelId) ||
      (await guild.channels.fetch(channelId).catch(() => null));

    if (ch && ch.type !== ChannelType.GuildVoice) ch = null;
  }

  const everyoneRoleId = guild.roles.everyone.id;

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
    // Ensure correct parent
    if (categoryId && ch.parentId !== categoryId) {
      await ch.setParent(categoryId).catch(() => null);
    }

    // Ensure display-only perms
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
 * Update time display channels for a guild (if configured).
 * Stored config shape:
 * - timeCategoryId: string | null
 * - timeChannels: Array<{ timeZone: string, label: string, channelId?: string }>
 */
async function updateTimeChannelsForGuild(guild, { force = false } = {}) {
  const now = Date.now();
  const last = lastRun.get(guild.id) || 0;
  if (!force && now - last < MIN_INTERVAL_MS) return;
  lastRun.set(guild.id, now);

  const cfg = getGuildConfig(guild.id);
  const categoryId = cfg.timeCategoryId;
  const entries = Array.isArray(cfg.timeChannels) ? cfg.timeChannels : [];

  if (!categoryId || entries.length === 0) return;

  // Validate category exists
  const category =
    guild.channels.cache.get(categoryId) ||
    (await guild.channels.fetch(categoryId).catch(() => null));

  if (!category || category.type !== ChannelType.GuildCategory) {
    console.warn(`⚠️ TimeChannels category missing/invalid for guild ${guild.id}.`);
    return;
  }

  // Bot needs Manage Channels
  let me = guild.members.me;
  if (!me) me = await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) return;

  const locale = cfg.timeLocale || "en-GB";

  // Build new list with updated channel IDs and cleaned invalid zones
  const updated = [];
  for (const e of entries) {
    const timeZone = String(e?.timeZone || "").trim();
    if (!timeZone) continue;

    const timeStr = formatTimeForZone(timeZone, locale);
    if (!timeStr) {
      console.warn(`⚠️ Invalid timeZone "${timeZone}" in guild ${guild.id}`);
      continue;
    }

    const label = safeLabel(e?.label, timeZone);
    const name = buildChannelName(label, timeStr);

    const ch = await ensureVoiceTimeChannel(
      guild,
      categoryId,
      e?.channelId || null,
      name
    );

    updated.push({
      timeZone,
      label,
      channelId: ch.id,
    });
  }

  setGuildConfig(guild.id, { timeChannels: updated });
}

/**
 * Start a single global ticker that updates time channels across all guilds.
 * Safe: only renames when needed + throttled per guild.
 */
function startTimeChannelsTicker(client) {
  if (client._timeChannelsTickerStarted) return;
  client._timeChannelsTickerStarted = true;

  const runAll = async () => {
    for (const guild of client.guilds.cache.values()) {
      updateTimeChannelsForGuild(guild).catch(() => null);
    }
  };

  // Run once immediately
  runAll().catch(() => null);

  // Align tick to the next minute boundary
  const schedule = () => {
    const now = Date.now();
    const msToNextMinute = 60_000 - (now % 60_000) + 250;
    setTimeout(() => {
      runAll().catch(() => null);
      setInterval(() => runAll().catch(() => null), 60_000);
    }, msToNextMinute);
  };

  schedule();
}

module.exports = { updateTimeChannelsForGuild, startTimeChannelsTicker };
