require("dotenv").config();
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error("❌ Missing env vars. Need DISCORD_TOKEN and CLIENT_ID");
  process.exit(1);
}

const confirm = String(process.env.CONFIRM_CLEAR_GLOBAL || "").toLowerCase().trim();
if (confirm !== "true") {
  console.error('❌ Refusing to clear GLOBAL commands. Set CONFIRM_CLEAR_GLOBAL=true to proceed.');
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("🧨 Clearing ALL global commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log("✅ Global commands cleared.");
  } catch (error) {
    console.error("❌ Failed to clear global commands:", error);
    process.exitCode = 1;
  }
})();
