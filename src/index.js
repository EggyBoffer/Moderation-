require("dotenv").config();

const path = require("node:path");
const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const { loadCommands } = require("./handlers/commandLoader");
const { loadEvents } = require("./handlers/eventloader");

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("❌ DISCORD_TOKEN missing. Put it in Railway Variables.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, 
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,      
    Partials.GuildMember,
    Partials.User,
  ],
});

client.commands = new Collection();
const commandsDir = path.join(__dirname, "commands");
const loadedCommands = loadCommands(commandsDir);
for (const [name, cmd] of loadedCommands.entries()) client.commands.set(name, cmd);

const eventsDir = path.join(__dirname, "events");
const loadedEventNames = loadEvents(client, eventsDir);
console.log(`🧩 Registered events: ${loadedEventNames.join(", ") || "(none)"}`);

client.login(token);
