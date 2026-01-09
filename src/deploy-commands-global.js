require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error("❌ Missing env vars. Check .env has DISCORD_TOKEN, CLIENT_ID");
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if (!command?.data?.toJSON) {
    console.warn(`⚠️ Skipping ${file}: command.data.toJSON() missing`);
    continue;
  }

  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(`🌍 Registering ${commands.length} global command(s)...`);
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("✅ Global slash commands registered. (May take a bit to show everywhere.)");
  } catch (error) {
    console.error("❌ Failed to register global commands:", error);
    process.exitCode = 1;
  }
})();
