const { Events, MessageFlags } = require("discord.js");

module.exports = {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`⚠️ No handler found for command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction, client);
    } catch (err) {
      console.error(`❌ Error running /${interaction.commandName}:`, err);

      const msg = "Something went wrong running that command.";
      const payload = { content: msg, flags: MessageFlags.Ephemeral };

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch {
        // ignore follow-up failures
      }
    }
  },
};
