const { PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("../storage/guildConfig");

/**
 * Enforce per-guild fun command channel restriction.
 *
 * Rules:
 * - If funChannelId is NOT set: allow anywhere
 * - If set: allow only in that channel
 * - Admin / Manage Server bypass
 *
 * Returns: { ok: boolean, reason?: string }
 */
function canUseFunCommand(interaction) {
  if (!interaction.inGuild()) return { ok: false, reason: "Use this in a server." };

  const member = interaction.member;
  if (member?.permissions?.has(PermissionFlagsBits.ManageGuild)) return { ok: true };

  const cfg = getGuildConfig(interaction.guildId);
  const funChannelId = cfg.funChannelId;

  if (!funChannelId) return { ok: true }; // unrestricted

  if (interaction.channelId === funChannelId) return { ok: true };

  return {
    ok: false,
    reason: `Fun commands are restricted to <#${funChannelId}>.\nAsk an admin to change it with \`/funchannel set\`.`,
  };
}

module.exports = { canUseFunCommand };
