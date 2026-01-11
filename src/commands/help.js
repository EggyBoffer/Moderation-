const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { replyEphemeral } = require("../handlers/interactionReply");

/**
 * /help
 * - Auto-generates help text from registered slash commands in client.commands
 * - Groups common commands into categories (fallback: "Other")
 * - Includes a docs link placeholder
 */

// Change this later to your actual docs page in the repo
const DOCS_URL = "https://github.com/EggyBoffer/Moderation-";

const CATEGORIES = [
  {
    key: "Moderation",
    match: (name) =>
      ["purge", "warn", "timeout", "untimeout", "check", "infractions"].includes(name),
  },
  {
    key: "Configuration",
    match: (name) =>
      [
        "welcome",
        "statcounts",
        "autoreact",
        "rolepanel",
        "starboard",
        "timechannels",
        "moderationlogs",
        "config",
      ].includes(name),
  },
  {
    key: "Utility",
    match: (name) => ["help", "info", "botinfo", "ping"].includes(name),
  },
];

function pickCategory(commandName) {
  for (const c of CATEGORIES) {
    if (c.match(commandName)) return c.key;
  }
  return "Other";
}

function cmdSummary(cmd) {
  // cmd.data is usually SlashCommandBuilder; it has .name and .description
  const name = cmd?.data?.name || cmd?.name || "unknown";
  const desc = cmd?.data?.description || cmd?.description || "No description set.";
  return { name, desc };
}

function safeLines(lines, max = 6) {
  return lines.slice(0, max).join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show a list of commands and how to use Moderation+."),

  async execute(interaction, client) {
    try {
      // Show to the user without spamming the whole server by default.
      // If you prefer public help, swap replyEphemeral -> interaction.reply
      const isEphemeralDefault = true;

      const commandsMap = client?.commands;
      const commands = commandsMap ? Array.from(commandsMap.values()) : [];

      // Build grouped lists
      const grouped = new Map();
      for (const cmd of commands) {
        const { name, desc } = cmdSummary(cmd);
        const category = pickCategory(name);
        if (!grouped.has(category)) grouped.set(category, []);
        grouped.get(category).push({ name, desc });
      }

      // Sort categories and commands alphabetically
      for (const [cat, list] of grouped.entries()) {
        list.sort((a, b) => a.name.localeCompare(b.name));
        grouped.set(cat, list);
      }

      const categoryOrder = ["Moderation", "Configuration", "Utility", "Other"];
      const orderedCats = categoryOrder.filter((c) => grouped.has(c));

      const embed = new EmbedBuilder()
        .setTitle("🔧 Moderation+ — Help")
        .setDescription(
          [
            "Use **slash commands** by typing `/` in chat.",
            "Most admin/mod commands require permissions or configured mod roles.",
            "",
            "**Quick examples**",
            safeLines(
              [
                "• `/purge amount:50` (bulk delete)",
                "• `/warn add user:@User reason:...`",
                "• `/timeout user:@User duration:10m reason:...`",
                "• `/welcome set channel:#welcome`",
                "• `/rolepanel create ...`",
                "• `/starboard create ...`",
              ],
              6
            ),
          ].join("\n")
        )
        .setFooter({ text: "Docs link is a placeholder for now — we’ll write proper docs soon." });

      // Add one field per category (Discord embed field value limit is 1024 chars)
      for (const cat of orderedCats) {
        const list = grouped.get(cat) || [];
        if (list.length === 0) continue;

        const lines = list.map((c) => `• \`/${c.name}\` — ${c.desc}`);
        let value = lines.join("\n");
        if (value.length > 1024) {
          // Trim safely
          const trimmed = [];
          let total = 0;
          for (const line of lines) {
            if (total + line.length + 1 > 900) break;
            trimmed.push(line);
            total += line.length + 1;
          }
          trimmed.push("• …and more");
          value = trimmed.join("\n");
        }

        embed.addFields({ name: cat, value });
      }

      embed.addFields({
        name: "📚 Documentation",
        value: `For now, see the repo here:\n${DOCS_URL}`,
      });

      if (isEphemeralDefault) {
        return replyEphemeral(interaction, { embeds: [embed] });
      }
      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error("❌ Error running /help:", err);
      try {
        return replyEphemeral(interaction, "Something went wrong running /help.");
      } catch {}
    }
  },
};
