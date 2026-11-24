// Data for the resources page (/viewer without parameters): the topics of the
// library category as Instagram-style posts. Pure functions only, so they run
// under node --test; the page itself is cad-resources.js.

export const MODEL_FORMATS = ["STEP", "STP", "IGES", "IGS", "GLB", "GLTF", "STL", "OBJ"];
export const DRAWING_FORMATS = ["DXF", "DWG"];
export const TABS = ["all", "share", "download", "other"];

// Tags that put a topic in a tab on purpose; other topics are sorted by what
// they contain (see resourceKind).
const SHARE_TAGS = ["分享", "作品", "作品分享", "share", "showcase"];
const DOWNLOAD_TAGS = ["下载", "资源下载", "图纸", "模型", "download", "files"];

export function normalizeFormat(value) {
  const format = String(value || "").trim().replace(/^\./, "").toUpperCase();
  return /^[A-Z0-9]{2,5}$/.test(format) ? format : "";
}

export function tagName(tag) {
  return String(typeof tag === "string" ? tag : tag?.name || "").trim();
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

// One topic from a topic list as a resource tile.
export function topicToResource(topic, users, models = new Map()) {
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

// The model list (/moaclab-cad/drawings.json) usually arrives after the
// topics: fill in format, preview and image without reordering anything.
export function applyModels(items, models) {
  if (!models?.size) { return items; }
  return items.map((item) => {
    const model = models.get(item.id);
    if (!model) { return item; }
    return {
      ...item,
      format: normalizeFormat(model.format) || item.format,
      previewUrl: model.preview_url || item.previewUrl,
      image: item.image || model.image_url || "",
    };
  });
}

// share | download | other. A "分享" / "下载" style tag decides; without one,
// a topic with a model or drawing file is a download, one with only a
// picture is a share, anything else is other.
export function resourceKind(item) {
  const tags = item.tags.map((tag) => tag.toLowerCase());
  if (tags.some((tag) => DOWNLOAD_TAGS.includes(tag))) { return "download"; }
  if (tags.some((tag) => SHARE_TAGS.includes(tag))) { return "share"; }
  if (item.format) { return "download"; }
  if (item.image) { return "share"; }
  return "other";
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

// The tiles of a tab: pinned topics first, then list order.
export function filterResources(items, { tab = "all" } = {}) {
  const out = tab === "all" ? items : items.filter((item) => resourceKind(item) === tab);
  return [...out].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
}

// The tab is kept in the URL (?tab=), so back and reload return to it.
export function readState(search) {
  const tab = new URLSearchParams(search).get("tab");
  return { tab: TABS.includes(tab) ? tab : "all" };
}

export function writeState(state) {
  return state.tab && state.tab !== "all" ? `?${new URLSearchParams({ tab: state.tab })}` : "";
}

// Soft background for a tile without an image, stable per topic.
const TEXT_TILE_COLORS = ["#fff4d6", "#e8f6ee", "#eef3ff", "#f3eefe", "#fde8ec", "#e6f4f7"];
export function textTileColor(id) {
  return TEXT_TILE_COLORS[Math.abs(Number(id) || 0) % TEXT_TILE_COLORS.length];
}
