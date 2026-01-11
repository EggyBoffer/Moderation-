const fs = require("fs");
const path = require("path");

// Repo URL used in /info and /help docs link etc.
const DEFAULT_REPO_URL = "https://github.com/EggyBoffer/Moderation-";

function readPackageJson() {
  try {
    // project root is one level above /src
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getBotMeta() {
  const pkg = readPackageJson();

  return {
    name: "Moderation+",
    // If package.json has a description, we can use it as fallback.
    tagline:
      "Moderation, utilities, and automation — without the bot bloat.",
    author: "Moderation+ Team",
    maintainer: "Death Killer21",

    // ✅ Automatic version (bumped by `npm version patch|minor|major`)
    version: pkg?.version && typeof pkg.version === "string" ? pkg.version : "0.0.0",

    // Optional extra metadata
    description: pkg?.description && typeof pkg.description === "string" ? pkg.description : null,

    repoUrl: DEFAULT_REPO_URL,
  };
}

module.exports = { getBotMeta };
