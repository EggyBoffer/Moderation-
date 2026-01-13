require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error("❌ Missing env vars. Need DISCORD_TOKEN and CLIENT_ID");
  process.exit(1);
}

const commandsDir = path.join(__dirname, "..", "src", "commands");
if (!fs.existsSync(commandsDir)) {
  console.error(`❌ Commands directory not found: ${commandsDir}`);
  process.exit(1);
}

const commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"));

const commands = [];
const seen = new Map();

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

  const json = cmd.data.toJSON();
  const name = json?.name;

  if (!name) {
    console.warn(`⚠️ Skipping ${file}: command has no name`);
    continue;
  }

  const idx = commands.length;
  commands.push(json);

  if (!seen.has(name)) seen.set(name, []);
  seen.get(name).push({ file, index: idx });
}

const duplicates = [...seen.entries()].filter(([, arr]) => arr.length > 1);
if (duplicates.length) {
  console.error("❌ Duplicate command names detected (global commands must be unique):");
  for (const [name, arr] of duplicates) {
    console.error(`  - "${name}" -> ${arr.map((x) => `${x.file} (index ${x.index})`).join(", ")}`);
  }
  process.exit(1);
}

if (commands.length === 0) {
  console.error("❌ Refusing to deploy 0 commands (this would wipe all global commands).");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(`🌍 Registering ${commands.length} global command(s)...`);
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("✅ Global slash commands registered. (Discord may take time to propagate.)");
  } catch (error) {
    console.error("❌ Failed to register global commands:", error);
    process.exitCode = 1;
  }
})();
