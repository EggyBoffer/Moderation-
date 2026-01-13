const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Shows bot latency and API ping"),

  
  async execute(interaction, client) {
    const start = Date.now();

    
    await interaction.reply("Pinging...");

    const roundTripMs = Date.now() - start;
    const apiPingMs = Math.round(client.ws.ping);

    await interaction.editReply(
      `🏓 Pong!\n` +
      `• Round-trip: **${roundTripMs}ms**\n` +
      `• WebSocket ping: **${apiPingMs}ms**`
    );
  },
};
