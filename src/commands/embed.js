const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");
const { buildEmbed, splitFieldString, makeAllowedMentions } = require("../handlers/embedder");

function clampFields(fields) {
  return fields.slice(0, 25);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Create and send custom embeds")

    .addSubcommand((sc) =>
      sc
        .setName("send")
        .setDescription("Send a custom embed")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to send to")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )

        // Ping options (now separates @here vs @everyone)
        .addStringOption((opt) =>
          opt
            .setName("ping")
            .setDescription("Ping mode")
            .setRequired(false)
            .addChoices(
              { name: "none", value: "none" },
              { name: "role", value: "role" },
              { name: "user", value: "user" },
              { name: "@here", value: "here" },
              { name: "@everyone", value: "everyone" }
            )
        )
        .addRoleOption((opt) =>
          opt.setName("ping_role").setDescription("Role to ping (when ping=role)").setRequired(false)
        )
        .addUserOption((opt) =>
          opt.setName("ping_user").setDescription("User to ping (when ping=user)").setRequired(false)
        )

        .addStringOption((opt) =>
          opt
            .setName("content")
            .setDescription("Optional message content (non-embed text)")
            .setRequired(false)
        )

        // Embed core
        .addStringOption((opt) => opt.setName("title").setDescription("Embed title").setRequired(false))
        .addStringOption((opt) => opt.setName("description").setDescription("Embed description").setRequired(false))
        .addStringOption((opt) => opt.setName("color").setDescription("Hex color like #5865F2").setRequired(false))
        .addStringOption((opt) => opt.setName("url").setDescription("Title URL").setRequired(false))

        // Media
        .addStringOption((opt) => opt.setName("thumbnail").setDescription("Thumbnail URL").setRequired(false))
        .addStringOption((opt) => opt.setName("image").setDescription("Image URL").setRequired(false))

        // Footer / Author
        .addStringOption((opt) => opt.setName("footer").setDescription("Footer text").setRequired(false))
        .addStringOption((opt) => opt.setName("footer_icon").setDescription("Footer icon URL").setRequired(false))
        .addStringOption((opt) => opt.setName("author").setDescription("Author name").setRequired(false))
        .addStringOption((opt) => opt.setName("author_icon").setDescription("Author icon URL").setRequired(false))
        .addStringOption((opt) => opt.setName("author_url").setDescription("Author URL").setRequired(false))

        .addBooleanOption((opt) =>
          opt.setName("timestamp").setDescription("Add a timestamp").setRequired(false)
        )

        // Fields
        .addStringOption((opt) => opt.setName("field1").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field2").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field3").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field4").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field5").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field6").setDescription('Field: "Name | Value | true/false"').setRequired(false))
    )

    .addSubcommand((sc) =>
      sc
        .setName("preview")
        .setDescription("Preview an embed (ephemeral)")
        .addStringOption((opt) => opt.setName("title").setDescription("Embed title").setRequired(false))
        .addStringOption((opt) => opt.setName("description").setDescription("Embed description").setRequired(false))
        .addStringOption((opt) => opt.setName("color").setDescription("Hex color like #5865F2").setRequired(false))
        .addStringOption((opt) => opt.setName("thumbnail").setDescription("Thumbnail URL").setRequired(false))
        .addStringOption((opt) => opt.setName("image").setDescription("Image URL").setRequired(false))
        .addStringOption((opt) => opt.setName("footer").setDescription("Footer text").setRequired(false))
        .addBooleanOption((opt) => opt.setName("timestamp").setDescription("Add a timestamp").setRequired(false))
    )

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this in a server.");
      if (!isMod(interaction.member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      const sub = interaction.options.getSubcommand(true);

      if (sub === "preview") {
        const embed = buildEmbed({
          title: interaction.options.getString("title"),
          description: interaction.options.getString("description"),
          color: interaction.options.getString("color"),
          thumbnail: interaction.options.getString("thumbnail"),
          image: interaction.options.getString("image"),
          footer: interaction.options.getString("footer"),
          timestamp: interaction.options.getBoolean("timestamp") || false,
        });

        return replyEphemeral(interaction, { embeds: [embed] });
      }

      if (sub === "send") {
        await deferEphemeral(interaction);

        const channel = interaction.options.getChannel("channel", true);

        const pingMode = interaction.options.getString("ping") || "none";
        const pingRole = interaction.options.getRole("ping_role");
        const pingUser = interaction.options.getUser("ping_user");

        let mention = "";
        let roleIdForAllowedMentions = null;

        if (pingMode === "role") {
          if (!pingRole) return interaction.editReply("You selected ping=role but didn’t choose a role.");
          mention = `<@&${pingRole.id}>`;
          roleIdForAllowedMentions = pingRole.id;
        } else if (pingMode === "user") {
          if (!pingUser) return interaction.editReply("You selected ping=user but didn’t choose a user.");
          mention = `<@${pingUser.id}>`;
        } else if (pingMode === "here") {
          mention = "@here";
        } else if (pingMode === "everyone") {
          mention = "@everyone";
        }

        const contentRaw = interaction.options.getString("content") || "";
        const content = [mention, contentRaw].filter(Boolean).join("\n").trim();

        const fields = [];
        for (let i = 1; i <= 6; i++) {
          const raw = interaction.options.getString(`field${i}`);
          if (!raw) continue;
          const f = splitFieldString(raw);
          if (!f) {
            return interaction.editReply(`Field ${i} format invalid. Use: \`Name | Value | true/false\``);
          }
          fields.push(f);
        }

        const embed = buildEmbed({
          title: interaction.options.getString("title"),
          description: interaction.options.getString("description"),
          color: interaction.options.getString("color"),
          url: interaction.options.getString("url"),
          authorName: interaction.options.getString("author"),
          authorIcon: interaction.options.getString("author_icon"),
          authorUrl: interaction.options.getString("author_url"),
          thumbnail: interaction.options.getString("thumbnail"),
          image: interaction.options.getString("image"),
          footer: interaction.options.getString("footer"),
          footerIcon: interaction.options.getString("footer_icon"),
          timestamp: interaction.options.getBoolean("timestamp") || false,
        });

        if (fields.length) embed.addFields(clampFields(fields));

        const hasEmbedContent =
          embed.data?.title ||
          embed.data?.description ||
          (embed.data?.fields && embed.data.fields.length) ||
          embed.data?.image ||
          embed.data?.thumbnail ||
          embed.data?.footer ||
          embed.data?.author;

        if (!hasEmbedContent && !content) {
          return interaction.editReply("Nothing to send. Provide embed content and/or message content.");
        }

        // Allowed mentions: only allow what the user chose.
        // NOTE: @here and @everyone both require parse:["everyone"] to ping.
        const allowedMentions = makeAllowedMentions({
          pingMode: pingMode === "here" ? "everyone" : pingMode,
          roleId: roleIdForAllowedMentions,
        });

        const sent = await channel.send({
          content: content || undefined,
          embeds: hasEmbedContent ? [embed] : undefined,
          allowedMentions,
        });

        return interaction.editReply(`✅ Sent embed to ${channel}.\nMessage ID: \`${sent.id}\``);
      }

      return replyEphemeral(interaction, "Unknown subcommand.");
    } catch (err) {
      console.error("❌ embed command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running embed.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running embed.");
      }
    }
  },
};
