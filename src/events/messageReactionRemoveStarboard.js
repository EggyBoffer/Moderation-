const { Events } = require("discord.js");
const { getGuildConfig } = require("../storage/guildConfig");
const {
  ensureStarboard,
  emojiMatches,
  countValidStars,
  upsertStarboardEntry,
} = require("../handlers/starboard");

module.exports = {
  name: Events.MessageReactionRemove,
  async execute(client, reaction, user) {
    try {
      if (reaction.partial) await reaction.fetch().catch(() => null);
      const message = reaction.message;
      if (!message?.guild) return;

      const cfg = ensureStarboard(getGuildConfig(message.guild.id));
      if (!cfg.enabled) return;

      if (!emojiMatches(reaction, cfg.emoji)) return;

      if (message.partial) await message.fetch().catch(() => null);
      if (!message.author) return;

      if (!cfg.watchChannelIds.includes(message.channel.id)) return;

      const stars = await countValidStars(reaction, message, cfg);
      await upsertStarboardEntry(client, message, stars);
    } catch (err) {
      console.error("❌ starboard reaction remove error:", err);
    }
  },
};
