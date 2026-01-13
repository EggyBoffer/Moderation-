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

function truthy(v) {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().trim();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return null;
}

function buildPanel(guild, title, description, buttonLabel) {
  const embed = new EmbedBuilder()
    .setTitle(title || "Support Tickets")
    .setDescription(
      normalizeNewlines(
        description || "Press the button below to open a private support ticket."
      )
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
          opt
            .setName("staff_role")
            .setDescription("Role that can view/manage tickets")
            .setRequired(true)
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
        .addRoleOption((opt) =>
          opt
            .setName("escalation_role")
            .setDescription("Optional: role to ping when a ticket is escalated (enables escalation)")
            .setRequired(false)
        )
        .addChannelOption((opt) =>
          opt
            .setName("escalated_category")
            .setDescription("Optional: category to move tickets into when escalated (enables escalation)")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("escalation")
        .setDescription("Configure ticket escalation.")
        .addSubcommand((sc) =>
          sc
            .setName("enable")
            .setDescription("Enable escalation (requires role + escalated category).")
            .addRoleOption((opt) =>
              opt
                .setName("role")
                .setDescription("Role to ping/notify for escalations")
                .setRequired(true)
            )
            .addChannelOption((opt) =>
              opt
                .setName("category")
                .setDescription("Category to move escalated tickets into")
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true)
            )
        )
        .addSubcommand((sc) =>
          sc.setName("disable").setDescription("Disable escalation (removes escalate option).")
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
        .addStringOption((opt) =>
          opt.setName("description").setDescription("Panel description (use \\n)")
        )
        .addStringOption((opt) =>
          opt.setName("button_label").setDescription('Button label (default "Create Ticket")')
        )
    )
    .addSubcommand((sc) =>
      sc.setName("status").setDescription("Show current ticket configuration.")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this in a server.");

      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand(true);

      const cfg = getGuildConfig(interaction.guildId);
      const t = cfg.tickets || {};

      if (!group && sub === "setup") {
        const category = interaction.options.getChannel("category", true);
        const staffRole = interaction.options.getRole("staff_role", true);
        const logChannel = interaction.options.getChannel("log_channel", true);
        const naming = interaction.options.getString("naming", true);
        const allowMulti = interaction.options.getBoolean("allow_multiple_per_user");

        const escalationRole = interaction.options.getRole("escalation_role");
        const escalatedCategory = interaction.options.getChannel("escalated_category");

        const wantsEscalation = Boolean(escalationRole || escalatedCategory);
        if (wantsEscalation && (!escalationRole || !escalatedCategory)) {
          return replyEphemeral(
            interaction,
            "To enable escalation in setup, you must set **both** `escalation_role` and `escalated_category`."
          );
        }

        const nextNumber = Number.isFinite(t.nextNumber) ? t.nextNumber : 1;

        setGuildConfig(interaction.guildId, {
          tickets: {
            enabled: true,
            categoryId: category.id,
            staffRoleId: staffRole.id,
            logChannelId: logChannel.id,
            namingMode: naming,
            allowMultiplePerUser:
              typeof allowMulti === "boolean" ? allowMulti : (t.allowMultiplePerUser || false),
            nextNumber,
            byUser: t.byUser || {},
            byChannel: t.byChannel || {},
            panelChannelId: t.panelChannelId || null,
            panelMessageId: t.panelMessageId || null,
            escalationEnabled: wantsEscalation ? true : Boolean(t.escalationEnabled),
            escalationRoleId: wantsEscalation ? escalationRole.id : (t.escalationRoleId || null),
            escalatedCategoryId: wantsEscalation ? escalatedCategory.id : (t.escalatedCategoryId || null),
          },
        });

        const lines = [
          "✅ Tickets configured.",
          `Category: <#${category.id}>`,
          `Staff Role: <@&${staffRole.id}>`,
          `Ticket Logs: <#${logChannel.id}>`,
          `Naming: \`${naming}\``,
        ];

        if (wantsEscalation) {
          lines.push(
            `Escalation: ✅`,
            `Escalation Role: <@&${escalationRole.id}>`,
            `Escalated Category: <#${escalatedCategory.id}>`
          );
        } else {
          const enabled = Boolean(t.escalationEnabled && t.escalationRoleId && t.escalatedCategoryId);
          lines.push(`Escalation: ${enabled ? "✅" : "❌"}`);
        }

        return replyEphemeral(interaction, lines.join("\n"));
      }

      if (group === "escalation" && sub === "enable") {
        if (!t?.enabled) return replyEphemeral(interaction, "Tickets aren’t configured. Run `/tickets setup` first.");

        const role = interaction.options.getRole("role", true);
        const category = interaction.options.getChannel("category", true);

        setGuildConfig(interaction.guildId, {
          tickets: {
            ...t,
            escalationEnabled: true,
            escalationRoleId: role.id,
            escalatedCategoryId: category.id,
          },
        });

        return replyEphemeral(
          interaction,
          `✅ Escalation enabled.\nEscalation Role: <@&${role.id}>\nEscalated Category: <#${category.id}>`
        );
      }

      if (group === "escalation" && sub === "disable") {
        if (!t?.enabled) return replyEphemeral(interaction, "Tickets aren’t configured. Run `/tickets setup` first.");

        setGuildConfig(interaction.guildId, {
          tickets: {
            ...t,
            escalationEnabled: false,
            escalationRoleId: null,
            escalatedCategoryId: null,
          },
        });

        return replyEphemeral(interaction, "✅ Escalation disabled. (Escalate option will no longer appear.)");
      }

      if (!group && sub === "status") {
        if (!t?.enabled) return replyEphemeral(interaction, "Tickets aren’t configured. Run `/tickets setup`.");

        const envMulti = truthy(process.env.TICKETS_ALLOW_MULTIPLE);
        const allowMultiResolved =
          typeof envMulti === "boolean" ? envMulti : Boolean(t.allowMultiplePerUser);

        const escalationConfigured = Boolean(t.escalationEnabled && t.escalationRoleId && t.escalatedCategoryId);

        const lines = [
          `Enabled: ${t.enabled ? "✅" : "❌"}`,
          `Category: ${t.categoryId ? `<#${t.categoryId}>` : "Not set"}`,
          `Staff Role: ${t.staffRoleId ? `<@&${t.staffRoleId}>` : "Not set"}`,
          `Ticket Logs: ${t.logChannelId ? `<#${t.logChannelId}>` : "Not set"}`,
          `Naming: \`${t.namingMode || "number"}\``,
          `Allow multiple open tickets: ${allowMultiResolved ? "✅" : "❌"}${
            typeof envMulti === "boolean" ? " (global override)" : ""
          }`,
          `Escalation: ${escalationConfigured ? "✅" : "❌"}`,
        ];

        if (escalationConfigured) {
          lines.push(
            `Escalation Role: <@&${t.escalationRoleId}>`,
            `Escalated Category: <#${t.escalatedCategoryId}>`
          );
        }

        return replyEphemeral(interaction, lines.join("\n"));
      }

      if (!group && sub === "panel") {
        if (!t?.enabled || !t.categoryId || !t.staffRoleId || !t.logChannelId) {
          return replyEphemeral(interaction, "Tickets aren’t configured. Run `/tickets setup` first.");
        }

        await deferEphemeral(interaction);

        const channel = interaction.options.getChannel("channel", true);
        if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
          return interaction.editReply("Pick a server text channel.");
        }

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
