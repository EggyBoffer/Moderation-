const { Events } = require("discord.js");
const { updateCountsForGuild } = require("../handlers/updateCounts");
const {
  startTimeChannelsTicker,
  updateTimeChannelsForGuild,
} = require("../handlers/timeChannels");
const { startPresenceTicker } = require("../handlers/presence");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(
      `📦 Loaded commands: ${[...client.commands.keys()].join(", ") || "(none)"}`
    );

    // Warm invite + vanity caches so "invited by" works on the very next join
    client.inviteCache = new Map();
    client.vanityUsesCache = new Map();

    for (const guild of client.guilds.cache.values()) {
      try {
        const invites = await guild.invites.fetch();
        client.inviteCache.set(guild.id, invites);
      } catch {
        // Missing Manage Server permission or invites unavailable
        client.inviteCache.set(guild.id, null);
      }

      try {
        const vanity = await guild.fetchVanityData();
        if (typeof vanity?.uses === "number") {
          client.vanityUsesCache.set(guild.id, vanity.uses);
        }
      } catch {
        // No vanity URL or no permission
      }

      // Update member/user/bot count channels (if configured)
      updateCountsForGuild(guild).catch(() => null);

      // Initial time channels update (if configured)
      updateTimeChannelsForGuild(guild).catch(() => null);
    }

    // Start global ticker (updates all configured guilds)
    startTimeChannelsTicker(client);

    // Start presence updater (bot status)
    startPresenceTicker(client);

    console.log("✅ Invite cache warmed.");
  },
};
