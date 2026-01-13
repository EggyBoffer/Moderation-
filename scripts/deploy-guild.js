require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID || process.env.SUPPORT_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("❌ Missing env vars. Need DISCORD_TOKEN, CLIENT_ID, and GUILD_ID (or SUPPORT_GUILD_ID)");
  process.exit(1);
}

const commandsDir = path.join(__dirname, "..", "src", "commands");
const commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"));

const commands = [];

for (const file of commandFiles) {
  const filePath = path.join(commandsDir, file);
  delete require.cache[require.resolve(filePath)];

  let command;
  try {
    command = require(filePath);
  } catch (err) {
    console.warn(`⚠️ Skipping ${file}: failed to require (${err?.message || err})`);
    continue;
  }

  if (!command?.data?.toJSON) {
    console.warn(`⚠️ Skipping ${file}: command.data.toJSON() missing`);
    continue;
  }

  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(`🔁 Registering ${commands.length} command(s) to guild ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log("✅ Guild slash commands registered.");
  } catch (error) {
    console.error("❌ Failed to register guild commands:", error);
    process.exitCode = 1;
  }
})();
