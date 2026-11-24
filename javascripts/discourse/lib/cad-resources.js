// The resources page: /viewer without parameters shown as an Instagram
// profile of the library category (resources_page setting). It replaces the
// plugin's drawing list on screen (the list stays in the DOM, hidden by the
// body class) and reads only public Discourse JSON:
//   /c/<id>/show.json            name, description, about topic
//   /c/<slug>/<id>/l/latest.json  the topics, every page
//   /moaclab-cad/drawings.json    which topics carry a model, and its format
//   /search.json                  search, limited to the category
//   /u/<me>/bookmarks.json        the "saved" tab, signed-in users only
// Tiles link to the topic; a model tile also links to its 3D preview.
import { getJSON, loadModelTopics } from "./cad-library-source";
import { rememberPreview } from "./cad-library-navigation";
import {
  DRAWING_FORMATS, filterResources, listsToResources, readState, resourceHighlights,
  resourceStats, textTileColor, writeState,
} from "./cad-resources-data";

const BODY_CLASS = "mlcv-resources-on";
const LIST_PAGES = 10;
const CACHE_MS = 60 * 1000;
const SCROLL_KEY = "moaclab-cad-resources-scroll-v1";

const ICONS = {
  cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
  model: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/></svg>',
  drawing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 9h10M7 13h6"/></svg>',
  saved: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-5-6 5z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.5s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5.9-8 10.6-8 10.6z"/></svg>',
  reply: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 12a8 8 0 1 1 3.6 6.7L4 20l1.3-3.6A8 8 0 0 1 4 12z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="4"/><path d="M17 6.5 19 8l-2 1.6"/></svg>',
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) { continue; }
    if (key === "text") { node.textContent = value; }
    else if (key === "html") { node.innerHTML = value; } // only the static ICONS above
    else if (key.startsWith("on")) { node.addEventListener(key.slice(2), value); }
    else { node.setAttribute(key, value === true ? "" : String(value)); }
  }
  for (const child of [].concat(children)) { if (child) { node.append(child); } }
  return node;
}

const icon = (name, className = "mlcv-res__icon") => el("span", { class: className, html: ICONS[name] });

