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
    .setName("info")
    .setDescription("Show information about Moderation+."),

  async execute(interaction, client) {
    try {
      const meta = getBotMeta();

      const botUser = client.user;
      const guildCount = client.guilds?.cache?.size ?? 0;

      // Discord.js v14: ws.ping is the gateway ping in ms (rough indicator)
      const ping = client.ws?.ping;
      const pingStr = Number.isFinite(ping) ? `${Math.round(ping)}ms` : "Unknown";

      const embed = new EmbedBuilder()
        .setTitle(`ℹ️ ${meta.name}`)
        .setDescription(meta.tagline || meta.description || "A multi-server moderation bot with built-in utilities.")
        .addFields(
          { name: "Version", value: `\`${meta.version}\``, inline: true },
          { name: "Author", value: meta.author || "Unknown", inline: true },
          { name: "Maintainer", value: meta.maintainer || "Unknown", inline: true },

          { name: "Uptime", value: formatUptime(client.uptime || 0), inline: true },
          { name: "Servers", value: `${guildCount}`, inline: true },
          { name: "Ping", value: pingStr, inline: true },

          { name: "Library", value: `discord.js`, inline: true }
        );

      if (meta.repoUrl) {
        embed.addFields({ name: "Repository", value: meta.repoUrl });
      }

      if (botUser?.avatarURL()) embed.setThumbnail(botUser.avatarURL());

      // Public info is fine. If you want it hidden, swap to replyEphemeral.
      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error("❌ Error running /info:", err);
      try {
        return replyEphemeral(interaction, "Something went wrong running /info.");
      } catch {}
    }
  },
};
