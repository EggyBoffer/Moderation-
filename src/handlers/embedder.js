const { EmbedBuilder } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

function unescapeNewlines(input) {
  // Turns "\n" into an actual newline for slash-command text fields
  if (input === null || input === undefined) return input;
  return String(input).replace(/\\n/g, "\n");
}

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

  // Apply newline unescape on all text fields
  title = title ? unescapeNewlines(title) : title;
  description = description ? unescapeNewlines(description) : description;
  footer = footer ? unescapeNewlines(footer) : footer;

  if (title) e.setTitle(String(title).slice(0, 256));
  if (description) e.setDescription(String(description).slice(0, 4000));

  const c = parseHexColor(color);
  if (c !== null) e.setColor(c);

  if (url) e.setURL(String(url).slice(0, 2048));

  if (authorName) {
    const author = { name: String(unescapeNewlines(authorName)).slice(0, 256) };
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

  const name = parts[0] ? unescapeNewlines(parts[0]).slice(0, 256) : null;
  const value = parts[1] ? unescapeNewlines(parts[1]).slice(0, 1024) : null;
  const inline = parts[2] ? /^true|yes|1$/i.test(parts[2]) : false;

  if (!name || !value) return null;
  return { name, value, inline };
}

function makeAllowedMentions({ pingMode, roleId } = {}) {
  const mode = String(pingMode || "none").toLowerCase();

  if (mode === "everyone") {
    return { parse: ["everyone"] };
  }

  if (mode === "role") {
    return { parse: [], roles: roleId ? [roleId] : [] };
  }

  if (mode === "user") {
    return { parse: ["users"] };
  }

  return { parse: [] };
}

/* =========================
   Templates (per guild)
   Stored in guild config:
     embedTemplates: { [nameLower]: { name, payload } }
   ========================= */

function ensureTemplates(cfg) {
  if (!cfg.embedTemplates || typeof cfg.embedTemplates !== "object") {
    cfg.embedTemplates = {};
  }
  return cfg.embedTemplates;
}

function normalizeTemplateName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 32);
}

function listTemplates(guildId) {
  const cfg = getGuildConfig(guildId);
  const templates = ensureTemplates(cfg);
  return Object.values(templates)
    .map((t) => t.name)
    .sort((a, b) => a.localeCompare(b));
}

function getTemplate(guildId, name) {
  const key = normalizeTemplateName(name);
  const cfg = getGuildConfig(guildId);
  const templates = ensureTemplates(cfg);
  return templates[key] || null;
}

function saveTemplate(guildId, name, payload) {
  const key = normalizeTemplateName(name);
  if (!key) return { ok: false, error: "Template name is invalid." };

  const cfg = getGuildConfig(guildId);
  const templates = ensureTemplates(cfg);

  templates[key] = {
    name: key,
    payload,
    updatedAt: Date.now(),
  };

  setGuildConfig(guildId, { embedTemplates: templates });
  return { ok: true, name: key };
}

function deleteTemplate(guildId, name) {
  const key = normalizeTemplateName(name);
  const cfg = getGuildConfig(guildId);
  const templates = ensureTemplates(cfg);

  const existed = Boolean(templates[key]);
  if (existed) {
    delete templates[key];
    setGuildConfig(guildId, { embedTemplates: templates });
  }

  return existed;
}

module.exports = {
  buildEmbed,
  splitFieldString,
  parseHexColor,
  makeAllowedMentions,
  unescapeNewlines,

  // templates
  normalizeTemplateName,
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
};
