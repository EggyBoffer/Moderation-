const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

function normalizeBoardId(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 32);
}

function ensureMultiStarboards(cfg) {
  
  if (!cfg.starboards && cfg.starboard) {
    const old = cfg.starboard || {};
    cfg.starboards = {
      enabled: Boolean(old.enabled),
      boards: {
        default: {
          enabled: Boolean(old.enabled),
          channelId: old.starboardChannelId || null,
          watchChannelIds: Array.isArray(old.watchChannelIds) ? old.watchChannelIds : [],
          emoji: typeof old.emoji === "string" ? old.emoji : "⭐",
          threshold: Number.isFinite(old.threshold) ? old.threshold : 3,
          ignoreBots: old.ignoreBots !== false,
          excludeSelf: old.excludeSelf !== false,
        },
      },
    };

    
    if (!cfg.starboardIndex || typeof cfg.starboardIndex !== "object") cfg.starboardIndex = {};
    if (!cfg.starboardIndex.default) cfg.starboardIndex.default = {};

    
    setGuildConfig(cfg.guildId || cfg.id || cfg._guildId || undefined, {}); 
    
    
  }

  const sb = cfg.starboards || {};
  const boardsRaw = sb.boards && typeof sb.boards === "object" ? sb.boards : {};

  const boards = {};
  for (const [id, b] of Object.entries(boardsRaw)) {
    if (!id) continue;
    boards[id] = {
      enabled: b?.enabled !== false,
      channelId: b?.channelId || null,
      watchChannelIds: Array.isArray(b?.watchChannelIds) ? Array.from(new Set(b.watchChannelIds.filter(Boolean))) : [],
      emoji: typeof b?.emoji === "string" ? b.emoji : "⭐",
      threshold: Number.isFinite(b?.threshold) ? b.threshold : 3,
      ignoreBots: b?.ignoreBots !== false,
      excludeSelf: b?.excludeSelf !== false,
    };

    if (typeof boards[id].threshold !== "number" || boards[id].threshold < 1) boards[id].threshold = 1;
  }

  return {
    enabled: Boolean(sb.enabled),
    boards,
  };
}

function ensureIndex(cfg) {
  if (!cfg.starboardIndex || typeof cfg.starboardIndex !== "object") cfg.starboardIndex = {};
  return cfg.starboardIndex;
}

function setStarboardsConfig(guildId, updates) {
  const cfg = getGuildConfig(guildId);
  const current = ensureMultiStarboards(cfg);

  const next = {
    ...current,
    ...updates,
    boards: { ...current.boards, ...(updates.boards || {}) },
  };

  
  const cleaned = {};
  for (const [id, b] of Object.entries(next.boards || {})) {
    if (!id) continue;
    cleaned[id] = {
      enabled: b.enabled !== false,
      channelId: b.channelId || null,
      watchChannelIds: Array.from(new Set((b.watchChannelIds || []).filter(Boolean))),
      emoji: typeof b.emoji === "string" ? b.emoji : "⭐",
      threshold: Number.isFinite(b.threshold) ? b.threshold : 3,
      ignoreBots: b.ignoreBots !== false,
      excludeSelf: b.excludeSelf !== false,
    };
    if (cleaned[id].threshold < 1) cleaned[id].threshold = 1;
  }
  next.boards = cleaned;

  setGuildConfig(guildId, { starboards: next });
  return next;
}

function emojiMatches(reaction, emojiStr) {
  const cfg = String(emojiStr || "").trim();
  const name = reaction.emoji?.name || "";
  const id = reaction.emoji?.id || "";

  if (!cfg) return false;
  if (cfg === name) return true;           
  if (id && cfg.includes(id)) return true; 
  if (id && cfg === id) return true;
  return false;
}

async function countValidStars(reaction, message, boardCfg) {
  const users = await reaction.users.fetch().catch(() => null);
  if (!users) return reaction.count || 0;

  let count = 0;
  for (const [, u] of users) {
    if (boardCfg.ignoreBots && u.bot) continue;
    if (boardCfg.excludeSelf && message.author?.id && u.id === message.author.id) continue;
    count++;
  }
  return count;
}

