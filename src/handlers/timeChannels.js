const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

const TICK_MS = 300_000;

const guildLocks = new Map();

const lastNameAttempt = new Map(); 
const NAME_ATTEMPT_COOLDOWN_MS = 300_000; 

const lastRun = new Map();
const MIN_INTERVAL_MS = 60_000; 

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
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  } catch {
    return null;
  }
}

function buildChannelName(label, timeStr) {
  const l = String(label || "").trim();
  const t = String(timeStr || "").trim();

  const endsWithColon = l.endsWith(":");
  const endsWithDash = l.endsWith("—") || l.endsWith("-");

  const name = endsWithColon || endsWithDash ? `${l} ${t}` : `${l} — ${t}`;
  return name.length > 96 ? name.slice(0, 96) : name;
}

function dedupeEntries(entries) {
  const map = new Map(); 

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

    
    if (!existing.channelId && channelId) {
      map.set(tz, {
        timeZone: tz,
        label: label || existing.label,
        channelId,
        permsApplied: permsApplied || existing.permsApplied || false,
      });
      continue;
    }

    
    if (!existing.label && label) {
      map.set(tz, { ...existing, label });
    }

    
    if (permsApplied && !existing.permsApplied) {
      map.set(tz, { ...map.get(tz), permsApplied: true });
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

async function ensureVoiceTimeChannel(guild, categoryId, entry, name) {
  let ch = null;

  if (entry?.channelId) {
    ch =
      guild.channels.cache.get(entry.channelId) ||
      (await guild.channels.fetch(entry.channelId).catch(() => null));

    if (ch && ch.type !== ChannelType.GuildVoice) ch = null;
  }

  const everyoneRoleId = guild.roles.everyone.id;

  
  if (!ch) {
    ch = await guild.channels
      .create({
        name,
        type: ChannelType.GuildVoice,
        parent: categoryId || null,
        permissionOverwrites: [
          {
            id: everyoneRoleId,
            deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
          },
        ],
      })
      .catch(() => null);

    if (!ch) throw new Error("channels.create failed (possibly rate limited/permissions)");

    return { channel: ch, permsApplied: true };
  }

  
  if (categoryId && ch.parentId !== categoryId) {
    await ch.setParent(categoryId).catch(() => null);
  }

  
  let permsApplied = Boolean(entry?.permsApplied);
  if (!permsApplied) {
    await ch.permissionOverwrites
      .edit(everyoneRoleId, { Connect: false, Speak: false })
      .catch(() => null);
    permsApplied = true;
  }

  
  if (ch.name !== name) {
    const last = lastNameAttempt.get(ch.id) || 0;
    const now = Date.now();
    if (now - last >= NAME_ATTEMPT_COOLDOWN_MS) {
      lastNameAttempt.set(ch.id, now);
      await ch.setName(name).catch(() => null);
    }
  }

  return { channel: ch, permsApplied };
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
      (await guild.channels.fetch(categoryId).catch(() => null));

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

      const timeStr = formatTimeForZone(timeZone, locale);
      if (!timeStr) {
        updated.push(e);
        continue;
      }

      const label = safeLabel(e?.label, timeZone);

      
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
        updated.push(e);
      }
    }

    setGuildConfig(guild.id, { timeChannels: updated });
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
