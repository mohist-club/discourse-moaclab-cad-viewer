// The resource detail pop-up, laid out like Instagram's post pop-up: media on
// the left (the 3D preview for a topic with a model, else its image, else
// its title on a soft colour), the post on the right (author, title, text,
// tags, files, replies) and an action row at the bottom. Opened from a tile
// on desktop; phones keep opening the topic page. One resource per opening:
// no previous / next.
//
// Text, files and replies come from /t/<id>.json. The posts' cooked HTML is
// read with DOMParser (an inert document) and only text and link targets are
// taken from it; nothing from it is inserted as HTML. Liking, replying and
// bookmarking stay Discourse's own: those buttons open the topic.
import { getJSON } from "./cad-library-source";
import { rememberPreview } from "./cad-library-navigation";
import { el, icon } from "./cad-resources-dom";
import { fileExtension, postModels, textTileColor } from "./cad-resources-data";

const CAD_EXT = /\.(step|stp|iges|igs|dxf|dwg|glb|gltf|stl|obj|zip|rar|7z|pdf)$/i;
const REPLY_LIMIT = 6;
const TEXT_LIMIT = 1600;

const topicCache = new Map();

function loadTopic(id) {
  if (!topicCache.has(id)) {
    const promise = getJSON(`/t/${id}.json`);
    promise.catch(() => topicCache.delete(id));
    topicCache.set(id, promise);
  }
  return topicCache.get(id);
}

