const fs = require("node:fs");
const path = require("node:path");

/**
 * Loads command modules from src/commands and returns a Collection-friendly Map.
 * Each command must export: { data, execute }
 */
function loadCommands(commandsDirPath) {
  const commands = new Map();

  if (!fs.existsSync(commandsDirPath)) {
    throw new Error(`Commands folder not found: ${commandsDirPath}`);
  }

  const commandFiles = fs
    .readdirSync(commandsDirPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsDirPath, file);
    const command = require(filePath);

    if (!command?.data?.name || typeof command.execute !== "function") {
      console.warn(
        `⚠️ Skipping invalid command file: ${file} (needs { data, execute })`
      );
      continue;
    }

    commands.set(command.data.name, command);
  }

  return commands;
}

module.exports = { loadCommands };
