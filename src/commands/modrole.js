const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");

const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

function normalizeRoleIds(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("modrole")
    .setDescription("Manage which roles are allowed to use moderation commands.")
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Add a mod role for this server.")
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Role to add").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Remove a mod role for this server.")
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Role to remove").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc.setName("list").setDescription("List mod roles for this server.")
    )
    // Only server managers can change mod roles
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyEphemeral(interaction, "You must use this command in a server.");
    }

    const sub = interaction.options.getSubcommand(true);
    const cfg = getGuildConfig(interaction.guildId);
    const modRoleIds = normalizeRoleIds(cfg.modRoleIds);

    if (sub === "list") {
      const list = modRoleIds.length
        ? modRoleIds.map((id) => `<@&${id}>`).join("\n")
        : "*No mod roles set.*";

      return replyEphemeral(
        interaction, `**Mod roles for this server:**\n${list}`
      );
    }

    const role = interaction.options.getRole("role", true);

    if (sub === "add") {
      const next = normalizeRoleIds([...modRoleIds, role.id]);
      setGuildConfig(interaction.guildId, { modRoleIds: next });

      return replyEphemeral(
        interaction, `✅ Added mod role: ${role}`
      );
    }

    if (sub === "remove") {
      const next = modRoleIds.filter((id) => id !== role.id);
      setGuildConfig(interaction.guildId, { modRoleIds: next });

      return replyEphemeral(
        interaction, `✅ Removed mod role: ${role}`);
    }
  },
};
