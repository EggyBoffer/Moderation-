const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { replyEphemeral } = require("../handlers/interactionReply");
const { getBotMeta } = require("../storage/botMeta");
const { getGuildConfig } = require("../storage/guildConfig");
const { buildSetupChecklistEmbed, runSetupPermissionTest } = require("../handlers/setup");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Guided setup checklist for Moderation+.")
    .addSubcommand((s) => s.setName("start").setDescription("Start the setup checklist (recommended)."))
    .addSubcommand((s) => s.setName("status").setDescription("Show setup status for this server."))
    .addSubcommand((s) => s.setName("test").setDescription("Test whether Moderation+ has the permissions it needs."))
    .addSubcommand((s) => s.setName("links").setDescription("Show invite, support, and legal links."))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "Use this command in a server.");
      }

      const member = interaction.member;
      const canManage =
        member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
        member?.permissions?.has(PermissionFlagsBits.Administrator);

      if (!canManage) {
        return replyEphemeral(interaction, "You need **Manage Server** (or Admin) to run `/setup`.");
      }

      const sub = interaction.options.getSubcommand(true);
      const meta = getBotMeta();

      if (sub === "links") {
        const embed = new EmbedBuilder()
          .setTitle(`🔗 ${meta.name || "Moderation+"} — Links`)
          .setDescription("Useful links for setup and support.")
          .addFields(
            { name: "Invite", value: meta.inviteUrl || "Not set" },
            { name: "Support Server", value: meta.supportServerUrl || "Not set" },
            { name: "Legal", value: `Privacy: ${meta.privacyUrl || "Not set"}\nTerms: ${meta.termsUrl || "Not set"}` }
          );

        return replyEphemeral(interaction, { embeds: [embed] });
      }

      if (sub === "test") {
        const embed = await runSetupPermissionTest(interaction);
        return replyEphemeral(interaction, { embeds: [embed] });
      }

      const cfg = getGuildConfig(interaction.guildId);

      const embed = buildSetupChecklistEmbed(meta, cfg, {
        guildId: interaction.guildId,
        guildName: interaction.guild?.name || "this server",
        mode: sub,
      });

      return replyEphemeral(interaction, { embeds: [embed] });
    } catch (err) {
      console.error("❌ Error running /setup:", err);
      try {
        return replyEphemeral(interaction, "Something went wrong running /setup.");
      } catch {}
    }
  },
};
