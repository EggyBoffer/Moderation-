const { Events } = require("discord.js");
const { getGuildConfig } = require("../storage/guildConfig");
const { ensureAutoRoles, maybeApplyJoinRole } = require("../handlers/autoRoles");

// Cap per-member timers so we don't leave huge timeouts hanging around.
// Longer delays are handled by the catch-up sweep.
const MAX_TIMER_MS = 6 * 60 * 60 * 1000; // 6 hours

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(client, member) {
    try {
      const cfg = getGuildConfig(member.guild.id);
      const ar = ensureAutoRoles(cfg);

      if (!ar.join.enabled || !ar.join.roleId) return;

      const delayMs = ar.join.delayMs || 0;

      // Immediate? Apply now.
      if (delayMs <= 0) {
        await maybeApplyJoinRole(client, member);
        return;
      }

      // For small/medium delays, schedule a timer so "30s" actually means 30s.
      if (delayMs <= MAX_TIMER_MS) {
        // optional: track timers per guild so we can avoid duplicates if needed
        if (!client.__autoRoleTimers) client.__autoRoleTimers = new Map();

        const key = `${member.guild.id}:${member.id}`;
        // clear any existing timer for this member (rare, but safe)
        const existing = client.__autoRoleTimers.get(key);
        if (existing) clearTimeout(existing);

        const t = setTimeout(async () => {
          try {
            // refetch member in case cache is stale
            const fresh = await member.guild.members.fetch(member.id).catch(() => null);
            if (!fresh) return;
            await maybeApplyJoinRole(client, fresh);
          } catch (e) {
            console.error("❌ Auto-role delayed apply error:", e);
          } finally {
            client.__autoRoleTimers.delete(key);
          }
        }, delayMs);

        client.__autoRoleTimers.set(key, t);
        return;
      }

      // For very long delays, do nothing here; sweep will catch up.
    } catch (err) {
      console.error("❌ GuildMemberAdd auto-role error:", err);
    }
  },
};
