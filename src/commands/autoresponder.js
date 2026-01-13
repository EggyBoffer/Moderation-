const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");
const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { isMod } = require("../handlers/permissions");
const { parseDurationToMs } = require("../handlers/parseDuration");

function ensureAutoResponderConfig(cfg) {
  const current = cfg.autoResponder || {};
  return {
    enabled: Boolean(current.enabled),
    allowedChannelIds: Array.isArray(current.allowedChannelIds) ? current.allowedChannelIds : [],
    stopAfterFirst: current.stopAfterFirst !== false, 
    triggers: Array.isArray(current.triggers) ? current.triggers : [],
  };
}

function makeId() {
  return `AR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function fmtWindow(ms) {
  if (!ms || ms <= 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function findTrigger(ar, id) {
  return ar.triggers.find((t) => t.id === id);
}

function buildList(ar) {
  if (!ar.triggers.length) return "No auto-responder triggers set.";

  const lines = ar.triggers.slice(0, 25).map((t) => {
    const limit = Number(t.limitCount || 0) > 0
      ? `${t.limitCount}/${fmtWindow(t.limitWindowMs)}`
      : "unlimited";

    const phrase = String(t.phrase || "").slice(0, 60);
    const respPreview = String(t.response || "").replace(/\s+/g, " ").slice(0, 80);

    const perTriggerChannels = Array.isArray(t.allowedChannelIds) && t.allowedChannelIds.length > 0
      ? `channels: ${t.allowedChannelIds.map((id) => `<#${id}>`).join(" ")}`
      : "channels: (inherits global)";

    return `• \`${t.id}\` — **${phrase}** → ${limit}\n  ↳ ${perTriggerChannels}\n  ↳ ${respPreview}${String(t.response || "").length > 80 ? "…" : ""}`;
  });

  const extra = ar.triggers.length > 25 ? `\n\n…and ${ar.triggers.length - 25} more.` : "";
  return lines.join("\n") + extra;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autoresponder")
    .setDescription("Configure keyword/phrase auto responses")

    .addSubcommand((sc) =>
      sc
        .setName("enable")
        .setDescription("Enable or disable the auto responder")
        .addBooleanOption((opt) =>
          opt.setName("enabled").setDescription("True to enable, false to disable").setRequired(true)
        )
    )

    .addSubcommandGroup((group) =>
      group
        .setName("channels")
        .setDescription("Global channel restriction (default for all triggers)")
        .addSubcommand((sc) =>
          sc
            .setName("add")
            .setDescription("Allow globally in a channel")
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Channel to allow")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
            )
        )
        .addSubcommand((sc) =>
          sc
            .setName("remove")
            .setDescription("Remove a channel from global allowed list")
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Channel to remove")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
            )
        )
        .addSubcommand((sc) => sc.setName("list").setDescription("List global allowed channels"))
        .addSubcommand((sc) =>
          sc.setName("clear").setDescription("Clear global allowed channels (allow all channels)")
        )
    )

    .addSubcommandGroup((group) =>
      group
        .setName("trigger")
        .setDescription("Manage triggers")
        .addSubcommand((sc) =>
          sc
            .setName("add")
            .setDescription("Add a new trigger")
            .addStringOption((opt) =>
              opt.setName("phrase").setDescription("Keyword/phrase (matched anywhere)").setRequired(true)
            )
            .addStringOption((opt) =>
              opt
                .setName("response")
                .setDescription("Response. Placeholders: {user}/{mention}, {username}, {server}")
                .setRequired(true)
            )
            .addIntegerOption((opt) =>
              opt.setName("limit").setDescription("Max per window (0 = unlimited)").setMinValue(0).setMaxValue(100)
            )
            .addStringOption((opt) =>
              opt.setName("window").setDescription("Window (30s, 10m, 2h). Required if limit>0.")
            )
        )
        .addSubcommand((sc) =>
          sc
            .setName("remove")
            .setDescription("Remove a trigger by ID")
            .addStringOption((opt) => opt.setName("id").setDescription("Trigger ID").setRequired(true))
        )
        .addSubcommand((sc) => sc.setName("list").setDescription("List triggers"))

        
        .addSubcommand((sc) =>
          sc
            .setName("channel-add")
            .setDescription("Restrict a trigger to a channel (overrides global)")
            .addStringOption((opt) => opt.setName("id").setDescription("Trigger ID").setRequired(true))
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Channel to allow for this trigger")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
            )
        )
        .addSubcommand((sc) =>
          sc
            .setName("channel-remove")
            .setDescription("Remove a channel from a trigger's allowed list")
            .addStringOption((opt) => opt.setName("id").setDescription("Trigger ID").setRequired(true))
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Channel to remove for this trigger")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
            )
        )
        .addSubcommand((sc) =>
          sc
            .setName("channel-list")
            .setDescription("List a trigger's channel restriction")
            .addStringOption((opt) => opt.setName("id").setDescription("Trigger ID").setRequired(true))
        )
        .addSubcommand((sc) =>
          sc
            .setName("channel-clear")
            .setDescription("Clear a trigger's channel restriction (inherit global)")
            .addStringOption((opt) => opt.setName("id").setDescription("Trigger ID").setRequired(true))
        )
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

      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand(true);

      const cfg = getGuildConfig(interaction.guildId);
      const ar = ensureAutoResponderConfig(cfg);

      
      if (!group && sub === "enable") {
        const enabled = interaction.options.getBoolean("enabled", true);
        setGuildConfig(interaction.guildId, { autoResponder: { ...ar, enabled } });
        return replyEphemeral(interaction, enabled ? "✅ Auto responder enabled." : "✅ Auto responder disabled.");
      }

      
      if (group === "channels") {
        if (sub === "add") {
          const channel = interaction.options.getChannel("channel", true);
          const set = new Set(ar.allowedChannelIds);
          set.add(channel.id);
          setGuildConfig(interaction.guildId, { autoResponder: { ...ar, allowedChannelIds: [...set] } });
          return replyEphemeral(interaction, `✅ Global: allowed in ${channel}.`);
        }

        if (sub === "remove") {
          const channel = interaction.options.getChannel("channel", true);
          const next = ar.allowedChannelIds.filter((id) => id !== channel.id);
          setGuildConfig(interaction.guildId, { autoResponder: { ...ar, allowedChannelIds: next } });
          return replyEphemeral(interaction, `✅ Global: removed ${channel}.`);
        }

        if (sub === "clear") {
          setGuildConfig(interaction.guildId, { autoResponder: { ...ar, allowedChannelIds: [] } });
          return replyEphemeral(interaction, "✅ Global: cleared — auto responder runs in all channels by default.");
        }

        if (sub === "list") {
          if (!ar.allowedChannelIds.length) {
            return replyEphemeral(interaction, "Global allowed channels: **all channels** (no restriction).");
          }
          const list = ar.allowedChannelIds.map((id) => `<#${id}>`).join("\n");
          return replyEphemeral(interaction, `**Global allowed channels:**\n${list}`);
        }
      }

      
      if (group === "trigger") {
        if (sub === "add") {
          const phrase = interaction.options.getString("phrase", true).trim();
          const response = interaction.options.getString("response", true).trim();
          const limit = interaction.options.getInteger("limit", false) ?? 0;
          const window = interaction.options.getString("window", false);

          if (phrase.length < 2) return replyEphemeral(interaction, "Phrase is too short.");
          if (response.length < 1) return replyEphemeral(interaction, "Response cannot be empty.");

          let limitWindowMs = 0;
          if (limit > 0) {
            if (!window) {
              return replyEphemeral(interaction, "If you set a limit, you must provide a window (e.g. `10m`, `2h`).");
            }
            const parsed = parseDurationToMs(window);
            if (!parsed.ok) return replyEphemeral(interaction, parsed.error);
            limitWindowMs = parsed.ms;
          }

          const trigger = {
            id: makeId(),
            phrase: phrase.slice(0, 200),
            response: response.slice(0, 2000),
            match: "contains",
            limitCount: limit,
            limitWindowMs,
            allowedChannelIds: [], 
          };

          ar.triggers.push(trigger);
          setGuildConfig(interaction.guildId, { autoResponder: ar });

          const limitText = limit > 0 ? `**${limit}** per **${fmtWindow(limitWindowMs)}**` : "**unlimited**";

          return replyEphemeral(
            interaction,
            `✅ Trigger added.\n• ID: \`${trigger.id}\`\n• Phrase: **${trigger.phrase}**\n• Limit: ${limitText}\n• Channels: inherits global\n\nPlaceholders: \`{user}\`/\`{mention}\`, \`{username}\`, \`{server}\``
          );
        }

        if (sub === "remove") {
          const id = interaction.options.getString("id", true).trim();
          const before = ar.triggers.length;
          const next = ar.triggers.filter((t) => t.id !== id);
          if (next.length === before) return replyEphemeral(interaction, "That trigger ID was not found.");
          setGuildConfig(interaction.guildId, { autoResponder: { ...ar, triggers: next } });
          return replyEphemeral(interaction, `✅ Trigger removed: \`${id}\``);
        }

        if (sub === "list") {
          await deferEphemeral(interaction);

          const enabledText = ar.enabled ? "✅ enabled" : "⛔ disabled";
          const globalChannelText = ar.allowedChannelIds.length
            ? ar.allowedChannelIds.map((id) => `<#${id}>`).join(" ")
            : "all channels";

          const body = buildList(ar);

          return interaction.editReply(
            `**Auto responder:** ${enabledText}\n` +
              `**Global channels:** ${globalChannelText}\n` +
              `**Placeholders:** \`{user}\`/\`{mention}\`, \`{username}\`, \`{server}\`\n\n` +
              `${body}`
          );
        }

        
        if (sub === "channel-add") {
          const id = interaction.options.getString("id", true).trim();
          const channel = interaction.options.getChannel("channel", true);

          const t = findTrigger(ar, id);
          if (!t) return replyEphemeral(interaction, "That trigger ID was not found.");

          const set = new Set(Array.isArray(t.allowedChannelIds) ? t.allowedChannelIds : []);
          set.add(channel.id);
          t.allowedChannelIds = [...set];

          setGuildConfig(interaction.guildId, { autoResponder: ar });
          return replyEphemeral(interaction, `✅ Trigger \`${id}\` allowed in ${channel} (overrides global).`);
        }

        if (sub === "channel-remove") {
          const id = interaction.options.getString("id", true).trim();
          const channel = interaction.options.getChannel("channel", true);

          const t = findTrigger(ar, id);
          if (!t) return replyEphemeral(interaction, "That trigger ID was not found.");

          t.allowedChannelIds = (Array.isArray(t.allowedChannelIds) ? t.allowedChannelIds : []).filter(
            (cid) => cid !== channel.id
          );

          setGuildConfig(interaction.guildId, { autoResponder: ar });

          if (t.allowedChannelIds.length === 0) {
            return replyEphemeral(interaction, `✅ Removed ${channel}. Trigger \`${id}\` now **inherits global**.`);
          }
          return replyEphemeral(interaction, `✅ Removed ${channel} from trigger \`${id}\`.`);
        }

        if (sub === "channel-list") {
          const id = interaction.options.getString("id", true).trim();
          const t = findTrigger(ar, id);
          if (!t) return replyEphemeral(interaction, "That trigger ID was not found.");

          const list = Array.isArray(t.allowedChannelIds) ? t.allowedChannelIds : [];
          if (list.length === 0) {
            return replyEphemeral(interaction, `Trigger \`${id}\` channels: **inherits global**.`);
          }
          return replyEphemeral(interaction, `Trigger \`${id}\` channels:\n${list.map((cid) => `<#${cid}>`).join("\n")}`);
        }

        if (sub === "channel-clear") {
          const id = interaction.options.getString("id", true).trim();
          const t = findTrigger(ar, id);
          if (!t) return replyEphemeral(interaction, "That trigger ID was not found.");

          t.allowedChannelIds = [];
          setGuildConfig(interaction.guildId, { autoResponder: ar });
          return replyEphemeral(interaction, `✅ Trigger \`${id}\` channel restriction cleared (inherits global).`);
        }
      }

      return replyEphemeral(interaction, "Unknown subcommand.");
    } catch (err) {
      console.error("❌ autoresponder command error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("Something went wrong running autoresponder.");
      } else {
        await replyEphemeral(interaction, "Something went wrong running autoresponder.");
      }
    }
  },
};
