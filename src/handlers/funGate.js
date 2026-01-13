const { PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("../storage/guildConfig");

function canUseFunCommand(interaction) {
  if (!interaction.inGuild()) return { ok: false, reason: "Use this in a server." };

  const member = interaction.member;
  if (member?.permissions?.has(PermissionFlagsBits.ManageGuild)) return { ok: true };

  const cfg = getGuildConfig(interaction.guildId);
  const funChannelId = cfg.funChannelId;

  if (!funChannelId) return { ok: true }; 

  if (interaction.channelId === funChannelId) return { ok: true };

  return {
    ok: false,
    reason: `Fun commands are restricted to <#${funChannelId}>.\nAsk an admin to change it with \`/funchannel set\`.`,
  };
}

module.exports = { canUseFunCommand };
