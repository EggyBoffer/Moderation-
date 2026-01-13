const crypto = require("node:crypto");

const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

function ensureInfractions(cfg) {
  const next = cfg && typeof cfg === "object" ? { ...cfg } : {};
  if (!next.infractions || typeof next.infractions !== "object") next.infractions = {};
  return next;
}

function makeInfractionId() {
  return `INF-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

function sanitizeReason(reason) {
  const s = String(reason ?? "").trim();
  if (!s) return "No reason provided";
  return s.length > 1000 ? s.slice(0, 1000) + "…" : s;
}

function getUserInfractions(cfg, userId) {
  const arr = cfg.infractions?.[userId];
  return Array.isArray(arr) ? arr : [];
}

function saveInfractions(guildId, cfg) {
  setGuildConfig(guildId, { infractions: cfg.infractions });
}

function addEntry(guildId, entry) {
  const cfg = ensureInfractions(getGuildConfig(guildId));
  const userId = entry.userId;

  cfg.infractions[userId] = [...getUserInfractions(cfg, userId), entry];
  saveInfractions(guildId, cfg);

  return entry;
}

function removeInfractionById(guildId, id) {
  const cfg = ensureInfractions(getGuildConfig(guildId));
  let removed = null;

  for (const [userId, arr] of Object.entries(cfg.infractions)) {
    if (!Array.isArray(arr)) continue;

    const idx = arr.findIndex((x) => x?.id === id);
    if (idx === -1) continue;

    const copy = [...arr];
    removed = copy.splice(idx, 1)[0] || null;

    if (copy.length === 0) delete cfg.infractions[userId];
    else cfg.infractions[userId] = copy;

    break;
  }

  if (removed) saveInfractions(guildId, cfg);
  return removed;
}

function addWarn(guildId, userId, modId, reason) {
  return addEntry(guildId, {
    id: makeInfractionId(),
    type: "warn",
    userId,
    modId,
    reason: sanitizeReason(reason),
    ts: Date.now(),
  });
}

function listWarns(guildId, userId) {
  const cfg = ensureInfractions(getGuildConfig(guildId));
  return getUserInfractions(cfg, userId).filter((x) => x.type === "warn");
}

function listWarnsWithinWindow(guildId, userId, windowMs) {
  const warns = listWarns(guildId, userId);
  if (!windowMs || windowMs <= 0) return warns;
  const cutoff = Date.now() - windowMs;
  return warns.filter((w) => (w.ts ?? 0) >= cutoff);
}

function clearWarnsForUser(guildId, userId) {
  const cfg = ensureInfractions(getGuildConfig(guildId));
  const arr = getUserInfractions(cfg, userId);
  const remaining = arr.filter((x) => x.type !== "warn");
  cfg.infractions[userId] = remaining;
  saveInfractions(guildId, cfg);
  return arr.length - remaining.length; 
}

function addTimeout(guildId, userId, modId, { reason, durationMs, durationStr, liftAt } = {}) {
  return addEntry(guildId, {
    id: makeInfractionId(),
    type: "timeout",
    userId,
    modId,
    reason: sanitizeReason(reason),
    ts: Date.now(),
    meta: {
      durationMs: Number(durationMs) || 0,
      durationStr: String(durationStr || "").slice(0, 50),
      liftAt: Number(liftAt) || 0,
    },
  });
}

function addUntimeout(guildId, userId, modId, reason) {
  return addEntry(guildId, {
    id: makeInfractionId(),
    type: "untimeout",
    userId,
    modId,
    reason: sanitizeReason(reason),
    ts: Date.now(),
  });
}

function addNote(guildId, userId, modId, note) {
  return addEntry(guildId, {
    id: makeInfractionId(),
    type: "note",
    userId,
    modId,
    reason: sanitizeReason(note),
    ts: Date.now(),
  });
}

function listNotes(guildId, userId) {
  const cfg = ensureInfractions(getGuildConfig(guildId));
  return getUserInfractions(cfg, userId).filter((x) => x.type === "note");
}

function listHistory(guildId, userId) {
  const cfg = ensureInfractions(getGuildConfig(guildId));
  return getUserInfractions(cfg, userId)
    .slice()
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}

module.exports = {
  addWarn,
  listWarns,
  listWarnsWithinWindow,
  clearWarnsForUser,

  removeInfractionById,

  addTimeout,
  addUntimeout,

  addNote,
  listNotes,

  listHistory,
};
