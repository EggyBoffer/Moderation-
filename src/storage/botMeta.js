const fs = require("fs");
const path = require("path");

// Core project links
const DEFAULT_REPO_URL = "https://github.com/EggyBoffer/Moderation-";
const DEFAULT_INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1459939265935839388&permissions=8&integration_type=0&scope=applications.commands+bot";
const DEFAULT_PRIVACY_URL =
  "https://eggyboffer.github.io/Moderation-/legal/privacy-policy";
const DEFAULT_TERMS_URL =
  "https://eggyboffer.github.io/Moderation-/legal/terms-of-service";

// Support (until everything is centralized)
const SUPPORT_EMAIL = "dk21eve@gmail.com";
const SUPPORT_DISCORD = "death_killer21";
const SUPPORT_SERVER_URL = "https://discord.gg/DaPDjKfaxY";

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
    // Branding
    name: "Moderation+",
    tagline: "Moderation, utilities, and automation — without the bot bloat.",
    description:
      pkg?.description && typeof pkg.description === "string"
        ? pkg.description
        : null,

    // Ownership
    author: "Moderation+ Team",
    maintainer: "Death Killer21",

    // Versioning (auto-managed via npm version)
    version:
      pkg?.version && typeof pkg.version === "string"
        ? pkg.version
        : "0.0.0",

    // Links (used by /info, /help, README, etc.)
    repoUrl: DEFAULT_REPO_URL,
    inviteUrl: DEFAULT_INVITE_URL,
    privacyUrl: DEFAULT_PRIVACY_URL,
    termsUrl: DEFAULT_TERMS_URL,

    // Support
    supportEmail: SUPPORT_EMAIL,
    supportDiscord: SUPPORT_DISCORD,
    supportServerUrl: SUPPORT_SERVER_URL,
  };
}

module.exports = { getBotMeta };
