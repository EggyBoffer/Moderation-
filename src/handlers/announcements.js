const { EmbedBuilder } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

function nowMs() {
  return Date.now();
}

function safeString(v) {
  return typeof v === "string" ? v : "";
}

function normalizeNewlines(text) {
  return safeString(text).replace(/\\n/g, "\n");
}

function parseTimeHHMM(value) {
  const s = safeString(value).trim();
  const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

function parseDateTimeToMs(input) {
  const raw = safeString(input).trim();
  if (!raw) return null;

  if (/^\d{10}$/.test(raw)) {
    const sec = Number(raw);
    if (!Number.isFinite(sec)) return null;
    return sec * 1000;
  }

  const m = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/
  );
  if (m) {
    const yyyy = m[1];
    const MM = m[2];
    const dd = m[3];
    const hh = m[4];
    const mm = m[5];
    const ss = m[6] || "00";
    const tz = m[7] || "Z";

    const tzNorm = tz === "Z" ? "Z" : tz.includes(":") ? tz : `${tz.slice(0, 3)}:${tz.slice(3)}`;
    const iso = `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}${tzNorm}`;
    const ms = new Date(iso).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function lastDayOfMonthUTC(year, monthIndex0) {
  const d = new Date(Date.UTC(year, monthIndex0 + 1, 0, 12, 0, 0));
  return d.getUTCDate();
}

function computeNextRunFromTime(freq, timeHHMM, state) {
  const t = parseTimeHHMM(timeHHMM);
  if (!t) return null;
  const now = new Date(nowMs());

  if (freq === "daily" || freq === "weekly" || freq === "biweekly") {
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), t.hour, t.minute, 0));
    if (base.getTime() <= nowMs()) base.setUTCDate(base.getUTCDate() + 1);

    if (freq === "daily") return base.getTime();
    if (freq === "weekly") return base.getTime();
    if (freq === "biweekly") return base.getTime();
  }

  if (freq === "monthly") {
    const created = typeof state?.createdAt === "number" ? new Date(state.createdAt) : new Date(nowMs());
    const targetDay = typeof state?.dayOfMonth === "number" ? state.dayOfMonth : created.getUTCDate();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const maxDayThisMonth = lastDayOfMonthUTC(year, month);
    const dayThisMonth = Math.min(targetDay, maxDayThisMonth);
    const candidate = new Date(Date.UTC(year, month, dayThisMonth, t.hour, t.minute, 0));
    if (candidate.getTime() > nowMs()) return candidate.getTime();

    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const maxDayNextMonth = lastDayOfMonthUTC(nextYear, nextMonth);
    const dayNextMonth = Math.min(targetDay, maxDayNextMonth);
    const next = new Date(Date.UTC(nextYear, nextMonth, dayNextMonth, t.hour, t.minute, 0));
    return next.getTime();
  }

  return null;
}

function advanceNextRun(freq, currentNextRunAt, timeHHMM, state) {
  const base = typeof currentNextRunAt === "number" ? new Date(currentNextRunAt) : null;
  if (!base) return computeNextRunFromTime(freq, timeHHMM, state);

  if (freq === "daily") {
    base.setUTCDate(base.getUTCDate() + 1);
    return base.getTime();
  }
  if (freq === "weekly") {
    base.setUTCDate(base.getUTCDate() + 7);
    return base.getTime();
  }
  if (freq === "biweekly") {
    base.setUTCDate(base.getUTCDate() + 14);
    return base.getTime();
  }
  if (freq === "monthly") {
    const t = parseTimeHHMM(timeHHMM);
    const targetDay = typeof state?.dayOfMonth === "number" ? state.dayOfMonth : base.getUTCDate();
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth();
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const maxDay = lastDayOfMonthUTC(nextYear, nextMonth);
    const day = Math.min(targetDay, maxDay);
    const next = new Date(Date.UTC(nextYear, nextMonth, day, t ? t.hour : base.getUTCHours(), t ? t.minute : base.getUTCMinutes(), 0));
    return next.getTime();
  }

  return null;
}

function convertTimestampTokens(text) {
  const s = normalizeNewlines(text);

  const convert = (match, mode, dateStr) => {
    const ms = parseDateTimeToMs(dateStr);
    if (!ms) return match;
    const unix = Math.floor(ms / 1000);
    const fmt = mode === "r" ? "R" : "F";
    return `<t:${unix}:${fmt}>`;
  };

  return s
    .replace(/\{t:(.+?)\}/g, (m, d) => convert(m, "f", d))
    .replace(/\{tr:(.+?)\}/g, (m, d) => convert(m, "r", d));
}

function getGuildAnnouncements(guildId) {
  const cfg = getGuildConfig(guildId);
  const ann = cfg.announcements && typeof cfg.announcements === "object" ? cfg.announcements : {};
  const items = Array.isArray(ann.items) ? ann.items : [];
  return { ...ann, items };
}

function setGuildAnnouncements(guildId, announcements) {
  return setGuildConfig(guildId, { announcements });
}

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPingString(pingType, roleId) {
  if (pingType === "everyone") return "@everyone";
  if (pingType === "here") return "@here";
  if (pingType === "role" && roleId) return `<@&${roleId}>`;
  return "";
}

function buildAllowedMentions(pingType, roleId) {
  if (pingType === "everyone" || pingType === "here") return { parse: ["everyone"], roles: [], users: [], repliedUser: false };
  if (pingType === "role" && roleId) return { parse: [], roles: [roleId], users: [], repliedUser: false };
  return { parse: [], roles: [], users: [], repliedUser: false };
}

