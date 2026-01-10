const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");
const {
  buildEmbed,
  splitFieldString,
  makeAllowedMentions,
  unescapeNewlines,
  normalizeTemplateName,
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
} = require("../handlers/embedder");

function clampFields(fields) {
  return fields.slice(0, 25);
}

function collectFieldsFromOptions(interaction, max = 6) {
  const fields = [];
  for (let i = 1; i <= max; i++) {
    const raw = interaction.options.getString(`field${i}`);
    if (!raw) continue;
    const f = splitFieldString(raw);
    if (!f) return { ok: false, error: `Field ${i} format invalid. Use: \`Name | Value | true/false\`` };
    fields.push(f);
  }
  return { ok: true, fields };
}

function buildPayloadFromOptions(interaction) {
  const fieldsRes = collectFieldsFromOptions(interaction, 6);
  if (!fieldsRes.ok) return fieldsRes;

  const payload = {
    content: interaction.options.getString("content") || "",
    title: interaction.options.getString("title") || "",
    description: interaction.options.getString("description") || "",
    color: interaction.options.getString("color") || "",
    url: interaction.options.getString("url") || "",
    author: interaction.options.getString("author") || "",
    author_icon: interaction.options.getString("author_icon") || "",
    author_url: interaction.options.getString("author_url") || "",
    thumbnail: interaction.options.getString("thumbnail") || "",
    image: interaction.options.getString("image") || "",
    footer: interaction.options.getString("footer") || "",
    footer_icon: interaction.options.getString("footer_icon") || "",
    timestamp: Boolean(interaction.options.getBoolean("timestamp")),
    fields: fieldsRes.fields,
  };

  return { ok: true, payload };
}

