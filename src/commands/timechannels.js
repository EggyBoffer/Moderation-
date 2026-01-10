const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

const lastRun = new Map();
const MIN_INTERVAL_MS = 10_000;

// If Discord is slow, requests can “succeed” after we give up waiting.
// We’ll still use timeouts, but also reconcile by scanning category channels.
const API_TIMEOUT_MS = 15_000;

// Prevent concurrent updates per guild (command + ticker collisions)
const guildLocks = new Map();

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

    const existing = map.get(tz);
    if (!existing) {
      map.set(tz, { timeZone: tz, label, ...(channelId ? { channelId } : {}) });
      continue;
    }

    // Prefer keeping a linked channelId
    if (!existing.channelId && channelId) {
      map.set(tz, { timeZone: tz, label: label || existing.label, channelId });
      continue;
    }

    // Otherwise keep existing, but update label if it was empty
    if (!existing.label && label) {
      map.set(tz, { ...existing, label });
    }
  }
  return [...map.values()];
}

/**
 * Scan the category for voice channels that match a label (prefix match),
 * and return all candidates.
 */
async function findMatchingChannels(guild, categoryId, label) {
  const normLabel = normalizeLabelForMatch(label);
  if (!normLabel) return [];

  // Ensure cache has category children
  const channels = guild.channels.cache.filter(
    (c) => c.parentId === categoryId && c.type === ChannelType.GuildVoice
  );

  const matches = [];
  for (const c of channels.values()) {
    const n = normalizeLabelForMatch(c.name);
    // Match if channel name begins with label (e.g. "Skinner time:" or "🕒 UK")
    if (n.startsWith(normLabel)) matches.push(c);
  }

  // Newest first is fine; Discord snowflakes by ID
  matches.sort((a, b) => (a.id < b.id ? 1 : -1));
  return matches;
}

async function ensureVoiceTimeChannel(guild, categoryId, channelId, name) {
  let ch = null;

  if (channelId) {
    ch =
      guild.channels.cache.get(channelId) ||
      (await withTimeout(
        guild.channels.fetch(channelId).catch(() => null),
        API_TIMEOUT_MS,
        "channels.fetch"
      ));

    if (ch && ch.type !== ChannelType.GuildVoice) ch = null;
  }

  const everyoneRoleId = guild.roles.everyone.id;

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
    return ch;
  }

  // Existing channel: fix parent, perms, and name
  if (categoryId && ch.parentId !== categoryId) {
    await withTimeout(ch.setParent(categoryId).catch(() => null), API_TIMEOUT_MS, "setParent");
  }

  await withTimeout(
    ch.permissionOverwrites
      .edit(everyoneRoleId, { Connect: false, Speak: false })
      .catch(() => null),
    API_TIMEOUT_MS,
    "permissionOverwrites.edit"
  );

  if (ch.name !== name) {
    await withTimeout(ch.setName(name).catch(() => null), API_TIMEOUT_MS, "setName");
  }

  return ch;
}

/**
 * Repair/reconcile:
 * - Dedup entries by timezone
 * - If entry has no channelId, try to find a matching channel by label in the category
 * - Optionally delete duplicates in category for a given label
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

    // If missing channelId, try to relink by matching channels
    if (!channelId) {
      const matches = await findMatchingChannels(guild, categoryId, label);
      if (matches.length > 0) {
        channelId = matches[0].id;
        fixed++;
      }
    }

    // Optionally delete duplicates for this label (keep the linked one)
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

    next.push({ timeZone: tz, label, ...(channelId ? { channelId } : {}) });
  }

  setGuildConfig(guild.id, { timeChannels: next });
  return { fixed, deleted };
}

async function updateTimeChannelsForGuild(guild, { force = false } = {}) {
  // Per-guild lock: do not overlap (ticker + command)
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
      (await withTimeout(guild.channels.fetch(categoryId).catch(() => null), API_TIMEOUT_MS, "fetch category"));

    if (!category || category.type !== ChannelType.GuildCategory) {
      console.warn(`⚠️ TimeChannels category missing/invalid for guild ${guild.id}.`);
      return;
    }

    let me = guild.members.me;
    if (!me) me = await guild.members.fetchMe().catch(() => null);
    if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
      console.warn(`⚠️ Missing ManageChannels for timechannels in guild ${guild.id}.`);
      return;
    }

    // Always start by deduping config and attempting to relink missing channel IDs.
    entries = dedupeEntries(entries);

    const locale = cfg.timeLocale || "en-GB";

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

      // If we don’t have channelId, try to relink by label before creating a new one.
      let channelId = e.channelId || null;
      if (!channelId) {
        const matches = await findMatchingChannels(guild, categoryId, label);
        if (matches.length > 0) channelId = matches[0].id;
      }

      const name = buildChannelName(label, timeStr);

      try {
        const ch = await ensureVoiceTimeChannel(guild, categoryId, channelId, name);

        updated.push({
          timeZone,
          label,
          channelId: ch.id,
        });
      } catch (err) {
        // Critical: if Discord created it but we timed out, we might miss channelId.
        // So: do a reconciliation pass by label.
        console.warn(`⚠️ TimeChannels update issue for "${label}" in guild ${guild.id}:`, err?.message || err);

        const matches = await findMatchingChannels(guild, categoryId, label);
        if (matches.length > 0) {
          updated.push({ timeZone, label, channelId: matches[0].id });
        } else {
          // keep entry but without channelId; repair can relink later
          updated.push({ timeZone, label });
        }
      }
    }

    setGuildConfig(guild.id, { timeChannels: updated });
  })()
    .finally(() => guildLocks.delete(guild.id));

  guildLocks.set(guild.id, p);
  return p;
}

function startTimeChannelsTicker(client) {
  if (client._timeChannelsTickerStarted) return;
  client._timeChannelsTickerStarted = true;

  const runAll = async () => {
    for (const guild of client.guilds.cache.values()) {
      updateTimeChannelsForGuild(guild).catch(() => null);
    }
  };

  runAll().catch(() => null);

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

module.exports = {
  updateTimeChannelsForGuild,
  startTimeChannelsTicker,
  repairTimeChannelsForGuild,
};
