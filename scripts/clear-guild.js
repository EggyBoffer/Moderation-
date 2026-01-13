require("dotenv").config();
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("❌ Missing env vars. Need DISCORD_TOKEN, CLIENT_ID, GUILD_ID");
  process.exit(1);
}

const confirm = String(process.env.CONFIRM_CLEAR_GUILD || "").toLowerCase().trim();
if (confirm !== "true") {
  console.error('❌ Refusing to clear GUILD commands. Set CONFIRM_CLEAR_GUILD=true to proceed.');
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(`🧨 Clearing ALL guild commands for guild ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    console.log("✅ Guild commands cleared.");
  } catch (error) {
    console.error("❌ Failed to clear guild commands:", error);
    process.exitCode = 1;
  }
})();
