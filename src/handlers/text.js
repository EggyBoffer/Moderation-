function clip(str, max = 900) {
  const s = String(str ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

module.exports = { clip };
