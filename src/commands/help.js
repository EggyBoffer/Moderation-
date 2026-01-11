const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { replyEphemeral } = require("../handlers/interactionReply");
const { getBotMeta } = require("../storage/botMeta");

/**
 * /help
 * - Auto-generates help text from registered slash commands in client.commands
 * - Groups commands into categories (fallback: "Other")
 * - Uses botMeta for branding + links (with safe fallbacks)
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

const FALLBACK_INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1459939265935839388&permissions=8&integration_type=0&scope=applications.commands+bot";
const FALLBACK_PRIVACY_URL = "https://eggyboffer.github.io/Moderation-/legal/privacy-policy";
const FALLBACK_TERMS_URL = "https://eggyboffer.github.io/Moderation-/legal/terms-of-service";

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

      const EPHEMERAL_DEFAULT = true;

      const name = meta.name || "Moderation+";
      const tagline = meta.tagline || meta.description || "";

      // ✅ Safe fallbacks so we never show "undefined" even if meta is outdated
      const inviteUrl = meta.inviteUrl || FALLBACK_INVITE_URL;
      const privacyUrl = meta.privacyUrl || FALLBACK_PRIVACY_URL;
      const termsUrl = meta.termsUrl || FALLBACK_TERMS_URL;

      const commandsMap = client?.commands;
      const commands = commandsMap ? Array.from(commandsMap.values()) : [];

      const grouped = new Map();
      for (const cmd of commands) {
        const { name: cmdName, desc } = cmdSummary(cmd);
        const category = pickCategory(cmdName);
        if (!grouped.has(category)) grouped.set(category, []);
        grouped.get(category).push({ name: cmdName, desc });
      }

      for (const [cat, list] of grouped.entries()) {
        list.sort((a, b) => a.name.localeCompare(b.name));
        grouped.set(cat, list);
      }

      const categoryOrder = ["Moderation", "Configuration", "Utility", "Other"];
      const orderedCats = categoryOrder.filter((c) => grouped.has(c));

      const embed = new EmbedBuilder()
        .setTitle(`🔧 ${name} — Help`)
        .setDescription(
          [
            tagline ? `_${tagline}_` : "",
            "",
            "**Quick start (server owners):**",
            "• `/setlogchannel` — set where moderation logs go (recommended first)",
            "• `/welcome set` — enable welcome messages",
            "• `/statcounts setup` — add member count channels",
            "• `/rolepanel create` — build button role menus",
            "• `/starboard enable` — enable starboard highlights",
            "",
            "Type **`/`** in chat to browse commands.",
            "Some commands require admin/mod permissions (or **Manage Server**).",
          ]
            .filter(Boolean)
            .join("\n")
        )
        .addFields({
          name: "➕ Invite & Legal",
          value: `Invite: ${inviteUrl}\nPrivacy: ${privacyUrl}\nTerms: ${termsUrl}`,
        })
        .setFooter({ text: "Tip: run /info for version, uptime, and support links." });

      for (const cat of orderedCats) {
        const list = grouped.get(cat) || [];
        if (list.length === 0) continue;

        const lines = list.map((c) => `• \`/${c.name}\` — ${c.desc}`);
        embed.addFields({ name: cat, value: trimToEmbedField(lines) });
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
