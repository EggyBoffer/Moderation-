const { Events, AuditLogEvent, EmbedBuilder } = require("discord.js");

module.exports = {
  name: Events.GuildCreate,
  async execute(client, guild) {
    
    await new Promise((r) => setTimeout(r, 1500));

    let inviter = null;

    try {
      if (guild.members.me.permissions.has("ViewAuditLog")) {
        const logs = await guild.fetchAuditLogs({
          type: AuditLogEvent.BotAdd,
          limit: 5,
        });

        const entry = logs.entries.find(
          (e) => e.target?.id === client.user.id
        );

        if (entry) inviter = entry.executor;
      }
    } catch {
      
    }

    if (!inviter) return;

    const embed = new EmbedBuilder()
      .setTitle("👋 Thanks for adding Moderation+!")
      .setColor(0x5865f2)
      .setDescription(
        [
          `Hi **${inviter.username}**!`,
          "",
          "Thanks for adding **Moderation+** to your server.",
          "The goal is simple: replace multiple moderation bots with **one clean, configurable system**.",
          "",
          "**Getting started:**",
          "• `/help` — view available commands",
          "• `/welcome set` — configure join messages",
          "• `/statcounts setup` — member count channels",
          "• `/rolepanel create` — button-based role menus",
          "• `/starboard enable` — highlight great messages",
          "",
          "All features are **opt-in** and configurable per server, so you can enable only what you need.",
          "",
          "If you run into any issues or have questions, you can reach the maintainer on Discord:",
          "**`death_killer21`**",
        ].join("\n")
      )
      .setFooter({
        text: "Moderation+ • One bot. All your moderation.",
      });

    try {
      await inviter.send({ embeds: [embed] });
    } catch {
      
    }
  },
};
