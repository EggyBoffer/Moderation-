const { Events } = require("discord.js");
const { startGitHubReleaseNotifier } = require("../internal/githubReleaseNotifier");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    try {
      startGitHubReleaseNotifier(client);
    } catch (err) {
      console.warn("⚠️ Failed to start GitHub release notifier:", err?.message || err);
    }
  },
};
