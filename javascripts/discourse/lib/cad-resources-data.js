// Data for the resources page (/viewer without parameters): the topics of the
// library category as Instagram-style posts. Pure functions only, so they run
// under node --test; the page itself is cad-resources.js.

export const MODEL_FORMATS = ["STEP", "STP", "IGES", "IGS", "GLB", "GLTF", "STL", "OBJ"];
export const DRAWING_FORMATS = ["DXF", "DWG"];
export const TABS = ["all", "model", "drawing", "saved"];
export const SORTS = ["latest", "likes", "replies", "views"];

export function normalizeFormat(value) {
  const format = String(value || "").trim().replace(/^\./, "").toUpperCase();
  return /^[A-Z0-9]{2,5}$/.test(format) ? format : "";
}

export function tagName(tag) {
  return String(typeof tag === "string" ? tag : tag?.name || "").trim();
}

// One topic from a topic list as a resource tile.
export function topicToResource(topic, users, models) {
  const model = models.get(topic.id);
  const poster = users.get(topic.posters?.[0]?.user_id);
  return {
    id: topic.id,
    title: topic.fancy_title ? decodeEntities(topic.fancy_title) : String(topic.title || ""),
    url: `/t/${topic.slug || "topic"}/${topic.id}`,
    image: topic.image_url || model?.image_url || "",
    username: poster?.username || "",
    avatar: avatarUrl(poster?.avatar_template, 48),
    pinned: Boolean(topic.pinned || topic.pinned_globally),
    likes: Number(topic.like_count) || 0,
    replies: Math.max(0, (Number(topic.posts_count) || 1) - 1),
    views: Number(topic.views) || 0,
    format: normalizeFormat(model?.format),
    previewUrl: model?.preview_url || "",
    tags: (topic.tags || []).map(tagName).filter(Boolean),
    order: 0,
  };
}

export function avatarUrl(template, size) {
  const value = String(template || "");
  return value ? value.replace("{size}", String(size)) : "";
}

function decodeEntities(text) {
  return String(text)
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Every page of a category topic list merged: resources in list order, the
// category's about topic left out, each topic once.
export function listsToResources(pages, { aboutTopicId, categoryId, models }) {
  const users = new Map();
  const seen = new Set();
  const out = [];
  for (const data of pages) {
    for (const user of data.users || []) { users.set(user.id, user); }
    for (const topic of data.topic_list?.topics || []) {
      if (seen.has(topic.id) || topic.id === aboutTopicId) { continue; }
      if (categoryId && topic.category_id !== categoryId) { continue; }
      seen.add(topic.id);
      out.push(topicToResource(topic, users, models));
    }
  }
  out.forEach((item, index) => { item.order = index; });
  return out;
}

// Header numbers: resources, distinct formats, distinct authors.
export function resourceStats(items) {
  return {
    resources: items.length,
    formats: new Set(items.map((item) => item.format).filter(Boolean)).size,
    contributors: new Set(items.map((item) => item.username).filter(Boolean)).size,
  };
}

// Authors with the most resources first, for the "contributors include" row.
export function resourceContributors(items) {
  const byName = new Map();
  for (const item of items) {
    if (!item.username) { continue; }
    const entry = byName.get(item.username) || { username: item.username, avatar: item.avatar, count: 0 };
    entry.count += 1;
    byName.set(item.username, entry);
  }
  return [...byName.values()].sort((a, b) => b.count - a.count || a.username.localeCompare(b.username));
}

// Highlight circles: formats first (most used), then the most used tags.
export function resourceHighlights(items, max = 8) {
  const count = (values) => {
    const counts = new Map();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const formats = count(items.map((item) => item.format).filter(Boolean))
    .map(([value]) => ({ key: `fmt:${value}`, label: value, kind: "format" }));
  const tags = count(items.flatMap((item) => item.tags))
    .map(([value]) => ({ key: `tag:${value}`, label: value, kind: "tag" }));
  return [...formats, ...tags].slice(0, max);
}

// The visible tiles for a tab, highlight filter, search result and sort.
export function filterResources(items, { tab = "all", filter = "", searchIds = null, savedIds = null, sort = "latest" } = {}) {
  let out = items;
  if (tab === "model") { out = out.filter((item) => MODEL_FORMATS.includes(item.format)); }
  if (tab === "drawing") { out = out.filter((item) => DRAWING_FORMATS.includes(item.format)); }
  if (tab === "saved") { out = savedIds ? out.filter((item) => savedIds.has(item.id)) : []; }
  if (filter.startsWith("fmt:")) { out = out.filter((item) => item.format === filter.slice(4)); }
  if (filter.startsWith("tag:")) { out = out.filter((item) => item.tags.includes(filter.slice(4))); }
  if (searchIds) {
    const rank = new Map(searchIds.map((id, index) => [id, index]));
    out = out.filter((item) => rank.has(item.id));
    if (sort === "latest") { return out.sort((a, b) => rank.get(a.id) - rank.get(b.id)); }
  }
  const key = { likes: "likes", replies: "replies", views: "views" }[sort];
  const pinFirst = (a, b) => (sort === "latest" ? Number(b.pinned) - Number(a.pinned) : 0);
  return [...out].sort((a, b) => pinFirst(a, b) || (key ? b[key] - a[key] : 0) || a.order - b.order);
}

// Page state kept in the URL (?tab=&f=&q=&sort=), so back and reload return
// to the same view. Unknown values fall back to the defaults.
export function readState(search) {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  const sort = params.get("sort");
  const filter = params.get("f") || "";
  return {
    tab: TABS.includes(tab) ? tab : "all",
    sort: SORTS.includes(sort) ? sort : "latest",
    filter: /^(fmt|tag):.{1,60}$/.test(filter) ? filter : "",
    query: (params.get("q") || "").slice(0, 200),
  };
}

export function writeState(state) {
  const params = new URLSearchParams();
  if (state.tab !== "all") { params.set("tab", state.tab); }
  if (state.filter) { params.set("f", state.filter); }
  if (state.query) { params.set("q", state.query); }
  if (state.sort !== "latest") { params.set("sort", state.sort); }
  const text = params.toString();
  return text ? `?${text}` : "";
}

// Soft background for a tile without an image, stable per topic.
const TEXT_TILE_COLORS = ["#fff4d6", "#e8f6ee", "#eef3ff", "#f3eefe", "#fde8ec", "#e6f4f7"];
export function textTileColor(id) {
  return TEXT_TILE_COLORS[Math.abs(Number(id) || 0) % TEXT_TILE_COLORS.length];
}
