const { EmbedBuilder } = require("discord.js");
const { getBotMeta } = require("../storage/botMeta");
const { patchInternalState, getInternalState } = require("../storage/internalState");

const SUPPORT_GUILD_ID = process.env.SUPPORT_GUILD_ID || "1460356958514315275";
const UPDATES_CHANNEL_ID =
  process.env.SUPPORT_UPDATES_CHANNEL_ID || "1460371583507107919";

// Optional: how often to check GitHub releases (kept, but not required for deploy posts)
const CHECK_INTERVAL_MS =
  Number(process.env.RELEASE_CHECK_INTERVAL_MS) || 6 * 60 * 60 * 1000;

const GITHUB_REPO_OWNER = "EggyBoffer";
const GITHUB_REPO_NAME = "Moderation-";
const GITHUB_LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;

function normalizeVersion(tag) {
  const s = String(tag || "").trim();
  return s.startsWith("v") ? s.slice(1) : s;
}

async function postToSupportChannel(client, embed) {
  const guild = client.guilds.cache.get(SUPPORT_GUILD_ID);
  if (!guild) return false;

  const channel = guild.channels.cache.get(UPDATES_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return false;

  await channel.send({ embeds: [embed] });
  return true;
}

/**
 * ✅ DEPLOY NOTIFIER (what you actually wanted)
 * Posts when the running bot version changes (after a deploy/rebuild).
 */
async function checkAndPostDeployVersion(client) {
  const meta = getBotMeta();
  const state = getInternalState();

  const currentVersion = String(meta.version || "0.0.0");
  const lastPosted = state.lastPostedRunningVersion;

  // Only post if this is a new running version we haven't announced
  if (lastPosted === currentVersion) return;

  const embed = new EmbedBuilder()
    .setTitle(`✅ ${meta.name || "Moderation+"} — Deployed`)
    .setColor(0x2ecc71)
    .setDescription(
      [
        `A new version is now running in production.`,
        "",
        `**Version:** \`${currentVersion}\``,
        meta.repoUrl ? `**Repo:** ${meta.repoUrl}` : null,
      ].filter(Boolean).join("\n")
    )
    .setFooter({ text: "Internal deploy notifier (support server only)." })
    .setTimestamp(new Date());

  const posted = await postToSupportChannel(client, embed);
  if (posted) {
    patchInternalState({
      lastPostedRunningVersion: currentVersion,
      lastPostedRunningAt: new Date().toISOString(),
    });
  }
}

/**
 * Optional: GitHub latest release watcher (only useful if you actually create GitHub Releases)
 */
async function fetchLatestRelease() {
  const res = await fetch(GITHUB_LATEST_RELEASE_URL, {
    headers: {
      "User-Agent": "ModerationPlus-ReleaseNotifier",
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    tag: data.tag_name || "",
    url: data.html_url || "",
    publishedAt: data.published_at || "",
    body: data.body || "",
    prerelease: !!data.prerelease,
    draft: !!data.draft,
  };
}

function buildReleaseEmbed(meta, latest) {
  const latestVersion = normalizeVersion(latest.tag);

  const body = String(latest.body || "").trim();
  const trimmed = body ? (body.length > 600 ? body.slice(0, 600) + "…" : body) : "";

  const lines = [
    `**New GitHub Release:** \`${latestVersion}\``,
    latest.prerelease ? "⚠️ Marked as **pre-release**." : null,
    latest.draft ? "⚠️ Marked as a **draft**." : null,
    trimmed ? "" : null,
    trimmed ? "**Release notes (trimmed):**" : null,
    trimmed || null,
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setTitle(`🚀 ${meta.name || "Moderation+"} — GitHub Release`)
    .setColor(0x5865f2)
    .setDescription(lines.join("\n"))
    .addFields(latest.url ? { name: "Release", value: latest.url } : null)
    .setFooter({ text: "Internal release notifier (support server only)." });

  embed.data.fields = (embed.data.fields || []).filter(Boolean);

  if (latest.publishedAt) {
    embed.setTimestamp(new Date(latest.publishedAt));
  }

  return embed;
}

async function checkGitHubReleaseOnce(client) {
  const meta = getBotMeta();
  const state = getInternalState();

  const latest = await fetchLatestRelease();
  const latestVersion = normalizeVersion(latest.tag);
  if (!latestVersion) return;

  if (state.lastNotifiedReleaseVersion === latestVersion) return;

  const embed = buildReleaseEmbed(meta, latest);
  const posted = await postToSupportChannel(client, embed);

  if (posted) {
    patchInternalState({
      lastNotifiedReleaseVersion: latestVersion,
      lastNotifiedReleaseAt: new Date().toISOString(),
    });
  }
}

function startGitHubReleaseNotifier(client) {
  // Only run if this bot is actually in the support guild
  if (!client.guilds.cache.has(SUPPORT_GUILD_ID)) return;

  // ✅ Always check deploy version on startup (this is the key)
  checkAndPostDeployVersion(client).catch((err) =>
    console.warn("⚠️ Deploy notifier failed:", err?.message || err)
  );

  // Optional: keep GitHub release polling (only matters if you use Releases)
  const timer = setInterval(() => {
    checkGitHubReleaseOnce(client).catch((err) =>
      console.warn("⚠️ GitHub release check failed:", err?.message || err)
    );
  }, CHECK_INTERVAL_MS);

  if (typeof timer.unref === "function") timer.unref();
}

module.exports = { startGitHubReleaseNotifier };
