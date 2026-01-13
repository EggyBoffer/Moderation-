const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { replyEphemeral } = require("../handlers/interactionReply");
const { getBotMeta } = require("../storage/botMeta");

function formatUptime(ms) {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (mins || hours || days) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Show how long Moderation+ has been running."),

  async execute(interaction, client) {
    try {
      const meta = getBotMeta();

      const up = formatUptime(client.uptime || 0);

      const embed = new EmbedBuilder()
        .setTitle(`⏱️ ${meta.name} — Uptime`)
        .addFields({ name: "Uptime", value: `\`${up}\`` })
        .setFooter({ text: `v${meta.version}` });

      
      return replyEphemeral(interaction, { embeds: [embed] });
    } catch (err) {
      console.error("❌ Error running /uptime:", err);
      try {
        return replyEphemeral(interaction, "Something went wrong running /uptime.");
      } catch {}
    }
  },
};
