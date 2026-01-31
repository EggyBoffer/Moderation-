const {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

const runtime = {
  lastNotify: new Map(),
};

function mkKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function safeLower(s) {
  return String(s || "").toLowerCase();
}

function clip(s, n) {
  const str = String(s || "");
  if (str.length <= n) return str;
  return str.slice(0, Math.max(0, n - 1)) + "…";
}

function makeId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeChannels(chs) {
  const arr = Array.isArray(chs) ? chs : [];
  return Array.from(new Set(arr.filter(Boolean)));
}

function normalizeRules(rules) {
  const arr = Array.isArray(rules) ? rules : [];
  return arr
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const type = String(r.type || "").toLowerCase();
      if (!type) return null;
      const out = {
        id: String(r.id || makeId()),
        type,
      };
      if (type === "keyword") {
        out.keyword = String(r.keyword || "").trim();
        out.caseSensitive = Boolean(r.caseSensitive);
        out.channels = normalizeChannels(r.channels);
      } else if (type === "user") {
        out.userId = String(r.userId || "");
        out.channels = normalizeChannels(r.channels);
      } else if (type === "channel") {
        out.channels = normalizeChannels(r.channels);
      } else {
        return null;
      }
      return out;
    })
    .filter(Boolean);
}

function getState(guildId) {
  const cfg = getGuildConfig(guildId);
  const raw = cfg.watchSystem && typeof cfg.watchSystem === "object" ? cfg.watchSystem : {};

  const inbox = raw.inbox && typeof raw.inbox === "object" ? raw.inbox : {};
  const users = raw.users && typeof raw.users === "object" ? raw.users : {};

  const state = {
    inbox: {
      enabled: Boolean(inbox.enabled),
      channelId: String(inbox.channelId || ""),
      mode: String(inbox.mode || "thread"),
      staffRoleId: String(inbox.staffRoleId || ""),
      allowStaffView: Boolean(inbox.allowStaffView),
    },
    users: {},
  };

  for (const [userId, u] of Object.entries(users)) {
    if (!u || typeof u !== "object") continue;
    state.users[userId] = {
      mode: String(u.mode || "dm"),
      paused: Boolean(u.paused),
      rules: normalizeRules(u.rules),
      inboxThreadId: String(u.inboxThreadId || ""),
    };
  }

  return state;
}

function saveState(guildId, state) {
  setGuildConfig(guildId, { watchSystem: state });
}

function ensureUser(state, userId) {
  if (!state.users[userId]) {
    state.users[userId] = { mode: "dm", paused: false, rules: [], inboxThreadId: "" };
  }
  if (!Array.isArray(state.users[userId].rules)) state.users[userId].rules = [];
  return state.users[userId];
}

function setUserMode(guildId, userId, mode) {
  const state = getState(guildId);
  const u = ensureUser(state, userId);
  u.mode = String(mode || "dm").toLowerCase();
  saveState(guildId, state);
  return state;
}

function setUserPaused(guildId, userId, paused) {
  const state = getState(guildId);
  const u = ensureUser(state, userId);
  u.paused = Boolean(paused);
  saveState(guildId, state);
  return state;
}

function setInboxConfig(guildId, patch) {
  const state = getState(guildId);
  state.inbox = { ...state.inbox, ...patch };
  saveState(guildId, state);
  return state;
}

function addRuleKeyword(guildId, userId, keyword, channels, caseSensitive) {
  const state = getState(guildId);
  const u = ensureUser(state, userId);
  const k = String(keyword || "").trim();
  if (!k) return null;
  const rule = {
    id: makeId(),
    type: "keyword",
    keyword: k,
    caseSensitive: Boolean(caseSensitive),
    channels: normalizeChannels(channels),
  };
  u.rules.push(rule);
  saveState(guildId, state);
  return rule;
}

function addRuleUser(guildId, userId, watchedUserId, channels) {
  const state = getState(guildId);
  const u = ensureUser(state, userId);
  const w = String(watchedUserId || "");
  if (!w) return null;
  const rule = {
    id: makeId(),
    type: "user",
    userId: w,
    channels: normalizeChannels(channels),
  };
  u.rules.push(rule);
  saveState(guildId, state);
  return rule;
}

function addRuleChannel(guildId, userId, channels) {
  const state = getState(guildId);
  const u = ensureUser(state, userId);
  const ch = normalizeChannels(channels);
  if (!ch.length) return null;
  const rule = {
    id: makeId(),
    type: "channel",
    channels: ch,
  };
  u.rules.push(rule);
  saveState(guildId, state);
  return rule;
}

function removeRule(guildId, userId, ruleId) {
  const state = getState(guildId);
  const u = ensureUser(state, userId);
  const before = u.rules.length;
  u.rules = u.rules.filter((r) => r.id !== ruleId);
  saveState(guildId, state);
  return before !== u.rules.length;
}

function listRules(guildId, userId) {
  const state = getState(guildId);
  const u = ensureUser(state, userId);
  return { state, user: u };
}

function channelAllowed(rule, channelId) {
  const list = normalizeChannels(rule.channels);
  if (!list.length) return true;
  return list.includes(channelId);
}

