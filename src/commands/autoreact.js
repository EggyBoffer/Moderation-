const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");
const { getGuildConfig } = require("../storage/guildConfig");
const { ensureAutoReact, setAutoReactConfig } = require("../handlers/autoReact");

function fmt(cfg) {
  const chs = cfg.channelIds.length ? cfg.channelIds.map((id) => `<#${id}>`).join(", ") : "(none)";
  const ems = cfg.emojis.length ? cfg.emojis.join(" ") : "(none)";
  return (
    `**Enabled:** ${cfg.enabled ? "✅ yes" : "⛔ no"}\n` +
    `**Channels:** ${chs}\n` +
    `**Mode:** \`${cfg.mode}\`\n` +
    `**Emojis:** ${ems}\n` +
    `**Ignore bots:** ${cfg.ignoreBots ? "yes" : "no"}`
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autoreact")
    .setDescription("Auto-react to messages in configured channels")
    .addSubcommand((sc) =>
      sc
        .setName("enable")
        .setDescription("Enable/disable auto-react")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable?").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("add-channel")
        .setDescription("Add a channel to auto-react in")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Text channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove-channel")
        .setDescription("Remove a channel from auto-react")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Text channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("mode")
        .setDescription("Set react mode")
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("What messages to react to")
            .setRequired(true)
            .addChoices(
              { name: "any", value: "any" },
              { name: "images only", value: "images" },
              { name: "text only", value: "text" },
              { name: "both text+image", value: "both" }
            )
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("emojis")
        .setDescription("Set emojis (space-separated, e.g. ✅ 🔥 ⭐)")
        .addStringOption((o) =>
          o.setName("value").setDescription("Emoji list").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("ignore-bots")
        .setDescription("Ignore bot messages")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Ignore bots?").setRequired(true))
    )
    .addSubcommand((sc) => sc.setName("view").setDescription("View current auto-react config"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this in a server.");
      if (!isMod(interaction.member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      const cfg = ensureAutoReact(getGuildConfig(interaction.guildId));
      const sub = interaction.options.getSubcommand(true);

      if (sub === "view") return replyEphemeral(interaction, fmt(cfg));

      if (sub === "enable") {
        const enabled = interaction.options.getBoolean("enabled", true);
        const next = setAutoReactConfig(interaction.guildId, { enabled });
        return replyEphemeral(interaction, `✅ Updated.\n\n${fmt(next)}`);
      }

      if (sub === "add-channel") {
        const ch = interaction.options.getChannel("channel", true);
        const next = setAutoReactConfig(interaction.guildId, { channelIds: [...cfg.channelIds, ch.id] });
        return replyEphemeral(interaction, `✅ Added ${ch}.\n\n${fmt(next)}`);
      }

      if (sub === "remove-channel") {
        const ch = interaction.options.getChannel("channel", true);
        const next = setAutoReactConfig(interaction.guildId, { channelIds: cfg.channelIds.filter((id) => id !== ch.id) });
        return replyEphemeral(interaction, `✅ Removed ${ch}.\n\n${fmt(next)}`);
      }

      if (sub === "mode") {
        const mode = interaction.options.getString("mode", true);
        const next = setAutoReactConfig(interaction.guildId, { mode });
        return replyEphemeral(interaction, `✅ Mode set.\n\n${fmt(next)}`);
      }

      if (sub === "ignore-bots") {
        const enabled = interaction.options.getBoolean("enabled", true);
        const next = setAutoReactConfig(interaction.guildId, { ignoreBots: enabled });
        return replyEphemeral(interaction, `✅ Updated.\n\n${fmt(next)}`);
      }

      if (sub === "emojis") {
        await deferEphemeral(interaction);
        const raw = interaction.options.getString("value", true).trim();

        // split by spaces, keep tokens
        const emojis = raw.split(/\s+/g).filter(Boolean);

        const next = setAutoReactConfig(interaction.guildId, { emojis });
        return interaction.editReply(`✅ Emojis set.\n\n${fmt(next)}`);
      }

      return replyEphemeral(interaction, "Unknown subcommand.");
    } catch (err) {
      console.error("❌ autoreact command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running autoreact.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running autoreact.");
      }
    }
  },
};
