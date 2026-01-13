require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("❌ Missing env vars. Need DISCORD_TOKEN, CLIENT_ID, GUILD_ID");
  process.exit(1);
}

const commandsDir = path.join(__dirname, "..", "src", "commands");
if (!fs.existsSync(commandsDir)) {
  console.error(`❌ Commands directory not found: ${commandsDir}`);
  process.exit(1);
}

const commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"));

const commands = [];
for (const file of commandFiles) {
  const filePath = path.join(commandsDir, file);

  try {
    delete require.cache[require.resolve(filePath)];
  } catch {}

  let cmd;
  try {
    cmd = require(filePath);
  } catch {
    console.warn(`⚠️ Skipping ${file}: failed to require`);
    continue;
  }

  if (!cmd?.data?.toJSON || typeof cmd.data.toJSON !== "function") {
    console.warn(`⚠️ Skipping invalid command file: ${file} (needs { data, execute })`);
    continue;
  }

  commands.push(cmd.data.toJSON());
}

if (commands.length === 0) {
  console.error("❌ Refusing to deploy 0 commands (this would wipe all guild commands).");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(`🏠 Registering ${commands.length} guild command(s) to guild ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log("✅ Guild slash commands registered.");
  } catch (error) {
    console.error("❌ Failed to register guild commands:", error);
    process.exitCode = 1;
  }
})();
