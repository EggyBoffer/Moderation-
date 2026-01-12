const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { listPanels } = require("./rolePanels");

function statusLine(ok, okText, badText) {
  return ok ? `✅ ${okText}` : `⚠️ ${badText}`;
}

function getStarboardStatus(cfg) {
  const sb = cfg?.starboards;
  const enabled = Boolean(sb?.enabled);
  const boards = sb?.boards && typeof sb.boards === "object" ? sb.boards : {};

  const enabledBoards = Object.entries(boards)
    .map(([id, b]) => ({ id, b }))
    .filter(({ b }) => b && b.enabled !== false);

  const configuredBoards = enabledBoards.filter(({ b }) => {
    const hasChannel = Boolean(b.channelId);
    const watched = Array.isArray(b.watchChannelIds) ? b.watchChannelIds.filter(Boolean) : [];
    return hasChannel && watched.length > 0;
  });

  const best = configuredBoards[0] || enabledBoards[0] || null;

  return {
    enabled,
    totalBoards: Object.keys(boards).length,
    enabledBoards: enabledBoards.length,
    configuredBoards: configuredBoards.length,
    exampleBoardId: best?.id || null,
    exampleChannelId: best?.b?.channelId || null,
    exampleWatchCount: Array.isArray(best?.b?.watchChannelIds) ? best.b.watchChannelIds.filter(Boolean).length : 0,
  };
}

function buildSetupChecklistEmbed(meta, cfg, { guildId, guildName, mode }) {
  const logChannelId = cfg?.logChannelId || null;
  const welcomeChannelId = cfg?.welcomeChannelId || null;
  const welcomeMessage = cfg?.welcomeMessage || null;

  const countsCategoryId = cfg?.countsCategoryId || null;

  let rolePanelsCount = 0;
  try {
    const panels = listPanels(guildId);
    rolePanelsCount = Array.isArray(panels) ? panels.length : 0;
  } catch {
    rolePanelsCount = 0;
  }

  const sb = getStarboardStatus(cfg);

  const header =
    mode === "start"
      ? [
          `Welcome to **${meta.name || "Moderation+"}** setup for **${guildName}**.`,
          "",
          "This checklist doesn’t change anything automatically — it just shows what to configure next.",
          "Run these in order for the smoothest setup.",
        ].join("\n")
      : `Setup status for **${guildName}**.`;

  const starboardValue = sb.enabled
    ? [
        statusLine(sb.configuredBoards > 0, "Configured", "Enabled but missing board config"),
        sb.configuredBoards > 0
          ? `Board: \`${sb.exampleBoardId}\` • Channel: <#${sb.exampleChannelId}> • Watching: ${sb.exampleWatchCount}`
          : `Boards: ${sb.totalBoards} (enabled: ${sb.enabledBoards})`,
        "Manage: `/starboard list`, `/starboard view`, `/starboard set`, `/starboard watch-add`",
      ].join("\n")
    : [
        "⚠️ Not enabled",
        "Run: `/starboard enable`",
        "Then: `/starboard create`",
      ].join("\n");

  const embed = new EmbedBuilder()
    .setTitle(`🧰 ${meta.name || "Moderation+"} — Setup`)
    .setDescription(header)
    .addFields(
      {
        name: "1) Moderation Logs",
        value: [
          statusLine(!!logChannelId, "Configured", "Not configured"),
          logChannelId ? `Channel: <#${logChannelId}>` : "Run: `/setlogchannel channel:#your-log-channel`",
        ].join("\n"),
      },
      {
        name: "2) Welcome Messages",
        value: [
          statusLine(!!welcomeChannelId, "Channel set", "Channel not set"),
          welcomeChannelId ? `Channel: <#${welcomeChannelId}>` : "Run: `/welcome set channel:#welcome`",
          statusLine(!!welcomeMessage, "Message set", "Message not set (optional)"),
          welcomeMessage ? "Manage: `/welcome message view`" : "Set: `/welcome message set text:...`",
        ].join("\n"),
      },
      {
        name: "3) Stat Count Channels",
        value: [
          statusLine(!!countsCategoryId, "Configured", "Not configured"),
          countsCategoryId ? `Category: <#${countsCategoryId}>` : "Run: `/statcounts setup category:#your-category`",
        ].join("\n"),
      },
      {
        name: "4) Role Panels",
        value: [
          rolePanelsCount > 0 ? `✅ ${rolePanelsCount} panel(s) configured` : "⚠️ No role panels configured",
          "Run: `/rolepanel create channel:#roles`",
          "Then: `/rolepanel add message_id:... role:@Role label:...`",
        ].join("\n"),
      },
      {
        name: "5) Starboard",
        value: starboardValue,
      }
    )
    .setFooter({ text: "Tip: run /setup test to check bot permissions." });

  return embed;
}

async function runSetupPermissionTest(interaction) {
  const guild = interaction.guild;
  const me = guild?.members?.me;

  const embed = new EmbedBuilder()
    .setTitle("🧪 Moderation+ — Permission Test")
    .setDescription(
      "These checks confirm Moderation+ can run all features reliably.\nMissing permissions may limit specific modules."
    )
    .setColor(0x5865f2);

  if (!guild || !me) {
    embed.addFields({
      name: "Status",
      value: "⚠️ Could not read guild/member state. Try again in a server channel.",
    });
    return embed;
  }

  const checks = [
    ["View Audit Log", PermissionFlagsBits.ViewAuditLog],
    ["Manage Channels", PermissionFlagsBits.ManageChannels],
    ["Manage Roles", PermissionFlagsBits.ManageRoles],
    ["Send Messages", PermissionFlagsBits.SendMessages],
    ["Embed Links", PermissionFlagsBits.EmbedLinks],
    ["Read Message History", PermissionFlagsBits.ReadMessageHistory],
  ];

  const lines = checks.map(([label, bit]) => {
    const ok = me.permissions.has(bit);
    return `${ok ? "✅" : "❌"} **${label}**`;
  });

  embed.addFields({ name: "Checks", value: lines.join("\n") });

  return embed;
}

module.exports = {
  buildSetupChecklistEmbed,
  runSetupPermissionTest,
};
