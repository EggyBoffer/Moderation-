const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { replyEphemeral } = require("../handlers/interactionReply");
const { canUseFunCommand } = require("../handlers/funGate");

const RESPONSES = [
  "It is certain.",
  "Without a doubt.",
  "You may rely on it.",
  "Yes — definitely.",
  "It is decidedly so.",
  "As I see it, yes.",
  "Most likely.",
  "Outlook: good.",
  "Signs point to yes.",
  "Yes.",
  "Reply hazy, try again.",
  "Ask again later.",
  "Better not tell you now.",
  "Cannot predict now.",
  "Concentrate and ask again.",
  "Don’t count on it.",
  "My reply is no.",
  "Outlook: not so good.",
  "Very doubtful.",
  "No.",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8-ball a question.")
    .addStringOption((opt) =>
      opt
        .setName("question")
        .setDescription("What do you want to ask?")
        .setRequired(true)
        .setMaxLength(200)
    ),

  async execute(interaction) {
    const gate = canUseFunCommand(interaction);
    if (!gate.ok) return replyEphemeral(interaction, gate.reason);

    const question = interaction.options.getString("question", true);
    const answer = pick(RESPONSES);

    const embed = new EmbedBuilder()
      .setTitle("🎱 Magic 8-Ball")
      .addFields(
        { name: "Question", value: question },
        { name: "Answer", value: `**${answer}**` }
      );

    return interaction.reply({ embeds: [embed] });
  },
};
