
const fs = require("node:fs");
const path = require("node:path");
const { Client, GatewayIntentBits } = require("discord.js");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function getGuildCount(token) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds], 
  });

  await client.login(token);

  await new Promise((resolve) => client.once("ready", resolve));

  const count = client.guilds.cache.size;

  await client.destroy();
  return count;
}

async function main() {
  const token = requireEnv("DISCORD_TOKEN_BOT2");
  const guildCount = await getGuildCount(token);

  const outDir = path.join(process.cwd(), "badges");
  const outFile = path.join(outDir, "servers.json");

  fs.mkdirSync(outDir, { recursive: true });

  
  
  const payload = {
    schemaVersion: 1,
    label: "Servers",
    message: String(guildCount),
    color: "5865F2",
  };

  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`✅ Updated badges/servers.json -> ${guildCount} servers`);
}

main().catch((err) => {
  console.error("❌ Failed to update server badge:", err);
  process.exit(1);
});
