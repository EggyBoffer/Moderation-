const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");
const { ensureEscalation, setEscalationConfig } = require("../handlers/escalation");
const { getGuildConfig } = require("../storage/guildConfig");
const { parseDurationToMs } = require("../handlers/parseDuration");

function msToPretty(ms) {
  if (!ms || ms <= 0) return "all time";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatRules(rules) {
  if (!rules.length) return "No escalation rules set.";
  const sorted = rules.slice().sort((a, b) => Number(a.warns) - Number(b.warns));
  return sorted
    .map((r) => {
      const reason = r.action.reason ? ` — "${r.action.reason}"` : "";
      return `• **${r.warns}** warns → timeout **${r.action.duration}**${reason}`;
    })
    .join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("escalation")
    .setDescription("Configure auto escalation (warn thresholds -> timeout)")
    .addSubcommand((sc) =>
      sc
        .setName("enable")
        .setDescription("Enable or disable escalation")
        .addBooleanOption((opt) =>
          opt.setName("enabled").setDescription("Enable?").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("window")
        .setDescription("Set warn counting window (0 = all time)")
        .addStringOption((opt) =>
          opt
            .setName("duration")
            .setDescription("e.g. 30d, 7d, 12h, 0 (for all time)")
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("resetwarns")
        .setDescription("Reset warns after an escalation triggers")
        .addBooleanOption((opt) =>
          opt.setName("enabled").setDescription("Reset warns?").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("rule-add")
        .setDescription("Add or update an escalation rule")
        .addIntegerOption((opt) =>
          opt
            .setName("warns")
            .setDescription("Warn threshold (e.g. 3)")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("timeout")
            .setDescription("Timeout duration (e.g. 1h, 12h, 1d)")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Optional reason text shown in timeout")
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("rule-remove")
        .setDescription("Remove a rule by warn threshold")
        .addIntegerOption((opt) =>
          opt
            .setName("warns")
            .setDescription("Warn threshold to remove")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc.setName("view").setDescription("View current escalation configuration")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "You must use this in a server.");
      }
      if (!isMod(interaction.member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      const sub = interaction.options.getSubcommand(true);

      if (sub === "enable") {
        const enabled = interaction.options.getBoolean("enabled", true);
        setEscalationConfig(interaction.guildId, { enabled });
        return replyEphemeral(
          interaction,
          enabled ? "✅ Auto escalation enabled." : "✅ Auto escalation disabled."
        );
      }

      if (sub === "window") {
        const duration = interaction.options.getString("duration", true).trim();

        if (duration === "0") {
          setEscalationConfig(interaction.guildId, { windowMs: 0 });
          return replyEphemeral(interaction, "✅ Warn window set to **all time**.");
        }

        const parsed = parseDurationToMs(duration);
        if (!parsed.ok) return replyEphemeral(interaction, parsed.error);

        setEscalationConfig(interaction.guildId, { windowMs: parsed.ms });
        return replyEphemeral(interaction, `✅ Warn window set to **${msToPretty(parsed.ms)}**.`);
      }

      if (sub === "resetwarns") {
        const enabled = interaction.options.getBoolean("enabled", true);
        setEscalationConfig(interaction.guildId, { resetWarnsOnEscalation: enabled });
        return replyEphemeral(
          interaction,
          enabled
            ? "✅ Warns will be reset after escalation."
            : "✅ Warns will NOT be reset after escalation."
        );
      }

      if (sub === "rule-add") {
        const warns = interaction.options.getInteger("warns", true);
        const timeout = interaction.options.getString("timeout", true).trim();
        const reason = interaction.options.getString("reason") || "";

        const parsed = parseDurationToMs(timeout);
        if (!parsed.ok) return replyEphemeral(interaction, parsed.error);

        await deferEphemeral(interaction);

        const cfg = getGuildConfig(interaction.guildId);
        const esc = ensureEscalation(cfg);

        const rules = esc.rules.slice();
        const idx = rules.findIndex((r) => Number(r.warns) === Number(warns));
        const rule = {
          warns,
          action: {
            type: "timeout",
            duration: timeout,
            reason: reason.trim().slice(0, 200),
          },
        };

        if (idx === -1) rules.push(rule);
        else rules[idx] = rule;

        setEscalationConfig(interaction.guildId, { rules });

        return interaction.editReply(
          `✅ Rule saved: **${warns}** warns → timeout **${timeout}**` +
            (reason.trim() ? ` (reason: "${rule.action.reason}")` : "")
        );
      }

      if (sub === "rule-remove") {
        const warns = interaction.options.getInteger("warns", true);

        const cfg = getGuildConfig(interaction.guildId);
        const esc = ensureEscalation(cfg);

        const next = esc.rules.filter((r) => Number(r.warns) !== Number(warns));
        setEscalationConfig(interaction.guildId, { rules: next });

        return replyEphemeral(interaction, `✅ Removed rule for **${warns}** warns (if it existed).`);
      }

      if (sub === "view") {
        const cfg = getGuildConfig(interaction.guildId);
        const esc = ensureEscalation(cfg);

        return replyEphemeral(
          interaction,
          `**Auto Escalation:** ${esc.enabled ? "✅ enabled" : "⛔ disabled"}\n` +
            `**Warn window:** ${msToPretty(esc.windowMs)}\n` +
            `**Reset warns on escalation:** ${esc.resetWarnsOnEscalation ? "yes" : "no"}\n\n` +
            `**Rules:**\n${formatRules(esc.rules)}`
        );
      }

      return replyEphemeral(interaction, "Unknown subcommand.");
    } catch (err) {
      console.error("❌ escalation command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running escalation.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running escalation.");
      }
    }
  },
};
