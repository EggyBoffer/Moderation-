const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");
const { getGuildConfig } = require("../storage/guildConfig");
const { ensureAutoReact, setAutoReactConfig } = require("../handlers/autoReact");

function formatRule(channelId, r) {
  const ems = (r.emojis || []).join(" ") || "(none)";
  return (
    `**<#${channelId}>**\n` +
    `• enabled: ${r.enabled ? "✅" : "⛔"}\n` +
    `• mode: \`${r.mode}\`\n` +
    `• emojis: ${ems}\n` +
    `• ignore bots: ${r.ignoreBots ? "yes" : "no"}`
  );
}

function formatSummary(cfg) {
  const rules = cfg.rules || {};
  const channels = Object.keys(rules);

  if (!channels.length) {
    return `**AutoReact:** ${cfg.enabled ? "✅ enabled" : "⛔ disabled"}\nNo channels configured yet.`;
  }

  const lines = channels
    .slice(0, 15)
    .map((id) => {
      const r = rules[id];
      const em = (r.emojis || []).slice(0, 3).join(" ");
      return `• <#${id}> — ${r.enabled ? "✅" : "⛔"} \`${r.mode}\` ${em}`;
    })
    .join("\n");

  const extra = channels.length > 15 ? `\n…and ${channels.length - 15} more.` : "";

  return `**AutoReact:** ${cfg.enabled ? "✅ enabled" : "⛔ disabled"}\n**Channels:**\n${lines}${extra}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autoreact")
    .setDescription("Auto-react to messages per-channel")
    .addSubcommand((sc) =>
      sc
        .setName("enable")
        .setDescription("Enable/disable auto-react globally")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable?").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("channel-add")
        .setDescription("Add a channel rule (default: enabled, any, ✅)")
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
        .setName("channel-remove")
        .setDescription("Remove a channel rule")
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
        .setName("channel-set")
        .setDescription("Update a channel's auto-react settings")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Text channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Enable for this channel?").setRequired(false)
        )
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("What messages to react to")
            .setRequired(false)
            .addChoices(
              { name: "any", value: "any" },
              { name: "images only", value: "images" },
              { name: "text only", value: "text" },
              { name: "both text+image", value: "both" }
            )
        )
        .addStringOption((o) =>
          o
            .setName("emojis")
            .setDescription('Space-separated emojis, e.g. "✅ 🔥 ⭐"')
            .setRequired(false)
        )
        .addBooleanOption((o) =>
          o.setName("ignore_bots").setDescription("Ignore bot messages?").setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("channel-view")
        .setDescription("View a specific channel rule")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((sc) => sc.setName("view").setDescription("View auto-react configuration summary"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this in a server.");
      if (!isMod(interaction.member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      const cfg = ensureAutoReact(getGuildConfig(interaction.guildId));
      const sub = interaction.options.getSubcommand(true);

      if (sub === "view") {
        return replyEphemeral(interaction, formatSummary(cfg));
      }

      if (sub === "enable") {
        const enabled = interaction.options.getBoolean("enabled", true);
        const next = setAutoReactConfig(interaction.guildId, { enabled });
        return replyEphemeral(interaction, `✅ Updated.\n\n${formatSummary(next)}`);
      }

      if (sub === "channel-add") {
        const ch = interaction.options.getChannel("channel", true);

        const rules = { ...cfg.rules };
        rules[ch.id] = rules[ch.id] || {
          enabled: true,
          mode: "any",
          emojis: ["✅"],
          ignoreBots: true,
        };

        const next = setAutoReactConfig(interaction.guildId, { rules });
        return replyEphemeral(interaction, `✅ Rule created for ${ch}.\n\n${formatRule(ch.id, next.rules[ch.id])}`);
      }

      if (sub === "channel-remove") {
        const ch = interaction.options.getChannel("channel", true);

        const rules = { ...cfg.rules };
        const existed = Boolean(rules[ch.id]);
        delete rules[ch.id];

        const next = setAutoReactConfig(interaction.guildId, { rules });
        return replyEphemeral(
          interaction,
          existed ? `🧹 Removed rule for ${ch}.\n\n${formatSummary(next)}` : `No rule existed for ${ch}.`
        );
      }

      if (sub === "channel-view") {
        const ch = interaction.options.getChannel("channel", true);
        const r = cfg.rules[ch.id];
        if (!r) return replyEphemeral(interaction, `No rule exists for ${ch}. Use \`/autoreact channel-add\` first.`);
        return replyEphemeral(interaction, formatRule(ch.id, r));
      }

      if (sub === "channel-set") {
        await deferEphemeral(interaction);

        const ch = interaction.options.getChannel("channel", true);
        const enabled = interaction.options.getBoolean("enabled");
        const mode = interaction.options.getString("mode");
        const emojisRaw = interaction.options.getString("emojis");
        const ignoreBots = interaction.options.getBoolean("ignore_bots");

        const rules = { ...cfg.rules };
        const current = rules[ch.id] || {
          enabled: true,
          mode: "any",
          emojis: ["✅"],
          ignoreBots: true,
        };

        const nextRule = { ...current };

        if (enabled !== null && enabled !== undefined) nextRule.enabled = enabled;
        if (mode) nextRule.mode = mode;
        if (ignoreBots !== null && ignoreBots !== undefined) nextRule.ignoreBots = ignoreBots;
        if (emojisRaw) nextRule.emojis = emojisRaw.trim().split(/\s+/g).filter(Boolean);

        rules[ch.id] = nextRule;

        const next = setAutoReactConfig(interaction.guildId, { rules });
        return interaction.editReply(`✅ Updated ${ch}.\n\n${formatRule(ch.id, next.rules[ch.id])}`);
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
