const fs = require("fs");
const path = require("path");

// Repo URL used in /info and later in /help docs link etc.
const DEFAULT_REPO_URL = "https://github.com/EggyBoffer/Moderation-";

function readPackageJsonVersion() {
  try {
    // project root is one level above /src
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    if (pkg && typeof pkg.version === "string") return pkg.version;
  } catch {}
  return "0.0.0";
}

function getBotMeta() {
  return {
    name: "Moderation+",
    tagline: "Moderation, utilities, and automation — without the bot bloat.",
    author: "Ryan Bushell", // change if you want
    version: readPackageJsonVersion(),
    repoUrl: DEFAULT_REPO_URL,
  };
}

module.exports = { getBotMeta };
