const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");
const { baseEmbed, setActor } = require("../handlers/logEmbeds");
const { clip } = require("../handlers/text");
const { listHistory } = require("../handlers/infractions");

function fmtTs(ms) {
  return ms ? `<t:${Math.floor(ms / 1000)}:f>` : "(unknown time)";
}

function formatEntry(e) {
  const when = fmtTs(e.ts);
  const mod = e.modId ? `<@${e.modId}>` : "(unknown mod)";
  const id = e.id ? `\`${e.id}\`` : "(no id)";

  if (e.type === "warn") {
    return `⚠️ **Warn** ${when}\n**Mod:** ${mod} • **ID:** ${id}\n${clip(e.reason, 240)}`;
  }

  if (e.type === "timeout") {
    const duration = e.meta?.durationStr ? `**${e.meta.durationStr}**` : "(unknown duration)";
    const lifts = e.meta?.liftAt ? fmtTs(e.meta.liftAt) : "(unknown lift time)";
    return `⏳ **Timeout** ${when}\n**Mod:** ${mod} • **ID:** ${id}\n**Duration:** ${duration} • **Lifts:** ${lifts}\n${clip(e.reason, 220)}`;
  }

  if (e.type === "untimeout") {
    return `✅ **Untimeout** ${when}\n**Mod:** ${mod} • **ID:** ${id}\n${clip(e.reason, 240)}`;
  }

  if (e.type === "note") {
    return `📝 **Note** ${when}\n**Mod:** ${mod} • **ID:** ${id}\n${clip(e.reason, 260)}`;
  }

  return `• **${String(e.type || "unknown").toUpperCase()}** ${when}\n**Mod:** ${mod} • **ID:** ${id}`;
}

function countTypes(entries) {
  const out = { warn: 0, timeout: 0, untimeout: 0, note: 0, other: 0 };
  for (const e of entries) {
    if (e?.type === "warn") out.warn++;
    else if (e?.type === "timeout") out.timeout++;
    else if (e?.type === "untimeout") out.untimeout++;
    else if (e?.type === "note") out.note++;
    else out.other++;
  }
  return out;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("check")
    .setDescription("View a user's full moderation history (warns, timeouts, notes)")
    .addUserOption((opt) => opt.setName("user").setDescription("User").setRequired(true))
    .addIntegerOption((opt) =>
      opt.setName("page").setDescription("Page number (default 1)").setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "You must use this command in a server.");
      }

      if (!isMod(interaction.member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      const user = interaction.options.getUser("user", true);
      const page = interaction.options.getInteger("page") ?? 1;

      await deferEphemeral(interaction);

      const history = listHistory(interaction.guildId, user.id);
      if (!history.length) {
        const embed = baseEmbed("Moderation History")
          .setThumbnail(interaction.guild.iconURL({ size: 128 }))
          .setDescription(`✅ **${user.tag}** has no moderation history recorded.`);
        setActor(embed, interaction.user);
        return interaction.editReply({ embeds: [embed] });
      }

      const perPage = 6;
      const totalPages = Math.max(1, Math.ceil(history.length / perPage));
      const safePage = Math.min(Math.max(page, 1), totalPages);

      const start = (safePage - 1) * perPage;
      const slice = history.slice(start, start + perPage);

      const counts = countTypes(history);
      const summary =
        `⚠️ Warns: **${counts.warn}**  •  ⏳ Timeouts: **${counts.timeout}**  •  ✅ Untimeouts: **${counts.untimeout}**  •  📝 Notes: **${counts.note}**`;

      let description = slice.map(formatEntry).join("\n\n");
      if (description.length > 3900) description = description.slice(0, 3900) + "…";

      const embed = baseEmbed("Moderation History")
        .setThumbnail(interaction.guild.iconURL({ size: 128 }))
        .setDescription(`**User:** ${user.tag} (ID: ${user.id})\n${summary}\n\n${description}`)
        .setFooter({ text: `Page ${safePage}/${totalPages} • Total entries: ${history.length}` });

      setActor(embed, interaction.user);
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("❌ check command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running check.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running check.");
      }
    }
  },
};
