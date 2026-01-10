const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const { replyEphemeral, deferEphemeral } = require("../handlers/interactionReply");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");
const { updateTimeChannelsForGuild } = require("../handlers/timeChannels");

// Discord only allows up to 25 choices per string option.
const COMMON_TIMEZONES = [
  { name: "UTC", value: "UTC" },
  { name: "Europe/London", value: "Europe/London" },
  { name: "Europe/Dublin", value: "Europe/Dublin" },
  { name: "Europe/Paris", value: "Europe/Paris" },
  { name: "Europe/Berlin", value: "Europe/Berlin" },
  { name: "Europe/Moscow", value: "Europe/Moscow" },

  { name: "America/New_York", value: "America/New_York" },
  { name: "America/Chicago", value: "America/Chicago" },
  { name: "America/Denver", value: "America/Denver" },
  { name: "America/Los_Angeles", value: "America/Los_Angeles" },
  { name: "America/Sao_Paulo", value: "America/Sao_Paulo" },

  { name: "Africa/Johannesburg", value: "Africa/Johannesburg" },

  { name: "Asia/Dubai", value: "Asia/Dubai" },
  { name: "Asia/Kolkata", value: "Asia/Kolkata" },
  { name: "Asia/Bangkok", value: "Asia/Bangkok" },
  { name: "Asia/Singapore", value: "Asia/Singapore" },
  { name: "Asia/Hong_Kong", value: "Asia/Hong_Kong" },
  { name: "Asia/Shanghai", value: "Asia/Shanghai" },
  { name: "Asia/Tokyo", value: "Asia/Tokyo" },
  { name: "Asia/Seoul", value: "Asia/Seoul" },

  { name: "Australia/Perth", value: "Australia/Perth" },
  { name: "Australia/Sydney", value: "Australia/Sydney" },

  { name: "Pacific/Auckland", value: "Pacific/Auckland" },
  { name: "Pacific/Honolulu", value: "Pacific/Honolulu" },
];

function normZone(z) {
  return String(z || "").trim();
}

function normLabel(l) {
  return String(l || "").trim();
}

function getEntries(cfg) {
  return Array.isArray(cfg.timeChannels) ? cfg.timeChannels : [];
}

