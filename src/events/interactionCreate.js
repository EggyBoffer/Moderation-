const { Events, MessageFlags, PermissionFlagsBits } = require("discord.js");
const { getPanel } = require("../handlers/rolePanels");
const { sendToGuildLog } = require("../handlers/logChannel");
const { baseEmbed, setActor } = require("../handlers/logEmbeds");
const { handleTicketInteraction } = require("../handlers/ticketsSystem");

module.exports = {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    try {
      const handledTicket = await handleTicketInteraction(client, interaction);
      if (handledTicket) return;
    } catch (err) {
      console.error("❌ ticket interaction error:", err);
      try {
        if (interaction.isRepliable()) {
          await interaction.reply({ content: "Something went wrong handling tickets.", flags: MessageFlags.Ephemeral });
        }
      } catch {}
      return;
    }

    if (interaction.isButton()) {
      const id = interaction.customId || "";

      if (id.startsWith("rp:")) {
        try {
          if (!interaction.inGuild()) return;

          const parts = id.split(":");
          const guildId = parts[1];
          const messageId = parts[2];
          const roleId = parts[3];

          if (!guildId || !messageId || !roleId) {
            return interaction.reply({
              content: "This button is malformed.",
              flags: MessageFlags.Ephemeral,
            });
          }

          if (interaction.guildId !== guildId) {
            return interaction.reply({
              content: "This button doesn’t belong to this server.",
              flags: MessageFlags.Ephemeral,
            });
          }

          const panel = getPanel(guildId, messageId);
          if (!panel) {
            return interaction.reply({
              content: "This role panel is no longer configured.",
              flags: MessageFlags.Ephemeral,
            });
          }

          const panelRoleIds = (panel.items || []).map((x) => x.roleId);
          if (!panelRoleIds.includes(roleId)) {
            return interaction.reply({
              content: "That button is not configured for this panel.",
              flags: MessageFlags.Ephemeral,
            });
          }

          const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
          if (!role) {
            return interaction.reply({
              content: "That role no longer exists.",
              flags: MessageFlags.Ephemeral,
            });
          }

          const me = interaction.guild.members.me;
          if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
              content: "I need **Manage Roles** permission to do that.",
              flags: MessageFlags.Ephemeral,
            });
          }

          if (role.position >= me.roles.highest.position) {
            return interaction.reply({
              content:
                "I can’t assign that role because it’s above (or equal to) my highest role.",
              flags: MessageFlags.Ephemeral,
            });
          }

          const member = await interaction.guild.members
            .fetch(interaction.user.id)
            .catch(() => null);

          if (!member) {
            return interaction.reply({
              content: "Couldn’t fetch your member record.",
              flags: MessageFlags.Ephemeral,
            });
          }

          const hasRole = member.roles.cache.has(role.id);
          const mode = (panel.mode || "multi").toLowerCase();

          if (hasRole) {
            await member.roles.remove(role.id);

            await interaction.reply({
              content: `✅ Removed **${role.name}**`,
              flags: MessageFlags.Ephemeral,
            });

            return;
          }

          if (mode === "single") {
            const toRemove = panelRoleIds.filter((rid) => rid !== role.id && member.roles.cache.has(rid));
            if (toRemove.length) await member.roles.remove(toRemove).catch(() => null);
          }

          await member.roles.add(role.id);

          await interaction.reply({
            content:
              mode === "single"
                ? `✅ Set your role to **${role.name}**`
                : `✅ Added **${role.name}**`,
            flags: MessageFlags.Ephemeral,
          });

          try {
            const log = baseEmbed("Role Panel Toggle")
              .setThumbnail(interaction.guild.iconURL({ size: 128 }))
              .setDescription(
                `**User:** ${interaction.user.tag} (ID: ${interaction.user.id})\n` +
                  `**Role:** ${role} (ID: ${role.id})\n` +
                  `**Mode:** ${mode}\n` +
                  `**Action:** Added\n` +
                  `**Panel Message ID:** \`${messageId}\``
              );

            setActor(log, interaction.user);
            await sendToGuildLog(client, interaction.guildId, { embeds: [log] });
          } catch {}

          return;
        } catch (err) {
          console.error("❌ rolepanel button error:", err);

          try {
            if (interaction.deferred || interaction.replied) {
              await interaction.followUp({
                content: "Something went wrong handling that button.",
                flags: MessageFlags.Ephemeral,
              });
            } else {
              await interaction.reply({
                content: "Something went wrong handling that button.",
                flags: MessageFlags.Ephemeral,
              });
            }
          } catch {}

          return;
        }
      }
    }

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
      } catch {}
    }
  },
};
