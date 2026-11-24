// The resources page: /viewer without parameters shown as an Instagram
// profile of the library category (resources_page setting). It replaces the
// plugin's drawing list on screen when there is one (the list stays in the
// DOM, hidden by the body class), and shows on its own when the plugin
// renders no list. It reads only public Discourse JSON:
//   /c/<id>/show.json             name, description, about topic
//   /c/<slug>/<id>/l/latest.json  the topics, every page
//   /moaclab-cad/drawings.json    which topics carry a model, and its format
//
// Speed: the skeleton (header, buttons, tabs, grey tiles) is drawn at once;
// the last result is kept in localStorage and drawn straight away on the next
// visit; the category, the first topic page and the model list are fetched
// together, tiles appear with the first page, later pages and the model
// formats fill in after.
import { getJSON, loadModelTopics } from "./cad-library-source";
import { rememberPreview } from "./cad-library-navigation";
import createResourceDetail from "./cad-resources-detail";
import { el, icon, ICONS } from "./cad-resources-dom";
import {
  applyModels, filterResources, listsToResources, readState, resourceContributors,
  resourceStats, textTileColor, writeState,
} from "./cad-resources-data";

const BODY_CLASS = "mlcv-resources-on";
const LIST_PAGES = 10;
const FRESH_MS = 60 * 1000;
const STORE_MS = 24 * 60 * 60 * 1000;
const STORE_KEY = "moaclab-cad-resources-v2";
const SCROLL_KEY = "moaclab-cad-resources-scroll-v1";
const SKELETON_TILES = 8;

function readStore(categoryId) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved?.categoryId !== categoryId || Date.now() - saved.at > STORE_MS) { return null; }
    return saved;
  } catch { return null; }
}

function writeStore(categoryId, data) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ categoryId, at: Date.now(), category: data.category, items: data.items }));
  } catch { /* storage full or disabled: the page still works, just without the head start */ }
}

