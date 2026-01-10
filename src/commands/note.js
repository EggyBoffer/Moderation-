const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");
const { addNote, listNotes, removeInfractionById } = require("../handlers/infractions");
const { clip } = require("../handlers/text");

function formatLine(n) {
  const when = n.ts ? `<t:${Math.floor(n.ts / 1000)}:f>` : "(unknown time)";
  return `• \`${n.id}\` — ${when} — <@${n.modId}>\n  ↳ ${n.reason}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Moderator notes for a user")
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Add a moderator note to a user")
        .addUserOption((opt) => opt.setName("user").setDescription("User").setRequired(true))
        .addStringOption((opt) => opt.setName("text").setDescription("Note text").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("list")
        .setDescription("List moderator notes for a user")
        .addUserOption((opt) => opt.setName("user").setDescription("User").setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Remove a moderator note by ID")
        .addStringOption((opt) => opt.setName("id").setDescription("Infraction ID").setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "You must use this command in a server.");
      }

      if (!isMod(interaction.member, interaction.guildId)) {
        return replyEphemeral(interaction, "You do not have permission to use this command.");
      }

      const sub = interaction.options.getSubcommand(true);

      if (sub === "add") {
        const user = interaction.options.getUser("user", true);
        const text = interaction.options.getString("text", true);

        await deferEphemeral(interaction);

        const entry = addNote(interaction.guildId, user.id, interaction.user.id, text);

        return interaction.editReply(
          `📝 Added note for **${user.tag}**\n` +
            `**ID:** \`${entry.id}\`\n` +
            `**Note:** ${clip(entry.reason, 1000)}`
        );
      }

      if (sub === "list") {
        const user = interaction.options.getUser("user", true);
        const notes = listNotes(interaction.guildId, user.id);

        if (!notes.length) {
          return replyEphemeral(interaction, `✅ **${user.tag}** has no moderator notes.`);
        }

        const sorted = notes.slice().sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
        const show = sorted.slice(0, 10);
        const lines = show.map(formatLine).join("\n");

        return replyEphemeral(
          interaction,
          `📝 Notes for **${user.tag}** (showing ${show.length}/${notes.length})\n\n${lines}`
        );
      }

      if (sub === "remove") {
        const id = interaction.options.getString("id", true).trim();

        await deferEphemeral(interaction);

        const removed = removeInfractionById(interaction.guildId, id);
        if (!removed || removed.type !== "note") {
          return interaction.editReply(`Couldn’t find a note with ID \`${id}\`.`);
        }

        return interaction.editReply(`🧹 Removed note \`${id}\` for <@${removed.userId}>.`);
      }

      return replyEphemeral(interaction, "Unknown subcommand.");
    } catch (err) {
      console.error("❌ note command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running note.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running note.");
      }
    }
  },
};