function payloadToEmbed(payload) {
  const embed = buildEmbed({
    title: payload.title,
    description: payload.description,
    color: payload.color,
    url: payload.url,
    authorName: payload.author,
    authorIcon: payload.author_icon,
    authorUrl: payload.author_url,
    thumbnail: payload.thumbnail,
    image: payload.image,
    footer: payload.footer,
    footerIcon: payload.footer_icon,
    timestamp: payload.timestamp,
  });

  if (Array.isArray(payload.fields) && payload.fields.length) {
    embed.addFields(clampFields(payload.fields));
  }

  const hasEmbedContent =
    embed.data?.title ||
    embed.data?.description ||
    (embed.data?.fields && embed.data.fields.length) ||
    embed.data?.image ||
    embed.data?.thumbnail ||
    embed.data?.footer ||
    embed.data?.author;

  return { embed, hasEmbedContent };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Create, send, and template custom embeds")

    // ===== SEND (direct) =====
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
          opt.setName("content").setDescription("Optional message content").setRequired(false)
        )

        .addStringOption((opt) => opt.setName("title").setDescription("Embed title").setRequired(false))
        .addStringOption((opt) => opt.setName("description").setDescription("Embed description (supports \\n)").setRequired(false))
        .addStringOption((opt) => opt.setName("color").setDescription("Hex color like #5865F2").setRequired(false))
        .addStringOption((opt) => opt.setName("url").setDescription("Title URL").setRequired(false))

        .addStringOption((opt) => opt.setName("thumbnail").setDescription("Thumbnail URL").setRequired(false))
        .addStringOption((opt) => opt.setName("image").setDescription("Image URL").setRequired(false))

        .addStringOption((opt) => opt.setName("footer").setDescription("Footer text (supports \\n)").setRequired(false))
        .addStringOption((opt) => opt.setName("footer_icon").setDescription("Footer icon URL").setRequired(false))

        .addStringOption((opt) => opt.setName("author").setDescription("Author name").setRequired(false))
        .addStringOption((opt) => opt.setName("author_icon").setDescription("Author icon URL").setRequired(false))
        .addStringOption((opt) => opt.setName("author_url").setDescription("Author URL").setRequired(false))

        .addBooleanOption((opt) => opt.setName("timestamp").setDescription("Add a timestamp").setRequired(false))

        .addStringOption((opt) => opt.setName("field1").setDescription('Field: "Name | Value | true/false" (supports \\n)').setRequired(false))
        .addStringOption((opt) => opt.setName("field2").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field3").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field4").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field5").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field6").setDescription('Field: "Name | Value | true/false"').setRequired(false))
    )

    // ===== PREVIEW (direct) =====
    .addSubcommand((sc) =>
      sc
        .setName("preview")
        .setDescription("Preview an embed (ephemeral)")

        .addStringOption((opt) => opt.setName("title").setDescription("Embed title").setRequired(false))
        .addStringOption((opt) => opt.setName("description").setDescription("Embed description (supports \\n)").setRequired(false))
        .addStringOption((opt) => opt.setName("color").setDescription("Hex color like #5865F2").setRequired(false))
        .addStringOption((opt) => opt.setName("thumbnail").setDescription("Thumbnail URL").setRequired(false))
        .addStringOption((opt) => opt.setName("image").setDescription("Image URL").setRequired(false))
        .addStringOption((opt) => opt.setName("footer").setDescription("Footer text (supports \\n)").setRequired(false))
        .addBooleanOption((opt) => opt.setName("timestamp").setDescription("Add a timestamp").setRequired(false))
    )

    // ===== TEMPLATE SAVE =====
    .addSubcommand((sc) =>
      sc
        .setName("template-save")
        .setDescription("Save the provided embed options as a template")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Template name").setRequired(true)
        )

        .addStringOption((opt) => opt.setName("content").setDescription("Optional message content").setRequired(false))

        .addStringOption((opt) => opt.setName("title").setDescription("Embed title").setRequired(false))
        .addStringOption((opt) => opt.setName("description").setDescription("Embed description (supports \\n)").setRequired(false))
        .addStringOption((opt) => opt.setName("color").setDescription("Hex color like #5865F2").setRequired(false))
        .addStringOption((opt) => opt.setName("url").setDescription("Title URL").setRequired(false))

        .addStringOption((opt) => opt.setName("thumbnail").setDescription("Thumbnail URL").setRequired(false))
        .addStringOption((opt) => opt.setName("image").setDescription("Image URL").setRequired(false))

        .addStringOption((opt) => opt.setName("footer").setDescription("Footer text (supports \\n)").setRequired(false))
        .addStringOption((opt) => opt.setName("footer_icon").setDescription("Footer icon URL").setRequired(false))

        .addStringOption((opt) => opt.setName("author").setDescription("Author name").setRequired(false))
        .addStringOption((opt) => opt.setName("author_icon").setDescription("Author icon URL").setRequired(false))
        .addStringOption((opt) => opt.setName("author_url").setDescription("Author URL").setRequired(false))

        .addBooleanOption((opt) => opt.setName("timestamp").setDescription("Add a timestamp").setRequired(false))

        .addStringOption((opt) => opt.setName("field1").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field2").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field3").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field4").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field5").setDescription('Field: "Name | Value | true/false"').setRequired(false))
        .addStringOption((opt) => opt.setName("field6").setDescription('Field: "Name | Value | true/false"').setRequired(false))
    )

    // ===== TEMPLATE SEND =====
    .addSubcommand((sc) =>
      sc
        .setName("template-send")
        .setDescription("Send a saved template")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Template name").setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to send to")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
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
    )

    // ===== TEMPLATE PREVIEW =====
    .addSubcommand((sc) =>
      sc
        .setName("template-preview")
        .setDescription("Preview a saved template (ephemeral)")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Template name").setRequired(true)
        )
    )

    // ===== TEMPLATE LIST =====
    .addSubcommand((sc) =>
      sc.setName("template-list").setDescription("List saved templates")
    )

    // ===== TEMPLATE DELETE =====
    .addSubcommand((sc) =>
      sc
        .setName("template-delete")
        .setDescription("Delete a saved template")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Template name").setRequired(true)
        )
    )

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) return replyEphemeral(interaction, "Use this in a server.");
      if (!isMod(interaction.member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      const sub = interaction.options.getSubcommand(true);

      // ---------- helper: send with ping ----------
      const sendWithPing = async ({ channel, payload }) => {
        const pingMode = interaction.options.getString("ping") || "none";
        const pingRole = interaction.options.getRole("ping_role");
        const pingUser = interaction.options.getUser("ping_user");

        let mention = "";
        let roleIdForAllowedMentions = null;

        if (pingMode === "role") {
          if (!pingRole) throw new Error("You selected ping=role but didn’t choose a role.");
          mention = `<@&${pingRole.id}>`;
          roleIdForAllowedMentions = pingRole.id;
        } else if (pingMode === "user") {
          if (!pingUser) throw new Error("You selected ping=user but didn’t choose a user.");
          mention = `<@${pingUser.id}>`;
        } else if (pingMode === "here") {
          mention = "@here";
        } else if (pingMode === "everyone") {
          mention = "@everyone";
        }

        const baseContent = unescapeNewlines(payload.content || "");
        const content = [mention, baseContent].filter(Boolean).join("\n").trim();

        const { embed, hasEmbedContent } = payloadToEmbed(payload);

        if (!hasEmbedContent && !content) {
          throw new Error("Nothing to send. Template has no embed content and no message content.");
        }

        const allowedMentions = makeAllowedMentions({
          pingMode: pingMode === "here" ? "everyone" : pingMode,
          roleId: roleIdForAllowedMentions,
        });

        const sent = await channel.send({
          content: content || undefined,
          embeds: hasEmbedContent ? [embed] : undefined,
          allowedMentions,
        });

        return sent;
      };

      // ===== direct preview =====
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

      // ===== direct send =====
      if (sub === "send") {
        await deferEphemeral(interaction);

        const channel = interaction.options.getChannel("channel", true);

        const built = buildPayloadFromOptions(interaction);
        if (!built.ok) return interaction.editReply(built.error);

        try {
          const sent = await sendWithPing({ channel, payload: built.payload });
          return interaction.editReply(`✅ Sent embed to ${channel}.\nMessage ID: \`${sent.id}\``);
        } catch (e) {
          return interaction.editReply(String(e.message || e));
        }
      }

      // ===== template save =====
      if (sub === "template-save") {
        await deferEphemeral(interaction);

        const rawName = interaction.options.getString("name", true);
        const name = normalizeTemplateName(rawName);
        if (!name) return interaction.editReply("Template name invalid. Use letters/numbers/dashes only.");

        const built = buildPayloadFromOptions(interaction);
        if (!built.ok) return interaction.editReply(built.error);

        const res = saveTemplate(interaction.guildId, name, built.payload);
        if (!res.ok) return interaction.editReply(res.error);

        // show preview so you know what you saved
        const { embed, hasEmbedContent } = payloadToEmbed(built.payload);

        return interaction.editReply({
          content: `✅ Template saved as \`${res.name}\`.`,
          embeds: hasEmbedContent ? [embed] : [],
        });
      }

      // ===== template list =====
      if (sub === "template-list") {
        const names = listTemplates(interaction.guildId);
        if (!names.length) return replyEphemeral(interaction, "No templates saved yet.");

        return replyEphemeral(interaction, `**Templates:**\n${names.map((n) => `• \`${n}\``).join("\n")}`);
      }

      // ===== template preview =====
      if (sub === "template-preview") {
        const name = interaction.options.getString("name", true);
        const tpl = getTemplate(interaction.guildId, name);
        if (!tpl) return replyEphemeral(interaction, `No template found named \`${normalizeTemplateName(name)}\`.`);

        const { embed, hasEmbedContent } = payloadToEmbed(tpl.payload);
        if (!hasEmbedContent) return replyEphemeral(interaction, `Template \`${tpl.name}\` has no embed content.`);

        return replyEphemeral(interaction, { embeds: [embed] });
      }

      // ===== template delete =====
      if (sub === "template-delete") {
        const name = interaction.options.getString("name", true);
        const existed = deleteTemplate(interaction.guildId, name);
        return replyEphemeral(
          interaction,
          existed
            ? `🧹 Deleted template \`${normalizeTemplateName(name)}\`.`
            : `No template found named \`${normalizeTemplateName(name)}\`.`
        );
      }

      // ===== template send =====
      if (sub === "template-send") {
        await deferEphemeral(interaction);

        const name = interaction.options.getString("name", true);
        const channel = interaction.options.getChannel("channel", true);

        const tpl = getTemplate(interaction.guildId, name);
        if (!tpl) return interaction.editReply(`No template found named \`${normalizeTemplateName(name)}\`.`);

        try {
          const sent = await sendWithPing({ channel, payload: tpl.payload });
          return interaction.editReply(`✅ Sent template \`${tpl.name}\` to ${channel}.\nMessage ID: \`${sent.id}\``);
        } catch (e) {
          return interaction.editReply(String(e.message || e));
        }
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