function makeEmbed(title, description) {
  const embed = new EmbedBuilder();
  const t = safeString(title).trim();
  if (t) embed.setTitle(t);
  embed.setDescription(convertTimestampTokens(description));
  return embed;
}

async function fireAnnouncement(client, guildId, item) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { ok: false, reason: "guild_missing" };

  const channelId = item.channelId;
  if (!channelId) return { ok: false, reason: "channel_missing" };

  let channel = guild.channels.cache.get(channelId);
  if (!channel) {
    try {
      channel = await guild.channels.fetch(channelId);
    } catch {
      channel = null;
    }
  }
  if (!channel || !channel.isTextBased()) return { ok: false, reason: "channel_invalid" };

  const ping = buildPingString(item.pingType, item.pingRoleId);
  const allowedMentions = buildAllowedMentions(item.pingType, item.pingRoleId);
  const title = safeString(item.title);
  const body = safeString(item.message);

  const embed = makeEmbed(title, body);

  try {
    await channel.send({ content: ping || undefined, embeds: [embed], allowedMentions });
    return { ok: true };
  } catch {
    return { ok: false, reason: "send_failed" };
  }
}

async function tickAnnouncements(client) {
  const dueCutoff = nowMs();
  for (const guild of client.guilds.cache.values()) {
    const state = getGuildAnnouncements(guild.id);
    if (!state.items.length) continue;

    let changed = false;
    const remaining = [];

    for (const item of state.items) {
      const paused = !!item.paused;
      const nextRunAt = typeof item.nextRunAt === "number" ? item.nextRunAt : null;
      if (paused || !nextRunAt || nextRunAt > dueCutoff) {
        remaining.push(item);
        continue;
      }

      const res = await fireAnnouncement(client, guild.id, item);
      if (!res.ok) {
        const bumped = { ...item, nextRunAt: dueCutoff + 60_000 };
        remaining.push(bumped);
        changed = true;
        continue;
      }

      if (item.frequency === "once") {
        changed = true;
        continue;
      }

      const next = advanceNextRun(item.frequency, item.nextRunAt, item.timeHHMM, item);
      if (!next) {
        changed = true;
        continue;
      }

      remaining.push({ ...item, nextRunAt: next, lastRunAt: dueCutoff });
      changed = true;
    }

    if (changed) {
      setGuildAnnouncements(guild.id, { ...state, items: remaining });
    }
  }
}

function startAnnouncementsTicker(client) {
  if (client.__announcementsTicker) return;

  client.__announcementsTicker = setInterval(() => {
    tickAnnouncements(client).catch(() => null);
  }, 30_000);
}

function createAnnouncement(guildId, payload) {
  const state = getGuildAnnouncements(guildId);
  const items = state.items.slice();

  const id = genId();
  const createdAt = nowMs();
  const frequency = payload.frequency;
  const channelId = payload.channelId;
  const pingType = payload.pingType;
  const pingRoleId = payload.pingRoleId || "";
  const title = safeString(payload.title);
  const message = normalizeNewlines(payload.message);

  const base = {
    id,
    createdAt,
    channelId,
    pingType,
    pingRoleId,
    title,
    message,
    paused: false,
  };

  if (frequency === "once") {
    const runAtMs = parseDateTimeToMs(payload.runAt);
    if (!runAtMs) return { ok: false, error: "invalid_datetime" };
    if (runAtMs <= nowMs() + 5000) return { ok: false, error: "datetime_in_past" };
    items.push({ ...base, frequency: "once", nextRunAt: runAtMs, runAt: runAtMs });
    setGuildAnnouncements(guildId, { ...state, items });
    return { ok: true, id, nextRunAt: runAtMs };
  }

  const timeHHMM = safeString(payload.timeHHMM).trim();
  const freq = payload.frequency;
  if (!["daily", "weekly", "biweekly", "monthly"].includes(freq)) return { ok: false, error: "invalid_frequency" };
  const dayOfMonth = new Date(createdAt).getUTCDate();
  const nextRunAt = computeNextRunFromTime(freq, timeHHMM, { createdAt, dayOfMonth });
  if (!nextRunAt) return { ok: false, error: "invalid_time" };

  items.push({ ...base, frequency: freq, timeHHMM, nextRunAt, dayOfMonth });
  setGuildAnnouncements(guildId, { ...state, items });
  return { ok: true, id, nextRunAt };
}

function listAnnouncements(guildId) {
  const state = getGuildAnnouncements(guildId);
  return state.items.slice();
}

function deleteAnnouncement(guildId, id) {
  const state = getGuildAnnouncements(guildId);
  const before = state.items.length;
  const items = state.items.filter((x) => x.id !== id);
  if (items.length === before) return { ok: false };
  setGuildAnnouncements(guildId, { ...state, items });
  return { ok: true };
}

function setAnnouncementPaused(guildId, id, paused) {
  const state = getGuildAnnouncements(guildId);
  const items = state.items.map((x) => (x.id === id ? { ...x, paused: !!paused } : x));
  const found = items.some((x) => x.id === id);
  if (!found) return { ok: false };
  setGuildAnnouncements(guildId, { ...state, items });
  return { ok: true };
}

module.exports = {
  startAnnouncementsTicker,
  createAnnouncement,
  listAnnouncements,
  deleteAnnouncement,
  setAnnouncementPaused,
  parseDateTimeToMs,
};