const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { forceClose } = require("../handlers/ticketsSystem");
const { replyEphemeral } = require("../handlers/interactionReply");
const { getGuildConfig } = require("../storage/guildConfig");

function canUseTicketAdmin(interaction, ticketsCfg) {
  const member = interaction.member;
  if (!member) return false;

  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;

  const adminRoleId = ticketsCfg?.adminRoleId;
  if (adminRoleId && member.roles?.cache?.has(adminRoleId)) return true;

  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticketadmin")
    .setDescription("Ticket admin tools.")
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

    const cfg = getGuildConfig(interaction.guildId);
    const t = cfg.tickets || {};

    if (!t?.enabled) {
      return replyEphemeral(interaction, "Tickets aren’t configured. Run `/tickets setup` first.");
    }

    if (!canUseTicketAdmin(interaction, t)) {
      return replyEphemeral(
        interaction,
        "You don’t have permission to use ticket admin tools. Ask an admin to set a **Ticket Admin role** in `/tickets setup`."
      );
    }

    const sub = interaction.options.getSubcommand(true);
    if (sub !== "forceclose") return replyEphemeral(interaction, "Unknown subcommand.");

    const reason = interaction.options.getString("reason") || "Force closed.";
    return forceClose(interaction, client, reason);
  },
};
