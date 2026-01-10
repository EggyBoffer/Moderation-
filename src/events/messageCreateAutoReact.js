const { Events } = require("discord.js");
const { getGuildConfig } = require("../storage/guildConfig");
const { ensureAutoReact, shouldReact, tryReact } = require("../handlers/autoReact");

module.exports = {
  name: Events.MessageCreate,
  async execute(client, message) {
    try {
      if (!message.guild || message.author?.system) return;

      const cfg = ensureAutoReact(getGuildConfig(message.guild.id));

      if (!cfg.enabled) return;
      if (!cfg.channelIds.includes(message.channel.id)) return;
      if (cfg.ignoreBots && message.author?.bot) return;

      if (!shouldReact(cfg.mode, message)) return;

      await tryReact(message, cfg.emojis);
    } catch (err) {
      console.error("❌ messageCreate auto-react error:", err);
    }
  },
};
