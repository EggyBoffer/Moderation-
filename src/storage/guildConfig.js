const fs = require("node:fs");
const path = require("node:path");

function getDataDir() {
  return process.env.DATA_DIR || "/app/data";
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

function ensureStore(filePath) {
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify({}, null, 2) + "\n", "utf8");
}

function readAll(filePath) {
  ensureStore(filePath);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(filePath, obj) {
  ensureStore(filePath);
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function getFilePath() {
  return path.join(getDataDir(), "guildConfig.json");
}

function getGuildConfig(guildId) {
  const filePath = getFilePath();
  const all = readAll(filePath);
  return all[guildId] || {};
}

function setGuildConfig(guildId, patch) {
  const filePath = getFilePath();
  const all = readAll(filePath);
  const current = all[guildId] || {};
  all[guildId] = { ...current, ...patch };
  writeAll(filePath, all);
  return all[guildId];
}

module.exports = { getGuildConfig, setGuildConfig };
