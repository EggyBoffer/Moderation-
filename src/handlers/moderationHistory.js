const crypto = require("node:crypto");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

function ensureStore(cfg) {
  if (!cfg.moderationHistory || typeof cfg.moderationHistory !== "object") {
    cfg.moderationHistory = {};
  }
  return cfg;
}

function makeId() {
  return `MOD-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

function cleanText(text) {
  const s = String(text ?? "").trim();
  if (!s) return "No reason provided";
  return s.length > 1000 ? s.slice(0, 1000) + "…" : s;
}

function addEntry(guildId, entry) {
  const cfg = getGuildConfig(guildId);
  ensureStore(cfg);

  const list = cfg.moderationHistory[entry.userId] ?? [];
  cfg.moderationHistory[entry.userId] = [...list, entry];

  setGuildConfig(guildId, { moderationHistory: cfg.moderationHistory });
  return entry;
}

function listEntries(guildId, userId) {
  const cfg = getGuildConfig(guildId);
  ensureStore(cfg);
  return cfg.moderationHistory[userId] ?? [];
}

function addWarn(guildId, userId, modId, reason) {
  return addEntry(guildId, {
    id: makeId(),
    type: "warn",
    userId,
    modId,
    reason: cleanText(reason),
    ts: Date.now(),
  });
}

function addTimeout(guildId, userId, modId, { reason, durationMs, durationStr, liftAt }) {
  return addEntry(guildId, {
    id: makeId(),
    type: "timeout",
    userId,
    modId,
    reason: cleanText(reason),
    ts: Date.now(),
    meta: {
      durationMs,
      durationStr,
      liftAt,
    },
  });
}

function addUntimeout(guildId, userId, modId, reason) {
  return addEntry(guildId, {
    id: makeId(),
    type: "untimeout",
    userId,
    modId,
    reason: cleanText(reason),
    ts: Date.now(),
  });
}

function addNote(guildId, userId, modId, note) {
  return addEntry(guildId, {
    id: makeId(),
    type: "note",
    userId,
    modId,
    reason: cleanText(note),
    ts: Date.now(),
  });
}

function getHistory(guildId, userId) {
  return listEntries(guildId, userId)
    .slice()
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}

module.exports = {
  addWarn,
  addTimeout,
  addUntimeout,
  addNote,
  getHistory,
};