function withTimeout(promise, ms, label = "update") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timechannels")
    .setDescription("World clock voice channels (per timezone)")
    .addSubcommand((sc) =>
      sc
        .setName("setup")
        .setDescription("Set the category to place time channels in")
        .addChannelOption((opt) =>
          opt
            .setName("category")
            .setDescription("Category to create/update the time channels in")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("locale")
            .setDescription('Locale for formatting (default "en-GB")')
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Add a timezone display channel")
        .addStringOption((opt) => {
          opt
            .setName("timezone")
            .setDescription("Pick a timezone from common presets")
            .setRequired(false);
          for (const z of COMMON_TIMEZONES) opt.addChoices(z);
          return opt;
        })
        .addStringOption((opt) =>
          opt
            .setName("custom_timezone")
            .setDescription('Custom timezone (IANA format, e.g. "Europe/London")')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("label")
            .setDescription('Custom label (e.g. "Skinner time:")')
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("label")
        .setDescription("Change the label for an existing timezone")
        .addStringOption((opt) =>
          opt
            .setName("timezone")
            .setDescription('Timezone to relabel (e.g. "America/New_York")')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("label")
            .setDescription('New label (e.g. "Skinner time:")')
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Remove a timezone from the display list")
        .addStringOption((opt) =>
          opt
            .setName("timezone")
            .setDescription('Timezone to remove (e.g. "Europe/London")')
            .setRequired(true)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("delete_channel")
            .setDescription("Also delete the voice channel (default: false)")
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc.setName("list").setDescription("List configured timezone channels")
    )
    .addSubcommand((sc) =>
      sc.setName("refresh").setDescription("Force refresh time channels now")
    )
    .addSubcommand((sc) =>
      sc
        .setName("disable")
        .setDescription("Disable time channels (does not delete channels)")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return replyEphemeral(interaction, "Use this in a server.");
      }

      const member = interaction.member;
      if (!member.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        return replyEphemeral(
          interaction,
          "You need **Manage Server** to configure time channels."
        );
      }

      const sub = interaction.options.getSubcommand(true);

      const safeRefresh = async () => {
        // Important: never hang the interaction forever
        try {
          await withTimeout(
            updateTimeChannelsForGuild(interaction.guild, { force: true }),
            12_000,
            "time channel refresh"
          );
          return { ok: true, msg: "✅ Updated immediately." };
        } catch (err) {
          console.warn("⚠️ timechannels refresh issue:", err?.message || err);
          return {
            ok: false,
            msg:
              "⚠️ Saved the setting, but Discord is being slow right now.\n" +
              "It’ll still update automatically within the next minute.",
          };
        }
      };

      if (sub === "setup") {
        const category = interaction.options.getChannel("category", true);
        const locale = interaction.options.getString("locale");

        setGuildConfig(interaction.guildId, {
          timeCategoryId: category.id,
          ...(locale ? { timeLocale: String(locale).trim() } : {}),
        });

        await deferEphemeral(interaction);
        const res = await safeRefresh();

        return interaction.editReply(
          `✅ Time channels configured under **${category.name}**.\n` +
            `Now add zones with \`/timechannels add\`.\n` +
            res.msg
        );
      }

      if (sub === "add") {
        const cfg = getGuildConfig(interaction.guildId);
        if (!cfg.timeCategoryId) {
          return replyEphemeral(
            interaction,
            "Time channels aren’t set up yet. Use `/timechannels setup` first."
          );
        }

        const tzChoice = interaction.options.getString("timezone");
        const tzCustom = interaction.options.getString("custom_timezone");
        const tz = normZone(tzCustom || tzChoice);

        if (!tz) {
          return replyEphemeral(
            interaction,
            "Pick a timezone or provide `custom_timezone` (e.g. `Europe/London`)."
          );
        }

        const label =
          normLabel(interaction.options.getString("label")) || `🕒 ${tz}`;

        const entries = getEntries(cfg);
        const existing = entries.find((e) => normZone(e.timeZone) === tz);

        if (existing) {
          const next = entries.map((e) =>
            normZone(e.timeZone) === tz ? { ...e, label } : e
          );
          setGuildConfig(interaction.guildId, { timeChannels: next });

          await deferEphemeral(interaction);
          const res = await safeRefresh();

          return interaction.editReply(
            `✅ Updated **${tz}** label to: **${label}**\n${res.msg}`
          );
        }

        setGuildConfig(interaction.guildId, {
          timeChannels: [...entries, { timeZone: tz, label }],
        });

        await deferEphemeral(interaction);
        const res = await safeRefresh();

        return interaction.editReply(`✅ Added timezone: **${tz}**\n${res.msg}`);
      }

      if (sub === "label") {
        const tz = normZone(interaction.options.getString("timezone", true));
        const label = normLabel(interaction.options.getString("label", true));

        const cfg = getGuildConfig(interaction.guildId);
        const entries = getEntries(cfg);

        const existing = entries.find((e) => normZone(e.timeZone) === tz);
        if (!existing) {
          return replyEphemeral(
            interaction,
            `No entry found for timezone: **${tz}**\nUse \`/timechannels add\` first.`
          );
        }

        const next = entries.map((e) =>
          normZone(e.timeZone) === tz ? { ...e, label } : e
        );
        setGuildConfig(interaction.guildId, { timeChannels: next });

        await deferEphemeral(interaction);
        const res = await safeRefresh();

        return interaction.editReply(`✅ Renamed **${tz}** to: **${label}**\n${res.msg}`);
      }

      if (sub === "remove") {
        const tz = normZone(interaction.options.getString("timezone", true));
        const deleteChannel = Boolean(interaction.options.getBoolean("delete_channel"));

        const cfg = getGuildConfig(interaction.guildId);
        const entries = getEntries(cfg);

        const target = entries.find((e) => normZone(e.timeZone) === tz);
        if (!target) {
          return replyEphemeral(interaction, `No entry found for: **${tz}**`);
        }

        const next = entries.filter((e) => normZone(e.timeZone) !== tz);
        setGuildConfig(interaction.guildId, { timeChannels: next });

        if (deleteChannel && target.channelId) {
          const ch =
            interaction.guild.channels.cache.get(target.channelId) ||
            (await interaction.guild.channels.fetch(target.channelId).catch(() => null));

          if (ch && ch.type === ChannelType.GuildVoice) {
            await ch.delete("TimeChannels removed by admin").catch(() => null);
          }
        }

        await deferEphemeral(interaction);
        const res = await safeRefresh();

        return interaction.editReply(`✅ Removed timezone: **${tz}**\n${res.msg}`);
      }

      if (sub === "list") {
        const cfg = getGuildConfig(interaction.guildId);
        const categoryId = cfg.timeCategoryId;
        const entries = getEntries(cfg);

        if (!categoryId || entries.length === 0) {
          return replyEphemeral(
            interaction,
            "No time channels configured yet. Use `/timechannels setup` and `/timechannels add`."
          );
        }

        const lines = entries.map((e) => {
          const tz = normZone(e.timeZone);
          const label = normLabel(e.label) || tz;
          const ch = e.channelId ? `<#${e.channelId}>` : "*not created yet*";
          return `• **${tz}** — "${label}" — ${ch}`;
        });

        return replyEphemeral(
          interaction,
          `**Time Channels**\n• Category: <#${categoryId}>\n` + lines.join("\n")
        );
      }

      if (sub === "refresh") {
        const cfg = getGuildConfig(interaction.guildId);
        if (!cfg.timeCategoryId) {
          return replyEphemeral(
            interaction,
            "Time channels aren’t set up yet. Use `/timechannels setup` first."
          );
        }

        await deferEphemeral(interaction);
        const res = await safeRefresh();
        return interaction.editReply(`✅ Refresh requested.\n${res.msg}`);
      }

      if (sub === "disable") {
        setGuildConfig(interaction.guildId, { timeCategoryId: null });
        return replyEphemeral(
          interaction,
          "✅ Time channels disabled. (Existing channels were not deleted.)"
        );
      }
    } catch (err) {
      console.error("❌ timechannels command error:", err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("Something went wrong running timechannels.");
        } else {
          await replyEphemeral(interaction, "Something went wrong running timechannels.");
        }
      } catch {}
    }
  },
};
