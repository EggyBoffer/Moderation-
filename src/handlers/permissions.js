const { PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("../storage/guildConfig");

function memberHasAnyRole(member, roleIds) {
  if (!member || !roleIds || roleIds.length === 0) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

/**
 * Returns true if the member is allowed to use mod commands in this guild.
 * Rules:
 * - Administrator always allowed
 * - ManageGuild always allowed (server managers)
 * - OR has one of the configured mod roles
 * - Optional: also allow ManageMessages (commented, enable if you want)
 */
function isMod(member, guildId) {
  if (!member || !guildId) return false;

  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;

  const cfg = getGuildConfig(guildId);
  const modRoleIds = cfg.modRoleIds || [];
  return memberHasAnyRole(member, modRoleIds);
}

module.exports = { isMod };
