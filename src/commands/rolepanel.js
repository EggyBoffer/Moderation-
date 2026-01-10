const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { sendToGuildLog } = require("../handlers/logChannel");
const { baseEmbed, setActor } = require("../handlers/logEmbeds");
const { clip } = require("../handlers/text");

const {
  normalizeNewlines,
  getPanel,
  upsertPanel,
  deletePanel,
  listPanels,
  setPanelEmbed,
  addPanelItem,
  removePanelItem,
} = require("../handlers/rolePanels");

// CustomId format: rp:<guildId>:<messageId>:<roleId>
function makeCustomId(guildId, messageId, roleId) {
  return `rp:${guildId}:${messageId}:${roleId}`;
}

function parseHexColor(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  return parseInt(m[1], 16);
}

function buildPanelEmbed(guild, panel) {
  const e = panel.embed || {};
  const title = e.title || "Role Panel";
  const desc = e.description || "Click a button to toggle roles.";

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(normalizeNewlines(desc))
    .setAuthor({
      name: guild.name,
      iconURL: guild.iconURL({ size: 128 }) || undefined,
    })
    .setTimestamp(new Date());

  const color = typeof e.color === "number" ? e.color : parseHexColor(e.color);
  if (typeof color === "number") embed.setColor(color);

  if (e.footer) embed.setFooter({ text: String(e.footer) });

  if (e.thumbnail === "guild") {
    embed.setThumbnail(guild.iconURL({ size: 256 }) || null);
  }

  return embed;
}

