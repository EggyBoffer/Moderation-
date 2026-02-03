const { PermissionFlagsBits } = require("discord.js");

const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");
const { sendToGuildLog } = require("./logChannel");
const { baseEmbed } = require("./logEmbeds");

function ensureAutoRoles(cfg) {
  const ar = cfg.autoRoles || {};
  const join = ar.join || {};
  const tenure = ar.tenure || {};

  const applied = join.applied && typeof join.applied === "object" ? join.applied : {};

  return {
    join: {
      enabled: Boolean(join.enabled),
      roleId: join.roleId || null,
      delayMs: Number.isFinite(join.delayMs) ? join.delayMs : 0,
      applied,
    },
    tenure: {
      enabled: Boolean(tenure.enabled),
      rules: Array.isArray(tenure.rules) ? tenure.rules : [],
      lastRunTs: Number.isFinite(tenure.lastRunTs) ? tenure.lastRunTs : 0,
    },
  };
}

function setAutoRolesConfig(guildId, updates) {
  const cfg = getGuildConfig(guildId);
  const current = ensureAutoRoles(cfg);

  const next = {
    ...current,
    ...updates,
    join: { ...current.join, ...(updates.join || {}) },
    tenure: { ...current.tenure, ...(updates.tenure || {}) },
  };

  setGuildConfig(guildId, { autoRoles: next });
  return next;
}

function isJoinApplied(ar, memberId) {
  const applied = ar?.join?.applied;
  if (!applied || typeof applied !== "object") return false;
  return Boolean(applied[memberId]);
}

function markJoinApplied(guildId, memberId) {
  const cfg = getGuildConfig(guildId);
  const ar = ensureAutoRoles(cfg);

  if (!ar.join.applied || typeof ar.join.applied !== "object") ar.join.applied = {};
  ar.join.applied[memberId] = Date.now();

  const keys = Object.keys(ar.join.applied);
  if (keys.length > 5000) {
    const entries = keys
      .map((k) => [k, Number(ar.join.applied[k]) || 0])
      .sort((a, b) => a[1] - b[1]);

    const removeCount = Math.min(1000, entries.length);
    for (let i = 0; i < removeCount; i++) {
      delete ar.join.applied[entries[i][0]];
    }
  }

  setGuildConfig(guildId, { autoRoles: ar });
}

function botCanManageRole(guild, role) {
  const me = guild.members.me;
  if (!me) return false;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return false;
  return me.roles.highest.position > role.position;
}

function memberCanManageRole(member, role) {
  if (!member?.permissions?.has) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return false;
  return member.roles.highest.position > role.position;
}

