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
  // setGuildConfig is shallow-merge; we pass the full infractions object to avoid losing keys
  setGuildConfig(guildId, { infractions: cfg.infractions });
}

function addWarn(guildId, userId, modId, reason) {
  const cfg = ensureInfractions(getGuildConfig(guildId));

  const entry = {
    id: makeInfractionId(),
    type: "warn",
    userId,
    modId,
    reason: sanitizeReason(reason),
    ts: Date.now(),
  };

  cfg.infractions[userId] = [...getUserInfractions(cfg, userId), entry];
  saveInfractions(guildId, cfg);
  return entry;
}

function listWarns(guildId, userId) {
  const cfg = ensureInfractions(getGuildConfig(guildId));
  return getUserInfractions(cfg, userId).filter((x) => x.type === "warn");
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

    if (copy.length === 0) {
      delete cfg.infractions[userId];
    } else {
      cfg.infractions[userId] = copy;
    }

    break;
  }

  if (removed) saveInfractions(guildId, cfg);
  return removed;
}

module.exports = {
  addWarn,
  listWarns,
  removeInfractionById,
};
