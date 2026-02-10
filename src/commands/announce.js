const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const {
  createAnnouncement,
  listAnnouncements,
  deleteAnnouncement,
  setAnnouncementPaused,
  parseDateTimeToMs,
} = require("../handlers/announcements");

function msToUnix(ms) {
  return Math.floor(ms / 1000);
}

function fmtWhen(ms) {
  const unix = msToUnix(ms);
  return `<t:${unix}:F> (<t:${unix}:R>)`;
}

function pingLabel(item) {
  if (item.pingType === "everyone") return "@everyone";
  if (item.pingType === "here") return "@here";
  if (item.pingType === "role" && item.pingRoleId) return `<@&${item.pingRoleId}>`;
  return "(none)";
}

function freqLabel(item) {
  if (item.frequency === "once") return "Once";
  if (item.frequency === "daily") return "Daily";
  if (item.frequency === "weekly") return "Weekly";
  if (item.frequency === "biweekly") return "Every 2 weeks";
  if (item.frequency === "monthly") return "Monthly";
  if (item.frequency === "every_ndays") {
    const n = typeof item.intervalDays === "number" ? item.intervalDays : 0;
    if (n === 2) return "Every other day";
    if (n > 0) return `Every ${n} days`;
    return "Every N days";
  }
  return item.frequency;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Automated announcements (scheduled embeds)")
    .addSubcommand((sc) =>
      sc
        .setName("create")
        .setDescription("Create a scheduled announcement")
        .addChannelOption((opt) =>
          opt.setName("channel").setDescription("Where to send the announcement").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("ping")
            .setDescription("Who to ping")
            .setRequired(true)
            .addChoices(
              { name: "Role", value: "role" },
              { name: "Everyone", value: "everyone" },
              { name: "Here", value: "here" },
              { name: "No ping", value: "none" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("recurrence")
            .setDescription("How often it runs")
            .setRequired(true)
            .addChoices(
              { name: "One time", value: "once" },
              { name: "Daily", value: "daily" },
              { name: "Every other day", value: "every_other_day" },
              { name: "Custom (every N days)", value: "every_ndays" },
              { name: "Weekly", value: "weekly" },
              { name: "Every 2 weeks", value: "biweekly" },
              { name: "Monthly", value: "monthly" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("when")
            .setDescription(
              "For one-time: YYYY-MM-DD HH:MM (UTC) or unix seconds. For recurring: HH:MM (UTC)."
            )
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("message")
            .setDescription("Embed body. Supports \\n and {t:YYYY-MM-DD HH:MM} / {tr:YYYY-MM-DD HH:MM}")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("days_between")
            .setDescription("Used only if recurrence=Custom (every N days). 2 = every other day.")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(365)
        )
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Role to ping (required if ping=Role)").setRequired(false)
        )
        .addStringOption((opt) => opt.setName("title").setDescription("Optional embed title").setRequired(false))
    )
    .addSubcommand((sc) => sc.setName("list").setDescription("List announcements"))
    .addSubcommand((sc) =>
      sc
        .setName("delete")
        .setDescription("Delete an announcement")
        .addStringOption((opt) => opt.setName("id").setDescription("Announcement id").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("pause")
        .setDescription("Pause an announcement")
        .addStringOption((opt) => opt.setName("id").setDescription("Announcement id").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("resume")
        .setDescription("Resume an announcement")
        .addStringOption((opt) => opt.setName("id").setDescription("Announcement id").setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this command in a server.");
    const sub = interaction.options.getSubcommand(true);

    if (sub === "list") {
      const items = listAnnouncements(interaction.guildId);
      if (!items.length) return replyEphemeral(interaction, "No announcements configured.");

      const lines = items
        .sort((a, b) => (a.nextRunAt || 0) - (b.nextRunAt || 0))
        .slice(0, 25)
        .map((x) => {
          const next = typeof x.nextRunAt === "number" ? fmtWhen(x.nextRunAt) : "(unknown)";
          const chan = x.channelId ? `<#${x.channelId}>` : "(no channel)";
          const status = x.paused ? "Paused" : "Active";
          return `• **${x.id}** — ${status} — ${freqLabel(x)} — ${chan} — ${pingLabel(x)} — Next: ${next}`;
        });

      const extra = items.length > 25 ? `\n\nShowing 25 of ${items.length}.` : "";
      return replyEphemeral(interaction, lines.join("\n") + extra);
    }

    if (sub === "create") {
      const channel = interaction.options.getChannel("channel", true);
      if (!channel.isTextBased()) return replyEphemeral(interaction, "That channel is not text-based.");

      const ping = interaction.options.getString("ping", true);
      const recurrence = interaction.options.getString("recurrence", true);
      const when = interaction.options.getString("when", true);
      const message = interaction.options.getString("message", true);
      const daysBetween = interaction.options.getInteger("days_between", false);
      const role = interaction.options.getRole("role", false);
      const title = interaction.options.getString("title", false) || "";

      if (ping === "role" && !role) return replyEphemeral(interaction, "If ping is Role, you must provide a role.");

      if (recurrence === "every_ndays" && (!daysBetween || daysBetween < 1)) {
        return replyEphemeral(interaction, "If recurrence is Custom (every N days), you must set days_between (1-365).");
      }

      await deferEphemeral(interaction);

      if (recurrence === "once") {
        const ms = parseDateTimeToMs(when);
        if (!ms) return interaction.editReply("❌ Invalid date/time. Use YYYY-MM-DD HH:MM (UTC), ISO, or unix seconds.");

        const res = createAnnouncement(interaction.guildId, {
          frequency: "once",
          runAt: when,
          channelId: channel.id,
          pingType: ping,
          pingRoleId: role ? role.id : "",
          title,
          message,
        });

        if (!res.ok) {
          if (res.error === "datetime_in_past") return interaction.editReply("❌ That time is in the past.");
          return interaction.editReply("❌ Failed to create announcement.");
        }

        return interaction.editReply(`✅ Created announcement **${res.id}** (one-time)\nNext run: ${fmtWhen(res.nextRunAt)}`);
      }

      let frequency = recurrence;
      let intervalDays = 0;

      if (recurrence === "every_other_day") {
        frequency = "every_ndays";
        intervalDays = 2;
      }

      if (recurrence === "every_ndays") {
        frequency = "every_ndays";
        intervalDays = daysBetween || 0;
      }

      const payload = {
        frequency,
        timeHHMM: when,
        channelId: channel.id,
        pingType: ping,
        pingRoleId: role ? role.id : "",
        title,
        message,
      };

      if (frequency === "every_ndays") payload.intervalDays = intervalDays;

      const res = createAnnouncement(interaction.guildId, payload);

      if (!res.ok) {
        if (res.error === "invalid_time") return interaction.editReply("❌ Invalid time. Use HH:MM (UTC) for recurring schedules.");
        if (res.error === "invalid_interval_days") return interaction.editReply("❌ Invalid days_between. Use 1-365.");
        return interaction.editReply("❌ Failed to create announcement.");
      }

      return interaction.editReply(`✅ Created announcement **${res.id}** (${freqLabel({ frequency, intervalDays })})\nNext run: ${fmtWhen(res.nextRunAt)}`);
    }

    if (sub === "delete") {
      const id = interaction.options.getString("id", true).trim();
      await deferEphemeral(interaction);
      const res = deleteAnnouncement(interaction.guildId, id);
      return interaction.editReply(res.ok ? `✅ Deleted **${id}**` : "❌ Announcement not found.");
    }

    if (sub === "pause" || sub === "resume") {
      const id = interaction.options.getString("id", true).trim();
      await deferEphemeral(interaction);
      const paused = sub === "pause";
      const res = setAnnouncementPaused(interaction.guildId, id, paused);
      return interaction.editReply(res.ok ? `✅ ${paused ? "Paused" : "Resumed"} **${id}**` : "❌ Announcement not found.");
    }
  },
};