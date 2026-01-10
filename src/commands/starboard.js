const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");
const { getGuildConfig } = require("../storage/guildConfig");
const { ensureStarboard, setStarboardConfig } = require("../handlers/starboard");

function fmt(cfg) {
  const watch = cfg.watchChannelIds.length ? cfg.watchChannelIds.map((id) => `<#${id}>`).join(", ") : "(none)";
  const sb = cfg.starboardChannelId ? `<#${cfg.starboardChannelId}>` : "(not set)";

  return (
    `**Enabled:** ${cfg.enabled ? "✅ yes" : "⛔ no"}\n` +
    `**Starboard channel:** ${sb}\n` +
    `**Watching:** ${watch}\n` +
    `**Emoji:** ${cfg.emoji}\n` +
    `**Threshold:** **${cfg.threshold}**\n` +
    `**Exclude self-star:** ${cfg.excludeSelf ? "yes" : "no"}\n` +
    `**Ignore bots:** ${cfg.ignoreBots ? "yes" : "no"}`
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("starboard")
    .setDescription("Configure the starboard (top rated posts)")

    .addSubcommand((sc) =>
      sc
        .setName("enable")
        .setDescription("Enable/disable starboard")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable?").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("set-channel")
        .setDescription("Set the starboard output channel")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Where starboard posts go")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("watch-add")
        .setDescription("Add a channel to watch for stars")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel to watch")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("watch-remove")
        .setDescription("Remove a channel from watch list")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel to stop watching")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("emoji")
        .setDescription("Set the star emoji (⭐ or custom emoji like <:name:id>)")
        .addStringOption((o) => o.setName("value").setDescription("Emoji").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("threshold")
        .setDescription("Set star threshold")
        .addIntegerOption((o) =>
          o.setName("value").setDescription("Stars needed").setMinValue(1).setMaxValue(50).setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("exclude-self")
        .setDescription("Exclude author self-starring their own message")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Exclude self?").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("ignore-bots")
        .setDescription("Ignore stars from bot accounts")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Ignore bots?").setRequired(true))
    )
    .addSubcommand((sc) => sc.setName("view").setDescription("View current starboard config"))

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this in a server.");
      if (!isMod(interaction.member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      const cfg = ensureStarboard(getGuildConfig(interaction.guildId));
      const sub = interaction.options.getSubcommand(true);

      if (sub === "view") return replyEphemeral(interaction, fmt(cfg));

      if (sub === "enable") {
        const enabled = interaction.options.getBoolean("enabled", true);
        const next = setStarboardConfig(interaction.guildId, { enabled });
        return replyEphemeral(interaction, `✅ Updated.\n\n${fmt(next)}`);
      }

      if (sub === "set-channel") {
        const ch = interaction.options.getChannel("channel", true);
        const next = setStarboardConfig(interaction.guildId, { starboardChannelId: ch.id });
        return replyEphemeral(interaction, `✅ Starboard channel set to ${ch}.\n\n${fmt(next)}`);
      }

      if (sub === "watch-add") {
        const ch = interaction.options.getChannel("channel", true);
        const next = setStarboardConfig(interaction.guildId, { watchChannelIds: [...cfg.watchChannelIds, ch.id] });
        return replyEphemeral(interaction, `✅ Watching ${ch}.\n\n${fmt(next)}`);
      }

      if (sub === "watch-remove") {
        const ch = interaction.options.getChannel("channel", true);
        const next = setStarboardConfig(interaction.guildId, { watchChannelIds: cfg.watchChannelIds.filter((id) => id !== ch.id) });
        return replyEphemeral(interaction, `✅ Stopped watching ${ch}.\n\n${fmt(next)}`);
      }

      if (sub === "emoji") {
        await deferEphemeral(interaction);
        const value = interaction.options.getString("value", true).trim();
        const next = setStarboardConfig(interaction.guildId, { emoji: value });
        return interaction.editReply(`✅ Emoji set.\n\n${fmt(next)}`);
      }

      if (sub === "threshold") {
        const value = interaction.options.getInteger("value", true);
        const next = setStarboardConfig(interaction.guildId, { threshold: value });
        return replyEphemeral(interaction, `✅ Threshold set.\n\n${fmt(next)}`);
      }

      if (sub === "exclude-self") {
        const enabled = interaction.options.getBoolean("enabled", true);
        const next = setStarboardConfig(interaction.guildId, { excludeSelf: enabled });
        return replyEphemeral(interaction, `✅ Updated.\n\n${fmt(next)}`);
      }

      if (sub === "ignore-bots") {
        const enabled = interaction.options.getBoolean("enabled", true);
        const next = setStarboardConfig(interaction.guildId, { ignoreBots: enabled });
        return replyEphemeral(interaction, `✅ Updated.\n\n${fmt(next)}`);
      }

      return replyEphemeral(interaction, "Unknown subcommand.");
    } catch (err) {
      console.error("❌ starboard command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running starboard.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running starboard.");
      }
    }
  },
};