function buildStarboardEmbed(message, starCount, boardCfg) {
  const e = new EmbedBuilder()
    .setAuthor({
      name: message.author?.tag || "Unknown",
      iconURL: message.author?.displayAvatarURL?.({ size: 128 }) || null,
    })
    .setDescription(message.content?.length ? message.content.slice(0, 4000) : "(no text)")
    .addFields(
      { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
      { name: "Stars", value: `${boardCfg.emoji} **${starCount}**`, inline: true }
    )
    .setTimestamp(message.createdAt || new Date());

  const att = message.attachments?.find((a) => (a.contentType || "").startsWith("image/"));
  if (att?.url) e.setImage(att.url);

  const embImg = (message.embeds || []).find((x) => x?.image?.url)?.image?.url;
  if (!att?.url && embImg) e.setImage(embImg);

  return e;
}

async function upsertBoardEntry(client, message, boardId, boardCfg, starCount) {
  if (starCount < boardCfg.threshold) {
    
    const cfg = getGuildConfig(message.guild.id);
    const index = ensureIndex(cfg);
    if (!index[boardId]) index[boardId] = {};

    const existing = index[boardId][message.id];
    if (existing?.starboardMessageId && boardCfg.channelId) {
      const sbChannel =
        message.guild.channels.cache.get(boardCfg.channelId) ||
        (await message.guild.channels.fetch(boardCfg.channelId).catch(() => null));
      if (sbChannel) {
        const old = await sbChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
        if (old) await old.delete().catch(() => null);
      }
      delete index[boardId][message.id];
      setGuildConfig(message.guild.id, { starboardIndex: index });
      return { ok: true, removed: true };
    }
    return { ok: true, below: true };
  }

  if (!boardCfg.channelId) return { ok: true, skipped: "no-channel" };

  const sbChannel =
    message.guild.channels.cache.get(boardCfg.channelId) ||
    (await message.guild.channels.fetch(boardCfg.channelId).catch(() => null));
  if (!sbChannel) return { ok: false, error: "Starboard channel not found" };

  const me = message.guild.members.me;
  if (!me) return { ok: false, error: "Bot member not available" };

  const perms = sbChannel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.SendMessages)) return { ok: false, error: "Missing SendMessages" };
  if (!perms?.has(PermissionFlagsBits.EmbedLinks)) return { ok: false, error: "Missing EmbedLinks" };

  const cfg = getGuildConfig(message.guild.id);
  const index = ensureIndex(cfg);
  if (!index[boardId]) index[boardId] = {};

  const jump = message.url;
  const contentTop = `${boardCfg.emoji} **${starCount}** • [Jump to message](${jump}) • \`${boardId}\``;

  const embed = buildStarboardEmbed(message, starCount, boardCfg);

  const existing = index[boardId][message.id];
  if (existing?.starboardMessageId) {
    const old = await sbChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
    if (old) {
      await old.edit({ content: contentTop, embeds: [embed] }).catch(() => null);
      index[boardId][message.id] = { starboardMessageId: old.id, lastCount: starCount };
      setGuildConfig(message.guild.id, { starboardIndex: index });
      return { ok: true, updated: true, starboardMessageId: old.id };
    }
  }

  const sent = await sbChannel.send({ content: contentTop, embeds: [embed] });
  index[boardId][message.id] = { starboardMessageId: sent.id, lastCount: starCount };
  setGuildConfig(message.guild.id, { starboardIndex: index });

  return { ok: true, created: true, starboardMessageId: sent.id };
}

async function handleStarReaction(client, reaction) {
  if (reaction.partial) await reaction.fetch().catch(() => null);
  const message = reaction.message;
  if (!message?.guild) return;

  if (message.partial) await message.fetch().catch(() => null);
  if (!message.author) return;

  const cfg = getGuildConfig(message.guild.id);
  const multi = ensureMultiStarboards(cfg);
  if (!multi.enabled) return;

  
  for (const [boardId, b] of Object.entries(multi.boards)) {
    if (!b.enabled) continue;
    if (!b.watchChannelIds.includes(message.channel.id)) continue;
    if (!emojiMatches(reaction, b.emoji)) continue;

    const stars = await countValidStars(reaction, message, b);
    await upsertBoardEntry(client, message, boardId, b, stars);
  }
}

async function cleanupOnMessageDelete(guild, deletedMessageId) {
  const cfg = getGuildConfig(guild.id);
  const multi = ensureMultiStarboards(cfg);
  const index = ensureIndex(cfg);

  for (const [boardId, entries] of Object.entries(index)) {
    const entry = entries?.[deletedMessageId];
    if (!entry?.starboardMessageId) continue;

    const board = multi.boards?.[boardId];
    if (!board?.channelId) continue;

    const sbChannel =
      guild.channels.cache.get(board.channelId) ||
      (await guild.channels.fetch(board.channelId).catch(() => null));
    if (!sbChannel) continue;

    const msg = await sbChannel.messages.fetch(entry.starboardMessageId).catch(() => null);
    if (msg) await msg.delete().catch(() => null);

    delete index[boardId][deletedMessageId];
  }

  setGuildConfig(guild.id, { starboardIndex: index });
}

module.exports = {
  normalizeBoardId,
  ensureMultiStarboards,
  setStarboardsConfig,
  handleStarReaction,
  cleanupOnMessageDelete,
};
