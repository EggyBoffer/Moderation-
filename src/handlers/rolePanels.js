const { getGuildConfig, setGuildConfig } = require("../storage/guildConfig");

function normalizeNewlines(s) {
  // Slash command options send literal "\n", so convert to actual newline
  return String(s ?? "").replaceAll("\\n", "\n");
}

function getPanels(guildId) {
  const cfg = getGuildConfig(guildId);
  if (!cfg.rolePanels || typeof cfg.rolePanels !== "object") return {};
  return cfg.rolePanels;
}

function savePanels(guildId, panels) {
  setGuildConfig(guildId, { rolePanels: panels });
}

function getPanel(guildId, messageId) {
  const panels = getPanels(guildId);
  return panels[messageId] || null;
}

function upsertPanel(guildId, messageId, panel) {
  const panels = getPanels(guildId);
  panels[messageId] = panel;
  savePanels(guildId, panels);
  return panels[messageId];
}

function deletePanel(guildId, messageId) {
  const panels = getPanels(guildId);
  if (!panels[messageId]) return false;
  delete panels[messageId];
  savePanels(guildId, panels);
  return true;
}

function listPanels(guildId) {
  const panels = getPanels(guildId);
  return Object.entries(panels).map(([messageId, p]) => ({
    messageId,
    channelId: p.channelId,
    title: p.embed?.title || "",
    itemCount: Array.isArray(p.items) ? p.items.length : 0,
  }));
}

function setPanelEmbed(guildId, messageId, embedPatch) {
  const existing = getPanel(guildId, messageId);
  if (!existing) return null;

  existing.embed = existing.embed || {};
  for (const [k, v] of Object.entries(embedPatch || {})) {
    if (v === undefined) continue;
    existing.embed[k] = typeof v === "string" ? normalizeNewlines(v) : v;
  }

  return upsertPanel(guildId, messageId, existing);
}

function addPanelItem(guildId, messageId, item) {
  const existing = getPanel(guildId, messageId);
  if (!existing) return null;

  existing.items = Array.isArray(existing.items) ? existing.items : [];

  // Replace item for same roleId if it exists
  const idx = existing.items.findIndex((x) => x.roleId === item.roleId);
  if (idx >= 0) existing.items[idx] = item;
  else existing.items.push(item);

  return upsertPanel(guildId, messageId, existing);
}

function removePanelItem(guildId, messageId, roleId) {
  const existing = getPanel(guildId, messageId);
  if (!existing) return null;

  existing.items = Array.isArray(existing.items) ? existing.items : [];
  const before = existing.items.length;
  existing.items = existing.items.filter((x) => x.roleId !== roleId);

  if (existing.items.length === before) return { updated: existing, removed: false };
  return { updated: upsertPanel(guildId, messageId, existing), removed: true };
}

module.exports = {
  normalizeNewlines,
  getPanel,
  upsertPanel,
  deletePanel,
  listPanels,
  setPanelEmbed,
  addPanelItem,
  removePanelItem,
};