export default function installResourcePage(api, { t, categoryId, filePicker }) {
  let cache = null; // { at, promise }
  let searchCache = new Map();
  let savedIds = null;
  let root = null;
  let state = readState("");
  let data = null;
  let searchIds = null;
  let failed = false;
  let restoreScroll = true;

  const currentUser = () => { try { return api.getCurrentUser?.() || null; } catch { return null; } };

  function loadData() {
    if (cache && Date.now() - cache.at < CACHE_MS) { return cache.promise; }
    const promise = (async () => {
      const [show, models] = await Promise.all([
        getJSON(`/c/${categoryId}/show.json`),
        loadModelTopics().catch(() => new Map()),
      ]);
      const category = show.category || {};
      const slug = category.slug || "c";
      const pages = [];
      for (let page = 0; page < LIST_PAGES; page++) {
        const list = await getJSON(`/c/${slug}/${categoryId}/l/latest.json?page=${page}`);
        pages.push(list);
        if (!list.topic_list?.more_topics_url) { break; }
      }
      const aboutTopicId = Number(String(category.topic_url || "").split("/").pop()) || null;
      return {
        category: {
          name: category.name || t("resources", "Resources"),
          description: category.description_text || "",
          aboutUrl: category.topic_url || "",
          slug,
        },
        items: listsToResources(pages, { aboutTopicId, categoryId, models }),
      };
    })();
    cache = { at: Date.now(), promise };
    promise.catch(() => { cache = null; });
    return promise;
  }

  async function loadSearch(query) {
    if (!query) { return null; }
    if (!searchCache.has(query)) {
      const promise = getJSON(`/search.json?${new URLSearchParams({ q: `${query} category:${categoryId}` })}`)
        .then((result) => [...new Set((result.topics || []).map((topic) => topic.id))]);
      promise.catch(() => searchCache.delete(query));
      searchCache.set(query, promise);
    }
    return searchCache.get(query);
  }

  async function loadSaved() {
    const user = currentUser();
    if (!user) { return new Set(); }
    if (savedIds) { return savedIds; }
    const ids = new Set();
    for (let page = 0; page < 5; page++) {
      const result = await getJSON(`/u/${encodeURIComponent(user.username)}/bookmarks.json?page=${page}`);
      const list = result.user_bookmark_list || result;
      for (const bookmark of list.bookmarks || []) {
        const id = Number(bookmark.topic_id || (bookmark.bookmarkable_type === "Topic" ? bookmark.bookmarkable_id : 0));
        if (id) { ids.add(id); }
      }
      if (!list.more_bookmarks_url) { break; }
    }
    savedIds = ids;
    return ids;
  }

  // ---- state ------------------------------------------------------------
  function setState(patch) {
    state = { ...state, ...patch };
    const url = `${location.pathname}${writeState(state)}${location.hash}`;
    try { history.replaceState(history.state, "", url); } catch { /* ignore */ }
    refresh();
  }

  async function refresh() {
    if (!root) { return; }
    renderControls();
    const token = (refresh.token = (refresh.token || 0) + 1);
    renderGrid({ loading: true });
    try {
      const [loaded, ids, saved] = await Promise.all([
        loadData(),
        loadSearch(state.query),
        state.tab === "saved" ? loadSaved() : Promise.resolve(null),
      ]);
      if (token !== refresh.token || !root?.isConnected) { return; }
      failed = false;
      const firstLoad = data !== loaded;
      data = loaded;
      searchIds = ids;
      if (firstLoad) { renderHeader(); renderHighlights(); }
      renderControls();
      renderGrid({ saved });
    } catch (error) {
      if (token !== refresh.token) { return; }
      console.error("Moaclab CAD resources page failed to load", error);
      failed = true;
      renderGrid({});
    }
  }

  // ---- header -----------------------------------------------------------
  function renderHeader() {
    const head = root.querySelector(".mlcv-res__head");
    const stats = resourceStats(data.items);
    const picker = filePicker();
    const actions = el("div", { class: "mlcv-res__actions" }, [
      el("a", { class: "mlcv-res__btn mlcv-res__btn--primary", href: `/new-topic?category_id=${categoryId}`, text: t("publishResource", "Publish") }),
      el("button", { type: "button", class: "mlcv-res__btn", onclick: () => picker.click() }, [icon("folder"), el("span", { text: t("previewLocalFile", "Preview a local file") })]),
      picker,
    ]);
    const stat = (value, label) => el("li", {}, [el("b", { text: String(value) }), el("span", { text: label })]);
    const bio = el("div", { class: "mlcv-res__bio" }, [
      data.category.description ? el("p", { text: data.category.description }) : null,
      data.category.aboutUrl ? el("a", { href: data.category.aboutUrl, text: t("aboutResources", "About this section") }) : null,
    ]);
    head.replaceChildren(
      el("div", { class: "mlcv-res__avatar" }, [el("span", { html: ICONS.cube })]),
      el("div", { class: "mlcv-res__info" }, [
        el("div", { class: "mlcv-res__title-row" }, [el("h1", { text: data.category.name }), actions]),
        el("ul", { class: "mlcv-res__stats" }, [
          stat(stats.resources, t("statResources", "resources")),
          stat(stats.formats, t("statFormats", "formats")),
          stat(stats.contributors, t("statContributors", "contributors")),
        ]),
        bio,
      ]),
    );
  }

  function renderHighlights() {
    const nav = root.querySelector(".mlcv-res__highlights");
    const list = resourceHighlights(data.items);
    nav.hidden = !list.length;
    nav.replaceChildren(...list.map((item) => {
      const active = state.filter === item.key;
      return el("button", {
        type: "button",
        class: `mlcv-res__highlight${active ? " is-active" : ""}`,
        "aria-pressed": active ? "true" : "false",
        "data-key": item.key,
        onclick: () => setState({ filter: state.filter === item.key ? "" : item.key }),
      }, [
        el("span", { class: "mlcv-res__ring" }, [item.kind === "format"
          ? el("span", { class: "mlcv-res__glyph", html: ICONS[DRAWING_FORMATS.includes(item.label) ? "drawing" : "model"] })
          : el("span", { class: "mlcv-res__glyph mlcv-res__glyph--tag", text: "#" })]),
        el("span", { class: "mlcv-res__highlight-label", text: item.kind === "format" ? item.label : `#${item.label}` }),
      ]);
    }));
  }

  function renderControls() {
    root.querySelectorAll(".mlcv-res__tab").forEach((tab) => {
      const selected = tab.dataset.tab === state.tab;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", selected ? "true" : "false");
    });
    root.querySelectorAll(".mlcv-res__highlight").forEach((node) => {
      const active = node.dataset.key === state.filter;
      node.classList.toggle("is-active", active);
      node.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const input = root.querySelector(".mlcv-res__search input");
    if (input && document.activeElement !== input) { input.value = state.query; }
    const select = root.querySelector(".mlcv-res__sort select");
    if (select) { select.value = state.sort; }
  }

  // ---- grid -------------------------------------------------------------
  function tile(item) {
    const label = [item.title, item.format, item.username && `@${item.username}`].filter(Boolean).join(" · ");
    const link = el("a", { class: "mlcv-res__link", href: item.url, "aria-label": label, onclick: rememberScroll });
    if (item.image) {
      link.append(el("img", { src: item.image, alt: "", loading: "lazy", decoding: "async" }));
    } else {
      link.append(el("span", { class: "mlcv-res__text", style: `background-color: ${textTileColor(item.id)}` }, [
        el("span", { class: "mlcv-res__text-title", text: item.title }),
        item.username ? el("span", { class: "mlcv-res__text-author", text: `@${item.username}` }) : null,
      ]));
    }
    const count = (name, value, text) => el("span", { title: text }, [icon(name), el("span", { text: String(value) })]);
    const overlay = el("span", { class: "mlcv-res__overlay", "aria-hidden": "true" }, [
      el("span", { class: "mlcv-res__overlay-title", text: item.title }),
      el("span", { class: "mlcv-res__counts" }, [
        count("heart", item.likes, t("likes", "Likes")),
        count("reply", item.replies, t("replies", "Replies")),
        count("eye", item.views, t("views", "Views")),
      ]),
      item.username ? el("span", { class: "mlcv-res__overlay-author", text: `@${item.username}` }) : null,
    ]);
    const badges = item.format ? el("span", { class: "mlcv-res__badges", "aria-hidden": "true" }, [el("span", { text: item.format })]) : null;
    const preview = item.previewUrl ? el("a", {
      class: "mlcv-res__preview",
      href: item.previewUrl,
      "aria-label": `${t("preview3d", "3D preview")}: ${item.title}`,
      onclick: () => {
        rememberScroll();
        rememberPreview({ href: new URL(item.previewUrl, location.origin).href, topic_url: item.url, title: item.title, username: item.username });
      },
    }, [icon("rotate"), el("span", { text: t("preview3d", "3D preview") })]) : null;
    return el("article", { class: `mlcv-res__tile${item.image ? "" : " mlcv-res__tile--text"}`, "data-topic-id": item.id }, [link, badges, overlay, preview]);
  }

  function renderGrid({ loading = false, saved = null }) {
    const grid = root.querySelector(".mlcv-res__grid");
    const status = root.querySelector(".mlcv-res__status");
    if (failed) {
      grid.replaceChildren();
      grid.setAttribute("aria-busy", "false");
      status.replaceChildren(
        el("span", { text: t("resourcesFailed", "Resources could not be loaded.") }),
        el("button", { type: "button", class: "mlcv-res__btn", text: t("retry", "Retry"), onclick: () => { cache = null; refresh(); } }),
      );
      return;
    }
    if (loading && !data) {
      grid.setAttribute("aria-busy", "true");
      status.replaceChildren(el("span", { text: t("resourcesLoading", "Loading resources…") }));
      return;
    }
    if (loading) { grid.setAttribute("aria-busy", "true"); return; }
    if (state.tab === "saved" && !currentUser()) {
      grid.replaceChildren();
      grid.setAttribute("aria-busy", "false");
      status.replaceChildren(el("a", { href: "/login", class: "mlcv-res__btn", text: t("loginForSaved", "Log in to see saved resources") }));
      return;
    }
    const items = filterResources(data.items, { ...state, searchIds, savedIds: saved || savedIds });
    grid.replaceChildren(...items.map(tile));
    grid.setAttribute("aria-busy", "false");
    status.replaceChildren(items.length ? "" : el("span", { text: t("resourcesEmpty", "Nothing here yet.") }));
    if (restoreScroll) {
      restoreScroll = false;
      try {
        const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "null");
        sessionStorage.removeItem(SCROLL_KEY);
        if (saved && saved.search === location.search) { requestAnimationFrame(() => window.scrollTo(0, Number(saved.scroll) || 0)); }
      } catch { /* ignore */ }
    }
  }

  function rememberScroll() {
    try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ search: location.search, scroll: window.scrollY })); } catch { /* ignore */ }
  }

  // ---- skeleton -----------------------------------------------------------
  function build() {
    const tabs = [
      ["all", "grid", t("tabAll", "All")],
      ["model", "model", t("tabModels", "3D models")],
      ["drawing", "drawing", t("tabDrawings", "2D drawings")],
      ["saved", "saved", t("tabSaved", "Saved")],
    ];
    let searchInput;
    const form = el("form", {
      class: "mlcv-res__search",
      role: "search",
      onsubmit: (event) => { event.preventDefault(); setState({ query: searchInput.value.trim() }); },
    }, [
      el("label", { class: "mlcv-res__sr", for: "mlcv-res-query", text: t("searchResources", "Search resources") }),
      icon("search"),
      (searchInput = el("input", {
        id: "mlcv-res-query",
        type: "search",
        placeholder: t("searchResourcesPlaceholder", "Search resources"),
        oninput: (event) => { if (!event.target.value && state.query) { setState({ query: "" }); } },
      })),
    ]);
    const sort = el("label", { class: "mlcv-res__sort" }, [
      el("span", { text: t("sortBy", "Sort") }),
      el("select", { onchange: (event) => setState({ sort: event.target.value }) }, [
        el("option", { value: "latest", text: t("sortLatest", "Latest") }),
        el("option", { value: "likes", text: t("sortLikes", "Most liked") }),
        el("option", { value: "replies", text: t("sortReplies", "Most replies") }),
        el("option", { value: "views", text: t("sortViews", "Most viewed") }),
      ]),
    ]);
    return el("section", { class: "mlcv-res", "aria-label": t("resources", "Resources") }, [
      el("header", { class: "mlcv-res__head" }, [el("div", { class: "mlcv-res__avatar" }, [el("span", { html: ICONS.cube })])]),
      el("nav", { class: "mlcv-res__highlights", "aria-label": t("highlights", "Formats and tags"), hidden: true }),
      el("div", { class: "mlcv-res__tabs", role: "tablist", "aria-label": t("resourceTypes", "Resource types") },
        tabs.map(([id, iconName, label]) => el("button", {
          type: "button", role: "tab", class: "mlcv-res__tab", "data-tab": id,
          onclick: () => setState({ tab: id }),
        }, [icon(iconName), el("span", { text: label })]))),
      el("div", { class: "mlcv-res__toolbar" }, [form, sort]),
      el("div", { class: "mlcv-res__grid", "aria-live": "polite", "aria-busy": "true" }),
      el("div", { class: "mlcv-res__status", role: "status" }),
    ]);
  }

  function mount() {
    if (!categoryId) { return; }
    const library = document.querySelector(".moaclab-cad-library");
    if (!library) { return; }
    if (root?.isConnected && root.nextElementSibling === library) { return; }
    root?.remove();
    state = readState(location.search);
    data = null;
    restoreScroll = true;
    root = build();
    library.before(root);
    document.body.classList.add(BODY_CLASS);
    refresh();
  }

  function unmount() {
    root?.remove();
    root = null;
    savedIds = null;
    searchCache = new Map();
    document.body.classList.remove(BODY_CLASS);
  }

  return { mount, unmount };
}
