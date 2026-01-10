const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

// Throttle updates per guild
const lastRun = new Map();
const MIN_INTERVAL_MS = 5_000;

// Discord API timeouts
const API_TIMEOUT_MS = 15_000;
const SETNAME_TIMEOUT_MS = 30_000;

// Update cadence
const TICK_MS = 120_000; // 2 minutes (more stable than 1m, far less rate-limit pain)
const STAGGER_SPREAD_MS = 90_000; // spread timezone updates across 90 seconds

// Prevent concurrent updates per guild (ticker + command collisions)
const guildLocks = new Map();

// Per-channel cooldown so we don't spam rename attempts if Discord is slow
const lastNameAttempt = new Map(); // channelId -> timestamp
const NAME_ATTEMPT_COOLDOWN_MS = 120_000; // 2 minutes

function withTimeout(promise, ms, label = "operation") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function safeLabel(s, fallback) {
  const v = String(s || "").trim();
  return v ? v : fallback;
}

function normalizeLabelForMatch(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatTimeForZone(timeZone, locale = "en-GB") {
  try {
    // "18:05"
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

  const endsWithColon = l.endsWith(":");
  const endsWithDash = l.endsWith("—") || l.endsWith("-");

  let name = "";
  if (endsWithColon || endsWithDash) name = `${l} ${t}`;
  else name = `${l} — ${t}`;

  // Discord limit 100 chars (play safe)
  return name.length > 96 ? name.slice(0, 96) : name;
}

/**
 * Deduplicate entries so you can’t have 3 entries for the same timezone.
 * Keep the one that already has a channelId (if any).
 */
function dedupeEntries(entries) {
  const map = new Map(); // tz -> entry
  for (const e of entries) {
    const tz = String(e?.timeZone || "").trim();
    if (!tz) continue;

    const label = String(e?.label || "").trim();
    const channelId = e?.channelId ? String(e.channelId) : null;
    const permsApplied = Boolean(e?.permsApplied);

    const existing = map.get(tz);
    if (!existing) {
      map.set(tz, {
        timeZone: tz,
        label,
        ...(channelId ? { channelId } : {}),
        ...(permsApplied ? { permsApplied: true } : {}),
      });
      continue;
    }

    // Prefer keeping a linked channelId
    if (!existing.channelId && channelId) {
      map.set(tz, {
        timeZone: tz,
        label: label || existing.label,
        channelId,
        permsApplied: permsApplied || existing.permsApplied || false,
      });
      continue;
    }

    // Otherwise keep existing, but update label if it was empty
    if (!existing.label && label) {
      map.set(tz, { ...existing, label });
    }

    // Preserve permsApplied if any entry had it
    if (permsApplied && !existing.permsApplied) {
      map.set(tz, { ...map.get(tz), permsApplied: true });
    }
  }
  return [...map.values()];
}

/**
 * Simple deterministic hash for staggering
 */
function hashStringToInt(s) {
  const str = String(s || "");
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Should we update this timezone on this tick?
 * We stagger each timezone into its own time window within STAGGER_SPREAD_MS.
 */
function shouldUpdateThisTick(guildId, timeZone) {
  const now = Date.now();
  const bucket = now % TICK_MS;
  const offset = hashStringToInt(`${guildId}:${timeZone}`) % STAGGER_SPREAD_MS;

  // Allow a window of 15s where this TZ is "eligible"
  const WINDOW_MS = 15_000;
  return Math.abs(bucket - offset) <= WINDOW_MS || bucket < WINDOW_MS || bucket > (TICK_MS - WINDOW_MS);
}

/**
 * Scan category for voice channels that match a label (prefix match)
 */
async function findMatchingChannels(guild, categoryId, label) {
  const normLabel = normalizeLabelForMatch(label);
  if (!normLabel) return [];

  const channels = guild.channels.cache.filter(
    (c) => c.parentId === categoryId && c.type === ChannelType.GuildVoice
  );

  const matches = [];
  for (const c of channels.values()) {
    const n = normalizeLabelForMatch(c.name);
    if (n.startsWith(normLabel)) matches.push(c);
  }

  // Newest first
  matches.sort((a, b) => (a.id < b.id ? 1 : -1));
  return matches;
}

/**
 * Ensure channel exists. Apply perms ONCE. Rename with cooldown only.
 * Returns { channel, permsApplied }.
 */
async function ensureVoiceTimeChannel(guild, categoryId, entry, name) {
  let ch = null;

  if (entry?.channelId) {
    ch =
      guild.channels.cache.get(entry.channelId) ||
      (await withTimeout(
        guild.channels.fetch(entry.channelId).catch(() => null),
        API_TIMEOUT_MS,
        "channels.fetch"
      ));

    if (ch && ch.type !== ChannelType.GuildVoice) ch = null;
  }

  const everyoneRoleId = guild.roles.everyone.id;

  // Create if missing
  if (!ch) {
    ch = await withTimeout(
      guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent: categoryId || null,
        permissionOverwrites: [
          {
            id: everyoneRoleId,
            deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
          },
        ],
      }),
      API_TIMEOUT_MS,
      "channels.create"
    );
    return { channel: ch, permsApplied: true };
  }

  // Fix parent only if wrong (rare)
  if (categoryId && ch.parentId !== categoryId) {
    await withTimeout(ch.setParent(categoryId).catch(() => null), API_TIMEOUT_MS, "setParent");
  }

  // Permissions: DO ONCE ONLY (this is a huge rate limit saver)
  let permsApplied = Boolean(entry?.permsApplied);
  if (!permsApplied) {
    await withTimeout(
      ch.permissionOverwrites
        .edit(everyoneRoleId, { Connect: false, Speak: false })
        .catch(() => null),
      API_TIMEOUT_MS,
      "permissionOverwrites.edit"
    );
    permsApplied = true;
  }

  // Rename with cooldown
  if (ch.name !== name) {
    const last = lastNameAttempt.get(ch.id) || 0;
    const now = Date.now();

    if (now - last >= NAME_ATTEMPT_COOLDOWN_MS) {
      lastNameAttempt.set(ch.id, now);
      await withTimeout(ch.setName(name).catch(() => null), SETNAME_TIMEOUT_MS, "setName");
    }
  }

  return { channel: ch, permsApplied };
}

/**
 * Repair / reconcile:
 * - Dedup entries by timezone
 * - Relink missing channelId by label
 * - Optionally delete duplicates in category
 */
async function repairTimeChannelsForGuild(guild, { deleteDuplicates = false } = {}) {
  const cfg = getGuildConfig(guild.id);
  const categoryId = cfg.timeCategoryId;
  if (!categoryId) return { fixed: 0, deleted: 0 };

  const category =
    guild.channels.cache.get(categoryId) ||
    (await guild.channels.fetch(categoryId).catch(() => null));

  if (!category || category.type !== ChannelType.GuildCategory) {
    return { fixed: 0, deleted: 0 };
  }

  let entries = Array.isArray(cfg.timeChannels) ? cfg.timeChannels : [];
  entries = dedupeEntries(entries);

  let fixed = 0;
  let deleted = 0;

  const next = [];
  for (const e of entries) {
    const tz = String(e.timeZone || "").trim();
    if (!tz) continue;

    const label = safeLabel(e.label, tz);
    let channelId = e.channelId || null;

    if (!channelId) {
      const matches = await findMatchingChannels(guild, categoryId, label);
      if (matches.length > 0) {
        channelId = matches[0].id;
        fixed++;
      }
    }

    if (deleteDuplicates) {
      const matches = await findMatchingChannels(guild, categoryId, label);
      const keepId = channelId || (matches[0] ? matches[0].id : null);

      for (const m of matches) {
        if (keepId && m.id !== keepId) {
          await m.delete("TimeChannels repair: removing duplicate").catch(() => null);
          deleted++;
        }
      }
    }

    next.push({
      timeZone: tz,
      label,
      ...(channelId ? { channelId } : {}),
      ...(e.permsApplied ? { permsApplied: true } : {}),
    });
  }

  setGuildConfig(guild.id, { timeChannels: next });
  return { fixed, deleted };
}

/**
 * Update time channels for a guild.
 * - Staggered + 2 minute tick (rename only)
 * - perms applied once
 */
async function updateTimeChannelsForGuild(guild, { force = false } = {}) {
  if (guildLocks.has(guild.id)) return guildLocks.get(guild.id);

  const p = (async () => {
    const now = Date.now();
    const last = lastRun.get(guild.id) || 0;
    if (!force && now - last < MIN_INTERVAL_MS) return;
    lastRun.set(guild.id, now);

    const cfg = getGuildConfig(guild.id);
    const categoryId = cfg.timeCategoryId;
    let entries = Array.isArray(cfg.timeChannels) ? cfg.timeChannels : [];
    if (!categoryId || entries.length === 0) return;

    const category =
      guild.channels.cache.get(categoryId) ||
      (await withTimeout(
        guild.channels.fetch(categoryId).catch(() => null),
        API_TIMEOUT_MS,
        "fetch category"
      ));

    if (!category || category.type !== ChannelType.GuildCategory) return;

    let me = guild.members.me;
    if (!me) me = await guild.members.fetchMe().catch(() => null);
    if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) return;

    entries = dedupeEntries(entries);
    const locale = cfg.timeLocale || "en-GB";

    const updated = [];
    for (const e of entries) {
      const timeZone = String(e?.timeZone || "").trim();
      if (!timeZone) continue;

      // Stagger updates unless forced
      if (!force && !shouldUpdateThisTick(guild.id, timeZone)) {
        updated.push(e);
        continue;
      }

      const timeStr = formatTimeForZone(timeZone, locale);
      if (!timeStr) {
        console.warn(`⚠️ Invalid timeZone "${timeZone}" in guild ${guild.id}`);
        updated.push(e);
        continue;
      }

      const label = safeLabel(e?.label, timeZone);

      // If we don’t have channelId, try to relink by label before creating a new one.
      let channelId = e.channelId || null;
      if (!channelId) {
        const matches = await findMatchingChannels(guild, categoryId, label);
        if (matches.length > 0) channelId = matches[0].id;
      }

      const name = buildChannelName(label, timeStr);

      try {
        const { channel, permsApplied } = await ensureVoiceTimeChannel(
          guild,
          categoryId,
          { ...e, channelId },
          name
        );

        updated.push({
          timeZone,
          label,
          channelId: channel.id,
          permsApplied,
        });
      } catch (err) {
        console.warn(
          `⚠️ TimeChannels update issue for "${label}" in guild ${guild.id}:`,
          err?.message || err
        );

        // Reconcile by label
        const matches = await findMatchingChannels(guild, categoryId, label);
        if (matches.length > 0) {
          updated.push({ timeZone, label, channelId: matches[0].id, permsApplied: Boolean(e?.permsApplied) });
        } else {
          updated.push({ timeZone, label, ...(e?.permsApplied ? { permsApplied: true } : {}) });
        }
      }
    }

    setGuildConfig(guild.id, { timeChannels: updated });
  })().finally(() => guildLocks.delete(guild.id));

  guildLocks.set(guild.id, p);
  return p;
}

/**
 * Start a global ticker:
 * - runs immediately
 * - then every 2 minutes (TICK_MS)
 * - staggered inside updateTimeChannelsForGuild
 */
function startTimeChannelsTicker(client) {
  if (client._timeChannelsTickerStarted) return;
  client._timeChannelsTickerStarted = true;

  const runAll = async () => {
    for (const guild of client.guilds.cache.values()) {
      updateTimeChannelsForGuild(guild).catch(() => null);
    }
  };

  runAll().catch(() => null);

  // Align to next tick boundary
  const now = Date.now();
  const msToNextTick = TICK_MS - (now % TICK_MS) + 250;
  setTimeout(() => {
    runAll().catch(() => null);
    setInterval(() => runAll().catch(() => null), TICK_MS);
  }, msToNextTick);
}

module.exports = {
  updateTimeChannelsForGuild,
  startTimeChannelsTicker,
  repairTimeChannelsForGuild,
};
