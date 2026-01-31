const {
  SlashCommandBuilder,
} = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");

const {
  setUserMode,
  setUserPaused,
  addRuleKeyword,
  addRuleUser,
  addRuleChannel,
  removeRule,
  listRules,
} = require("../handlers/watchSystem");

function splitChannelIds(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  return Array.from(new Set(s.split(/\s+/).map((x) => x.replace(/<#|>/g, "").trim()).filter(Boolean)));
}

function fmtRule(r) {
  if (r.type === "keyword") {
    const scope = (r.channels || []).length ? ` in ${r.channels.map((id) => `<#${id}>`).join(", ")}` : "";
    const cs = r.caseSensitive ? " (case-sensitive)" : "";
    return `\`${r.id}\` • Keyword **${r.keyword}**${cs}${scope}`;
  }
  if (r.type === "user") {
    const scope = (r.channels || []).length ? ` in ${r.channels.map((id) => `<#${id}>`).join(", ")}` : "";
    return `\`${r.id}\` • User <@${r.userId}>${scope}`;
  }
  if (r.type === "channel") {
    const scope = (r.channels || []).length ? r.channels.map((id) => `<#${id}>`).join(", ") : "(none)";
    return `\`${r.id}\` • Any message in ${scope}`;
  }
  return `\`${r.id}\` • Unknown`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("watch")
    .setDescription("Privately watch channels/users/keywords with DM or Inbox alerts")
    .addSubcommand((sc) =>
      sc
        .setName("mode")
        .setDescription("Choose how you receive alerts")
        .addStringOption((opt) =>
          opt
            .setName("mode")
            .setDescription("Alert delivery mode")
            .setRequired(true)
            .addChoices(
              { name: "DM", value: "dm" },
              { name: "Inbox", value: "inbox" },
              { name: "Both", value: "both" },
              { name: "Off", value: "off" }
            )
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("addkeyword")
        .setDescription("Alert when a keyword is mentioned")
        .addStringOption((opt) =>
          opt.setName("keyword").setDescription("Keyword to match").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("channels")
            .setDescription("Optional: space-separated channel mentions/IDs to limit matches")
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("casesensitive")
            .setDescription("Match case exactly")
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("adduser")
        .setDescription("Alert when a specific user posts")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to watch").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("channels")
            .setDescription("Optional: space-separated channel mentions/IDs to limit matches")
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("addchannel")
        .setDescription("Alert on any message in specific channels")
        .addStringOption((opt) =>
          opt
            .setName("channels")
            .setDescription("Space-separated channel mentions/IDs")
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Remove a watch rule")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("Rule ID").setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc.setName("list").setDescription("List your watch rules")
    )
    .addSubcommand((sc) =>
      sc.setName("pause").setDescription("Pause all your watch alerts")
    )
    .addSubcommand((sc) =>
      sc.setName("resume").setDescription("Resume all your watch alerts")
    ),

  async execute(interaction, client) {
    if (!interaction.inGuild()) {
      return replyEphemeral(interaction, "Use this command in a server.");
    }

    const sub = interaction.options.getSubcommand(true);

    if (sub === "mode") {
      const mode = interaction.options.getString("mode", true);
      setUserMode(interaction.guildId, interaction.user.id, mode);
      return replyEphemeral(interaction, `✅ Watch mode set to **${mode.toUpperCase()}**`);
    }

    if (sub === "pause") {
      setUserPaused(interaction.guildId, interaction.user.id, true);
      return replyEphemeral(interaction, "⏸️ Your watch alerts are now paused.");
    }

    if (sub === "resume") {
      setUserPaused(interaction.guildId, interaction.user.id, false);
      return replyEphemeral(interaction, "▶️ Your watch alerts are now active.");
    }

    if (sub === "addkeyword") {
      const keyword = interaction.options.getString("keyword", true);
      const channelsRaw = interaction.options.getString("channels", false);
      const caseSensitive = interaction.options.getBoolean("casesensitive", false) || false;
      const channels = splitChannelIds(channelsRaw);

      await deferEphemeral(interaction);
      const rule = addRuleKeyword(interaction.guildId, interaction.user.id, keyword, channels, caseSensitive);
      if (!rule) {
        return interaction.editReply("❌ Could not add that keyword rule.");
      }
      return interaction.editReply(`✅ Added rule: ${fmtRule(rule)}`);
    }

    if (sub === "adduser") {
      const user = interaction.options.getUser("user", true);
      const channelsRaw = interaction.options.getString("channels", false);
      const channels = splitChannelIds(channelsRaw);

      await deferEphemeral(interaction);
      const rule = addRuleUser(interaction.guildId, interaction.user.id, user.id, channels);
      if (!rule) {
        return interaction.editReply("❌ Could not add that user rule.");
      }
      return interaction.editReply(`✅ Added rule: ${fmtRule(rule)}`);
    }

    if (sub === "addchannel") {
      const channelsRaw = interaction.options.getString("channels", true);
      const channels = splitChannelIds(channelsRaw);

      await deferEphemeral(interaction);
      const rule = addRuleChannel(interaction.guildId, interaction.user.id, channels);
      if (!rule) {
        return interaction.editReply("❌ Could not add that channel rule.");
      }
      return interaction.editReply(`✅ Added rule: ${fmtRule(rule)}`);
    }

    if (sub === "remove") {
      const id = interaction.options.getString("id", true);
      await deferEphemeral(interaction);
      const ok = removeRule(interaction.guildId, interaction.user.id, id);
      if (!ok) return interaction.editReply("❌ No rule found with that ID.");
      return interaction.editReply(`✅ Removed rule \`${id}\``);
    }

    if (sub === "list") {
      await deferEphemeral(interaction);
      const { user } = listRules(interaction.guildId, interaction.user.id);
      const mode = String(user.mode || "dm").toLowerCase();
      const paused = Boolean(user.paused);
      const rules = Array.isArray(user.rules) ? user.rules : [];

      if (!rules.length) {
        return interaction.editReply(
          `**Mode:** ${mode.toUpperCase()}\n**Paused:** ${paused ? "Yes" : "No"}\n\n*No watch rules yet.*`
        );
      }

      const lines = rules.map((r) => fmtRule(r));
      const body = lines.join("\n");
      const msg = `**Mode:** ${mode.toUpperCase()}\n**Paused:** ${paused ? "Yes" : "No"}\n\n${body}`;
      return interaction.editReply(msg.length > 1900 ? msg.slice(0, 1900) + "…" : msg);
    }
  },
};
