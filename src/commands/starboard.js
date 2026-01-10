const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");
const { getGuildConfig } = require("../storage/guildConfig");
const { normalizeBoardId, ensureMultiStarboards, setStarboardsConfig } = require("../handlers/starboard");

function fmtBoard(id, b) {
  const watch = b.watchChannelIds?.length ? b.watchChannelIds.map((x) => `<#${x}>`).join(", ") : "(none)";
  const out = b.channelId ? `<#${b.channelId}>` : "(not set)";
  return (
    `**${id}** ${b.enabled ? "✅" : "⛔"}\n` +
    `• output: ${out}\n` +
    `• watch: ${watch}\n` +
    `• emoji: ${b.emoji}\n` +
    `• threshold: **${b.threshold}**\n` +
    `• exclude self: ${b.excludeSelf ? "yes" : "no"}\n` +
    `• ignore bots: ${b.ignoreBots ? "yes" : "no"}`
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("starboard")
    .setDescription("Configure starboards (multiple boards supported)")

    .addSubcommand((sc) =>
      sc
        .setName("enable")
        .setDescription("Enable/disable starboards globally")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable?").setRequired(true))
    )

    .addSubcommand((sc) =>
      sc
        .setName("create")
        .setDescription("Create a new starboard")
        .addStringOption((o) => o.setName("name").setDescription("Board name").setRequired(true))
        .addChannelOption((o) =>
          o
            .setName("output")
            .setDescription("Starboard output channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("emoji").setDescription("Emoji (⭐ or <:name:id>)").setRequired(false)
        )
        .addIntegerOption((o) =>
          o.setName("threshold").setDescription("Stars needed").setMinValue(1).setMaxValue(50).setRequired(false)
        )
    )

    .addSubcommand((sc) =>
      sc
        .setName("delete")
        .setDescription("Delete a starboard")
        .addStringOption((o) => o.setName("name").setDescription("Board name").setRequired(true))
    )

    .addSubcommand((sc) => sc.setName("list").setDescription("List starboards"))

    .addSubcommand((sc) =>
      sc
        .setName("view")
        .setDescription("View a starboard")
        .addStringOption((o) => o.setName("name").setDescription("Board name").setRequired(true))
    )

    .addSubcommand((sc) =>
      sc
        .setName("set")
        .setDescription("Update settings on a starboard")
        .addStringOption((o) => o.setName("name").setDescription("Board name").setRequired(true))
        .addChannelOption((o) =>
          o
            .setName("output")
            .setDescription("Output channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji").setRequired(false))
        .addIntegerOption((o) => o.setName("threshold").setDescription("Threshold").setMinValue(1).setMaxValue(50).setRequired(false))
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable this board").setRequired(false))
        .addBooleanOption((o) => o.setName("exclude_self").setDescription("Exclude self-stars").setRequired(false))
        .addBooleanOption((o) => o.setName("ignore_bots").setDescription("Ignore bot stars").setRequired(false))
    )

    .addSubcommand((sc) =>
      sc
        .setName("watch-add")
        .setDescription("Add a watched channel to a board")
        .addStringOption((o) => o.setName("name").setDescription("Board name").setRequired(true))
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
        .setDescription("Remove a watched channel from a board")
        .addStringOption((o) => o.setName("name").setDescription("Board name").setRequired(true))
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel to stop watching")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this in a server.");
      if (!isMod(interaction.member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      const cfg = ensureMultiStarboards(getGuildConfig(interaction.guildId));
      const sub = interaction.options.getSubcommand(true);

      if (sub === "enable") {
        const enabled = interaction.options.getBoolean("enabled", true);
        const next = setStarboardsConfig(interaction.guildId, { enabled });
        return replyEphemeral(interaction, `✅ Starboards globally ${enabled ? "enabled" : "disabled"}. (${Object.keys(next.boards).length} board(s))`);
      }

      if (sub === "list") {
        const ids = Object.keys(cfg.boards || {}).sort();
        if (!ids.length) return replyEphemeral(interaction, "No starboards yet. Use `/starboard create`.");
        return replyEphemeral(interaction, `**Starboards:**\n${ids.map((x) => `• \`${x}\``).join("\n")}`);
      }

      if (sub === "create") {
        await deferEphemeral(interaction);

        const rawName = interaction.options.getString("name", true);
        const id = normalizeBoardId(rawName);
        if (!id) return interaction.editReply("Invalid board name. Use letters/numbers/dashes.");

        const output = interaction.options.getChannel("output", true);
        const emoji = interaction.options.getString("emoji") || "⭐";
        const threshold = interaction.options.getInteger("threshold") || 3;

        if (cfg.boards[id]) return interaction.editReply(`Board \`${id}\` already exists.`);

        const boards = { ...cfg.boards };
        boards[id] = {
          enabled: true,
          channelId: output.id,
          watchChannelIds: [],
          emoji,
          threshold,
          ignoreBots: true,
          excludeSelf: true,
        };

        const next = setStarboardsConfig(interaction.guildId, { enabled: true, boards });
        return interaction.editReply(`✅ Created starboard \`${id}\` → ${output}\n\n${fmtBoard(id, next.boards[id])}`);
      }

      if (sub === "delete") {
        const rawName = interaction.options.getString("name", true);
        const id = normalizeBoardId(rawName);

        const boards = { ...cfg.boards };
        if (!boards[id]) return replyEphemeral(interaction, `No board named \`${id}\`.`);

        delete boards[id];
        const next = setStarboardsConfig(interaction.guildId, { boards });
        return replyEphemeral(interaction, `🧹 Deleted \`${id}\`. Remaining boards: ${Object.keys(next.boards).length}`);
      }

      if (sub === "view") {
        const id = normalizeBoardId(interaction.options.getString("name", true));
        const b = cfg.boards[id];
        if (!b) return replyEphemeral(interaction, `No board named \`${id}\`.`);
        return replyEphemeral(interaction, fmtBoard(id, b));
      }

      if (sub === "set") {
        await deferEphemeral(interaction);

        const id = normalizeBoardId(interaction.options.getString("name", true));
        const b = cfg.boards[id];
        if (!b) return interaction.editReply(`No board named \`${id}\`.`);

        const output = interaction.options.getChannel("output");
        const emoji = interaction.options.getString("emoji");
        const threshold = interaction.options.getInteger("threshold");
        const enabled = interaction.options.getBoolean("enabled");
        const excludeSelf = interaction.options.getBoolean("exclude_self");
        const ignoreBots = interaction.options.getBoolean("ignore_bots");

        const boards = { ...cfg.boards };
        const nextB = { ...b };

        if (output) nextB.channelId = output.id;
        if (emoji) nextB.emoji = emoji.trim();
        if (threshold !== null && threshold !== undefined) nextB.threshold = threshold;
        if (enabled !== null && enabled !== undefined) nextB.enabled = enabled;
        if (excludeSelf !== null && excludeSelf !== undefined) nextB.excludeSelf = excludeSelf;
        if (ignoreBots !== null && ignoreBots !== undefined) nextB.ignoreBots = ignoreBots;

        boards[id] = nextB;

        const next = setStarboardsConfig(interaction.guildId, { boards });
        return interaction.editReply(`✅ Updated \`${id}\`.\n\n${fmtBoard(id, next.boards[id])}`);
      }

      if (sub === "watch-add") {
        const id = normalizeBoardId(interaction.options.getString("name", true));
        const ch = interaction.options.getChannel("channel", true);
        const b = cfg.boards[id];
        if (!b) return replyEphemeral(interaction, `No board named \`${id}\`.`);

        const boards = { ...cfg.boards };
        boards[id] = { ...b, watchChannelIds: Array.from(new Set([...(b.watchChannelIds || []), ch.id])) };

        const next = setStarboardsConfig(interaction.guildId, { boards });
        return replyEphemeral(interaction, `✅ \`${id}\` now watches ${ch}.`);
      }

      if (sub === "watch-remove") {
        const id = normalizeBoardId(interaction.options.getString("name", true));
        const ch = interaction.options.getChannel("channel", true);
        const b = cfg.boards[id];
        if (!b) return replyEphemeral(interaction, `No board named \`${id}\`.`);

        const boards = { ...cfg.boards };
        boards[id] = { ...b, watchChannelIds: (b.watchChannelIds || []).filter((x) => x !== ch.id) };

        const next = setStarboardsConfig(interaction.guildId, { boards });
        return replyEphemeral(interaction, `✅ \`${id}\` no longer watches ${ch}.`);
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
