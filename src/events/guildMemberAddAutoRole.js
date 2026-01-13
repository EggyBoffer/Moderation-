const { Events } = require("discord.js");
const { getGuildConfig } = require("../storage/guildConfig");
const { ensureAutoRoles, maybeApplyJoinRole } = require("../handlers/autoRoles");

const MAX_TIMER_MS = 6 * 60 * 60 * 1000; 

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(client, member) {
    try {
      const cfg = getGuildConfig(member.guild.id);
      const ar = ensureAutoRoles(cfg);

      if (!ar.join.enabled || !ar.join.roleId) return;

      const delayMs = ar.join.delayMs || 0;

      
      if (delayMs <= 0) {
        await maybeApplyJoinRole(client, member);
        return;
      }

      
      if (delayMs <= MAX_TIMER_MS) {
        
        if (!client.__autoRoleTimers) client.__autoRoleTimers = new Map();

        const key = `${member.guild.id}:${member.id}`;
        
        const existing = client.__autoRoleTimers.get(key);
        if (existing) clearTimeout(existing);

        const t = setTimeout(async () => {
          try {
            
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

      
    } catch (err) {
      console.error("❌ GuildMemberAdd auto-role error:", err);
    }
  },
};
