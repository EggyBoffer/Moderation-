const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { forceClose } = require("../handlers/ticketsSystem");
const { replyEphemeral } = require("../handlers/interactionReply");

module.exports = {
  supportOnly: true,
  data: new SlashCommandBuilder()
    .setName("ticketadmin")
    .setDescription("Support-only ticket tools.")
    .addSubcommand((sc) =>
      sc
        .setName("forceclose")
        .setDescription("Silently close a ticket (no user DM). Use inside the ticket channel.")
        .addStringOption((opt) =>
          opt.setName("reason").setDescription("Reason (for logs only)").setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this in a server.");

    const sub = interaction.options.getSubcommand(true);
    if (sub !== "forceclose") return replyEphemeral(interaction, "Unknown subcommand.");

    const reason = interaction.options.getString("reason") || "Force closed.";
    return forceClose(interaction, client, reason);
  },
};
