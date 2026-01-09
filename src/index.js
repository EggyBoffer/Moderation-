require("dotenv").config();

const path = require("node:path");
const { Client, Collection, Events, GatewayIntentBits } = require("discord.js");
const { loadCommands } = require("./handlers/commandLoader");

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("❌ DISCORD_TOKEN missing. Put it in your .env (local) or Railway Variables.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // We'll enable more later when we add logging/mod stuff:
    // GatewayIntentBits.GuildMembers,
    // GatewayIntentBits.GuildMessages,
    // GatewayIntentBits.MessageContent,
  ],
});

// Load commands into a Discord Collection for easy lookup
client.commands = new Collection();
const commandsDir = path.join(__dirname, "commands");
const loaded = loadCommands(commandsDir);

for (const [name, cmd] of loaded.entries()) {
  client.commands.set(name, cmd);
}

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`📦 Loaded commands: ${[...client.commands.keys()].join(", ") || "(none)"}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    // This can happen if commands are registered but code isn't updated yet
    console.warn(`⚠️ No handler found for command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`❌ Error running /${interaction.commandName}:`, err);

    const msg = "Something went wrong running that command.";
    // Try reply; if already replied, try followUp
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.Error, (err) => {
  console.error("❌ Discord client error:", err);
});

client.login(token);
