const KEY = "moaclab-cad-library-navigation-v1";
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; } };
const previewKey = (url) => {
  const params = new URL(url, location.origin).searchParams;
  return [params.get("id"), params.get("upload"), params.get("url")].filter(Boolean).join("|");
};

export function drawingContext() {
  const memory = read();
  return memory?.key && memory.key === previewKey(location.href) ? memory : null;
}

export default function rememberDrawingLibrary(api) {
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.(".moaclab-cad-library a[href]");
    if (!link) { return; }
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin || url.pathname !== "/viewer" || !url.search) { return; }
    const card = link.closest(".moaclab-cad-library__card");
    try {
      sessionStorage.setItem(KEY, JSON.stringify({
        key: previewKey(url.href),
        topic_url: card?.querySelector("h2 a")?.getAttribute("href"),
        title: card?.querySelector("h2")?.textContent?.trim(),
        username: card?.querySelector(".moaclab-cad-library__byline")?.childNodes[0]?.textContent?.trim(),
        query: document.querySelector("#cad-library-query")?.value || "",
        scroll: window.scrollY,
      }));
    } catch { /* Private browsing can disable session storage. */ }
  }, true);

  let generation = 0;
  api.onPageChange(() => {
    const token = ++generation;
    if (location.pathname !== "/viewer" || location.search) { return; }
    const memory = read();
    if (!memory) { return; }
    let attempts = 0;
    const restore = () => {
      if (generation !== token || location.pathname !== "/viewer" || location.search) { return; }
      const input = document.querySelector("#cad-library-query");
      // The format filter is hidden (common.scss), so only the search text is restored.
      if (!input) { if (++attempts < 20) { setTimeout(restore, 100); } return; }
      input.value = memory.query; input.dispatchEvent(new Event("input", { bubbles: true }));
      if (memory.query) { input.form?.requestSubmit(); }
      let waits = 0;
      const restoreScroll = () => {
        if (generation !== token || location.pathname !== "/viewer" || location.search) { return; }
        const grid = document.querySelector(".moaclab-cad-library__grid");
        if (grid?.getAttribute("aria-busy") === "true" && ++waits < 30) { setTimeout(restoreScroll, 100); return; }
        window.scrollTo(0, Number(memory.scroll) || 0);
      };
      requestAnimationFrame(restoreScroll);
    };
    restore();
  });
}
