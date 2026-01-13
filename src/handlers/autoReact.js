const { PermissionFlagsBits } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

function ensureAutoReact(cfg) {
  const ar = cfg.autoReact || {};
  const rulesRaw = ar.rules && typeof ar.rules === "object" ? ar.rules : {};

  const rules = {};
  for (const [channelId, r] of Object.entries(rulesRaw)) {
    rules[channelId] = {
      enabled: r?.enabled !== false, 
      mode: typeof r?.mode === "string" ? r.mode : "any",
      emojis: Array.isArray(r?.emojis) && r.emojis.length ? r.emojis : ["✅"],
      ignoreBots: r?.ignoreBots !== false, 
    };
  }

  return {
    enabled: Boolean(ar.enabled),
    rules,
  };
}

function setAutoReactConfig(guildId, updates) {
  const cfg = getGuildConfig(guildId);
  const current = ensureAutoReact(cfg);

  const next = {
    ...current,
    ...updates,
    rules: { ...current.rules, ...(updates.rules || {}) },
  };

  
  const cleaned = {};
  for (const [channelId, r] of Object.entries(next.rules || {})) {
    if (!channelId) continue;

    const emojis = Array.from(new Set((r.emojis || []).filter(Boolean))).slice(0, 10);
    cleaned[channelId] = {
      enabled: r.enabled !== false,
      mode: typeof r.mode === "string" ? r.mode : "any",
      emojis: emojis.length ? emojis : ["✅"],
      ignoreBots: r.ignoreBots !== false,
    };
  }
  next.rules = cleaned;

  setGuildConfig(guildId, { autoReact: next });
  return next;
}

function getRuleForChannel(cfg, channelId) {
  if (!cfg.enabled) return null;
  const rule = cfg.rules?.[channelId];
  if (!rule || rule.enabled === false) return null;
  return rule;
}

function hasImageAttachment(message) {
  const atts = message.attachments;
  if (!atts || atts.size === 0) return false;

  for (const [, a] of atts) {
    const ct = (a.contentType || "").toLowerCase();
    const name = (a.name || "").toLowerCase();
    if (ct.startsWith("image/")) return true;
    if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) return true;
  }
  return false;
}

function hasTextContent(message) {
  const content = String(message.content || "").trim();
  return content.length > 0;
}

function shouldReact(mode, message) {
  const img =
    hasImageAttachment(message) ||
    (message.embeds || []).some((e) => e?.image?.url);
  const text = hasTextContent(message);

  if (mode === "images") return img;
  if (mode === "text") return text;
  if (mode === "both") return img && text;
  return true; 
}

async function tryReact(message, emojis) {
  const me = message.guild.members.me;
  if (!me) return;

  const perms = message.channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.AddReactions)) return;
  if (!perms?.has(PermissionFlagsBits.ReadMessageHistory)) return;

  for (const em of emojis) {
    try {
      await message.react(em);
    } catch {
      
    }
  }
}

module.exports = {
  ensureAutoReact,
  setAutoReactConfig,
  getRuleForChannel,
  shouldReact,
  tryReact,
};
