const fs = require("node:fs");
const path = require("node:path");

function loadEvents(client, eventsDirPath) {
  const eventFiles = fs.readdirSync(eventsDirPath).filter((f) => f.endsWith(".js"));
  const loaded = [];

  for (const file of eventFiles) {
    const filePath = path.join(eventsDirPath, file);
    const mod = require(filePath);

    // Special module: if name is not a Discord event, we still allow execute(client) to attach its own listeners.
    if (!mod?.name || typeof mod.execute !== "function") {
      console.warn(`⚠️ Skipping invalid event module: ${file}`);
      continue;
    }

    // If it's a normal discord.js event, register it.
    // If it's a "module" (like moderationLogs) it will attach listeners itself.
    const isDiscordEvent = typeof mod.name === "string" && mod.name.startsWith("discord.");

    if (isDiscordEvent) {
      if (mod.once) client.once(mod.name, (...args) => mod.execute(client, ...args));
      else client.on(mod.name, (...args) => mod.execute(client, ...args));
    } else {
      // Module pattern
      mod.execute(client);
    }

    loaded.push(file.replace(".js", ""));
  }

  return loaded;
}

module.exports = { loadEvents };
