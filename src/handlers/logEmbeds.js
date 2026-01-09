const { EmbedBuilder } = require("discord.js");

function baseEmbed(title) {
  return new EmbedBuilder()
    .setTitle(title)
    .setTimestamp(new Date());
}

function setActor(embed, actor) {
  if (!actor) return embed;
  embed.setAuthor({
    name: `${actor.tag} (${actor.id})`,
    iconURL: actor.displayAvatarURL?.({ size: 64 }) ?? undefined,
  });
  return embed;
}

module.exports = { baseEmbed, setActor };
