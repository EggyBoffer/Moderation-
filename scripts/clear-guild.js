require("dotenv").config();
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID || process.env.SUPPORT_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("❌ Missing env vars. Need DISCORD_TOKEN, CLIENT_ID, and GUILD_ID (or SUPPORT_GUILD_ID)");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(`🧹 Clearing guild commands from ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    console.log("✅ Guild commands cleared.");
  } catch (error) {
    console.error("❌ Failed to clear guild commands:", error);
    process.exitCode = 1;
  }
})();
