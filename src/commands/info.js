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

      const ping = client.ws?.ping;
      const pingStr = Number.isFinite(ping) ? `${Math.round(ping)}ms` : "Unknown";

      // Prefer meta fields if present, fallback to sensible defaults
      const name = meta.name || "Moderation+";
      const description =
        meta.tagline ||
        meta.description ||
        "A multi-server moderation bot with built-in utilities.";

      // Links (single-source-of-truth friendly)
      const inviteUrl =
        meta.inviteUrl ||
        "https://discord.com/oauth2/authorize?client_id=1459939265935839388&permissions=8&integration_type=0&scope=applications.commands+bot";

      const privacyUrl =
        meta.privacyUrl || "https://eggyboffer.github.io/Moderation-/legal/privacy-policy";
      const termsUrl =
        meta.termsUrl || "https://eggyboffer.github.io/Moderation-/legal/terms-of-service";

      const supportEmail = meta.supportEmail || "dk21eve@gmail.com";
      const supportDiscord = meta.supportDiscord || "death_killer21";

      const embed = new EmbedBuilder()
        .setTitle(`ℹ️ ${name}`)
        .setDescription(description)
        .addFields(
          { name: "Version", value: `\`${meta.version || "Unknown"}\``, inline: true },
          { name: "Maintainer", value: meta.maintainer || "Unknown", inline: true },
          { name: "Library", value: "discord.js v14", inline: true },

          { name: "Uptime", value: formatUptime(client.uptime || 0), inline: true },
          { name: "Servers", value: `${guildCount}`, inline: true },
          { name: "Ping", value: pingStr, inline: true }
        )
        .addFields(
          { name: "➕ Invite", value: inviteUrl },
          {
            name: "📜 Legal",
            value: `Privacy Policy: ${privacyUrl}\nTerms of Service: ${termsUrl}`,
          },
          {
            name: "🛟 Support",
            value: `Email: **${supportEmail}**\nDiscord: **\`${supportDiscord}\`**`,
          }
        );

      if (meta.repoUrl) {
        embed.addFields({ name: "Repository", value: meta.repoUrl });
      }

      if (botUser?.avatarURL()) embed.setThumbnail(botUser.avatarURL());

      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error("❌ Error running /info:", err);
      try {
        return replyEphemeral(interaction, "Something went wrong running /info.");
      } catch {}
    }
  },
};
