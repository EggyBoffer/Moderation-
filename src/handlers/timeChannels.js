const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

const lastRun = new Map();
const MIN_INTERVAL_MS = 10_000;

const API_TIMEOUT_MS = 15_000;
const SETNAME_TIMEOUT_MS = 30_000;

// Prevent concurrent updates per guild (ticker + command collisions)
const guildLocks = new Map();

// Per-channel cooldown so we don't spam rename attempts if Discord is slow
const lastNameAttempt = new Map(); // channelId -> timestamp
const NAME_ATTEMPT_COOLDOWN_MS = 90_000; // 1.5 minutes

// Per-guild+timezone minute key to avoid repeated attempts within the same minute
const lastMinuteKey = new Map(); // `${guildId}:${timeZone}` -> "YYYYMMDDHHmm"

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

// Build a stable "minute key" per timezone so we only try once per minute
function minuteKeyForZone(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());

    const get = (t) => parts.find((p) => p.type === t)?.value || "00";
    // YYYYMMDDHHmm
    return `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}`;
  } catch {
    // fallback: local minute key
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
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

function dedupeEntries(entries) {
  const map = new Map();
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

    if (!existing.channelId && channelId) {
      map.set(tz, { timeZone: tz, label: label || existing.label, channelId });
      continue;
    }

    if (!existing.label && label) {
      map.set(tz, { ...existing, label });
    }
  }
  return [...map.values()];
}

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

  if (categoryId && ch.parentId !== categoryId) {
    await withTimeout(
      ch.setParent(categoryId).catch(() => null),
      API_TIMEOUT_MS,
      "setParent"
    );
  }

  await withTimeout(
    ch.permissionOverwrites
      .edit(everyoneRoleId, { Connect: false, Speak: false })
      .catch(() => null),
    API_TIMEOUT_MS,
    "permissionOverwrites.edit"
  );

  // Rename with cooldown
  if (ch.name !== name) {
    const last = lastNameAttempt.get(ch.id) || 0;
    const now = Date.now();

    if (now - last >= NAME_ATTEMPT_COOLDOWN_MS) {
      lastNameAttempt.set(ch.id, now);
      await withTimeout(ch.setName(name).catch(() => null), SETNAME_TIMEOUT_MS, "setName");
    }
  }

  return ch;
}

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

    next.push({ timeZone: tz, label, ...(channelId ? { channelId } : {}) });
  }

  setGuildConfig(guild.id, { timeChannels: next });
  return { fixed, deleted };
}

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

      // Only attempt once per minute per timezone (unless forced)
      const key = `${guild.id}:${timeZone}`;
      const mk = minuteKeyForZone(timeZone);
      if (!force && lastMinuteKey.get(key) === mk) continue;
      lastMinuteKey.set(key, mk);

      const timeStr = formatTimeForZone(timeZone, locale);
      if (!timeStr) continue;

      const label = safeLabel(e?.label, timeZone);

      let channelId = e.channelId || null;
      if (!channelId) {
        const matches = await findMatchingChannels(guild, categoryId, label);
        if (matches.length > 0) channelId = matches[0].id;
      }

      const name = buildChannelName(label, timeStr);

      try {
        const ch = await ensureVoiceTimeChannel(guild, categoryId, channelId, name);
        updated.push({ timeZone, label, channelId: ch.id });
      } catch (err) {
        console.warn(
          `⚠️ TimeChannels update issue for "${label}" in guild ${guild.id}:`,
          err?.message || err
        );

        const matches = await findMatchingChannels(guild, categoryId, label);
        if (matches.length > 0) updated.push({ timeZone, label, channelId: matches[0].id });
        else updated.push({ timeZone, label });
      }
    }

    if (updated.length > 0) {
      setGuildConfig(guild.id, { timeChannels: updated });
    }
  })().finally(() => guildLocks.delete(guild.id));

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

  const now = Date.now();
  const msToNextMinute = 60_000 - (now % 60_000) + 250;
  setTimeout(() => {
    runAll().catch(() => null);
    setInterval(() => runAll().catch(() => null), 60_000);
  }, msToNextMinute);
}

module.exports = {
  updateTimeChannelsForGuild,
  startTimeChannelsTicker,
  repairTimeChannelsForGuild,
};
