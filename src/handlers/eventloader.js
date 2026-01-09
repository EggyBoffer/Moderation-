const fs = require("node:fs");
const path = require("node:path");

function loadEvents(client, eventsDirPath) {
  if (!fs.existsSync(eventsDirPath)) {
    throw new Error(`Events folder not found: ${eventsDirPath}`);
  }

  const eventFiles = fs
    .readdirSync(eventsDirPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of eventFiles) {
    const filePath = path.join(eventsDirPath, file);
    const event = require(filePath);

    if (!event?.name || typeof event.execute !== "function") {
      console.warn(
        `⚠️ Skipping invalid event file: ${file} (needs { name, execute })`
      );
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(client, ...args));
    } else {
      client.on(event.name, (...args) => event.execute(client, ...args));
    }
  }

  return eventFiles.map((f) => f.replace(".js", ""));
}

module.exports = { loadEvents };
