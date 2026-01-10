const { EmbedBuilder } = require("discord.js");

function parseHexColor(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;

  return parseInt(hex, 16);
}

function buildEmbed({
  title,
  description,
  color,
  url,
  authorName,
  authorIcon,
  authorUrl,
  thumbnail,
  image,
  footer,
  footerIcon,
  timestamp,
} = {}) {
  const e = new EmbedBuilder();

  if (title) e.setTitle(String(title).slice(0, 256));
  if (description) e.setDescription(String(description).slice(0, 4000));

  const c = parseHexColor(color);
  if (c !== null) e.setColor(c);

  if (url) e.setURL(String(url).slice(0, 2048));

  if (authorName) {
    const author = { name: String(authorName).slice(0, 256) };
    if (authorIcon) author.iconURL = String(authorIcon).slice(0, 2048);
    if (authorUrl) author.url = String(authorUrl).slice(0, 2048);
    e.setAuthor(author);
  }

  if (thumbnail) e.setThumbnail(String(thumbnail).slice(0, 2048));
  if (image) e.setImage(String(image).slice(0, 2048));

  if (footer) {
    const f = { text: String(footer).slice(0, 2048) };
    if (footerIcon) f.iconURL = String(footerIcon).slice(0, 2048);
    e.setFooter(f);
  }

  if (timestamp) e.setTimestamp(new Date());

  return e;
}

function splitFieldString(s) {
  // "Name | Value | true"
  const parts = String(s || "")
    .split("|")
    .map((p) => p.trim());

  const name = parts[0] ? parts[0].slice(0, 256) : null;
  const value = parts[1] ? parts[1].slice(0, 1024) : null;
  const inline = parts[2] ? /^true|yes|1$/i.test(parts[2]) : false;

  if (!name || !value) return null;
  return { name, value, inline };
}

function makeAllowedMentions({ pingMode, roleId } = {}) {
  // pingMode: "none" | "role" | "user" | "everyone"
  // We default to NONE (safe)
  const mode = String(pingMode || "none").toLowerCase();

  if (mode === "everyone") {
    return { parse: ["everyone"] };
  }

  if (mode === "role") {
    return { parse: [], roles: roleId ? [roleId] : [] };
  }

  if (mode === "user") {
    // We'll supply the user mention in content; allow only users.
    return { parse: ["users"] };
  }

  return { parse: [] };
}

module.exports = {
  buildEmbed,
  splitFieldString,
  parseHexColor,
  makeAllowedMentions,
};
