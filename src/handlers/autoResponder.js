const { getGuildConfig } = require("../storage/guildConfig");

/**
 * Auto Responder
 *
 * guildConfig.json:
 *   autoResponder: {
 *     enabled: boolean,
 *     allowedChannelIds: string[],  // global restriction; empty => all channels
 *     stopAfterFirst: boolean,
 *     triggers: [
 *       {
 *         id: string,
 *         phrase: string,
 *         response: string,
 *         match: "contains",
 *         limitCount: number,       // 0 = unlimited
 *         limitWindowMs: number,
 *         allowedChannelIds?: string[] // per-trigger restriction; if non-empty overrides global
 *       }
 *     ]
 *   }
 *
 * Response placeholders:
 *   {user} or {mention}  -> mentions message author
 *   {username}           -> author's username
 *   {server}             -> guild name
 */

// key => number[] of timestamps (ms)
const hitBuckets = new Map();

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function channelAllowedByList(channelId, list) {
  if (!Array.isArray(list) || list.length === 0) return true; // empty => allow all
  return list.includes(channelId);
}

function isChannelAllowed(messageChannelId, globalAllowed, triggerAllowed) {
  // If trigger has a non-empty allowed list, it overrides global.
  if (Array.isArray(triggerAllowed) && triggerAllowed.length > 0) {
    return triggerAllowed.includes(messageChannelId);
  }
  // Otherwise fall back to global rules
  return channelAllowedByList(messageChannelId, globalAllowed);
}

function allowByRateLimit(guildId, trigger) {
  const limitCount = Number(trigger?.limitCount || 0);
  const windowMs = Number(trigger?.limitWindowMs || 0);

  // Unlimited / disabled limiter
  if (!Number.isFinite(limitCount) || limitCount <= 0) return true;
  if (!Number.isFinite(windowMs) || windowMs <= 0) return true;

  const key = `${guildId}:${trigger.id}`;
  const now = Date.now();

  const arr = hitBuckets.get(key) || [];
  const cutoff = now - windowMs;

  const pruned = arr.filter((t) => t >= cutoff);

  if (pruned.length >= limitCount) {
    hitBuckets.set(key, pruned);
    return false;
  }

  pruned.push(now);
  hitBuckets.set(key, pruned);
  return true;
}

function applyPlaceholders(template, message) {
  const authorId = message.author?.id || "";
  const username = message.author?.username || "there";
  const server = message.guild?.name || "this server";

  return String(template || "")
    .replace(/\{user\}/gi, `<@${authorId}>`)
    .replace(/\{mention\}/gi, `<@${authorId}>`)
    .replace(/\{username\}/gi, username)
    .replace(/\{server\}/gi, server);
}

/**
 * Evaluates a message and (maybe) sends an autoresponse.
 * Returns true if a response was sent.
 */
async function handleAutoResponse(message) {
  try {
    if (!message?.guildId) return false;
    if (!message?.channelId) return false;
    if (!message?.content) return false;
    if (message.author?.bot) return false;

    const cfg = getGuildConfig(message.guildId);
    const ar = cfg.autoResponder || {};
    if (!ar.enabled) return false;

    const triggers = Array.isArray(ar.triggers) ? ar.triggers : [];
    if (triggers.length === 0) return false;

    const contentNorm = normalize(message.content);
    if (!contentNorm) return false;

    for (const trigger of triggers) {
      if (!trigger?.phrase || !trigger?.response) continue;

      // Per-trigger channel restriction (override global)
      if (!isChannelAllowed(message.channelId, ar.allowedChannelIds || [], trigger.allowedChannelIds)) {
        continue;
      }

      const phraseNorm = normalize(trigger.phrase);
      if (!phraseNorm) continue;

      // Match mode: contains (default)
      const matchOk = contentNorm.includes(phraseNorm);
      if (!matchOk) continue;

      if (!allowByRateLimit(message.guildId, trigger)) continue;

      const rendered = applyPlaceholders(trigger.response, message).slice(0, 2000);

      await message.channel.send({
        content: rendered,
        allowedMentions: {
          parse: [],
          roles: [],
          users: message.author?.id ? [message.author.id] : [],
        },
      });

      if (ar.stopAfterFirst !== false) return true;
    }

    return false;
  } catch (err) {
    console.error("❌ AutoResponder handle error:", err);
    return false;
  }
}

module.exports = { handleAutoResponse };
