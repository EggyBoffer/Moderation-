const fs = require("fs");
const path = require("path");

function getDataDir() {
  // Your Railway volume is mounted at /app/data
  // Allow override for local/dev if you want.
  return process.env.DATA_DIR || "/app/data";
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, value) {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

function getInternalStateFile() {
  return path.join(getDataDir(), "internalState.json");
}

function getInternalState() {
  const file = getInternalStateFile();
  return readJsonSafe(file, {});
}

function setInternalState(next) {
  const file = getInternalStateFile();
  return writeJsonSafe(file, next);
}

function patchInternalState(patch) {
  const current = getInternalState();
  const next = { ...current, ...patch };
  setInternalState(next);
  return next;
}

module.exports = {
  getDataDir,
  getInternalState,
  setInternalState,
  patchInternalState,
};
