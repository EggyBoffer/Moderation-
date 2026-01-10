const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

function ensureStarboard(cfg) {
  const sb = cfg.starboard || {};
  return {
    enabled: Boolean(sb.enabled),
    starboardChannelId: sb.starboardChannelId || null,
    watchChannelIds: Array.isArray(sb.watchChannelIds) ? sb.watchChannelIds : [],
    emoji: typeof sb.emoji === "string" ? sb.emoji : "⭐",
    threshold: Number.isFinite(sb.threshold) ? sb.threshold : 3,
    ignoreBots: sb.ignoreBots !== false, // default true
    excludeSelf: sb.excludeSelf !== false, // default true
  };
}

function ensureIndex(cfg) {
  if (!cfg.starboardIndex || typeof cfg.starboardIndex !== "object") cfg.starboardIndex = {};
  return cfg.starboardIndex;
}

function setStarboardConfig(guildId, updates) {
  const cfg = getGuildConfig(guildId);
  const current = ensureStarboard(cfg);
  const next = { ...current, ...updates };

  next.watchChannelIds = Array.from(new Set((next.watchChannelIds || []).filter(Boolean)));
  if (typeof next.threshold !== "number" || next.threshold < 1) next.threshold = 1;

  setGuildConfig(guildId, { starboard: next });
  return next;
}

function emojiMatches(reaction, emojiStr) {
  // For unicode emoji, reaction.emoji.name is the character.
  // For custom, you can configure "<:name:id>" or just "name:id" or id.
  const cfg = String(emojiStr || "").trim();

  const name = reaction.emoji?.name || "";
  const id = reaction.emoji?.id || "";

  if (!cfg) return false;

  if (cfg === name) return true; // unicode or custom name match
  if (id && cfg.includes(id)) return true; // matches "<:x:id>" or "name:id"
  if (id && cfg === id) return true;

  return false;
}

async function countValidStars(reaction, message, cfg) {
  // fetch users to count unique non-bot, optionally excluding author self-star
  const users = await reaction.users.fetch().catch(() => null);
  if (!users) return reaction.count || 0;

  let count = 0;
  for (const [, u] of users) {
    if (cfg.ignoreBots && u.bot) continue;
    if (cfg.excludeSelf && message.author?.id && u.id === message.author.id) continue;
    count++;
  }
  return count;
}

function buildStarboardEmbed(message, starCount, cfg) {
  const e = new EmbedBuilder()
    .setAuthor({
      name: message.author?.tag || "Unknown",
      iconURL: message.author?.displayAvatarURL?.({ size: 128 }) || null,
    })
    .setDescription(message.content?.length ? message.content.slice(0, 4000) : "(no text)")
    .addFields(
      { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
      { name: "Stars", value: `${cfg.emoji} **${starCount}**`, inline: true }
    )
    .setTimestamp(message.createdAt || new Date());

  // Attach first image if present
  const att = message.attachments?.find((a) => (a.contentType || "").startsWith("image/"));
  if (att?.url) e.setImage(att.url);

  // If embeds already contain an image, use it
  const embImg = (message.embeds || []).find((x) => x?.image?.url)?.image?.url;
  if (!att?.url && embImg) e.setImage(embImg);

  return e;
}

async function upsertStarboardEntry(client, message, starCount) {
  const cfgRaw = getGuildConfig(message.guild.id);
  const cfg = ensureStarboard(cfgRaw);
  if (!cfg.enabled) return { ok: true, skipped: "disabled" };
  if (!cfg.starboardChannelId) return { ok: true, skipped: "no-channel" };
  if (!cfg.watchChannelIds.includes(message.channel.id)) return { ok: true, skipped: "not-watched" };

  const sbChannel =
    message.guild.channels.cache.get(cfg.starboardChannelId) ||
    (await message.guild.channels.fetch(cfg.starboardChannelId).catch(() => null));
  if (!sbChannel) return { ok: false, error: "Starboard channel not found" };

  const me = message.guild.members.me;
  if (!me) return { ok: false, error: "Bot member not available" };

  const perms = sbChannel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.SendMessages)) return { ok: false, error: "Missing SendMessages" };
  if (!perms?.has(PermissionFlagsBits.EmbedLinks)) return { ok: false, error: "Missing EmbedLinks" };

  const fullCfg = getGuildConfig(message.guild.id);
  const index = ensureIndex(fullCfg);
  const key = message.id;

  const jump = message.url;
  const contentTop = `${cfg.emoji} **${starCount}** • [Jump to message](${jump})`;

  // below threshold: delete if exists
  if (starCount < cfg.threshold) {
    const existing = index[key];
    if (existing?.starboardMessageId) {
      const old = await sbChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
      if (old) await old.delete().catch(() => null);
      delete index[key];
      setGuildConfig(message.guild.id, { starboardIndex: index });
      return { ok: true, removed: true };
    }
    return { ok: true, below: true };
  }

  const embed = buildStarboardEmbed(message, starCount, cfg);

  const existing = index[key];
  if (existing?.starboardMessageId) {
    const old = await sbChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
    if (old) {
      await old.edit({ content: contentTop, embeds: [embed] }).catch(() => null);
      index[key] = { starboardMessageId: old.id, lastCount: starCount };
      setGuildConfig(message.guild.id, { starboardIndex: index });
      return { ok: true, updated: true, starboardMessageId: old.id };
    }
  }

  const sent = await sbChannel.send({ content: contentTop, embeds: [embed] });
  index[key] = { starboardMessageId: sent.id, lastCount: starCount };
  setGuildConfig(message.guild.id, { starboardIndex: index });

  return { ok: true, created: true, starboardMessageId: sent.id };
}

async function cleanupOnMessageDelete(guild, deletedMessageId) {
  const cfg = getGuildConfig(guild.id);
  const index = ensureIndex(cfg);

  const entry = index[deletedMessageId];
  if (!entry?.starboardMessageId) return;

  const sb = ensureStarboard(cfg);
  if (!sb.starboardChannelId) return;

  const sbChannel =
    guild.channels.cache.get(sb.starboardChannelId) ||
    (await guild.channels.fetch(sb.starboardChannelId).catch(() => null));
  if (!sbChannel) return;

  const msg = await sbChannel.messages.fetch(entry.starboardMessageId).catch(() => null);
  if (msg) await msg.delete().catch(() => null);

  delete index[deletedMessageId];
  setGuildConfig(guild.id, { starboardIndex: index });
}

module.exports = {
  ensureStarboard,
  setStarboardConfig,
  emojiMatches,
  countValidStars,
  upsertStarboardEntry,
  cleanupOnMessageDelete,
};
