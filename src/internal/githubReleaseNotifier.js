const { EmbedBuilder } = require("discord.js");
const { getBotMeta } = require("../storage/botMeta");
const { patchInternalState, getInternalState } = require("../storage/internalState");

const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID || "1460356958514315275";
const UPDATES_CHANNEL_ID =
  process.env.SUPPORT_UPDATES_CHANNEL_ID || "1460371583507107919";

// How often to check GitHub (6 hours by default)
const CHECK_INTERVAL_MS =
  Number(process.env.RELEASE_CHECK_INTERVAL_MS) || 6 * 60 * 60 * 1000;

const GITHUB_REPO_OWNER = "EggyBoffer";
const GITHUB_REPO_NAME = "Moderation-";
const GITHUB_LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;

function normalizeVersion(tag) {
  // Common tags: "v1.2.3" or "1.2.3"
  const s = String(tag || "").trim();
  return s.startsWith("v") ? s.slice(1) : s;
}

async function fetchLatestRelease() {
  const res = await fetch(GITHUB_LATEST_RELEASE_URL, {
    headers: {
      "User-Agent": "ModerationPlus-ReleaseNotifier",
      Accept: "application/vnd.github+json",
    },
  });

  // Handle rate limit / API issues gracefully
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  return {
    tag: data.tag_name || "",
    name: data.name || data.tag_name || "New Release",
    url: data.html_url || "",
    publishedAt: data.published_at || "",
    body: data.body || "",
    prerelease: !!data.prerelease,
    draft: !!data.draft,
  };
}

function buildReleaseEmbed(meta, latest, currentVersion) {
  const latestVersion = normalizeVersion(latest.tag);

  const lines = [];

  lines.push(`**New version detected:** \`${latestVersion}\``);
  lines.push(`**Current bot version:** \`${currentVersion}\``);

  if (latest.prerelease) lines.push("⚠️ This release is marked as **pre-release**.");
  if (latest.draft) lines.push("⚠️ This release is marked as a **draft**.");

  // Keep body short to avoid massive embeds
  const body = String(latest.body || "").trim();
  if (body) {
    const trimmed = body.length > 600 ? body.slice(0, 600) + "…" : body;
    lines.push("");
    lines.push("**Release notes (trimmed):**");
    lines.push(trimmed);
  }

  const embed = new EmbedBuilder()
    .setTitle(`🚀 ${meta.name || "Moderation+"} — Update Available`)
    .setColor(0x2ecc71)
    .setDescription(lines.join("\n"))
    .addFields(
      latest.url ? { name: "Release", value: latest.url } : null,
      latest.publishedAt
        ? { name: "Published", value: `<t:${Math.floor(new Date(latest.publishedAt).getTime() / 1000)}:F>` }
        : null
    )
    .setFooter({ text: "Internal update notifier (support server only)." });

  // Filter out null fields
  embed.data.fields = (embed.data.fields || []).filter(Boolean);

  return embed;
}

async function postToSupportChannel(client, embed) {
  const guild = client.guilds.cache.get(SUPPORT_GUILD_ID);
  if (!guild) return false;

  const channel = guild.channels.cache.get(UPDATES_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return false;

  await channel.send({ embeds: [embed] });
  return true;
}

async function checkOnce(client) {
  const meta = getBotMeta();
  const state = getInternalState();

  const currentVersion = String(meta.version || "0.0.0");
  const latest = await fetchLatestRelease();
  const latestVersion = normalizeVersion(latest.tag);

  // If GitHub didn't return a tag, do nothing
  if (!latestVersion) return;

  // Prevent reposting the same version
  const lastNotified = state.lastNotifiedReleaseVersion;
  if (lastNotified === latestVersion) return;

  // Optional: only notify when the latest > current (semver compare is more work; keep it simple)
  // If you want strict semver comparisons later, we can add it.
  if (latestVersion === currentVersion) {
    // Still mark as notified so it doesn't repeatedly post “same version”
    patchInternalState({ lastNotifiedReleaseVersion: latestVersion });
    return;
  }

  const embed = buildReleaseEmbed(meta, latest, currentVersion);

  const posted = await postToSupportChannel(client, embed);
  if (posted) {
    patchInternalState({
      lastNotifiedReleaseVersion: latestVersion,
      lastNotifiedReleaseAt: new Date().toISOString(),
    });
  }
}

function startGitHubReleaseNotifier(client) {
  // Only run if the bot is actually in the support guild
  const inSupportGuild = client.guilds.cache.has(SUPPORT_GUILD_ID);
  if (!inSupportGuild) return;

  // Run immediately once
  checkOnce(client).catch((err) =>
    console.warn("⚠️ Release notifier check failed:", err?.message || err)
  );

  // Then poll
  const timer = setInterval(() => {
    checkOnce(client).catch((err) =>
      console.warn("⚠️ Release notifier check failed:", err?.message || err)
    );
  }, CHECK_INTERVAL_MS);

  // Don’t keep the process alive just for this timer
  if (typeof timer.unref === "function") timer.unref();
}

module.exports = { startGitHubReleaseNotifier };
