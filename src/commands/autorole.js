const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");
const { getGuildConfig } = require("../storage/guildConfig");
const {
  ensureAutoRoles,
  setAutoRolesConfig,
  botCanManageRole,
  memberCanManageRole,
  runTenureSweep,
  runJoinRoleSweep,
} = require("../handlers/autoRoles");
const { parseDurationToMs } = require("../handlers/parseDuration");

function fmtMs(ms) {
  if (!ms || ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatTenureRules(rules) {
  if (!rules.length) return "No tenure rules set.";
  const sorted = rules.slice().sort((a, b) => Number(a.days) - Number(b.days));
  return sorted
    .map((r) => {
      const remove = r.removeRoleId ? `, remove <@&${r.removeRoleId}>` : "";
      return `• **${r.days}** day(s): add <@&${r.addRoleId}>${remove}`;
    })
    .join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Configure automatic roles (join + tenure)")

    
    .addSubcommand((sc) =>
      sc
        .setName("join-enable")
        .setDescription("Enable/disable join auto-role")
        .addBooleanOption((opt) =>
          opt.setName("enabled").setDescription("Enable?").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("join-set")
        .setDescription("Set join role + optional delay")
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Role to give on join").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("delay")
            .setDescription("Delay before giving role (e.g. 0, 10s, 5m, 1h)")
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc.setName("join-clear").setDescription("Clear join auto-role role setting")
    )

    
    .addSubcommand((sc) =>
      sc
        .setName("tenure-enable")
        .setDescription("Enable/disable tenure roles")
        .addBooleanOption((opt) =>
          opt.setName("enabled").setDescription("Enable?").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("tenure-add")
        .setDescription("Add/update a tenure rule")
        .addIntegerOption((opt) =>
          opt
            .setName("days")
            .setDescription("Days in server required")
            .setMinValue(1)
            .setMaxValue(3650)
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt.setName("addrole").setDescription("Role to add").setRequired(true)
        )
        .addRoleOption((opt) =>
          opt
            .setName("removerole")
            .setDescription("Optional role to remove")
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("tenure-remove")
        .setDescription("Remove a tenure rule by days value")
        .addIntegerOption((opt) =>
          opt
            .setName("days")
            .setDescription("Rule days threshold to remove")
            .setMinValue(1)
            .setMaxValue(3650)
            .setRequired(true)
        )
    )

    
    .addSubcommand((sc) =>
      sc.setName("view").setDescription("View current auto-role configuration")
    )
    .addSubcommand((sc) =>
      sc.setName("run-now").setDescription("Run tenure + join catch-up sweeps now")
    )

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction, client) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "You must use this command in a server.");
      }

      if (!isMod(interaction.member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      
      if (!interaction.member.permissions?.has(PermissionFlagsBits.ManageRoles)) {
        return replyEphemeral(interaction, "You need **Manage Roles** to configure auto roles.");
      }

      const me = interaction.guild.members.me;
      if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
        return replyEphemeral(interaction, "I need **Manage Roles** to assign roles.");
      }

      const sub = interaction.options.getSubcommand(true);

      const cfg = getGuildConfig(interaction.guildId);
      const ar = ensureAutoRoles(cfg);

      if (sub === "join-enable") {
        const enabled = interaction.options.getBoolean("enabled", true);
        setAutoRolesConfig(interaction.guildId, { join: { enabled } });
        return replyEphemeral(
          interaction,
          enabled ? "✅ Join auto-role enabled." : "✅ Join auto-role disabled."
        );
      }

      if (sub === "join-set") {
        const role = interaction.options.getRole("role", true);
        const delayRaw = interaction.options.getString("delay") ?? "0";

        if (!memberCanManageRole(interaction.member, role)) {
          return replyEphemeral(interaction, "You can’t configure a role above your highest role.");
        }
        if (!botCanManageRole(interaction.guild, role)) {
          return replyEphemeral(interaction, "I can’t assign that role (role hierarchy).");
        }

        let delayMs = 0;
        if (delayRaw !== "0") {
          const parsed = parseDurationToMs(delayRaw);
          if (!parsed.ok) return replyEphemeral(interaction, parsed.error);
          delayMs = parsed.ms;
        }

        setAutoRolesConfig(interaction.guildId, {
          join: { enabled: true, roleId: role.id, delayMs },
        });

        return replyEphemeral(
          interaction,
          `✅ Join role set to <@&${role.id}> with delay **${fmtMs(delayMs)}**.`
        );
      }

      if (sub === "join-clear") {
        setAutoRolesConfig(interaction.guildId, {
          join: { roleId: null, delayMs: 0 },
        });
        return replyEphemeral(interaction, "✅ Join role cleared.");
      }

      if (sub === "tenure-enable") {
        const enabled = interaction.options.getBoolean("enabled", true);
        setAutoRolesConfig(interaction.guildId, { tenure: { enabled } });
        return replyEphemeral(
          interaction,
          enabled ? "✅ Tenure roles enabled." : "✅ Tenure roles disabled."
        );
      }

      if (sub === "tenure-add") {
        const days = interaction.options.getInteger("days", true);
        const addRole = interaction.options.getRole("addrole", true);
        const removeRole = interaction.options.getRole("removerole", false);

        if (!memberCanManageRole(interaction.member, addRole)) {
          return replyEphemeral(interaction, "You can’t configure an add-role above your highest role.");
        }
        if (!botCanManageRole(interaction.guild, addRole)) {
          return replyEphemeral(interaction, "I can’t assign that add-role (role hierarchy).");
        }

        if (removeRole) {
          if (!memberCanManageRole(interaction.member, removeRole)) {
            return replyEphemeral(interaction, "You can’t configure a remove-role above your highest role.");
          }
          if (!botCanManageRole(interaction.guild, removeRole)) {
            return replyEphemeral(interaction, "I can’t remove that role (role hierarchy).");
          }
        }

        const rules = ar.tenure.rules.slice();
        const idx = rules.findIndex((r) => Number(r.days) === Number(days));

        const rule = {
          days,
          addRoleId: addRole.id,
          removeRoleId: removeRole ? removeRole.id : null,
        };

        if (idx === -1) rules.push(rule);
        else rules[idx] = rule;

        setAutoRolesConfig(interaction.guildId, { tenure: { enabled: true, rules } });

        return replyEphemeral(
          interaction,
          `✅ Tenure rule saved:\n**${days}** day(s) → add <@&${addRole.id}>` +
            (removeRole ? `, remove <@&${removeRole.id}>` : "")
        );
      }

      if (sub === "tenure-remove") {
        const days = interaction.options.getInteger("days", true);
        const rules = ar.tenure.rules.filter((r) => Number(r.days) !== Number(days));
        setAutoRolesConfig(interaction.guildId, { tenure: { rules } });
        return replyEphemeral(interaction, `✅ Removed tenure rule for **${days}** day(s) (if it existed).`);
      }

      if (sub === "view") {
        const joinText = ar.join.enabled && ar.join.roleId
          ? `✅ enabled\nRole: <@&${ar.join.roleId}>\nDelay: **${fmtMs(ar.join.delayMs)}**`
          : ar.join.enabled
            ? "✅ enabled\nRole: (not set)"
            : "⛔ disabled";

        const tenureText = ar.tenure.enabled
          ? `✅ enabled\n${formatTenureRules(ar.tenure.rules)}`
          : "⛔ disabled";

        return replyEphemeral(
          interaction,
          `**Join Auto-Role:**\n${joinText}\n\n**Tenure Roles:**\n${tenureText}`
        );
      }

      if (sub === "run-now") {
        await deferEphemeral(interaction);

        const joinRes = await runJoinRoleSweep(client, interaction.guild);
        const tenRes = await runTenureSweep(client, interaction.guild);

        const joinLine = joinRes.ok
          ? `Join catch-up: ${joinRes.applied ? `applied **${joinRes.applied}**` : "ok"}`
          : `Join catch-up: ❌ ${joinRes.error || "error"}`;

        const tenLine = tenRes.ok
          ? `Tenure sweep: ${tenRes.promoted ? `promoted **${tenRes.promoted}**` : "ok"}`
          : `Tenure sweep: ❌ ${tenRes.error || "error"}`;

        return interaction.editReply(`✅ Run complete.\n${joinLine}\n${tenLine}`);
      }

      return replyEphemeral(interaction, "Unknown subcommand.");
    } catch (err) {
      console.error("❌ autorole command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running autorole.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running autorole.");
      }
    }
  },
};
