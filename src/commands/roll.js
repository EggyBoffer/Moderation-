const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { replyEphemeral } = require("../handlers/interactionReply");
const { canUseFunCommand } = require("../handlers/funGate");

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll dice (e.g. 1d20, 2d6, etc.)")
    .addIntegerOption((opt) =>
      opt
        .setName("dice")
        .setDescription("How many dice? (default: 1)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("sides")
        .setDescription("Sides per die (default: 20)")
        .setRequired(false)
        .setMinValue(2)
        .setMaxValue(1000)
    ),

  async execute(interaction) {
    const gate = canUseFunCommand(interaction);
    if (!gate.ok) return replyEphemeral(interaction, gate.reason);

    const dice = clamp(interaction.options.getInteger("dice") ?? 1, 1, 50);
    const sides = clamp(interaction.options.getInteger("sides") ?? 20, 2, 1000);

    const rolls = [];
    for (let i = 0; i < dice; i++) rolls.push(randInt(1, sides));

    const total = rolls.reduce((a, b) => a + b, 0);
    const shown = rolls.slice(0, 25);
    const extra = rolls.length - shown.length;

    const embed = new EmbedBuilder()
      .setTitle("🎲 Dice Roll")
      .addFields(
        { name: "Roll", value: `\`${dice}d${sides}\``, inline: true },
        { name: "Total", value: `\`${total}\``, inline: true },
        {
          name: "Results",
          value:
            shown.map((n) => `\`${n}\``).join(" ") +
            (extra > 0 ? `\n…and **${extra}** more.` : ""),
        }
      );

    return interaction.reply({ embeds: [embed] });
  },
};
