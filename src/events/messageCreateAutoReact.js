const { Events } = require("discord.js");
const { getGuildConfig } = require("../storage/guildConfig");
const { ensureAutoReact, getRuleForChannel, shouldReact, tryReact } = require("../handlers/autoReact");

module.exports = {
  name: Events.MessageCreate,
  async execute(client, message) {
    try {
      if (!message.guild || message.author?.system) return;

      const cfg = ensureAutoReact(getGuildConfig(message.guild.id));
      const rule = getRuleForChannel(cfg, message.channel.id);
      if (!rule) return;

      if (rule.ignoreBots && message.author?.bot) return;

      if (!shouldReact(rule.mode, message)) return;

      await tryReact(message, rule.emojis);
    } catch (err) {
      console.error("❌ messageCreate auto-react error:", err);
    }
  },
};
