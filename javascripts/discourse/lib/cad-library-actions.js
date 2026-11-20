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
  function goToPreview() {
    try {
      api.container.lookup("service:router").transitionTo(PREVIEW_URL);
    } catch {
      pendingFile = null;
      window.location.assign(PREVIEW_URL);
    }
  }

  return function enhanceLibrary() {
    const actions = document.querySelector(".moaclab-cad-library__actions");
    if (!actions || actions.querySelector(".mlcv-library-preview")) { return; }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) { return; }
      pendingFile = file;
      goToPreview();
    });

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-primary mlcv-library-preview";
    button.textContent = t("previewDrawing", "Preview drawing");
    button.addEventListener("click", () => input.click());

    actions.classList.add("mlcv-library-actions");
    actions.append(button, input);
  };
}