function matchRule(rule, message) {
  if (!rule || !message) return null;
  const type = String(rule.type || "").toLowerCase();
  if (type === "keyword") {
    if (!rule.keyword) return null;
    if (!channelAllowed(rule, message.channelId)) return null;
    const hay = rule.caseSensitive ? String(message.content || "") : safeLower(message.content || "");
    const needle = rule.caseSensitive ? String(rule.keyword) : safeLower(rule.keyword);
    if (!needle) return null;
    if (hay.includes(needle)) return `Keyword: ${rule.keyword}`;
    return null;
  }

  if (type === "user") {
    if (!rule.userId) return null;
    if (!channelAllowed(rule, message.channelId)) return null;
    if (message.author?.id === rule.userId) return `User: <@${rule.userId}>`;
    return null;
  }

  if (type === "channel") {
    const list = normalizeChannels(rule.channels);
    if (!list.length) return null;
    if (list.includes(message.channelId)) return `Channel: <#${message.channelId}>`;
    return null;
  }

  return null;
}

function buildEmbed(message, triggers) {
  const guildId = message.guildId;
  const channelId = message.channelId;
  const messageId = message.id;
  const jump = `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;

  const embed = new EmbedBuilder()
    .setTitle("Watch Alert")
    .setDescription(
      `**From:** ${message.author?.tag || "Unknown"} (ID: ${message.author?.id || "?"})\n` +
      `**Channel:** <#${channelId}>\n` +
      `**Matched:** ${triggers.join(" • ")}\n` +
      `**Jump:** ${jump}`
    )
    .setTimestamp(new Date());

  const snippet = clip(String(message.content || "").replace(/\s+/g, " ").trim(), 200);
  if (snippet) embed.addFields({ name: "Message", value: snippet });

  return embed;
}

async function getOrCreateInboxThread(client, guild, state, userId) {
  if (!state.inbox.enabled || !state.inbox.channelId) return null;
  const inboxChannel = await client.channels.fetch(state.inbox.channelId).catch(() => null);
  if (!inboxChannel) return null;
  if (!inboxChannel.isTextBased()) return null;

  const u = ensureUser(state, userId);
  if (u.inboxThreadId) {
    const existing = await client.channels.fetch(u.inboxThreadId).catch(() => null);
    if (existing && existing.type === ChannelType.PrivateThread) {
      return existing;
    }
    u.inboxThreadId = "";
  }

  const me = guild.members.me;
  if (!me) return null;
  const perms = inboxChannel.permissionsFor(me);
  if (!perms) return null;

  const canCreate = perms.has(PermissionFlagsBits.ManageThreads) || perms.has(PermissionFlagsBits.ManageChannels);
  if (!canCreate) return null;

  const thread = await inboxChannel.threads
    .create({
      name: `inbox-${userId}`,
      autoArchiveDuration: 10080,
      type: ChannelType.PrivateThread,
      invitable: false,
    })
    .catch(() => null);

  if (!thread) return null;

  await thread.members.add(userId).catch(() => null);

  if (state.inbox.allowStaffView && state.inbox.staffRoleId) {
    const role = await guild.roles.fetch(state.inbox.staffRoleId).catch(() => null);
    if (role) {
      const members = role.members;
      for (const m of members.values()) {
        await thread.members.add(m.id).catch(() => null);
      }
    }
  }

  u.inboxThreadId = thread.id;
  saveState(guild.id, state);

  return thread;
}

async function notifyUser(client, guild, state, userId, embed) {
  const u = ensureUser(state, userId);
  const mode = String(u.mode || "dm").toLowerCase();
  const wantsInbox = mode === "inbox" || mode === "both";
  const wantsDM = mode === "dm" || mode === "both";

  if (wantsInbox) {
    const thread = await getOrCreateInboxThread(client, guild, state, userId);
    if (thread) {
      const sent = await thread.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => null);
      if (sent) return true;
    }
  }

  if (wantsDM) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return false;
    const sent = await user.send({ embeds: [embed] }).catch(() => null);
    if (sent) return true;
  }

  return false;
}

async function handleWatchMessage(client, message) {
  if (!message || !message.inGuild()) return;
  if (!message.guildId) return;
  if (!message.author || message.author.bot) return;

  const guild = message.guild;
  if (!guild) return;

  const state = getState(message.guildId);
  const userEntries = Object.entries(state.users);
  if (!userEntries.length) return;

  for (const [userId, u] of userEntries) {
    if (!u || u.paused) continue;
    const mode = String(u.mode || "dm").toLowerCase();
    if (mode === "off" || mode === "none") continue;
    if (userId === message.author.id) continue;

    const triggers = [];
    for (const rule of u.rules || []) {
      const hit = matchRule(rule, message);
      if (hit) triggers.push(hit);
    }

    if (!triggers.length) continue;

    const k = mkKey(message.guildId, userId);
    const last = runtime.lastNotify.get(k) || 0;
    const now = Date.now();
    if (now - last < 7000) continue;
    runtime.lastNotify.set(k, now);

    const embed = buildEmbed(message, triggers);
    await notifyUser(client, guild, state, userId, embed);
  }
}

module.exports = {
  getState,
  setInboxConfig,
  setUserMode,
  setUserPaused,
  addRuleKeyword,
  addRuleUser,
  addRuleChannel,
  removeRule,
  listRules,
  handleWatchMessage,
};
