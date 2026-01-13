const { Events } = require("discord.js");
const { updateCountsForGuild } = require("../handlers/updateCounts");
const {
  startTimeChannelsTicker,
  updateTimeChannelsForGuild,
} = require("../handlers/timeChannels");
const { startPresenceTicker } = require("../handlers/presence");

const { startGitHubReleaseNotifier } = require("../internal/githubReleaseNotifier");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log("DATA_DIR =", process.env.DATA_DIR);
    console.log(
      `📦 Loaded commands: ${[...client.commands.keys()].join(", ") || "(none)"}`
    );

    client.inviteCache = new Map();
    client.vanityUsesCache = new Map();

    for (const guild of client.guilds.cache.values()) {
      try {
        const invites = await guild.invites.fetch();
        client.inviteCache.set(guild.id, invites);
      } catch {
  
        client.inviteCache.set(guild.id, null);
      }

      try {
        const vanity = await guild.fetchVanityData();
        if (typeof vanity?.uses === "number") {
          client.vanityUsesCache.set(guild.id, vanity.uses);
        }
      } catch {

      }

  
      updateCountsForGuild(guild).catch(() => null);

      updateTimeChannelsForGuild(guild).catch(() => null);
    }

    startTimeChannelsTicker(client);

    startPresenceTicker(client);

    try {
      startGitHubReleaseNotifier(client);
    } catch (err) {
      console.warn("⚠️ Failed to start GitHub release notifier:", err?.message || err);
    }

    console.log("✅ Invite cache warmed.");
  },
};
