const fs = require("node:fs");
const path = require("node:path");

/**
 * Supports:
 * 1) Normal event files: { name, once?, execute(client, ...args) }
 * 2) Module files: { register(client) }  // attaches multiple listeners internally
 */
function loadEvents(client, eventsDirPath) {
  if (!fs.existsSync(eventsDirPath)) {
    throw new Error(`Events folder not found: ${eventsDirPath}`);
  }

  const eventFiles = fs.readdirSync(eventsDirPath).filter((f) => f.endsWith(".js"));
  const loaded = [];

  for (const file of eventFiles) {
    const filePath = path.join(eventsDirPath, file);
    const mod = require(filePath);

    // Module pattern: mod.register(client)
    if (typeof mod.register === "function") {
      mod.register(client);
      loaded.push(file.replace(".js", ""));
      continue;
    }

    // Normal event pattern
    if (!mod?.name || typeof mod.execute !== "function") {
      console.warn(`⚠️ Skipping invalid event file: ${file}`);
      continue;
    }

    if (mod.once) {
      client.once(mod.name, (...args) => mod.execute(client, ...args));
    } else {
      client.on(mod.name, (...args) => mod.execute(client, ...args));
    }

    loaded.push(file.replace(".js", ""));
  }

  return loaded;
}

module.exports = { loadEvents };
