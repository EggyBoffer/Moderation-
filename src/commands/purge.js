const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} = require("discord.js");

const { sendToGuildLog } = require("../handlers/logChannel");
const { isMod } = require("../handlers/permissions");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");

const MAX_BULK = 100;          
const MAX_SCAN = 1000;         
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function isYoungerThan14Days(msg) {
  const ts = msg.createdTimestamp ?? 0;
  return Date.now() - ts < FOURTEEN_DAYS_MS;
}

function clip(str, max = 200) {
  const s = String(str ?? "").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function summarizeCriteria({ amount, user, role, contains, botsOnly, attachmentsOnly }) {
  const parts = [`Amount: ${amount}`];
  if (user) parts.push(`User: ${user.tag}`);
  if (role) parts.push(`Role: @${role.name}`);
  if (contains) parts.push(`Contains: "${contains}"`);
  if (botsOnly) parts.push("Bots only");
  if (attachmentsOnly) parts.push("Attachments only");
  return parts.join(" • ");
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
        .setDescription("Reason (logged)")
        .setRequired(false)
    )
    
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  
  async execute(interaction, client) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral( interaction, "You must use this command in an actual server!");
      }

      const channel = interaction.channel;
      if (!channel || !channel.isTextBased()) {
        return replyEphemeral(interaction, "You must use this command in a text channel!");
      }

      
      
      if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
      ) {
        return replyEphemeral(
          interaction, "Use this command in a normal text channel.");
      }

      const amount = interaction.options.getInteger("amount", true);
      const user = interaction.options.getUser("user", false);
      const role = interaction.options.getRole("role", false);
      const containsRaw = interaction.options.getString("contains", false);
      const botsOnly = interaction.options.getBoolean("bots_only", false) ?? false;
      const attachmentsOnly = interaction.options.getBoolean("attachments_only", false) ?? false;
      const reason = (interaction.options.getString("reason", false) ?? "").trim();

      const contains = containsRaw ? containsRaw.toLowerCase().trim() : null;

      const member = interaction.member; 
      const botMember = interaction.guild.members.me;

      
      if (!isMod(member, interaction.guildId)) {
        return replyEphemeral(
            interaction, "Sorry, you're not a moderator of this server... Skill issue!"
        );
      }

     
      const userPerms = channel.permissionsFor(member);
      if (!userPerms || !userPerms.has(PermissionFlagsBits.ManageMessages)) {
        return replyEphemeral(
          interaction, "Sorry, you don't manage this channel!"
        );
      }

      
      const botPerms = channel.permissionsFor(botMember);
      if (!botPerms || !botPerms.has(PermissionFlagsBits.ManageMessages)) {
        return replyEphemeral(
          interaction, "I do not have permission to manage messages in this channel."
        );
      }

      await deferEphemeral(interaction);

      const hasFilters = !!user || !!role || !!contains || botsOnly || attachmentsOnly;

      let deletedCount = 0;
      let scanned = 0;

      if (!hasFilters) {
        
        const res = await channel.bulkDelete(amount, true);
        deletedCount = res.size;
      } else {
        
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

            
            if (msg.pinned) continue;

            
            if (!isYoungerThan14Days(msg)) continue;

            
            if (botsOnly && !msg.author?.bot) continue;

            
            if (attachmentsOnly && (!msg.attachments || msg.attachments.size === 0)) continue;

            
            if (contains) {
              const content = (msg.content ?? "").toLowerCase();
              if (!content.includes(contains)) continue;
            }

            
            if (user && msg.author?.id !== user.id) continue;

            
            if (role) {
              const m = msg.member;
              if (!m || !m.roles.cache.has(role.id)) continue;
            }

            matches.push(msg);
          }
        }

        if (matches.length === 0) {
          return interaction.editReply(
            `No matching messages found.\n` +
            `Scanned **${scanned}** messages.\n\n` +
            `Note: messages older than 14 days cannot be bulk deleted.`
          );
        }

        const res = await channel.bulkDelete(matches, true);
        deletedCount = res.size;
      }

      const criteria = summarizeCriteria({
        amount,
        user,
        role,
        contains: containsRaw,
        botsOnly,
        attachmentsOnly,
      });

      await interaction.editReply(
        `✅ Purge complete.\n` +
        `• Deleted: **${deletedCount}** message(s)\n` +
        `• ${hasFilters ? `Scanned: **${scanned}**` : "Fast purge"}\n` +
        `• Criteria: ${criteria}\n\n` +
        `Note: messages older than 14 days cannot be bulk deleted.`
      );

      
      const embed = new EmbedBuilder()
        .setTitle("Bulk Purge Used!")
        .setDescription(
          `**Moderator:** ${interaction.user.tag} (ID: ${interaction.user.id})\n` +
          `**Channel:** <#${interaction.channelId}>\n` +
          `**Deleted:** ${deletedCount}\n` +
          `**Criteria:** ${criteria}`
        )
        .setTimestamp(new Date());

      if (reason) {
        embed.addFields({ name: "Reason", value: clip(reason, 1024) });
      }

      await sendToGuildLog(client, interaction.guildId, { embeds: [embed] });
    } catch (err) {
      console.error("❌ purge command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something happened and this isn't possible right now!");
      } else {
        await replyEphemeral(
             interaction, "Something happened and this isn't possible right now!" 
            );
      }
    }
  },
};
