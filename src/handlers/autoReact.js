const { PermissionFlagsBits } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

function ensureAutoReact(cfg) {
  const ar = cfg.autoReact || {};
  return {
    enabled: Boolean(ar.enabled),
    channelIds: Array.isArray(ar.channelIds) ? ar.channelIds : [],
    // "any" | "images" | "text" | "both"
    mode: typeof ar.mode === "string" ? ar.mode : "any",
    // up to a few emojis. store as strings like "🔥" or custom "<:name:id>"
    emojis: Array.isArray(ar.emojis) ? ar.emojis : ["✅"],
    ignoreBots: ar.ignoreBots !== false, // default true
  };
}

function setAutoReactConfig(guildId, updates) {
  const cfg = getGuildConfig(guildId);
  const current = ensureAutoReact(cfg);
  const next = { ...current, ...updates };

  // clean
  next.channelIds = Array.from(new Set((next.channelIds || []).filter(Boolean)));
  next.emojis = Array.from(new Set((next.emojis || []).filter(Boolean))).slice(0, 10);

  setGuildConfig(guildId, { autoReact: next });
  return next;
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
  const img = hasImageAttachment(message) || (message.embeds || []).some((e) => e?.image?.url);
  const text = hasTextContent(message);

  if (mode === "images") return img;
  if (mode === "text") return text;
  if (mode === "both") return img && text;
  return true; // any
}

async function tryReact(message, emojis) {
  // bot needs AddReactions + ReadMessageHistory in that channel
  const me = message.guild.members.me;
  if (!me) return;

  const perms = message.channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.AddReactions)) return;
  if (!perms?.has(PermissionFlagsBits.ReadMessageHistory)) return;

  for (const em of emojis) {
    try {
      await message.react(em);
    } catch {
      // ignore invalid emoji or missing perms
    }
  }
}

module.exports = {
  ensureAutoReact,
  setAutoReactConfig,
  shouldReact,
  tryReact,
};
