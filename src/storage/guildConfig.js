const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const FILE_PATH = path.join(DATA_DIR, "guildConfig.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, JSON.stringify({}), "utf8");
}

function readAll() {
  ensureStore();
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(obj) {
  ensureStore();
  fs.writeFileSync(FILE_PATH, JSON.stringify(obj, null, 2), "utf8");
}

function getGuildConfig(guildId) {
  const all = readAll();
  return all[guildId] || {};
}

function setGuildConfig(guildId, patch) {
  const all = readAll();
  const current = all[guildId] || {};
  all[guildId] = { ...current, ...patch };
  writeAll(all);
  return all[guildId];
}

module.exports = { getGuildConfig, setGuildConfig };