async function safeAddRole(member, roleId, reason) {
  const role = member.guild.roles.cache.get(roleId);
  if (!role) return { ok: false, error: "Role not found" };

  if (!botCanManageRole(member.guild, role)) {
    return { ok: false, error: "Bot cannot manage that role (hierarchy/permission)" };
  }

  if (member.roles.cache.has(roleId)) {
    return { ok: true, already: true };
  }

  try {
    await member.roles.add(roleId, reason);
    return { ok: true, added: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function safeRemoveRole(member, roleId, reason) {
  const role = member.guild.roles.cache.get(roleId);
  if (!role) return { ok: false, error: "Role not found" };

  if (!botCanManageRole(member.guild, role)) {
    return { ok: false, error: "Bot cannot manage that role (hierarchy/permission)" };
  }

  if (!member.roles.cache.has(roleId)) {
    return { ok: true, already: true };
  }

  try {
    await member.roles.remove(roleId, reason);
    return { ok: true, removed: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function maybeApplyJoinRole(client, member) {
  const cfg = getGuildConfig(member.guild.id);
  const ar = ensureAutoRoles(cfg);
  if (!ar.join.enabled) return { ok: true, skipped: "disabled" };
  if (!ar.join.roleId) return { ok: true, skipped: "no-role-set" };

  if (isJoinApplied(ar, member.id)) {
    return { ok: true, skipped: "already-applied" };
  }

  const roleId = ar.join.roleId;
  const delayMs = ar.join.delayMs || 0;

  const joinedAt = member.joinedTimestamp || member.joinedAt?.getTime() || 0;
  const dueAt = joinedAt + delayMs;

  if (delayMs > 0 && Date.now() < dueAt) {
    return { ok: true, pending: true, dueAt };
  }

  const res = await safeAddRole(member, roleId, "Auto role on join");
  if (!res.ok) return res;

  if (res.added || res.already) {
    markJoinApplied(member.guild.id, member.id);
  }

  if (res.added) {
    const embed = baseEmbed("Auto Role Assigned")
      .setDescription(`**Member:** ${member.user.tag} (ID: ${member.id})\n**Role:** <@&${roleId}>`)
      .setThumbnail(member.guild.iconURL({ size: 128 }));

    await sendToGuildLog(client, member.guild.id, { embeds: [embed] });
  }

  return res;
}

async function runJoinRoleSweep(client, guild) {
  const cfg = getGuildConfig(guild.id);
  const ar = ensureAutoRoles(cfg);
  if (!ar.join.enabled) return { ok: true, skipped: "disabled" };
  if (!ar.join.roleId) return { ok: true, skipped: "no-role-set" };

  const delayMs = ar.join.delayMs || 0;
  if (delayMs <= 0) return { ok: true, skipped: "no-delay" };

  try {
    await guild.members.fetch();
  } catch {
    return { ok: false, error: "Could not fetch members (missing intent/permissions?)" };
  }

  const roleId = ar.join.roleId;
  let applied = 0;

  const now = Date.now();
  for (const [, member] of guild.members.cache) {
    if (member.user?.bot) continue;

    if (isJoinApplied(ar, member.id)) continue;

    if (member.roles.cache.has(roleId)) {
      markJoinApplied(guild.id, member.id);
      continue;
    }

    const joinedAt = member.joinedTimestamp || 0;
    if (!joinedAt) continue;

    if (now >= joinedAt + delayMs) {
      const res = await safeAddRole(member, roleId, "Auto role on join (catch-up)");
      if (res.ok && (res.added || res.already)) {
        markJoinApplied(guild.id, member.id);
      }
      if (res.ok && res.added) applied++;
    }
  }

  return { ok: true, applied };
}

async function runTenureSweep(client, guild) {
  const cfg = getGuildConfig(guild.id);
  const ar = ensureAutoRoles(cfg);
  if (!ar.tenure.enabled) return { ok: true, skipped: "disabled" };

  const rules = ar.tenure.rules
    .filter((r) => Number(r?.days) > 0 && r?.addRoleId)
    .sort((a, b) => Number(a.days) - Number(b.days));

  if (!rules.length) return { ok: true, skipped: "no-rules" };

  try {
    await guild.members.fetch();
  } catch {
    return { ok: false, error: "Could not fetch members (missing intent/permissions?)" };
  }

  let promoted = 0;
  const now = Date.now();

  for (const [, member] of guild.members.cache) {
    if (!member?.joinedTimestamp) continue;
    if (member.user?.bot) continue;

    const ageMs = now - member.joinedTimestamp;

    for (const rule of rules) {
      const requiredMs = Number(rule.days) * 24 * 60 * 60 * 1000;
      if (ageMs < requiredMs) continue;

      const addRes = await safeAddRole(
        member,
        rule.addRoleId,
        `Tenure auto role: ${rule.days} day(s)`
      );
      if (addRes.ok && addRes.added) promoted++;

      if (rule.removeRoleId) {
        await safeRemoveRole(
          member,
          rule.removeRoleId,
          `Tenure auto role: remove after ${rule.days} day(s)`
        );
      }
    }
  }

  setAutoRolesConfig(guild.id, { tenure: { lastRunTs: Date.now() } });

  if (promoted > 0) {
    const embed = baseEmbed("Tenure Roles Updated")
      .setDescription(`Applied tenure rules.\n**Promotions added:** ${promoted}`)
      .setThumbnail(guild.iconURL({ size: 128 }));
    await sendToGuildLog(client, guild.id, { embeds: [embed] });
  }

  return { ok: true, promoted };
}

function startAutoRoleScheduler(
  client,
  { tenureEveryMs = 60 * 60 * 1000, joinCatchupEveryMs = 30 * 60 * 1000 } = {}
) {
  if (client.__autoRoleSchedulerStarted) return;
  client.__autoRoleSchedulerStarted = true;

  setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
      try {
        await runTenureSweep(client, guild);
      } catch (e) {
        console.error("❌ Tenure sweep error:", guild.id, e);
      }
    }
  }, tenureEveryMs);

  setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
      try {
        await runJoinRoleSweep(client, guild);
      } catch (e) {
        console.error("❌ Join role sweep error:", guild.id, e);
      }
    }
  }, joinCatchupEveryMs);
}

module.exports = {
  ensureAutoRoles,
  setAutoRolesConfig,
  botCanManageRole,
  memberCanManageRole,
  maybeApplyJoinRole,
  runJoinRoleSweep,
  runTenureSweep,
  startAutoRoleScheduler,
};
