const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const { sendToGuildLog } = require("../handlers/logChannel");

// Hard safety limits
const MAX_BULK = 100;          // Discord bulk delete limit
const MAX_SCAN = 1000;         // max messages to scan when filtering (anti-abuse + performance)

// Discord bulk delete cannot remove messages older than 14 days
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function summarizeCriteria({ amount, user, role, contains, botsOnly, attachmentsOnly }) {
  const parts = [`Amount: ${amount}`];
  if (user) parts.push(`User: ${user.tag}`);
  if (role) parts.push(`Role: @${role.name}`);
  if (contains) parts.push(`Contains: "${contains}"`);
  if (botsOnly) parts.push(`Bots only`);
  if (attachmentsOnly) parts.push(`Attachments only`);
  return parts.join(" • ");
}

function isYoungerThan14Days(msg) {
  const ts = msg.createdTimestamp ?? 0;
  return Date.now() - ts < FOURTEEN_DAYS_MS;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete messages in this channel with optional filters.")
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("How many messages to delete (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(MAX_BULK)
    )
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Only delete messages from this user")
        .setRequired(false)
    )
    .addRoleOption((opt) =>
      opt
        .setName("role")
        .setDescription("Only delete messages from users with this role")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("contains")
        .setDescription("Only delete messages containing this text (case-insensitive)")
        .setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt
        .setName("bots_only")
        .setDescription("Only delete messages sent by bots")
        .setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt
        .setName("attachments_only")
        .setDescription("Only delete messages that have attachments")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason shown in logs")
        .setRequired(false)
    )
    // Permission gating at command level (Discord UI will show it as admin/mod-only)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction
   * @param {import("discord.js").Client} client
   */
  async execute(interaction, client) {
    try {
      if (!interaction.inGuild()) {
        return interaction.reply({ content: "Use this command in a server.", ephemeral: true });
      }

      const amount = interaction.options.getInteger("amount", true);
      const user = interaction.options.getUser("user", false);
      const role = interaction.options.getRole("role", false);
      const containsRaw = interaction.options.getString("contains", false);
      const botsOnly = interaction.options.getBoolean("bots_only", false) ?? false;
      const attachmentsOnly = interaction.options.getBoolean("attachments_only", false) ?? false;
      const reason = interaction.options.getString("reason", false) ?? "";

      const contains = containsRaw ? containsRaw.toLowerCase() : null;

      // Permissions: user + bot must have Manage Messages
      const me = interaction.guild.members.me;
      const member = interaction.member;

      if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: "You need **Manage Messages** to do that.", ephemeral: true });
      }

      if (!me?.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
          content: "I need the **Manage Messages** permission in this server/channel to purge.",
          ephemeral: true,
        });
      }

      const channel = interaction.channel;
      if (!channel || !channel.isTextBased()) {
        return interaction.reply({ content: "This command must be used in a text channel.", ephemeral: true });
      }

      // Defer so we don’t hit the 3-second interaction timeout
      await interaction.deferReply({ ephemeral: true });

      const hasFilters =
        !!user || !!role || !!contains || botsOnly || attachmentsOnly;

      let deletedCount = 0;
      let scanned = 0;

      // Fast path: no filters -> just delete the last N messages
      if (!hasFilters) {
        const res = await channel.bulkDelete(amount, true); // true filters out >14-day messages
        deletedCount = res.size;

      } else {
        // Filtered path: scan recent messages until we collect enough matches
        const matches = [];

        let lastId = null;

        while (matches.length < amount && scanned < MAX_SCAN) {
          const batch = await channel.messages.fetch({
            limit: 100,
            ...(lastId ? { before: lastId } : {}),
          });

          if (batch.size === 0) break;

          scanned += batch.size;
          lastId = batch.last()?.id;

          for (const msg of batch.values()) {
            if (matches.length >= amount) break;

            // Skip pinned messages (safer default)
            if (msg.pinned) continue;

            // Bulk delete limitation: older than 14 days won't be deleted, so skip them here
            if (!isYoungerThan14Days(msg)) continue;

            // Filter: bots
            if (botsOnly && !msg.author?.bot) continue;

            // Filter: attachments
            if (attachmentsOnly && (!msg.attachments || msg.attachments.size === 0)) continue;

            // Filter: contains text
            if (contains) {
              const content = (msg.content ?? "").toLowerCase();
              if (!content.includes(contains)) continue;
            }

            // Filter: user
            if (user && msg.author?.id !== user.id) continue;

            // Filter: role (requires guild member lookup)
            if (role) {
              const m = msg.member; // may be null for some edge cases
              if (!m || !m.roles.cache.has(role.id)) continue;
            }

            matches.push(msg);
          }
        }

        if (matches.length === 0) {
          return interaction.editReply(
            `No matching messages found (scanned ${scanned} messages).`
          );
        }

        // Perform deletion
        const res = await channel.bulkDelete(matches, true);
        deletedCount = res.size;
      }

      // Reply to the invoker
      const criteria = summarizeCriteria({ amount, user, role, contains, botsOnly, attachmentsOnly });
      await interaction.editReply(
        `✅ Purge complete.\n` +
        `• Deleted: **${deletedCount}** message(s)\n` +
        `• ${hasFilters ? `Scanned: **${scanned}**` : "Fast purge"}\n` +
        `• Criteria: ${criteria}\n\n` +
        `Note: Messages older than 14 days cannot be bulk deleted by Discord.`
      );

      // Log it (embed)
      const embed = new EmbedBuilder()
        .setTitle("Purge Executed")
        .setDescription(
          `**Moderator:** ${interaction.user.tag} (ID: ${interaction.user.id})\n` +
          `**Channel:** <#${interaction.channelId}>\n` +
          `**Deleted:** ${deletedCount}\n` +
          `**Criteria:** ${criteria}`
        )
        .setTimestamp(new Date());

      if (reason.trim()) {
        embed.addFields({ name: "Reason", value: reason.slice(0, 1024) });
      }

      await sendToGuildLog(client, interaction.guildId, { embeds: [embed] });

    } catch (err) {
      console.error("❌ purge command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running purge.");
      } else {
        await interaction.reply({ content: "Something went wrong running purge.", ephemeral: true });
      }
    }
  },
};
