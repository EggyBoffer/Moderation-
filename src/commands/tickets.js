const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

const PANEL_BTN_ID = "tickets:create";

function normalizeNewlines(s) {
  return String(s || "").replaceAll("\\n", "\n");
}

function buildPanel(guild, title, description, buttonLabel) {
  const embed = new EmbedBuilder()
    .setTitle(title || "Support Tickets")
    .setDescription(
      normalizeNewlines(description || "Press the button below to open a private support ticket.")
    )
    .setAuthor({
      name: guild.name,
      iconURL: guild.iconURL({ size: 128 }) || undefined,
    })
    .setColor(0x5865f2)
    .setTimestamp(new Date());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(PANEL_BTN_ID)
      .setLabel(buttonLabel || "Create Ticket")
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tickets")
    .setDescription("Ticket system configuration and tools.")
    .addSubcommand((sc) =>
      sc
        .setName("setup")
        .setDescription("Configure tickets for this server.")
        .addChannelOption((opt) =>
          opt
            .setName("category")
            .setDescription("Category where ticket channels will be created")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt.setName("staff_role").setDescription("Role that can view/manage tickets").setRequired(true)
        )
        .addRoleOption((opt) =>
          opt
            .setName("admin_role")
            .setDescription("Role that can use /ticketadmin (optional). If unset, only Manage Server/Admin can.")
            .setRequired(false)
        )
        .addChannelOption((opt) =>
          opt
            .setName("log_channel")
            .setDescription("Ticket logs channel (transcripts posted here).")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("naming")
            .setDescription("Default ticket naming mode")
            .addChoices(
              { name: "Numbered (ticket-0001)", value: "number" },
              { name: "Username (ticket-username)", value: "username" }
            )
            .setRequired(true)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("allow_multiple_per_user")
            .setDescription("Allow multiple open tickets per user (per-guild override)")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("escalation_mode")
            .setDescription("How escalation is applied")
            .addChoices(
              { name: "Automatic (apply immediately)", value: "automatic" },
              { name: "Manual (requires manager acceptance)", value: "manual" }
            )
            .setRequired(false)
        )
        .addRoleOption((opt) =>
          opt
            .setName("escalation_role")
            .setDescription("Role that will take over escalated tickets (optional)")
            .setRequired(false)
        )
        .addRoleOption((opt) =>
          opt
            .setName("escalation_manager_role")
            .setDescription("Role pinged for manual escalation acceptance (optional)")
            .setRequired(false)
        )
        .addChannelOption((opt) =>
          opt
            .setName("escalated_category")
            .setDescription("Category to move escalated tickets into (optional)")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("panel")
        .setDescription("Post a Create Ticket panel in a channel.")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to post the panel in")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption((opt) => opt.setName("title").setDescription("Panel title"))
        .addStringOption((opt) => opt.setName("description").setDescription("Panel description (use \\n)"))
        .addStringOption((opt) => opt.setName("button_label").setDescription('Button label (default "Create Ticket")'))
    )
    .addSubcommand((sc) => sc.setName("status").setDescription("Show current ticket configuration."))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this in a server.");

      const sub = interaction.options.getSubcommand(true);
      const cfg = getGuildConfig(interaction.guildId);
      const t = cfg.tickets || {};

      if (sub === "setup") {
        const category = interaction.options.getChannel("category", true);
        const staffRole = interaction.options.getRole("staff_role", true);
        const adminRole = interaction.options.getRole("admin_role") || null;
        const logChannel = interaction.options.getChannel("log_channel", true);
        const naming = interaction.options.getString("naming", true);
        const allowMulti = interaction.options.getBoolean("allow_multiple_per_user");

        const escalationMode = interaction.options.getString("escalation_mode") || (t.escalationMode || "automatic");
        const escalationRole = interaction.options.getRole("escalation_role") || null;
        const escalationManagerRole = interaction.options.getRole("escalation_manager_role") || null;
        const escalatedCategory = interaction.options.getChannel("escalated_category") || null;

        const anyEsc = Boolean(escalationRole || escalationManagerRole || escalatedCategory);
        if (anyEsc) {
          if (!escalationRole || !escalatedCategory) {
            return replyEphemeral(
              interaction,
              "To configure escalation you must set both `escalation_role` and `escalated_category`."
            );
          }
          if (escalationMode === "manual" && !escalationManagerRole) {
            return replyEphemeral(interaction, "Manual escalation requires `escalation_manager_role`.");
          }
        }

        const nextNumber = Number.isFinite(t.nextNumber) ? t.nextNumber : 1;

        setGuildConfig(interaction.guildId, {
          tickets: {
            enabled: true,
            categoryId: category.id,
            staffRoleId: staffRole.id,
            adminRoleId: adminRole ? adminRole.id : (t.adminRoleId || null),
            logChannelId: logChannel.id,
            namingMode: naming,
            allowMultiplePerUser:
              typeof allowMulti === "boolean" ? allowMulti : (t.allowMultiplePerUser || false),
            nextNumber,
            byUser: t.byUser || {},
            byChannel: t.byChannel || {},
            panelChannelId: t.panelChannelId || null,
            panelMessageId: t.panelMessageId || null,
            escalationMode: escalationMode,
            escalationRoleId: escalationRole ? escalationRole.id : (t.escalationRoleId || null),
            escalationManagerRoleId: escalationManagerRole
              ? escalationManagerRole.id
              : (t.escalationManagerRoleId || null),
            escalatedCategoryId: escalatedCategory ? escalatedCategory.id : (t.escalatedCategoryId || null),
          },
        });

        const lines = [
          "✅ Tickets configured.",
          `Category: <#${category.id}>`,
          `Staff Role: <@&${staffRole.id}>`,
          `Ticket Admin Role: ${adminRole ? `<@&${adminRole.id}>` : (t.adminRoleId ? `<@&${t.adminRoleId}>` : "Not set")}`,
          `Ticket Logs: <#${logChannel.id}>`,
          `Naming: \`${naming}\``,
        ];

        const escEnabled = Boolean((escalationRole && escalatedCategory) || (t.escalationRoleId && t.escalatedCategoryId));
        lines.push(`Escalation: ${escEnabled ? "✅" : "❌"}`);
        if (escEnabled) {
          lines.push(
            `Escalation mode: \`${escalationMode}\``,
            `Escalation role: <@&${(escalationRole ? escalationRole.id : t.escalationRoleId)}>` ,
            `Escalated category: <#${(escalatedCategory ? escalatedCategory.id : t.escalatedCategoryId)}>`
          );
          if (escalationMode === "manual") {
            const mgr = escalationManagerRole ? escalationManagerRole.id : t.escalationManagerRoleId;
            lines.push(`Escalation manager: ${mgr ? `<@&${mgr}>` : "Not set"}`);
          }
        }

        return replyEphemeral(interaction, lines.join("\n"));
      }

      if (sub === "status") {
        if (!t?.enabled) return replyEphemeral(interaction, "Tickets aren’t configured. Run `/tickets setup`.");

        const escEnabled = Boolean(t.escalationRoleId && t.escalatedCategoryId);
        const lines = [
          `Enabled: ${t.enabled ? "✅" : "❌"}`,
          `Category: ${t.categoryId ? `<#${t.categoryId}>` : "Not set"}`,
          `Staff Role: ${t.staffRoleId ? `<@&${t.staffRoleId}>` : "Not set"}`,
          `Ticket Admin Role: ${t.adminRoleId ? `<@&${t.adminRoleId}>` : "Not set"}`,
          `Ticket Logs: ${t.logChannelId ? `<#${t.logChannelId}>` : "Not set"}`,
          `Naming: \`${t.namingMode || "number"}\``,
          `Allow multiple open tickets: ${t.allowMultiplePerUser ? "✅" : "❌"}`,
          `Escalation: ${escEnabled ? "✅" : "❌"}`,
        ];

        if (escEnabled) {
          lines.push(
            `Escalation mode: \`${t.escalationMode || "automatic"}\``,
            `Escalation role: <@&${t.escalationRoleId}>`,
            `Escalated category: <#${t.escalatedCategoryId}>`
          );
          if ((t.escalationMode || "automatic") === "manual") {
            lines.push(`Escalation manager: ${t.escalationManagerRoleId ? `<@&${t.escalationManagerRoleId}>` : "Not set"}`);
          }
        }

        return replyEphemeral(interaction, lines.join("\n"));
      }

      if (sub === "panel") {
        if (!t?.enabled || !t.categoryId || !t.staffRoleId || !t.logChannelId) {
          return replyEphemeral(interaction, "Tickets aren’t configured. Run `/tickets setup` first.");
        }

        await deferEphemeral(interaction);

        const channel = interaction.options.getChannel("channel", true);
        if (!channel?.isTextBased?.() || channel.isDMBased?.()) return interaction.editReply("Pick a server text channel.");

        const title = interaction.options.getString("title") || "Support Tickets";
        const description =
          interaction.options.getString("description") ||
          "Press the button below to open a private support ticket.\\nYou can optionally name your ticket when it opens.";
        const buttonLabel = interaction.options.getString("button_label") || "Create Ticket";

        const msg = await channel.send(buildPanel(interaction.guild, title, description, buttonLabel));

        setGuildConfig(interaction.guildId, {
          tickets: {
            ...t,
            panelChannelId: channel.id,
            panelMessageId: msg.id,
          },
        });

        return interaction.editReply(`✅ Ticket panel posted in ${channel}.`);
      }

      return replyEphemeral(interaction, "Unknown subcommand.");
    } catch (err) {
      console.error("❌ tickets command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running tickets.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running tickets.");
      }
    }
  },
};
