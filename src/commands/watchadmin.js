const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { setInboxConfig, getState } = require("../handlers/watchSystem");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("watchadmin")
    .setDescription("Admin setup for the Watch system")
    .addSubcommand((sc) =>
      sc
        .setName("inbox")
        .setDescription("Configure the private inbox channel")
        .addBooleanOption((opt) => opt.setName("enabled").setDescription("Enable or disable inbox").setRequired(true))
        .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to host private inbox threads").setRequired(false))
    )
    .addSubcommand((sc) =>
      sc
        .setName("staff")
        .setDescription("Allow a role to view users' inbox threads")
        .addBooleanOption((opt) => opt.setName("allow").setDescription("Enable staff view").setRequired(true))
        .addRoleOption((opt) => opt.setName("role").setDescription("Role allowed to view inbox threads").setRequired(false))
    )
    .addSubcommand((sc) => sc.setName("status").setDescription("Show watch inbox configuration"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this command in a server.");
    const sub = interaction.options.getSubcommand(true);

    if (sub === "status") {
      const state = getState(interaction.guildId);
      const inbox = state.inbox || {};
      const lines = [
        `**Inbox Enabled:** ${inbox.enabled ? "Yes" : "No"}`,
        `**Inbox Channel:** ${inbox.channelId ? `<#${inbox.channelId}>` : "(not set)"}`,
        `**Staff View:** ${inbox.allowStaffView ? "Yes" : "No"}`,
        `**Staff Role:** ${inbox.staffRoleId ? `<@&${inbox.staffRoleId}>` : "(none)"}`,
      ];
      return replyEphemeral(interaction, lines.join("\n"));
    }

    if (sub === "inbox") {
      const enabled = interaction.options.getBoolean("enabled", true);
      const channel = interaction.options.getChannel("channel", false);
      await deferEphemeral(interaction);

      if (enabled && !channel) return interaction.editReply("❌ When enabling inbox, you must provide a channel.");
      if (channel && !channel.isTextBased()) return interaction.editReply("❌ That channel is not text-based.");

      setInboxConfig(interaction.guildId, {
        enabled,
        channelId: channel ? channel.id : "",
      });

      return interaction.editReply(enabled ? `✅ Inbox enabled in ${channel}` : "✅ Inbox disabled");
    }

    if (sub === "staff") {
      const allow = interaction.options.getBoolean("allow", true);
      const role = interaction.options.getRole("role", false);
      await deferEphemeral(interaction);

      if (allow && !role) return interaction.editReply("❌ When enabling staff view, you must provide a role.");

      setInboxConfig(interaction.guildId, {
        allowStaffView: allow,
        staffRoleId: role ? role.id : "",
      });

      return interaction.editReply(allow ? `✅ Staff view enabled for ${role}` : "✅ Staff view disabled");
    }
  },
};