function safeHref(href) {
  try {
    const url = new URL(href, location.origin);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch { return null; }
}

// Text paragraphs, file links and the first picture of one post.
export function readCooked(cooked) {
  const doc = new DOMParser().parseFromString(String(cooked || ""), "text/html");
  doc.querySelectorAll("script, style, .lightbox-wrapper .meta, aside.onebox, .moaclab-cad-viewer-source-retainer").forEach((node) => node.remove());
  const files = [];
  const seen = new Set();
  doc.querySelectorAll("a[href]").forEach((link) => {
    const href = safeHref(link.getAttribute("href"));
    const name = (link.textContent || "").trim();
    if (!href || seen.has(href) || name.startsWith("moaclab-cad-source:") || name.startsWith("moaclab-cad-private:")) { return; }
    if (link.classList.contains("attachment") || CAD_EXT.test(new URL(href).pathname) || CAD_EXT.test(name)) {
      seen.add(href);
      files.push({ name: name || decodeURIComponent(href.split("/").pop()), href });
    }
  });
  // a paragraph that is only an attachment link (and its size) is listed
  // under Files already
  doc.querySelectorAll("a.attachment").forEach((link) => {
    const block = link.closest("p, li");
    if (!block) { return; }
    const rest = (block.textContent || "").replace(link.textContent || "", "");
    if (/^[\s()（）\d.,]*(?:[KMG]i?B|bytes)?[\s()（）]*$/i.test(rest)) { block.remove(); }
  });
  const image = [...doc.querySelectorAll("img")].find((img) => !img.classList.contains("emoji") && !img.classList.contains("avatar"));
  const blocks = [...doc.body.querySelectorAll("p, li, h1, h2, h3, h4, blockquote")]
    .filter((node) => !node.querySelector("p, li"))
    .map((node) => (node.textContent || "").replace(/\[moaclab-3d[^\]]*\]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return { blocks, files, image: image ? safeHref(image.getAttribute("src")) : null };
}

export default function createResourceDetail({ t }) {
  let layer = null;
  let current = null;
  let returnFocus = null;
  let token = 0;

  function open(item, opener) {
    current = item;
    returnFocus = opener || document.activeElement;
    if (!layer) { build(); }
    document.body.append(layer);
    document.documentElement.classList.add("mlcv-rd-open");
    // on the document, so Esc works wherever focus ended up (a re-rendered
    // control, the page behind); the 3D iframe keeps its own keys
    document.addEventListener("keydown", onKey, true);
    show();
    layer.querySelector(".mlcv-rd__close").focus();
  }

  function close() {
    if (!layer?.isConnected) { return; }
    token++;
    layer.querySelector(".mlcv-rd__media").replaceChildren(); // stops a running 3D preview
    layer.remove();
    document.removeEventListener("keydown", onKey, true);
    document.documentElement.classList.remove("mlcv-rd-open");
    returnFocus?.focus?.();
  }

  function onKey(event) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "Tab") { trapFocus(event); }
  }

  function trapFocus(event) {
    const focusable = [...layer.querySelectorAll("a[href], button:not([disabled]), iframe, [tabindex='0']")].filter((node) => node.offsetParent !== null);
    if (!focusable.length) { return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function build() {
    layer = el("div", { class: "mlcv-rd", onclick: (event) => { if (event.target === layer) { close(); } } }, [
      el("button", { type: "button", class: "mlcv-rd__close", "aria-label": t("close", "Close"), onclick: close }, [icon("close", "mlcv-rd__icon")]),
      el("div", { class: "mlcv-rd__dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "mlcv-rd-title" }, [
        el("div", { class: "mlcv-rd__media" }),
        el("aside", { class: "mlcv-rd__side" }),
      ]),
    ]);
  }

  function show() {
    const item = current;
    const mine = ++token;
    renderMedia(item, null);
    renderSide(item, null);
    loadTopic(item.id).then((topic) => {
      if (mine !== token) { return; }
      renderMedia(item, topic);
      renderSide(item, topic);
    }).catch(() => {
      if (mine === token) { renderSide(item, false); }
    });
  }

  // ---- what the post carries ----------------------------------------------------------
  // Models: the plugin's model list first, then shortcodes and CAD
  // attachments in the first post. Attachments that are not models are
  // plain downloads.
  function contents(item, topic) {
    const cooked = topic ? readCooked(topic.post_stream?.posts?.[0]?.cooked) : null;
    const models = [];
    if (item.previewUrl) { models.push({ href: item.previewUrl, name: item.title, format: item.format }); }
    if (cooked) {
      for (const model of postModels(topic.post_stream.posts[0].cooked, cooked.files)) {
        if (!models.some((known) => known.href === model.href)) { models.push(model); }
      }
    }
    const modelFiles = new Set(models.map((model) => model.name));
    const downloads = cooked ? cooked.files.filter((file) => !modelFiles.has(file.name) || !/^(step|stp|igs|iges|dxf|dwg|glb|gltf|stl|obj)$/.test(fileExtension(file.name) || fileExtension(file.href))) : [];
    const attachmentFor = (model) => cooked?.files.find((file) => file.name === model.name);
    return { cooked, models, downloads, attachmentFor, picture: item.image || cooked?.image || null };
  }

  // ---- left: the drawing preview, else the picture, else the title -----------------------
  function renderMedia(item, topic, choice = 0) {
    const media = layer.querySelector(".mlcv-rd__media");
    const { models, picture } = contents(item, topic);
    const model = models[Math.min(choice, models.length - 1)];
    const waiting = !model && topic === null; // the post may still name a model
    const key = `${item.id}:${model ? `3d:${model.href}` : waiting ? "wait" : picture ? "img" : "text"}:${models.length}`;
    if (media.dataset.key === key && media.childElementCount) { return; }
    media.dataset.key = key;
    media.className = "mlcv-rd__media";
    media.style.backgroundColor = "";
    if (model) {
      const src = new URL(model.href, location.origin);
      src.searchParams.set("embed", "1");
      if (!src.searchParams.get("name")) { src.searchParams.set("name", model.name || item.title); }
      media.classList.add("mlcv-rd__media--model");
      media.replaceChildren(
        el("iframe", { src: src.pathname + src.search, title: `${t("preview3d", "3D preview")}: ${model.name || item.title}`, allowfullscreen: true }),
        // top-left, clear of the viewer's own toolbar at the bottom
        el("div", { class: "mlcv-rd__media-bar" }, [
          models.length > 1 ? el("div", { class: "mlcv-rd__models", role: "tablist", "aria-label": t("files", "Files") }, models.map((entry, at) => el("button", {
            type: "button",
            role: "tab",
            class: `mlcv-rd__model${entry === model ? " is-active" : ""}`,
            "aria-selected": entry === model ? "true" : "false",
            title: entry.name || item.title,
            text: entry.format || String(at + 1),
            onclick: () => {
              renderMedia(item, topic, at);
              layer.querySelector(".mlcv-rd__model.is-active")?.focus();
            },
          }))) : null,
          el("a", { class: "mlcv-rd__open-viewer", href: model.href }, [icon("rotate", "mlcv-rd__icon"), el("span", { text: t("openInViewer", "Open in viewer") })]),
        ]),
      );
      media.querySelector(".mlcv-rd__open-viewer").addEventListener("click", () => {
        rememberPreview({ href: new URL(model.href, location.origin).href, topic_url: item.url, title: item.title, username: item.username });
        close();
      }, { once: true });
    } else if (waiting) {
      media.classList.add("mlcv-rd__media--loading");
      media.replaceChildren(el("span", { class: "mlcv-rd__spinner", role: "status", "aria-label": t("resourcesLoading", "Loading…") }));
    } else if (picture) {
      media.classList.add("mlcv-rd__media--image");
      media.replaceChildren(el("img", { src: picture, alt: item.title }));
    } else {
      media.classList.add("mlcv-rd__media--text");
      media.style.backgroundColor = textTileColor(item.id);
      media.replaceChildren(el("div", { class: "mlcv-rd__media-title", text: item.title }));
    }
  }

  // ---- right: the post ---------------------------------------------------------------
  function renderSide(item, topic) {
    const side = layer.querySelector(".mlcv-rd__side");
    const posts = topic?.post_stream?.posts || [];
    const first = posts[0];
    const author = topic?.details?.created_by?.username || first?.username || item.username;
    const avatarTemplate = topic?.details?.created_by?.avatar_template || first?.avatar_template;
    const found = contents(item, topic);
    const cooked = found.cooked || { blocks: [], files: [] };
    const files = [
      ...found.models.map((model) => ({ name: `${model.name || item.title}${model.format ? ` · ${model.format}` : ""}`, href: model.href, model: true, download: found.attachmentFor(model)?.href || null })),
      ...found.downloads,
    ];
    const created = topic?.created_at ? new Date(topic.created_at) : null;
    const likes = topic?.like_count ?? item.likes;
    const replies = Math.max(0, (topic?.posts_count ?? item.replies + 1) - 1);

    let textLength = 0;
    const paragraphs = cooked.blocks.filter((block) => (textLength += block.length) <= TEXT_LIMIT);

    side.replaceChildren(
      el("header", { class: "mlcv-rd__author" }, [
        el("span", { class: "mlcv-rd__avatar" }, [avatarTemplate
          ? el("img", { src: avatarTemplate.replace("{size}", "64"), alt: "" })
          : el("span", { text: (author || "?").charAt(0).toUpperCase() })]),
        author ? el("a", { class: "mlcv-rd__username", href: `/u/${encodeURIComponent(author)}`, text: author }) : null,
      ]),
      el("div", { class: "mlcv-rd__body" }, [
        el("h2", { id: "mlcv-rd-title", class: "mlcv-rd__title", text: item.title }),
        topic === null ? el("div", { class: "mlcv-rd__loading", role: "status", text: t("resourcesLoading", "Loading…") }) : null,
        topic === false ? el("div", { class: "mlcv-rd__loading", role: "status", text: t("resourcesFailed", "Resources could not be loaded.") }) : null,
        paragraphs.length ? el("div", { class: "mlcv-rd__text" }, paragraphs.map((text) => el("p", { text }))) : null,
        cooked.blocks.length > paragraphs.length ? el("a", { class: "mlcv-rd__more", href: item.url, text: t("readMore", "Read more") }) : null,
        item.tags.length ? el("div", { class: "mlcv-rd__tags" }, item.tags.map((tag) => el("a", { href: `/tag/${encodeURIComponent(tag)}`, text: `#${tag}` }))) : null,
        files.length ? el("div", { class: "mlcv-rd__files" }, [
          el("div", { class: "mlcv-rd__files-head", text: `${t("files", "Files")} · ${files.length}` }),
          ...files.map((file) => el("div", { class: "mlcv-rd__file" }, [
            el("a", { class: "mlcv-rd__file-main", href: file.href, target: file.model ? null : "_blank", rel: file.model ? null : "noopener" }, [
              icon(file.model ? "rotate" : "file", "mlcv-rd__file-icon"),
              el("span", { class: "mlcv-rd__file-name", text: file.name }),
              file.model ? icon("next", "mlcv-rd__icon") : icon("download", "mlcv-rd__icon"),
            ]),
            file.model && file.download ? el("a", { class: "mlcv-rd__file-download", href: file.download, target: "_blank", rel: "noopener", "aria-label": `${t("download", "Download")}: ${file.name}`, title: t("download", "Download") }, [icon("download", "mlcv-rd__icon")]) : null,
          ])),
        ]) : null,
        posts.length > 1 ? el("div", { class: "mlcv-rd__replies" }, posts.slice(1, 1 + REPLY_LIMIT).map((post) => {
          const text = readCooked(post.cooked).blocks.join(" ");
          return el("div", { class: "mlcv-rd__reply" }, [
            el("span", { class: "mlcv-rd__avatar mlcv-rd__avatar--small" }, [post.avatar_template
              ? el("img", { src: post.avatar_template.replace("{size}", "48"), alt: "" })
              : el("span", { text: (post.username || "?").charAt(0).toUpperCase() })]),
            el("p", {}, [el("b", { text: post.username || "" }), el("span", { text: ` ${text.length > 180 ? `${text.slice(0, 180)}…` : text}` })]),
          ]);
        })) : null,
        replies > REPLY_LIMIT ? el("a", { class: "mlcv-rd__more", href: item.url, text: `${t("viewAllReplies", "View all replies")} (${replies})` }) : null,
      ]),
      el("footer", { class: "mlcv-rd__footer" }, [
        el("div", { class: "mlcv-rd__actions" }, [
          el("a", { class: "mlcv-rd__action", href: item.url, "aria-label": t("likeInTopic", "Like in the topic"), title: t("likeInTopic", "Like in the topic") }, [icon("heartLine", "mlcv-rd__icon")]),
          el("a", { class: "mlcv-rd__action", href: item.url, "aria-label": t("replyInTopic", "Reply in the topic"), title: t("replyInTopic", "Reply in the topic") }, [icon("replyLine", "mlcv-rd__icon")]),
          el("button", { type: "button", class: "mlcv-rd__action", "aria-label": t("copyLink", "Copy link"), title: t("copyLink", "Copy link"), onclick: (event) => copyLink(event.currentTarget, item) }, [icon("send", "mlcv-rd__icon")]),
          el("span", { class: "mlcv-rd__spacer" }),
          el("a", { class: "mlcv-rd__action", href: item.url, "aria-label": t("bookmarkInTopic", "Bookmark in the topic"), title: t("bookmarkInTopic", "Bookmark in the topic") }, [icon("bookmark", "mlcv-rd__icon")]),
        ]),
        el("div", { class: "mlcv-rd__counts", text: `${likes} ${t("likesCount", "likes")} · ${replies} ${t("repliesCount", "replies")}` }),
        created ? el("time", { class: "mlcv-rd__date", datetime: created.toISOString(), text: created.toLocaleDateString() }) : null,
        el("a", { class: "mlcv-rd__topic", href: item.url, text: t("viewTopic", "Topic") }),
      ]),
    );
    // links inside the pop-up leave it: close first so the page underneath is clean
    side.querySelectorAll("a[href]:not([target])").forEach((link) => link.addEventListener("click", close));
    side.querySelectorAll(".mlcv-rd__file-main[href^='/viewer?']").forEach((link) => link.addEventListener("click", () => {
      rememberPreview({ href: new URL(link.getAttribute("href"), location.origin).href, topic_url: item.url, title: item.title, username: item.username });
      close();
    }, { once: true }));
  }

  async function copyLink(button, item) {
    const url = new URL(item.url, location.origin).href;
    try { await navigator.clipboard.writeText(url); } catch { window.prompt(t("copyLink", "Copy link"), url); return; }
    button.classList.add("is-done");
    button.setAttribute("title", t("linkCopied", "Link copied"));
    setTimeout(() => { button.classList.remove("is-done"); button.setAttribute("title", t("copyLink", "Copy link")); }, 1500);
  }

  return { open, close };
}