export default function installResourcePage(api, { t, categoryId, filePicker }) {
  let root = null;
  let state = readState("");
  let data = null; // { category, items, complete }
  let loading = null; // { at, promise }
  let failed = false;
  let restoreScroll = true;
  const detail = createResourceDetail({ t });
  const wide = () => window.matchMedia?.("(min-width: 768px)").matches ?? true;

  // ---- data -----------------------------------------------------------------
  // Category, first topic page and model list in parallel; the first page is
  // drawn as soon as it lands, the other pages and the model formats follow.
  function load() {
    if (loading && Date.now() - loading.at < FRESH_MS) { return loading.promise; }
    const promise = (async () => {
      // The list URL needs the category slug: known from the last visit, the
      // first page is fetched together with the category; on a first visit
      // it waits for the category.
      const storedSlug = readStore(categoryId)?.category?.slug;
      const listUrl = (slug, page) => `/c/${slug}/${categoryId}/l/latest.json?page=${page}`;
      const showPromise = getJSON(`/c/${categoryId}/show.json`);
      const modelsPromise = loadModelTopics().catch(() => new Map());
      const firstPromise = storedSlug
        ? getJSON(listUrl(storedSlug, 0))
        : showPromise.then((show) => getJSON(listUrl(show.category?.slug || "c", 0)));
      const [show, first] = await Promise.all([showPromise, firstPromise]);

      const raw = show.category || {};
      const category = {
        name: raw.name || t("resources", "Resources"),
        description: raw.description_text || "",
        aboutUrl: raw.topic_url || "",
        slug: raw.slug || "",
      };
      const aboutTopicId = Number(String(raw.topic_url || "").split("/").pop()) || null;
      const pages = [first];
      let models = new Map();
      const build = (complete) => ({
        category,
        items: applyModels(listsToResources(pages, { aboutTopicId, categoryId, models }), models),
        complete,
      });

      show_(build(false));
      modelsPromise.then((found) => { models = found; show_(build(false)); });

      for (let page = 1; page < LIST_PAGES && pages[pages.length - 1].topic_list?.more_topics_url; page++) {
        pages.push(await getJSON(listUrl(category.slug || storedSlug || "c", page)));
        show_(build(false));
      }
      models = await modelsPromise;
      const done = build(true);
      show_(done);
      writeStore(categoryId, done);
      return done;
    })();
    loading = { at: Date.now(), promise };
    promise.catch(() => { loading = null; });
    return promise;
  }

  // New data for the page (fresh or partial); ignored once the page is gone.
  function show_(next) {
    data = next;
    failed = false;
    if (root?.isConnected) { render(); }
  }

  function start() {
    const stored = readStore(categoryId);
    if (stored && !data) { data = { category: stored.category, items: stored.items, complete: false }; }
    render();
    load().catch((error) => {
      console.error("Moaclab CAD resources page failed to load", error);
      if (!data?.items?.length) { failed = true; }
      if (root?.isConnected) { render(); }
    });
  }

  // ---- state ----------------------------------------------------------------
  function setTab(tab) {
    state = { ...state, tab };
    try { history.replaceState(history.state, "", `${location.pathname}${writeState(state)}${location.hash}`); } catch { /* ignore */ }
    render();
  }

  // ---- rendering --------------------------------------------------------------
  function render() {
    if (!root) { return; }
    renderHeader();
    renderTabs();
    renderGrid();
  }

  function renderHeader() {
    const head = root.querySelector(".mlcv-res__info");
    const name = data?.category?.name || t("resources", "Resources");
    if (!data) {
      head.replaceChildren(
        el("h1", { text: name }),
        el("div", { class: "mlcv-res__skeleton-line", style: "width: 260px" }),
        el("div", { class: "mlcv-res__skeleton-line", style: "width: 150px" }),
        el("div", { class: "mlcv-res__skeleton-line", style: "width: 90%" }),
      );
      return;
    }
    const stats = resourceStats(data.items);
    const people = resourceContributors(data.items);
    const stat = (value, label) => el("li", {}, [el("b", { text: String(value) }), el("span", { text: label })]);
    const shown = people.slice(0, 2).map((person) => person.username);
    const rest = Math.max(0, people.length - shown.length);
    head.replaceChildren(
      el("h1", { text: name }),
      el("ul", { class: "mlcv-res__stats" }, [
        stat(stats.resources, t("statResources", "resources")),
        stat(stats.formats, t("statFormats", "formats")),
        stat(stats.contributors, t("statContributors", "contributors")),
      ]),
      el("div", { class: "mlcv-res__bio" }, [
        el("div", { class: "mlcv-res__bio-label", text: t("resourcesSubtitle", "Drawings · models · tool files") }),
        data.category.description ? el("p", { text: data.category.description }) : null,
        data.category.aboutUrl ? el("a", { class: "mlcv-res__bio-link", href: data.category.aboutUrl }, [icon("link"), el("span", { text: t("aboutResources", "About this section") })]) : null,
      ]),
      people.length ? el("div", { class: "mlcv-res__people" }, [
        el("span", { class: "mlcv-res__faces", "aria-hidden": "true" }, people.slice(0, 3).map((person) => person.avatar
          ? el("img", { src: person.avatar, alt: "", loading: "lazy" })
          : el("span", { text: person.username.charAt(0).toUpperCase() }))),
        el("span", { text: `${t("contributorsInclude", "Contributors include")} ${shown.join(t("listSeparator", ", "))}${rest ? ` +${rest}` : ""}` }),
      ]) : null,
    );
  }

  function renderTabs() {
    root.querySelectorAll(".mlcv-res__tab").forEach((tab) => {
      const selected = tab.dataset.tab === state.tab;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function tile(item) {
    const label = [item.title, item.format, item.username && `@${item.username}`].filter(Boolean).join(" · ");
    const link = el("a", {
      class: "mlcv-res__link",
      href: item.url,
      "aria-label": label,
      onclick: (event) => {
        // desktop: Instagram's post pop-up; modified clicks and phones open the topic
        if (wide() && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          detail.open(item, event.currentTarget);
          return;
        }
        rememberScroll();
      },
    });
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
    const badges = item.pinned || item.format ? el("span", { class: "mlcv-res__badges", "aria-hidden": "true" }, [
      item.pinned ? icon("pin", "mlcv-res__badge-icon") : null,
      item.format ? el("span", { class: "mlcv-res__badge-format", text: item.format }) : null,
    ]) : null;
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

  function renderGrid() {
    const grid = root.querySelector(".mlcv-res__grid");
    const status = root.querySelector(".mlcv-res__status");
    if (failed) {
      grid.replaceChildren();
      grid.setAttribute("aria-busy", "false");
      status.replaceChildren(
        el("span", { text: t("resourcesFailed", "Resources could not be loaded.") }),
        el("button", { type: "button", class: "mlcv-res__btn", text: t("retry", "Retry"), onclick: () => { loading = null; failed = false; start(); } }),
      );
      return;
    }
    if (!data) {
      grid.setAttribute("aria-busy", "true");
      grid.replaceChildren(...Array.from({ length: SKELETON_TILES }, () => el("span", { class: "mlcv-res__tile mlcv-res__tile--skeleton", "aria-hidden": "true" })));
      status.replaceChildren();
      return;
    }
    const items = filterResources(data.items, state);
    grid.replaceChildren(...items.map(tile));
    grid.setAttribute("aria-busy", data.complete ? "false" : "true");
    status.replaceChildren(items.length || !data.complete ? "" : el("span", { text: t("resourcesEmpty", "Nothing here yet.") }));
    if (restoreScroll && items.length) {
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

  // ---- skeleton ---------------------------------------------------------------
  function build() {
    const tabs = [
      ["all", "tabAll", t("tabAll", "All")],
      ["share", "tabShare", t("tabShare", "Shared")],
      ["download", "tabDownload", t("tabDownload", "Downloads")],
      ["other", "tabOther", t("tabOther", "Other")],
    ];
    const picker = filePicker();
    return el("section", { class: "mlcv-res", "aria-label": t("resources", "Resources") }, [
      el("header", { class: "mlcv-res__head" }, [
        el("div", { class: "mlcv-res__avatar" }, [
          el("span", { class: "mlcv-res__ring", "aria-hidden": "true" }),
          el("span", { class: "mlcv-res__avatar-core" }, [el("span", { class: "mlcv-res__cube", html: ICONS.cubeRainbow })]),
        ]),
        el("div", { class: "mlcv-res__info" }),
      ]),
      el("div", { class: "mlcv-res__actions" }, [
        el("a", { class: "mlcv-res__btn mlcv-res__btn--primary", href: `/new-topic?category_id=${categoryId}`, text: t("publishResource", "Publish") }),
        // a <label> opens its file input natively, in every browser
        el("label", { class: "mlcv-res__btn", tabindex: "0", role: "button", onkeydown: (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); picker.click(); } } }, [
          el("span", { text: t("previewLocalFile", "Preview") }),
          picker,
        ]),
      ]),
      el("div", { class: "mlcv-res__tabs", role: "tablist", "aria-label": t("resourceTypes", "Resource types") },
        tabs.map(([id, iconName, label]) => el("button", {
          type: "button", role: "tab", class: "mlcv-res__tab", "data-tab": id,
          "aria-label": label, title: label,
          onclick: () => setTab(id),
        }, [icon(iconName)]))),
      el("div", { class: "mlcv-res__grid", "aria-live": "polite", "aria-busy": "true" }),
      el("div", { class: "mlcv-res__status", role: "status" }),
    ]);
  }

  // ---- placement ----------------------------------------------------------------
  // Right before the plugin's list when the plugin renders one (the list is
  // then hidden), otherwise inside #main-outlet straight away; if the list
  // shows up later the page moves in front of it without being rebuilt.
  function mount() {
    if (!categoryId || location.pathname !== "/viewer") { return; }
    const library = document.querySelector(".moaclab-cad-library");
    const outlet = document.querySelector("#main-outlet");
    if (!library && !outlet) { return; }
    if (root?.isConnected) {
      if (library && root.nextElementSibling !== library) { library.before(root); }
      return;
    }
    state = readState(location.search);
    restoreScroll = true;
    root = build();
    if (library) { library.before(root); } else { outlet.append(root); }
    document.body.classList.add(BODY_CLASS);
    start();
  }

  function unmount() {
    detail.close();
    root?.remove();
    root = null;
    document.body.classList.remove(BODY_CLASS);
  }

  return { mount, unmount };
}