function buildRows(guildId, messageId, items) {
  const rows = [];
  let row = new ActionRowBuilder();

  const safeItems = Array.isArray(items) ? items : [];

  for (const it of safeItems) {
    const btn = new ButtonBuilder()
      .setCustomId(makeCustomId(guildId, messageId, it.roleId))
      .setLabel(it.label || "Role")
      .setStyle(it.style || ButtonStyle.Secondary);

    if (it.emoji) btn.setEmoji(it.emoji);

    // 5 buttons per row
    if (row.components.length >= 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(btn);
  }

  if (row.components.length) rows.push(row);

  // Max 5 rows (25 buttons). If more, we’ll just truncate visually.
  return rows.slice(0, 5);
}

async function fetchPanelMessage(guild, channelId, messageId) {
  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return { channel: null, message: null };

  const message = await channel.messages.fetch(messageId).catch(() => null);
  return { channel, message };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rolepanel")
    .setDescription("Create and manage role panels (buttons)")

    .addSubcommand((sc) =>
      sc
        .setName("create")
        .setDescription("Create a new role panel message")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to post the role panel in")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("title")
            .setDescription("Embed title")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("description")
            .setDescription("Embed description (use \\n for line breaks)")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("color")
            .setDescription('Hex color like "#57F287"')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("footer")
            .setDescription("Embed footer text (use \\n for line breaks)")
            .setRequired(false)
        )
    )

    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Add or update a button in a role panel")
        .addStringOption((opt) =>
          opt
            .setName("message_id")
            .setDescription("Role panel message ID")
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Role to toggle").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("label").setDescription("Button label").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("emoji")
            .setDescription("Emoji like 😀 or <:name:id>")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("style")
            .setDescription("Button style")
            .addChoices(
              { name: "Secondary (grey)", value: "secondary" },
              { name: "Primary (blue)", value: "primary" },
              { name: "Success (green)", value: "success" },
              { name: "Danger (red)", value: "danger" }
            )
            .setRequired(false)
        )
    )

    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Remove a button from a role panel")
        .addStringOption((opt) =>
          opt
            .setName("message_id")
            .setDescription("Role panel message ID")
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Role to remove").setRequired(true)
        )
    )

    .addSubcommand((sc) =>
      sc
        .setName("edit")
        .setDescription("Edit the role panel embed text")
        .addStringOption((opt) =>
          opt
            .setName("message_id")
            .setDescription("Role panel message ID")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("title").setDescription("Embed title").setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("description")
            .setDescription("Embed description (use \\n for line breaks)")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("color")
            .setDescription('Hex color like "#57F287"')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("footer")
            .setDescription("Embed footer text (use \\n for line breaks)")
            .setRequired(false)
        )
    )

    .addSubcommand((sc) =>
      sc
        .setName("refresh")
        .setDescription("Rebuild a role panel message from stored config")
        .addStringOption((opt) =>
          opt
            .setName("message_id")
            .setDescription("Role panel message ID")
            .setRequired(true)
        )
    )

    .addSubcommand((sc) =>
      sc.setName("list").setDescription("List role panels configured in this server")
    )

    .addSubcommand((sc) =>
      sc
        .setName("delete")
        .setDescription("Delete a role panel from config (does not delete the message)")
        .addStringOption((opt) =>
          opt
            .setName("message_id")
            .setDescription("Role panel message ID")
            .setRequired(true)
        )
    )

    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "Use this in a server.");
      }

      const member = interaction.member;
      if (!member.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        return replyEphemeral(interaction, "You need **Manage Server** to manage role panels.");
      }

      const sub = interaction.options.getSubcommand(true);

      if (sub === "create") {
        await deferEphemeral(interaction);

        const channel = interaction.options.getChannel("channel", true);
        if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
          return interaction.editReply("Pick a server text channel.");
        }

        const title = interaction.options.getString("title") || "Choose Your Roles";
        const description =
          interaction.options.getString("description") ||
          "Click a button to toggle roles.\nYou can change your mind anytime.";
        const color = parseHexColor(interaction.options.getString("color")) ?? 0x5865F2;
        const footer = interaction.options.getString("footer") || "";

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(normalizeNewlines(description))
          .setColor(color)
          .setAuthor({
            name: interaction.guild.name,
            iconURL: interaction.guild.iconURL({ size: 128 }) || undefined,
          })
          .setTimestamp(new Date());

        if (footer) embed.setFooter({ text: normalizeNewlines(footer) });

        const msg = await channel.send({ embeds: [embed], components: [] });

        upsertPanel(interaction.guildId, msg.id, {
          channelId: channel.id,
          embed: { title, description, color, footer },
          items: [],
        });

        await interaction.editReply(
          `✅ Role panel created in ${channel}.\n**Message ID:** \`${msg.id}\`\nUse \`/rolepanel add\` to add buttons.`
        );

        const log = baseEmbed("Role Panel Created")
          .setDescription(`**Channel:** ${channel}\n**Message ID:** \`${msg.id}\``)
          .setThumbnail(interaction.guild.iconURL({ size: 128 }))
          .addFields(
            { name: "Title", value: clip(title, 256), inline: true },
            { name: "Buttons", value: "0", inline: true }
          );
        setActor(log, interaction.user);
        await sendToGuildLog(client, interaction.guildId, { embeds: [log] });

        return;
      }

      if (sub === "add") {
        await deferEphemeral(interaction);

        const messageId = interaction.options.getString("message_id", true).trim();
        const role = interaction.options.getRole("role", true);
        const label = interaction.options.getString("label", true).slice(0, 80);
        const emoji = interaction.options.getString("emoji") || null;
        const styleRaw = interaction.options.getString("style") || "secondary";

        const panel = getPanel(interaction.guildId, messageId);
        if (!panel) {
          return interaction.editReply("I can’t find that role panel in config. Did you use `/rolepanel create`?");
        }

        // Bot must be able to grant the role
        const me = interaction.guild.members.me;
        if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.editReply("I need **Manage Roles** permission to assign roles.");
        }
        const botTop = me.roles.highest;
        if (role.position >= botTop.position) {
          return interaction.editReply("I can’t assign that role because it’s above (or equal to) my highest role.");
        }

        const style =
          styleRaw === "primary"
            ? ButtonStyle.Primary
            : styleRaw === "success"
            ? ButtonStyle.Success
            : styleRaw === "danger"
            ? ButtonStyle.Danger
            : ButtonStyle.Secondary;

        addPanelItem(interaction.guildId, messageId, {
          roleId: role.id,
          label,
          emoji,
          style,
        });

        // Rebuild message
        const updated = getPanel(interaction.guildId, messageId);
        const { message } = await fetchPanelMessage(interaction.guild, updated.channelId, messageId);
        if (!message) {
          return interaction.editReply("I couldn’t fetch the panel message. Did it get deleted?");
        }

        const embed = buildPanelEmbed(interaction.guild, updated);
        const rows = buildRows(interaction.guildId, messageId, updated.items);

        await message.edit({ embeds: [embed], components: rows });

        await interaction.editReply(`✅ Added/updated button for ${role} on panel \`${messageId}\`.`);

        const log = baseEmbed("Role Panel Updated")
          .setThumbnail(interaction.guild.iconURL({ size: 128 }))
          .setDescription(`**Message ID:** \`${messageId}\`\n**Role:** ${role}\n**Label:** ${label}`);
        setActor(log, interaction.user);
        await sendToGuildLog(client, interaction.guildId, { embeds: [log] });

        return;
      }

      if (sub === "remove") {
        await deferEphemeral(interaction);

        const messageId = interaction.options.getString("message_id", true).trim();
        const role = interaction.options.getRole("role", true);

        const panel = getPanel(interaction.guildId, messageId);
        if (!panel) return interaction.editReply("That role panel isn’t in config.");

        const res = removePanelItem(interaction.guildId, messageId, role.id);
        if (!res?.removed) {
          return interaction.editReply("That role wasn’t on the panel.");
        }

        const updated = res.updated;
        const { message } = await fetchPanelMessage(interaction.guild, updated.channelId, messageId);
        if (!message) return interaction.editReply("I couldn’t fetch the panel message. Did it get deleted?");

        const embed = buildPanelEmbed(interaction.guild, updated);
        const rows = buildRows(interaction.guildId, messageId, updated.items);

        await message.edit({ embeds: [embed], components: rows });

        await interaction.editReply(`✅ Removed ${role} from panel \`${messageId}\`.`);

        const log = baseEmbed("Role Panel Updated")
          .setThumbnail(interaction.guild.iconURL({ size: 128 }))
          .setDescription(`**Message ID:** \`${messageId}\`\nRemoved role: ${role}`);
        setActor(log, interaction.user);
        await sendToGuildLog(client, interaction.guildId, { embeds: [log] });

        return;
      }

      if (sub === "edit") {
        await deferEphemeral(interaction);

        const messageId = interaction.options.getString("message_id", true).trim();
        const panel = getPanel(interaction.guildId, messageId);
        if (!panel) return interaction.editReply("That role panel isn’t in config.");

        const title = interaction.options.getString("title");
        const description = interaction.options.getString("description");
        const colorStr = interaction.options.getString("color");
        const footer = interaction.options.getString("footer");

        const color = parseHexColor(colorStr);

        const updated = setPanelEmbed(interaction.guildId, messageId, {
          ...(title !== null ? { title } : {}),
          ...(description !== null ? { description } : {}),
          ...(color !== null ? { color } : {}),
          ...(footer !== null ? { footer } : {}),
        });

        const { message } = await fetchPanelMessage(interaction.guild, updated.channelId, messageId);
        if (!message) return interaction.editReply("I couldn’t fetch the panel message. Did it get deleted?");

        const embed = buildPanelEmbed(interaction.guild, updated);
        const rows = buildRows(interaction.guildId, messageId, updated.items);

        await message.edit({ embeds: [embed], components: rows });

        await interaction.editReply(`✅ Updated embed for panel \`${messageId}\`.`);

        return;
      }

      if (sub === "refresh") {
        await deferEphemeral(interaction);

        const messageId = interaction.options.getString("message_id", true).trim();
        const panel = getPanel(interaction.guildId, messageId);
        if (!panel) return interaction.editReply("That role panel isn’t in config.");

        const { message } = await fetchPanelMessage(interaction.guild, panel.channelId, messageId);
        if (!message) return interaction.editReply("I couldn’t fetch the panel message. Did it get deleted?");

        const embed = buildPanelEmbed(interaction.guild, panel);
        const rows = buildRows(interaction.guildId, messageId, panel.items);

        await message.edit({ embeds: [embed], components: rows });
        await interaction.editReply(`✅ Refreshed panel \`${messageId}\`.`);

        return;
      }

      if (sub === "list") {
        const panels = listPanels(interaction.guildId);
        if (!panels.length) return replyEphemeral(interaction, "No role panels configured yet.");

        const lines = panels
          .slice(0, 15)
          .map((p) => `• \`${p.messageId}\` — <#${p.channelId}> — **${clip(p.title || "Role Panel", 40)}** — ${p.itemCount} buttons`)
          .join("\n");

        return replyEphemeral(interaction, `📌 Role panels (showing ${Math.min(15, panels.length)}/${panels.length}):\n\n${lines}`);
      }

      if (sub === "delete") {
        await deferEphemeral(interaction);

        const messageId = interaction.options.getString("message_id", true).trim();
        const ok = deletePanel(interaction.guildId, messageId);
        if (!ok) return interaction.editReply("That role panel wasn’t in config.");

        await interaction.editReply(
          `✅ Deleted panel \`${messageId}\` from config.\n(Panel message was not deleted.)`
        );
        return;
      }
    } catch (err) {
      console.error("❌ rolepanel command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running rolepanel.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running rolepanel.");
      }
    }
  },
};
