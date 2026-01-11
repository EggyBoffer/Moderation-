const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { replyEphemeral } = require("../handlers/interactionReply");
const { getBotMeta } = require("../storage/botMeta");

/**
 * /help
 * - Auto-generates help text from registered slash commands in client.commands
 * - Groups common commands into categories (fallback: "Other")
 * - Uses botMeta for branding + docs/repo link
 */

const CATEGORIES = [
  {
    key: "Moderation",
    match: (name) =>
      ["purge", "warn", "timeout", "untimeout", "check", "infractions", "note", "escalation"].includes(name),
  },
  {
    key: "Configuration",
    match: (name) =>
      [
        "welcome",
        "statcounts",
        "autoreact",
        "autoresponder",
        "autorole",
        "rolepanel",
        "starboard",
        "timechannels",
        "setlogchannel",
        "viewconfig",
        "modrole",
        "embed",
      ].includes(name),
  },
  {
    key: "Utility",
    match: (name) => ["help", "info", "uptime", "ping"].includes(name),
  },
];

function pickCategory(commandName) {
  for (const c of CATEGORIES) {
    if (c.match(commandName)) return c.key;
  }
  return "Other";
}

function cmdSummary(cmd) {
  const name = cmd?.data?.name || cmd?.name || "unknown";
  const desc = cmd?.data?.description || cmd?.description || "No description set.";
  return { name, desc };
}

function trimToEmbedField(lines, maxLen = 1024) {
  const out = [];
  let total = 0;

  for (const line of lines) {
    const add = line.length + 1;
    if (total + add > maxLen - 20) break;
    out.push(line);
    total += add;
  }

  if (out.length < lines.length) out.push("• …and more");
  return out.join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show a list of commands and how to use Moderation+."),

  async execute(interaction, client) {
    try {
      const meta = getBotMeta();

      // Default: hide in ephemeral so it doesn't spam channels
      const EPHEMERAL_DEFAULT = true;

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
        .setTitle(`🔧 ${meta.name} — Help`)
        .setDescription(
          [
            meta.tagline ? `_${meta.tagline}_` : "",
            "",
            "Use **slash commands** by typing `/` in chat.",
            "Some commands require mod/admin roles (or Manage Server).",
            "",
            "**Quick examples**",
            [
              "• `/purge amount:50`",
              "• `/warn add user:@User reason:...`",
              "• `/timeout user:@User duration:10m reason:...`",
              "• `/welcome set channel:#welcome`",
              "• `/rolepanel create ...`",
              "• `/starboard create ...`",
            ].join("\n"),
          ]
            .filter(Boolean)
            .join("\n")
        )
        .setFooter({ text: "Docs link is a placeholder for now — we’ll write proper docs soon." });

      // Add one field per category
      for (const cat of orderedCats) {
        const list = grouped.get(cat) || [];
        if (list.length === 0) continue;

        const lines = list.map((c) => `• \`/${c.name}\` — ${c.desc}`);
        embed.addFields({ name: cat, value: trimToEmbedField(lines) });
      }

      // Docs / repo link from botMeta (single source of truth)
      if (meta.repoUrl) {
        embed.addFields({
          name: "📚 Documentation",
          value: `Repo / docs: ${meta.repoUrl}`,
        });
      }

      if (EPHEMERAL_DEFAULT) {
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
