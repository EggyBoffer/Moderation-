require("dotenv").config();
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error("❌ Missing env vars. Need DISCORD_TOKEN and CLIENT_ID");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    const cmds = await rest.get(Routes.applicationCommands(clientId));
    console.log(`✅ Global commands for CLIENT_ID=${clientId}: ${cmds.length}`);
    for (const c of cmds) console.log(`/${c.name}`);
  } catch (e) {
    console.error("❌ Failed to fetch global commands:", e);
    process.exitCode = 1;
  }
})();
