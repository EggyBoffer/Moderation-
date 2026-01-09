const { Events } = require("discord.js");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(
      `📦 Loaded commands: ${[...client.commands.keys()].join(", ") || "(none)"}`
    );

    // Warm invite + vanity caches for join tracking
    client.inviteCache = new Map();
    client.vanityUsesCache = new Map();

    for (const guild of client.guilds.cache.values()) {
      try {
        const invites = await guild.invites.fetch();
        client.inviteCache.set(guild.id, invites);
      } catch {
        // Missing Manage Server or invites unavailable
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
    }
  },
};
