const { PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("../storage/guildConfig");

function memberHasAnyRole(member, roleIds) {
  if (!member || !roleIds || roleIds.length === 0) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

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
