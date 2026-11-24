// The drawing library page (/viewer without parameters) is rendered by the
// discourse-moaclab-tools plugin. Its header links ("local preview" and
// "upload") are hidden in common.scss and replaced here by one button that
// opens the file picker and then the viewer with the chosen file.
const ACCEPT = ".step,.stp,.iges,.igs,.dxf,.dwg,.glb,.gltf,.stl,.obj";
const PREVIEW_URL = "/viewer?mode=preview";

let pendingFile = null;

// The file picked on the library page, handed to the viewer once it mounts.
export function takePendingLocalFile() {
  const file = pendingFile;
  pendingFile = null;
  return file;
}

export default function installLibraryActions(api, t) {
  // /viewer → /viewer?mode=preview only changes the query, which the route
  // can treat as no transition at all. If the URL has not moved shortly
  // after, move it here: the initializer listens to popstate and opens the
  // viewer with the pending file (no reload, so the file is kept).
  function goToPreview() {
    const arrived = () => new URLSearchParams(location.search).get("mode") === "preview";
    try {
      api.container.lookup("service:router").transitionTo(PREVIEW_URL)?.catch?.(() => {});
    } catch { /* handled below */ }
    setTimeout(() => {
      if (arrived() || !pendingFile) { return; }
      history.pushState(history.state, "", PREVIEW_URL);
      window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    }, 250);
  }

  // A file input whose chosen file opens the viewer. It is visually hidden
  // rather than display:none, so it can sit inside a <label> that opens it
  // natively (Safari / iOS ignore click() on some hidden inputs).
  function filePicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.className = "mlcv-file-input";
    input.tabIndex = -1;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) { return; }
      pendingFile = file;
      goToPreview();
    });
    return input;
  }

  function enhanceLibrary() {
    const actions = document.querySelector(".moaclab-cad-library__actions");
    if (!actions || actions.querySelector(".mlcv-library-preview")) { return; }

    const input = filePicker();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-primary mlcv-library-preview";
    button.textContent = t("previewDrawing", "Preview drawing");
    button.addEventListener("click", () => input.click());

    actions.classList.add("mlcv-library-actions");
    actions.append(button, input);
  }
  enhanceLibrary.filePicker = filePicker;
  return enhanceLibrary;
}
