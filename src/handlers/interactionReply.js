const { MessageFlags } = require("discord.js");

function replyEphemeral(interaction, options) {
  const payload = typeof options === "string" ? { content: options } : { ...options };
  payload.flags = MessageFlags.Ephemeral;
  return interaction.reply(payload);
}

function deferEphemeral(interaction) {
  return interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

module.exports = { replyEphemeral, deferEphemeral };
