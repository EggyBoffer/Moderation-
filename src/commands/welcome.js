const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");

const { setGuildConfig, getGuildConfig } = require("../storage/guildConfig");
const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");

const DEFAULT_WELCOME =
  "👋 Welcome {user} to **{server}**! You are member #{memberCount}. Please read {rules}.";

function renderWelcomeMessage(template, member) {
  const rulesChannel =
    member.guild.channels.cache.find(
      (c) => c?.name === "rules" && c?.isTextBased?.()
    ) || null;

  return String(template || DEFAULT_WELCOME)
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{memberCount}", String(member.guild.memberCount))
    .replaceAll("{rules}", rulesChannel ? `<#${rulesChannel.id}>` : "the rules");
}

function buildWelcomeEmbed(member, template) {
  const rendered = renderWelcomeMessage(template, member);

  return new EmbedBuilder()
    .setTitle("Welcome!")
    .setDescription(rendered)
    .setColor(0x57F287)
    .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
    .setAuthor({
      name: member.guild.name,
      iconURL: member.guild.iconURL({ size: 128 }) || undefined,
    })
    .setTimestamp(new Date());
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Configure welcome messages for this server")

    .addSubcommand((sc) =>
      sc
        .setName("set")
        .setDescription("Set the channel where welcome messages will be sent")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to send welcome messages in")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )

    .addSubcommandGroup((group) =>
      group
        .setName("message")
        .setDescription("Configure the welcome message text")
        .addSubcommand((sc) =>
          sc
            .setName("set")
            .setDescription("Set the welcome message text")
            .addStringOption((opt) =>
              opt
                .setName("text")
                .setDescription("Message text (supports placeholders)")
                .setRequired(true)
            )
        )
        .addSubcommand((sc) =>
          sc.setName("view").setDescription("View the current welcome message")
        )
    )

    .addSubcommand((sc) =>
      sc.setName("test").setDescription("Send a test welcome message")
    )

    .addSubcommand((sc) =>
      sc.setName("clear").setDescription("Disable welcome messages")
    )

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "This command can only be used in a server.");
      }

      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand(true);

      const cfg = getGuildConfig(interaction.guildId);

      if (!group && sub === "set") {
        const channel = interaction.options.getChannel("channel", true);

        if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
          return replyEphemeral(interaction, "Pick a text channel in this server.");
        }

        setGuildConfig(interaction.guildId, { welcomeChannelId: channel.id });
        return replyEphemeral(interaction, `✅ Welcome messages will be sent in ${channel}.`);
      }

      if (group === "message" && sub === "set") {
        const text = interaction.options.getString("text", true).slice(0, 1000);

        setGuildConfig(interaction.guildId, { welcomeMessage: text });

        return replyEphemeral(
          interaction,
          "✅ Welcome message updated.\n\n" +
            "**Placeholders:** `{user}`, `{username}`, `{server}`, `{memberCount}`, `{rules}`"
        );
      }

      if (group === "message" && sub === "view") {
        const msg = cfg.welcomeMessage || DEFAULT_WELCOME;
        return replyEphemeral(interaction, `**Current welcome message:**\n\n${msg}`);
      }

      if (!group && sub === "clear") {
        setGuildConfig(interaction.guildId, {
          welcomeChannelId: null,
          welcomeMessage: null,
        });

        return replyEphemeral(interaction, "✅ Welcome messages disabled.");
      }

      if (!group && sub === "test") {
        await deferEphemeral(interaction);

        if (!cfg.welcomeChannelId) {
          return interaction.editReply("⚠️ No welcome channel set.");
        }

        const channel =
          interaction.guild.channels.cache.get(cfg.welcomeChannelId) ||
          (await interaction.guild.channels.fetch(cfg.welcomeChannelId).catch(() => null));

        if (!channel?.isTextBased?.()) {
          return interaction.editReply("⚠️ Welcome channel no longer exists.");
        }

        const template = cfg.welcomeMessage || DEFAULT_WELCOME;
        const embed = buildWelcomeEmbed(interaction.member, template);

        await channel.send({ embeds: [embed] });
        return interaction.editReply("✅ Test welcome embed sent.");
      }

      return replyEphemeral(interaction, "Unknown subcommand.");
    } catch (err) {
      console.error("❌ welcome command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running welcome.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running welcome.");
      }
    }
  },
};
