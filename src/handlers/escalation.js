const { PermissionFlagsBits } = require("discord.js");

const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");
const { listWarnsWithinWindow, addTimeout, clearWarnsForUser } = require("./infractions");
const { parseDurationToMs } = require("./parseDuration");

function ensureEscalation(cfg) {
  const e = cfg.escalation || {};
  return {
    enabled: Boolean(e.enabled),
    windowMs: Number.isFinite(e.windowMs) ? e.windowMs : 0, // 0 = all time
    resetWarnsOnEscalation: Boolean(e.resetWarnsOnEscalation),
    // rules: [{ warns: number, action: { type:"timeout", duration:"1h", reason?:string } }]
    rules: Array.isArray(e.rules) ? e.rules : [],
  };
}

function toDiscordTimestamp(ms) {
  return `<t:${Math.floor(ms / 1000)}:f>`;
}

function pickRule(rules, warnCount) {
  // choose the highest rule that is <= warnCount
  const sorted = rules
    .filter((r) => Number(r?.warns) > 0 && r?.action?.type === "timeout" && r?.action?.duration)
    .sort((a, b) => Number(a.warns) - Number(b.warns));

  let chosen = null;
  for (const r of sorted) {
    if (warnCount >= Number(r.warns)) chosen = r;
  }
  return chosen;
}

async function maybeEscalateOnWarn({ guild, client, targetMember, modUser }) {
  const cfg = getGuildConfig(guild.id);
  const esc = ensureEscalation(cfg);

  if (!esc.enabled) {
    return { escalated: false, reason: "disabled" };
  }

  const warns = listWarnsWithinWindow(guild.id, targetMember.id, esc.windowMs);
  const warnCount = warns.length;

  const rule = pickRule(esc.rules, warnCount);
  if (!rule) return { escalated: false, reason: "no-rule" };

  // Apply timeout escalation
  const durationStr = String(rule.action.duration);
  const parsed = parseDurationToMs(durationStr);
  if (!parsed.ok) {
    return { escalated: false, reason: `bad-duration:${parsed.error}` };
  }

  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionFlagsBits.ModerateMembers)) {
    return { escalated: false, reason: "bot-missing-moderate-members" };
  }

  if (!targetMember.moderatable) {
    return { escalated: false, reason: "not-moderatable" };
  }

  const extraReason = rule.action.reason ? String(rule.action.reason).trim() : "";
  const reason = extraReason
    ? `Auto escalation: ${extraReason}`
    : `Auto escalation: reached ${rule.warns} warns`;

  const liftAt = Date.now() + parsed.ms;

  await targetMember.timeout(parsed.ms, reason);

  const entry = addTimeout(guild.id, targetMember.id, modUser.id, {
    reason,
    durationMs: parsed.ms,
    durationStr,
    liftAt,
  });

  let clearedWarns = 0;
  if (esc.resetWarnsOnEscalation) {
    clearedWarns = clearWarnsForUser(guild.id, targetMember.id);
  }

  return {
    escalated: true,
    rule: { warns: rule.warns, durationStr },
    liftAt,
    caseId: entry.id,
    clearedWarns,
    liftStamp: toDiscordTimestamp(liftAt),
    warnCount,
  };
}

function setEscalationConfig(guildId, updates) {
  const cfg = getGuildConfig(guildId);
  const current = ensureEscalation(cfg);

  const next = { ...current, ...updates };
  // shallow merge to guild config
  setGuildConfig(guildId, { escalation: next });
  return next;
}

module.exports = {
  ensureEscalation,
  setEscalationConfig,
  maybeEscalateOnWarn,
};
