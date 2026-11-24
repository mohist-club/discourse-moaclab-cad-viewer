import { apiInitializer } from "discourse/lib/api";
import { i18n } from "discourse-i18n";
import configureCadPreviewLighting from "../lib/cad-preview-lighting";
import installCadWorkbench from "../lib/cad-workbench";
import installDxfPolylines from "../lib/cad-dxf-polylines";
import { serializeDrawingSvg } from "../lib/cad-svg-snapshot";
import { installCadFileSnapshot, readUploadResponse, uploadErrorHint } from "../lib/cad-upload-errors";
import rememberDrawingLibrary, { drawingContext } from "../lib/cad-library-navigation";
import installLibraryActions, { takePendingLocalFile } from "../lib/cad-library-actions";
import installLibrarySource from "../lib/cad-library-source";
import installResourcePage from "../lib/cad-resources";

export default apiInitializer((api) => {
  const NS = "moaclab-cad-viewer";
  const ASSET_BASE = "/plugins/discourse-moaclab-tools/viewer/v055";
  const themeSettings = typeof settings !== "undefined" ? settings : {};
  const EMBED_RE = /\[moaclab-3d\s+([^\]]+)\]/g;
  const t = (key, fallback) => {
    try { return i18n(themePrefix(`moaclab_cad_viewer.${key}`), { defaultValue: fallback }); }
    catch { return fallback; }
  };
  const isRoute = () => {
    const url = new URL(window.location.href);
    return url.pathname === "/viewer" && (
      url.searchParams.get("mode") === "preview" || url.searchParams.get("embed") === "1" ||
      ["id", "upload", "url"].some((key) => url.searchParams.has(key))
    );
  };
  const isEmbed = () => new URLSearchParams(window.location.search).get("embed") === "1";
  const state = {
    instance: null,
    opening: null,
    mounting: null,
    observer: null,
    frame: null,
    fitFrame: null,
    failed: false,
    currentFile: null,
    currentFileKey: "",
    shareButton: null,
    uploading: false,
    routeFileKey: "",
    loadingRouteFile: false,
    bridge: null,
  };
  rememberDrawingLibrary(api);
  installLibrarySource(api, Number(themeSettings.library_category_id ?? 9) || 0);
  const enhanceLibrary = installLibraryActions(api, t);
  const isLibrary = () => window.location.pathname === "/viewer" && !isRoute();
  const libraryCategoryId = Number(themeSettings.library_category_id ?? 9) || 0;
  const resources = (themeSettings.resources_page ?? true) && libraryCategoryId
    ? installResourcePage(api, { t, categoryId: libraryCategoryId, filePicker: enhanceLibrary.filePicker })
    : null;

  if (themeSettings.show_sidebar_link ?? false) {
    api.addCommunitySectionLink((BaseCommunitySectionLink) => class MoaclabCadViewerSectionLink extends BaseCommunitySectionLink {
      get name() { return NS; }
      get href() { return "/viewer"; }
      get currentWhen() { return "moaclab-viewer"; }
      get title() { return t("open", "3D Viewer"); }
      get text() { return t("open", "3D Viewer"); }
      get prefixValue() { return "cube"; }
    });
  }

  function parseShortcodeAttrs(raw = "") {
    const attrs = {};
    raw.replace(/([a-z0-9_-]+)\s*=\s*(?:"([^"]*)"|“([^”]*)”|'([^']*)'|‘([^’]*)’|([^\s]+))/gi, (_, key, v1, v2, v3, v4, v5) => {
      const value = v1 ?? v2 ?? v3 ?? v4 ?? v5 ?? "";
      attrs[key] = value;
      return "";
    });
    return attrs;
  }

  function resolveUploadLocator(locator = "") {
    if (!locator) return null;
    if (/^upload:\/\//.test(locator)) {
      const token = locator.replace(/^upload:\/\//, "");
      if (!/^[A-Za-z0-9._-]+$/.test(token)) return null;
      return new URL(`/uploads/short-url/${token}`, window.location.origin).toString();
    }
    try {
      const url = new URL(locator, window.location.origin);
      if (!/^https?:$/.test(url.protocol)) return null;
      if (/\/uploads\/short-url\//.test(url.pathname)) return url.toString();
      return null;
    } catch {
      return null;
    }
  }

  function concealedUploadLocator(upload) {
    const raw = upload?.short_url || upload?.short_path || "";
    if (/^upload:\/\//.test(raw)) return raw;
    try {
      const url = new URL(raw, window.location.origin);
      const match = url.pathname.match(/\/uploads\/short-url\/([^/?#]+)/);
      if (match?.[1]) return `upload://${match[1]}`;
    } catch {
      const match = String(raw).match(/\/uploads\/short-url\/([^/?#]+)/);
      if (match?.[1]) return `upload://${match[1]}`;
    }
    return "";
  }

  function viewerEmbedUrl(attrs) {
    const id = attrs.id || "";
    const ext = (attrs.ext || attrs.type || "").toLowerCase();
    const title = attrs.title || attrs.name || "";

    if (attrs.upload) {
      const fileUrl = resolveUploadLocator(attrs.upload);
      if (!fileUrl) return null;
      if (!/^(step|stp|igs|iges|dxf|dwg|glb|gltf|stl|obj)$/.test(ext)) return null;
      const url = new URL("/viewer", window.location.origin);
      url.searchParams.set("embed", "1");
      url.searchParams.set("upload", attrs.upload);
      url.searchParams.set("ext", ext);
      if (title) url.searchParams.set("name", title);
      return url.toString();
    }

    if (attrs.url) {
      let fileUrl;
      try { fileUrl = new URL(attrs.url, window.location.origin); }
      catch { return null; }
      if (!/^https?:$/.test(fileUrl.protocol)) return null;
      if (!/\/uploads\//.test(fileUrl.pathname) && fileUrl.origin === window.location.origin && !attrs.allow_local_url) return null;
      if (!/^(step|stp|igs|iges|dxf|dwg|glb|gltf|stl|obj)$/.test(ext)) return null;
      const url = new URL("/viewer", window.location.origin);
      url.searchParams.set("embed", "1");
      url.searchParams.set("url", fileUrl.toString());
      url.searchParams.set("ext", ext);
      if (title) url.searchParams.set("name", title);
      return url.toString();
    }

    if (!/^[a-f0-9]{16}$/.test(id)) return null;
    if (!/^(step|stp|igs|iges|dxf|dwg|glb|gltf|stl|obj)$/.test(ext)) return null;
    const configuredBase = themeSettings.embed_viewer_base || "/viewer";
    const base = /\/tools\/3d\/embed\/?$/i.test(configuredBase) ? "/viewer" : configuredBase;
    const url = new URL(base, window.location.origin);
    url.searchParams.set("embed", "1");
    url.searchParams.set("id", id);
    url.searchParams.set("ext", ext);
    if (title) url.searchParams.set("name", title);
    return url.toString();
  }

  function renderPostEmbeds(root) {
    if (!root || root.dataset?.moaclabCadEmbedsReady === "1") return;
    hideRetentionLinks(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const targets = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue?.includes("[moaclab-3d")) targets.push(node);
    }
    targets.forEach((node) => {
      const text = node.nodeValue || "";
      EMBED_RE.lastIndex = 0;
      if (!EMBED_RE.test(text)) return;
      EMBED_RE.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match;
      while ((match = EMBED_RE.exec(text))) {
        fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
        const attrs = parseShortcodeAttrs(match[1]);
        const src = viewerEmbedUrl(attrs);
        if (src) {
          const card = document.createElement("div");
          card.className = `${NS}-post-embed`;
          const title = attrs.title || attrs.name || "Moaclab CAD 预览";
          const head = document.createElement("div");
          head.className = `${NS}-post-embed-head`;
          const label = document.createElement("span");
          label.textContent = title;
          const frame = document.createElement("iframe");
          frame.src = src;
          frame.title = title;
          frame.loading = "lazy";
          frame.allowFullscreen = true;
          head.append(label);
          card.append(head, frame);
          fragment.append(card);
        } else {
          fragment.append(document.createTextNode(match[0]));
        }
        lastIndex = EMBED_RE.lastIndex;
      }
      fragment.append(document.createTextNode(text.slice(lastIndex)));
      node.parentNode?.replaceChild(fragment, node);
    });
    hideRetentionLinks(root);
    if (root.dataset) root.dataset.moaclabCadEmbedsReady = "1";
  }

  function hideRetentionLinks(root) {
    root.querySelectorAll?.("a").forEach((link) => {
      const text = (link.textContent || "").trim();
      if (!text.startsWith("moaclab-cad-source:")) return;
      link.classList.add(`${NS}-source-retainer`);
      link.setAttribute("aria-hidden", "true");
      const paragraph = link.closest("p");
      if (paragraph && (paragraph.textContent || "").trim() === text) {
        paragraph.hidden = true;
        paragraph.classList.add(`${NS}-source-retainer-wrap`);
      } else {
        link.hidden = true;
      }
    });
  }

  if (api.decorateCookedElement) {
    api.decorateCookedElement((element) => renderPostEmbeds(element), { id: `${NS}-post-embeds` });
  }

  const labels = () => Object.fromEntries([
    ["title", "3D Engineering Viewer"], ["upload", "Open model"], ["formats", "STEP / IGES / DXF / DWG / GLB / STL / OBJ"], ["empty", "Drop STEP / IGES / DXF / DWG / GLB / STL / OBJ"],
    ["ready", "Drag to orbit · Scroll to zoom · Right-drag to pan"], ["loading", "Parsing model…"], ["error", "This model could not be opened"],
    ["parts", "Parts"], ["home", "Fit"], ["orbit", "Orbit"], ["pan", "Pan"], ["inspect", "Inspect"], ["selected", "Selected"], ["tree", "Tree"], ["section", "Section"],
    ["explode", "Explode"], ["style", "Style"], ["measure", "Measure"], ["info", "Info"], ["screenshot", "Capture"],
    ["fullscreen", "Fullscreen"], ["solid", "Solid"], ["wire", "Edges"], ["ghost", "Ghost"],
    ["viewOrientation", "View orientation"], ["top", "Top"], ["front", "Front"], ["right", "Right"],
    ["close", "Close"], ["visibility", "Visibility"], ["partColor", "Part color"],
    ["gmkPalette", "GMK stock colors"], ["colorPreview", "Screen preview · verify with physical samples"],
    ["demo", "MX SWITCH ASSEMBLY / DEMO"],
  ].map(([key, fallback]) => [key, t(key, fallback)]));

  function routeFileParams() {
    const params = new URLSearchParams(window.location.search);
    const upload = params.get("upload");
    const rawUrl = params.get("url");
    const id = params.get("id");
    const ext = (params.get("ext") || "").toLowerCase();
    if (!/^(step|stp|igs|iges|dxf|dwg|glb|gltf|stl|obj)$/.test(ext)) return null;
    if (id) {
      if (!/^[a-f0-9]{16}$/.test(id)) return null;
      return { url: new URL(`/moaclab-cad/models/${id}`, window.location.origin).toString(), ext, name: params.get("name") || `Moaclab CAD.${ext}` };
    }
    if (upload) {
      const fileUrl = resolveUploadLocator(upload);
      if (!fileUrl) return null;
      return { url: fileUrl, ext, name: params.get("name") || upload.replace(/^upload:\/\//, "") || `Moaclab CAD.${ext}` };
    }
    if (!rawUrl) return null;
    try {
      const url = new URL(rawUrl, window.location.origin);
      if (!/^https?:$/.test(url.protocol)) return null;
      return { url: url.toString(), ext, name: params.get("name") || url.pathname.split("/").pop() || `Moaclab CAD.${ext}` };
    } catch {
      return null;
    }
  }

  function hasRouteFileRequest() {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get("id") || params.get("upload") || params.get("url"));
  }

  function setViewerRouteStatus(message, isError = false, isLoading = false) {
    const mount = document.querySelector(`#${NS}-mount`);
    if (state.instance?.setStatus) {
      state.instance.setStatus(message, isError, isLoading);
    } else if (mount) {
      mount.textContent = message;
    }
  }

  async function loadInitialFile() {
    const localFile = takePendingLocalFile();
    if (localFile) await state.instance.loadFile(localFile);
    else await loadRouteFile();
  }

  async function loadRouteFile() {
    if (!state.instance) return;
    const file = routeFileParams();
    if (!file) {
      if (hasRouteFileRequest()) {
        state.instance.clearModel?.();
        setViewerRouteStatus(t("error", "This model could not be opened"), true);
      }
      return;
    }
    const key = `${file.url}|${file.ext}|${file.name}`;
    if (state.routeFileKey === key) return;
    state.routeFileKey = key;
    state.loadingRouteFile = true;
    try {
      state.instance.clearModel?.();
      setViewerRouteStatus(t("loading", "Parsing model…"), false, true);
      const response = await fetch(file.url, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`fetch ${response.status}`);
      const blob = await response.blob();
      const remoteFile = new File([blob], file.name, { type: blob.type || "application/octet-stream" });
      await state.instance.loadFile(remoteFile);
    } catch (error) {
      console.error("Moaclab CAD Viewer failed to load shortcode upload", error);
      state.instance.clearModel?.();
      setViewerRouteStatus(t("error", "This model could not be opened"), true);
    } finally {
      state.loadingRouteFile = false;
    }
  }

  function fileExt(name = "") {
    return (name.split(".").pop() || "").toLowerCase();
  }

  function shortcodeForUpload(upload, file) {
    const ext = fileExt(file?.name || upload?.original_filename || upload?.filename || upload?.url || "");
    const locator = concealedUploadLocator(upload);
    if (!locator) throw new Error("upload response did not include a short upload locator");
    const title = (file?.name || upload?.original_filename || upload?.filename || `Moaclab CAD.${ext}`).replace(/"/g, "'");
    return `[moaclab-3d upload="${locator}" type="${ext}" title="${title}"]`;
  }

  function shortcodeForPersistentModel(model, file) {
    const ext = (model?.ext || fileExt(file?.name || model?.name || "")).toLowerCase();
    if (!/^[a-f0-9]{16}$/.test(model?.id || "")) throw new Error("model response did not include a persistent id");
    if (!/^(step|stp|igs|iges|dxf|dwg|glb|gltf|stl|obj)$/.test(ext)) throw new Error("model response did not include a supported extension");
    const title = (file?.name || model?.name || `Moaclab CAD.${ext}`).replace(/"/g, "'");
    return `[moaclab-3d id="${model.id}" ext="${ext}" title="${title}"]`;
  }

  function imageMarkdownForUpload(upload, file) {
    const locator = concealedUploadLocator(upload);
    if (!locator) return "";
    const title = (file?.name || upload?.original_filename || upload?.filename || "Moaclab CAD preview").replace(/[\[\]\n\r]/g, " ").trim();
    const width = Number(upload?.width) || 1280;
    const height = Number(upload?.height) || 720;
    return `![${title}|${width}x${height}](${locator})`;
  }

  function retentionMarkdownForUpload(upload, file) {
    const locator = concealedUploadLocator(upload);
    if (!locator) return "";
    const title = (file?.name || upload?.original_filename || upload?.filename || "Moaclab CAD source").replace(/[\]\[\n\r]/g, " ").trim();
    return `[moaclab-cad-source:${title}](${locator})`;
  }

  function csrfToken() {
    return document.querySelector("meta[name='csrf-token']")?.content || "";
  }

  async function uploadCurrentFile(file) {
    const form = new FormData();
    form.append("upload_type", "composer");
    form.append("synchronous", "true");
    form.append("file", file, file.name);
    const response = await fetch("/uploads.json", {
      method: "POST",
      credentials: "same-origin",
      headers: csrfToken() ? { "X-CSRF-Token": csrfToken() } : undefined,
      body: form,
    });
    return await readUploadResponse(response);
  }

  async function uploadPersistentModel(file) {
    const form = new FormData();
    form.append("model", file, file.name);
    form.append("name", file.name);
    const response = await fetch("/moaclab-cad/models.json", {
      method: "POST",
      credentials: "same-origin",
      headers: csrfToken() ? { "X-CSRF-Token": csrfToken() } : undefined,
      body: form,
    });
    const json = await readUploadResponse(response);
    if (!json?.ok) throw new Error(json?.error || "model upload failed");
    return json;
  }

  function blobFromCanvas(canvas, type = "image/png", quality) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("preview capture returned an empty blob")), type, quality);
      } catch (error) {
        reject(error);
      }
    });
  }

  function drawContain(ctx, source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const scale = Math.min(targetWidth / Math.max(1, sourceWidth), targetHeight / Math.max(1, sourceHeight));
    const width = Math.max(1, sourceWidth * scale);
    const height = Math.max(1, sourceHeight * scale);
    const left = (targetWidth - width) / 2;
    const top = (targetHeight - height) / 2;
    ctx.drawImage(source, left, top, width, height);
  }

  async function captureSvgPreview(svg, targetCanvas) {
    const xml = serializeDrawingSvg(svg, targetCanvas.width, targetCanvas.height);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(svgBlob);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = objectUrl;
      });
      const ctx = targetCanvas.getContext("2d");
      ctx.fillStyle = "#edf0f4";
      ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
      drawContain(ctx, image, image.naturalWidth || 1280, image.naturalHeight || 720, targetCanvas.width, targetCanvas.height);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function captureCurrentPreview(file) {
    const page = document.getElementById(`${NS}-page`);
    const target = document.createElement("canvas");
    target.width = 1280;
    target.height = 720;
    const ctx = target.getContext("2d");
    ctx.fillStyle = "#edf0f4";
    ctx.fillRect(0, 0, target.width, target.height);

    const dxfSvg = page?.querySelector(".mlcv-dxf-layer svg");
    if (dxfSvg) {
      await captureSvgPreview(dxfSvg, target);
    } else {
      const sourceCanvas = page?.querySelector(".mlcv-canvas canvas");
      if (sourceCanvas) {
        drawContain(ctx, sourceCanvas, sourceCanvas.width || sourceCanvas.clientWidth || 1280, sourceCanvas.height || sourceCanvas.clientHeight || 720, target.width, target.height);
      } else {
        ctx.fillStyle = "#17191c";
        ctx.font = "600 42px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(file?.name || "Moaclab CAD Preview", 64, 360);
      }
    }

    const blob = await blobFromCanvas(target, "image/png");
    const safeName = (file?.name || "moaclab-cad").replace(/\.[^.]+$/, "").replace(/[^\w\u4e00-\u9fa5.-]+/g, "-").slice(0, 90) || "moaclab-cad";
    return new File([blob], `${safeName}-preview.png`, { type: "image/png" });
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function composerModel(composer) {
    return composer?.model || composer?.composer || null;
  }

  function setComposerReplyOnModel(composer, text) {
    const model = composerModel(composer);
    if (!model) return false;
    if (typeof model.set === "function") {
      model.set("reply", text);
      return true;
    }
    if ("reply" in model) {
      model.reply = text;
      return true;
    }
    return false;
  }

  async function setComposerReplyInEditor(text) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const input = document.querySelector(".d-editor-input, textarea.d-editor-input, textarea[name='reply']");
      if (input) {
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.focus?.();
        return true;
      }
      await sleep(80);
    }
    return false;
  }

  async function insertComposerBody(composer, text) {
    const normalized = `${text}\n\n`;
    setComposerReplyOnModel(composer, normalized);
    if (await setComposerReplyInEditor(normalized)) return true;
    await sleep(120);
    return setComposerReplyOnModel(composer, normalized);
  }

  async function openComposerWithShortcode(body, file) {
    const composer = api.container.lookup("service:composer");
    if (!composer?.open) throw new Error("composer service unavailable");
    const name = file?.name || "Moaclab CAD Preview";
    const title = name.replace(/\.[^.]+$/, "").slice(0, 255);
    await composer.open({
      action: "createTopic",
      draftKey: "new_topic",
      title,
      reply: `${body}\n\n`,
      composerBody: `${body}\n\n`,
    });
    await insertComposerBody(composer, body);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard?.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function setShareButtonState(label, disabled = false) {
    if (!state.shareButton) return;
    state.shareButton.textContent = label;
    state.shareButton.disabled = disabled;
  }

  async function composeCurrentFile() {
    if (!state.currentFile || state.uploading) return;
    if (!api.getCurrentUser()) {
      api.container.lookup("route:application").send("showLogin");
      return;
    }
    state.uploading = true;
    setShareButtonState(t("posting", "Uploading…"), true);
    try {
      const model = await uploadPersistentModel(state.currentFile);
      const shortcode = shortcodeForPersistentModel(model, state.currentFile);
      let body = shortcode;
      try {
        setShareButtonState(t("capturingPreview", "Capturing…"), true);
        const previewFile = await captureCurrentPreview(state.currentFile);
        const previewUpload = await uploadCurrentFile(previewFile);
        const previewMarkdown = imageMarkdownForUpload(previewUpload, state.currentFile);
        if (previewMarkdown) body = `${previewMarkdown}\n\n${body}`;
      } catch (previewError) {
        console.warn("Moaclab CAD Viewer preview capture failed; continuing with shortcode only", previewError);
      }
      await openComposerWithShortcode(body, state.currentFile);
      setShareButtonState(t("shareUpload", "Upload & share"), false);
    } catch (error) {
      console.error("Moaclab CAD Viewer composer upload failed", error);
      setShareButtonState(t("uploadFailed", "Upload failed"), false);
      window.alert?.(uploadErrorHint(error, t));
    } finally {
      state.uploading = false;
    }
  }

  function installComposerBridge(page) {
    const headerFile = page?.querySelector(".mlcv-file");
    if (!headerFile || state.shareButton) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mlcv-post";
    button.hidden = true;
    button.textContent = t("shareUpload", "Upload & share");
    button.addEventListener("click", composeCurrentFile);
    headerFile.appendChild(button);
    state.shareButton = button;

    state.bridge = {
      setFile(file, remote) {
        state.currentFile = remote ? null : file;
        state.currentFileKey = remote ? "" : `${file.name}:${file.size}:${file.lastModified}`;
        button.hidden = remote;
        setShareButtonState(t("shareUpload", "Upload & share"), false);
      },
      clearFile() {
        state.currentFile = null;
        state.currentFileKey = "";
        button.hidden = true;
      },
    };
  }

  function syncSidebar(active = isRoute()) {
    if (!(themeSettings.show_sidebar_link ?? false)) return;
    const viewer = document.querySelector(`.sidebar-section-link[data-link-name="${NS}"]`);
    if (viewer) {
      viewer.classList.toggle(`${NS}-selected`, active);
      if (active) viewer.setAttribute("aria-current", "page"); else viewer.removeAttribute("aria-current");
    }
  }

  function loadBundle() {
    if (window.MoaclabCadViewer) return Promise.resolve(window.MoaclabCadViewer);
    if (state.opening) return state.opening;

    const url = `${ASSET_BASE}/viewer-bundle-v055.js`;

    state.opening = new Promise((resolve, reject) => {
      const selector = `script[data-moaclab-cad-bundle="${url}"]`;
      document.querySelector(selector)?.remove();

      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.dataset.moaclabCadBundle = url;
      script.onload = () => {
        if (window.MoaclabCadViewer) resolve(window.MoaclabCadViewer);
        else reject(new Error("Viewer bundle loaded without its public API"));
      };
      script.onerror = () => reject(new Error(`Viewer bundle failed to load: ${url}`));
      document.head.appendChild(script);
    }).catch((error) => {
      state.opening = null;
      throw error;
    });

    return state.opening;
  }

  function fitPageToViewport(page = document.getElementById(`${NS}-page`)) {
    if (!page || !isRoute()) return;
    const outlet = document.getElementById("main-outlet");
    const outletRect = outlet?.getBoundingClientRect();
    const headerRect = document.querySelector(".d-header-wrap, .d-header")?.getBoundingClientRect();
    const embedded = isEmbed();
    const left = embedded ? 0 : Math.max(0, outletRect?.left || 0);
    const top = embedded ? 0 : Math.max(0, outletRect?.top || 0, headerRect?.bottom || 0);
    page.style.setProperty("--mlcv-page-left", `${left}px`);
    page.style.setProperty("--mlcv-page-top", `${top}px`);
    page.style.setProperty("--mlcv-page-width", `${Math.max(1, window.innerWidth - left)}px`);
    page.style.setProperty("--mlcv-page-height", `${Math.max(1, window.innerHeight - top)}px`);
  }

  function scheduleFit() {
    cancelAnimationFrame(state.fitFrame);
    state.fitFrame = requestAnimationFrame(() => fitPageToViewport());
  }

  async function open() {
    if (state.mounting) return state.mounting;
    if (state.failed) return false;
    state.mounting = (async () => {
    let page = document.getElementById(`${NS}-page`);
    if (page && state.instance) { await loadInitialFile(); return true; }
    if (state.instance) { state.instance.dispose(); state.instance = null; }
    const outlet = document.getElementById("main-outlet");
    if (!outlet || !document.body) return false;
    if (!page) {
      page = document.createElement("main");
      page.id = `${NS}-page`;
      page.className = `${NS}-page`;
      page.setAttribute("aria-label", t("open", "3D Viewer"));
      page.innerHTML = `<div id="${NS}-mount" class="${NS}-mount" role="application"><div class="${NS}-boot" role="status"><span aria-hidden="true"></span>${t("loading", "Loading viewer…")}</div></div>`;
      document.body.appendChild(page);
    }
    document.body.classList.add(`${NS}-route`);
    document.body.classList.toggle(`${NS}-embed`, isEmbed());
    fitPageToViewport(page);
    try {
      const viewerApi = await loadBundle();
      if (!isRoute() || !page.isConnected) return false;
      if (state.instance) return true;
      page.querySelector(`.${NS}-boot`)?.remove();
      state.instance = viewerApi.mount(page.querySelector(`#${NS}-mount`), {
        occtScriptUrl: `${ASSET_BASE}/occt-import-js-v055.js`,
        occtWasmUrl: `${ASSET_BASE}/occt-import-js-v055.wasm`,
        dracoScriptUrl: `${ASSET_BASE}/draco-wasm-wrapper-v055.js`,
        dracoWasmUrl: `${ASSET_BASE}/draco-decoder-v055.wasm`,
        labels: labels(),
      });
      configureCadPreviewLighting(state.instance);
      installDxfPolylines(state.instance);
      installComposerBridge(page);
      installCadWorkbench(state.instance, {
        t,
        embedded: isEmbed(),
        context: drawingContext,
        isRemote: () => state.loadingRouteFile,
        onFile: (file, remote) => state.bridge?.setFile(file, remote),
        onFileError: () => state.bridge?.clearFile(),
      });
      installCadFileSnapshot(state.instance, () => state.loadingRouteFile, t, () => state.bridge?.clearFile());
      await loadInitialFile();
      return true;
    } catch (error) {
      state.failed = true;
      console.error("Moaclab CAD Viewer failed to load", error);
      page.querySelector(`#${NS}-mount`).textContent = t("error", "This model could not be opened");
      return false;
    }
    })();
    try { return await state.mounting; }
    finally { state.mounting = null; }
  }

  function close() {
    cancelAnimationFrame(state.frame);
    cancelAnimationFrame(state.fitFrame);
    state.instance?.dispose?.(); state.instance = null;
    state.opening = null;
    state.failed = false;
    document.getElementById(`${NS}-page`)?.remove();
    state.shareButton = null;
    state.currentFile = null;
    state.currentFileKey = "";
    state.routeFileKey = "";
    state.loadingRouteFile = false;
    state.bridge = null;
    document.body.classList.remove(`${NS}-route`);
    document.body.classList.remove(`${NS}-embed`);
  }

  function reconcile() {
    cancelAnimationFrame(state.frame);
    state.frame = requestAnimationFrame(() => { if (isRoute()) { syncSidebar(true); fitPageToViewport(); open(); } });
  }

  function syncRoute() {
    if (isRoute()) {
      document.body.classList.add(`${NS}-route`);
      document.body.classList.toggle(`${NS}-embed`, isEmbed());
      resources?.unmount();
      syncSidebar(true); reconcile();
    } else {
      syncSidebar(false); close();
      if (isLibrary()) { enhanceLibrary(); resources?.mount(); } else { resources?.unmount(); }
    }
  }

  window.addEventListener("popstate", syncRoute);
  window.addEventListener("resize", scheduleFit, { passive: true });
  state.observer = new MutationObserver(() => {
    cancelAnimationFrame(state.frame);
    state.frame = requestAnimationFrame(syncRoute);
  });
  if (document.body) state.observer.observe(document.body, { childList: true, subtree: true });
  api.onPageChange(() => {
    cancelAnimationFrame(state.frame);
    state.frame = requestAnimationFrame(syncRoute);
  });
  syncRoute();
});
