import icons from "./cad-workbench-icons";
import { Box3, Vector3, Color, EdgesGeometry, LineSegments, LineBasicMaterial, GridHelper } from "./cad-workbench-geometry";

export function safeTopicUrl(value, origin) {
  try {
    const url = new URL(value, origin);
    return url.origin === origin && /^\/t\//.test(url.pathname) ? url.pathname : null;
  } catch { return null; }
}

export default function installCadWorkbench(viewer, options = {}) {
  if (viewer.moaclabWorkbench) { return; }
  viewer.moaclabWorkbench = true;
  const t = options.t || ((_key, fallback) => fallback);
  const root = viewer.root;
  const abort = new AbortController();
  const listen = (node, event, callback) => node?.addEventListener(event, callback, { signal: abort.signal });
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  };
  const button = (name, label, callback, className = "mlcv-wb-button") => {
    const node = element("button", className);
    node.type = "button"; node.title = label; node.setAttribute("aria-label", label);
    if (name) { node.innerHTML = icons[name]; }
    if (callback) { listen(node, "click", callback); }
    return node;
  };
  const q = (selector) => root.querySelector(selector);
  const old = {};
  const wrap = (name, callback) => { old[name] = viewer[name]; viewer[name] = callback; };
  let file = null;
  let sourceUnit = "unknown";
  let unit = "unknown";
  let activePanel = "style";
  let backgroundMode = "theme";
  let neutral = false;
  let sectionAxis = "y";
  let sectionPercent = 50;
  let sectionReverse = false;
  let originalBounds = null;
  let failed = false;
  let lastDistance = null;
  let scaleAtFit = 1;
  const originals = new Map();
  const edges = new Map();
  const localTimers = new Set();
  const defer = (callback) => { const id = requestAnimationFrame(() => { localTimers.delete(id); if (!viewer.disposed) { callback(); } }); localTimers.add(id); };
  root.classList.add("mlcv-workbench");
  if (options.embedded) { root.classList.add("mlcv-workbench--embedded"); }
  viewer.shell.dataset.workbenchVersion = "0.6.0";

  const breadcrumb = element("nav", "mlcv-wb-breadcrumb");
  breadcrumb.setAttribute("aria-label", t("breadcrumb", "Breadcrumb"));
  const back = element("a", "", t("drawingLibrary", "Drawing library"));
  back.href = "/viewer";
  const backIcon = element("span"); backIcon.innerHTML = icons.ArrowLeft; back.prepend(backIcon);
  const separator = element("span"); separator.innerHTML = icons.ChevronRight;
  const crumbTitle = element("span", "mlcv-wb-crumb-title", t("localPreview", "Local preview"));
  breadcrumb.append(back, separator, crumbTitle);
  viewer.header.prepend(breadcrumb);
  viewer.header.querySelector(".mlcv-library-back")?.remove();
  const context = q(".mlcv-context");
  const title = element("h1", "mlcv-wb-title", t("localPreview", "Local preview"));
  const meta = element("p", "mlcv-wb-meta");
  context.replaceChildren(title, meta);
  const originalFileLabel = element("span", "mlcv-wb-canvas-file");
  originalFileLabel.dataset.fileName = "";
  viewer.stage.append(originalFileLabel);
  const nativeFileLabel = q(".mlcv-canvas-file");
  if (nativeFileLabel) { nativeFileLabel.hidden = true; }
  const formats = q(".mlcv-file__formats");
  if (formats) { formats.hidden = true; }
  const openLabel = q(".mlcv-open");
  openLabel?.querySelector("svg")?.remove();
  if (openLabel) { const icon = element("span"); icon.innerHTML = icons.FolderOpen; openLabel.prepend(icon); }
  q("[data-file]")?.setAttribute("aria-label", t("chooseAnotherFile", "Choose another file"));
  const topicLink = element("a", "mlcv-wb-topic");
  topicLink.innerHTML = icons.MessageSquare;
  topicLink.append(element("span", "", t("viewTopic", "Topic")));
  topicLink.hidden = true;
  q(".mlcv-file").prepend(topicLink);
  const fullButton = button("Maximize", t("fullscreen", "Fullscreen"), () => viewer.toggleFullscreen());
  q(".mlcv-file").append(fullButton);
  q(".mlcv-corner")?.remove();

  const toolIcons = { home:"Scan", orbit:"Orbit", pan:"Hand", inspect:"Focus", tree:"Layers", section:"Scissors", explode:"Expand", style:"SlidersHorizontal", measure:"Ruler", info:"Info" };
  viewer.toolbar.querySelectorAll("[data-action]").forEach((node) => {
    const icon = toolIcons[node.dataset.action];
    const label = node.getAttribute("aria-label") || node.textContent;
    if (icon) { node.innerHTML = icons[icon]; }
    node.title = label; node.removeAttribute("data-tooltip");
  });
  const capture = button("Camera", t("screenshot", "Capture"), null, "mlcv-tool"); capture.dataset.action = "shot";
  viewer.toolbar.append(capture);
  const toolbarFullscreen = button("Maximize", t("fullscreen", "Fullscreen"), () => viewer.toggleFullscreen(), "mlcv-tool mlcv-wb-fullscreen-tool");
  const syncFullscreenTool = () => {
    const fullscreen = document.fullscreenElement === viewer.shell || document.webkitFullscreenElement === viewer.shell;
    toolbarFullscreen.hidden = !options.embedded && !fullscreen;
    viewer.header.hidden = !!options.embedded || fullscreen;
    viewer.shell.classList.toggle("mlcv-wb-fullscreen", fullscreen);
  };
  listen(document, "fullscreenchange", syncFullscreenTool);
  listen(document, "webkitfullscreenchange", syncFullscreenTool);
  syncFullscreenTool();
  viewer.toolbar.append(toolbarFullscreen);
  const viewcube = q(".mlcv-viewcube");
  viewcube.replaceChildren();
  for (const [value, label, icon] of [["iso",t("isometric", "Isometric"),"Box"],["front",t("front", "Front")],["top",t("top", "Top")],["right",t("right", "Right")]]) {
    const node = button(icon, label); node.dataset.view = value;
    if (!icon) { node.textContent = label; }
    viewcube.append(node);
  }
  const zoomBar = element("div", "mlcv-wb-zoom");
  const zoomText = element("output", "", "100%");
  const zoom = (factor) => {
    const offset = viewer.camera.position.clone().sub(viewer.controls.target);
    offset.setLength(Math.min(viewer.controls.maxDistance, Math.max(viewer.controls.minDistance, offset.length() * factor)));
    viewer.camera.position.copy(viewer.controls.target).add(offset); viewer.controls.update();
  };
  zoomBar.append(button("Minus",t("zoomOut", "Zoom out"),()=>zoom(1.2)),zoomText,button("Plus",t("zoomIn", "Zoom in"),()=>zoom(0.84)));
  viewer.stage.append(zoomBar);
  const inspector = element("aside", "mlcv-wb-inspector");
  const tabs = element("div", "mlcv-wb-tabs");
  tabs.setAttribute("role", "tablist");
  for (const [value, label] of [["style", t("style", "Display")],["tree",t("tree", "Structure")],["info",t("info", "Info")]]) {
    const node = button(null, label, () => viewer.openPanel(value)); node.textContent = label;
    node.dataset.wbTab = value; node.setAttribute("role", "tab"); tabs.append(node);
  }
  tabs.append(button("PanelRightClose",t("close", "Close"),()=>viewer.closePanel()));
  inspector.append(tabs, viewer.panel);
  viewer.shell.append(inspector);
  const foot = element("div", "mlcv-wb-foot", t("localRendering", "Rendered locally")); inspector.append(foot);
  const togglePanel = (open) => {
    root.classList.toggle("mlcv-wb-panel-open", open);
    inspector.hidden = !open; viewer.panel.hidden = !open;
    defer(() => viewer.resize());
  };
  const notice = element("div", "mlcv-wb-state"); notice.hidden = true; notice.setAttribute("role", "status");
  viewer.stage.append(notice);
  const grid = new GridHelper(100, 20, 0x9faab1, 0xcbd2d7); grid.visible = false; viewer.scene.add(grid);
  const mats = (mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const size = () => originalBounds?.getSize(new Vector3()) || new Vector3();
  const unitLabel = () => unit === "unknown" ? t("modelUnits", "model units") : unit;
  const conversion = () => sourceUnit === "unknown" || unit === "unknown" ? 1 : ({mm:1,cm:10,in:25.4,m:1000}[sourceUnit] / {mm:1,cm:10,in:25.4}[unit]);
  const scaled = (number) => `${(number * conversion()).toFixed(2)} ${unitLabel()}`;
  const cleanupEdges = () => {
    for (const edge of edges.values()) { edge.removeFromParent(); edge.geometry.dispose(); edge.material.dispose(); }
    edges.clear();
  };
  const applyEdges = () => {
    for (const mesh of viewer.meshes) {
      if (viewer.styleMode === "wire" && !edges.has(mesh)) {
        const edge = new LineSegments(new EdgesGeometry(mesh.geometry, 30), new LineBasicMaterial({ color: 0x71818b }));
        mesh.add(edge); edges.set(mesh, edge);
      }
      const edge = edges.get(mesh);
      if (edge) { edge.visible = viewer.styleMode === "wire"; edge.material.clippingPlanes = viewer.sectionEnabled ? [viewer.clipPlane] : []; edge.material.needsUpdate = true; }
    }
  };
  function captureOriginals() {
    originals.clear();
    viewer.meshes.forEach((mesh) => originals.set(mesh, mats(mesh).map((mat) => ({color:mat.color?.clone(),map:mat.map}))));
    originalBounds = viewer.group ? new Box3().setFromObject(viewer.group) : null;
    const extent = size().length(); grid.scale.setScalar(Math.max(extent / 70, 0.01));
    grid.position.y = originalBounds ? originalBounds.min.y - extent * 0.01 : 0;
  }
  function updateMaterial() {
    const selected = viewer.selectedMesh;
    viewer.clearSelection();
    for (const mesh of viewer.meshes) {
      mats(mesh).forEach((mat,index) => {
        const source = originals.get(mesh)?.[index];
        if (mat.color && source?.color) { mat.color.copy(neutral ? new Color(0xa9b3bb) : mesh.userData.wbColor || source.color); }
        if (source) { mat.map = neutral ? null : source.map; mat.needsUpdate = true; }
      });
    }
    if (selected?.visible) { viewer.selectMesh(selected,{focus:false,animate:false}); }
  }
  function sectionPosition() {
    const normal = viewer.clipPlane.normal;
    normal.set(sectionAxis === "x" ? 1:0, sectionAxis === "y" ? 1:0, sectionAxis === "z" ? 1:0).multiplyScalar(sectionReverse ? -1:1);
    const bounds = viewer.group ? new Box3().setFromObject(viewer.group) : originalBounds;
    if (!bounds) { return; }
    const min = bounds.min[sectionAxis], max = bounds.max[sectionAxis];
    const boundary = sectionReverse ? max - (max-min)*sectionPercent/100 : min + (max-min)*sectionPercent/100;
    viewer.clipPlane.constant = -boundary * normal[sectionAxis]; viewer.clearMeasure(); applyEdges();
  }
  function section(body, label) { const node = element("section", "mlcv-wb-section"); node.append(element("h3","",label)); body.append(node); return node; }
  function row(body, label, control) { const node=element("label","mlcv-wb-row");node.append(element("span","",label),control);body.append(node);return node; }
  function range(body, label, value, min, max, callback) {
    const output=element("output","",`${value}%`); row(body,label,output);
    const input=element("input");input.type="range";input.min=min;input.max=max;input.value=value;input.setAttribute("aria-label",label);
    listen(input,"input",()=>{output.textContent=`${input.value}%`;callback(Number(input.value));});body.append(input);return input;
  }
  function check(body,label,checked,callback) { const input=element("input");input.type="checkbox";input.checked=checked;input.setAttribute("role","switch");listen(input,"change",()=>callback(input.checked));row(body,label,input);return input; }
  function choices(body, optionsList, value, callback) {
    const node=element("div","mlcv-wb-segmented");
    for(const [id,label] of optionsList){const item=button(null,label,()=>{callback(id);node.querySelectorAll("button").forEach(b=>b.classList.toggle("is-active",b===item));});item.textContent=label;item.classList.toggle("is-active",id===value);node.append(item);}body.append(node);
  }
  function showInfo(body) {
    const info=section(body,t("fileInfo","File information"));
    const list=element("dl","mlcv-info");
    for(const [label,value] of [[t("fileName","File"),file?.name||t("demo","Assembly demo")],[t("format","Format"),file?.name.split(".").pop().toUpperCase()||"DEMO"],[t("fileSize","Size"),file?`${(file.size/1048576).toFixed(2)} MB`:"—"],[t("parts","Parts"),viewer.meshes.length]]){const line=element("div");line.append(element("dt","",label),element("dd","",String(value)));list.append(line);}info.append(list);
    const dimensions=section(body,t("dimensions","Dimensions"));
    const select=element("select");for(const id of ["mm","cm","in","unknown"]){const item=element("option","",id==="unknown"?t("modelUnits","Model units"):id);item.value=id;select.append(item);}select.value=unit;
    row(dimensions,t("units","Units"),select);
    listen(select,"change",()=>{unit=select.value;viewer.openPanel("info");if(lastDistance!==null){q("[data-measure-label]").textContent=`≈ ${scaled(lastDistance)} · ${t("approximate","Approximate")}`;}});
    const measured=size();const dl=element("dl","mlcv-info");for(const axis of ["x","y","z"]){const line=element("div");line.append(element("dt","",axis.toUpperCase()),element("dd","",scaled(measured[axis])));dl.append(line);}dimensions.append(dl);
    dimensions.append(element("p","mlcv-wb-note",sourceUnit==="unknown"?t("unknownUnitNote","Source units are unknown. Unit selection is a manual assignment."):t("boundsNote","Dimensions describe the original model bounding box.")));
    body.append(element("p","mlcv-wb-note",t("measureNote","Mesh-based measurements are approximate, not manufacturing dimensions.")));
  }
  function reset() {
    viewer.setMeasure(false); viewer.clearSelection(); viewer.setExplode(0); viewer.setSection(false); viewer.setStyle("solid");
    neutral=false;viewer.meshes.forEach(mesh=>{mesh.visible=true;delete mesh.userData.wbColor;});updateMaterial();
    viewer.inspectMode=false;viewer.controls.autoRotate=false;grid.visible=false;
    viewer.renderer.toneMappingExposure=0.92;backgroundMode="theme";viewer.applyCanvasTheme();viewer.action("home");viewer.openPanel("style");
  }
  wrap("openPanel",function(kind,trigger){
    activePanel=kind;
    old.openPanel.call(this,kind,trigger);
    togglePanel(true);
    tabs.querySelectorAll("[data-wb-tab]").forEach(node=>{const on=node.dataset.wbTab===kind;node.classList.toggle("is-active",on);node.setAttribute("aria-selected",String(on));});
    const body=this.panel.querySelector("[data-panel-body]");
    if(kind==="style"){
      body.replaceChildren();
      const modes=section(body,t("renderMode","Display mode"));
      choices(modes,[["solid",t("solid","Solid")],["wire",t("wire","Edges")],["ghost",t("ghost","Transparent")]],this.styleMode,value=>this.setStyle(value));
      const material=element("select");for(const [value,label]of[["original",t("originalColor","Original colors")],["neutral",t("neutralMaterial","Neutral material")]]){const option=element("option","",label);option.value=value;material.append(option);}material.value=neutral?"neutral":"original";
      listen(material,"change",()=>{neutral=material.value==="neutral";updateMaterial();});row(modes,t("material","Material"),material);
      const canvas=section(body,t("canvas","Canvas"));
      const swatches=element("div","mlcv-wb-swatches");
      for(const [value,label,color]of[["theme",t("themeBackground","Theme"),"#f1f3f4"],["white",t("whiteBackground","White"),"#ffffff"],["dark",t("darkBackground","Dark gray"),"#303438"]]){const swatch=button(null,label,()=>{backgroundMode=value;this.applyCanvasTheme();swatches.querySelectorAll("button").forEach(b=>b.classList.toggle("is-active",b===swatch));});swatch.style.setProperty("--swatch",color);swatch.classList.toggle("is-active",backgroundMode===value);swatches.append(swatch);}row(canvas,t("background","Background"),swatches);
      check(canvas,t("grid","Reference grid"),grid.visible,on=>{grid.visible=on;});
      check(canvas,t("autoObserve","Auto observe"),this.controls.autoRotate,on=>{this.inspectMode=on;this.controls.autoRotate=on;this.syncInspectButton();if(on&&this.selectedMesh){this.focusSelection(true);}});
      range(canvas,t("brightness","Brightness"),Math.round(this.renderer.toneMappingExposure/.92*100),50,150,value=>{this.renderer.toneMappingExposure=.92*value/100;});
      const restore=button("RotateCcw",t("restoreDefaults","Restore defaults"),reset,"mlcv-wb-reset");restore.append(element("span","",t("restoreDefaults","Restore defaults")));body.append(restore);
    }else if(kind==="info"){body.replaceChildren();showInfo(body);
    }else if(kind==="section"){
      body.replaceChildren();const settings=section(body,t("section","Section"));
      check(settings,t("enableSection","Enable section"),this.sectionEnabled,on=>{this.setSection(on);sectionPosition();});
      choices(settings,[["x","X"],["y","Y"],["z","Z"]],sectionAxis,value=>{sectionAxis=value;sectionPosition();});
      range(settings,t("position","Position"),sectionPercent,0,100,value=>{sectionPercent=value;sectionPosition();});
      check(settings,t("reverse","Reverse"),sectionReverse,on=>{sectionReverse=on;sectionPosition();});
    }else if(kind==="explode"){
      body.replaceChildren();const settings=section(body,t("explode","Explode"));
      const slider=range(settings,t("separation","Separation"),this.explodeValue,0,100,value=>{this.clearMeasure();this.setExplode(value);if(this.sectionEnabled){sectionPosition();}});slider.disabled=this.meshes.length<2;
    }
    this.panel.querySelector("header").hidden=["style","tree","info"].includes(kind);
  });
  wrap("closePanel",function(){old.closePanel.call(this);togglePanel(false);});
  wrap("setStyle",function(mode){old.setStyle.call(this,mode==="wire"?"solid":mode);this.styleMode=mode;applyEdges();});
  wrap("setSection",function(on){old.setSection.call(this,on);applyEdges();});
  wrap("setSelectedColor",function(hex,code){if(this.selectedMesh){this.selectedMesh.userData.wbColor=new Color(hex);}neutral=false;old.setSelectedColor.call(this,hex,code);});
  wrap("renderColorEditor",function(){old.renderColorEditor.call(this);const editor=q("[data-color-editor]");if(!editor||!this.selectedMesh){return;}const restore=button("RotateCcw",t("restoreColor","Restore original color"),()=>{delete this.selectedMesh.userData.wbColor;delete this.selectedMesh.userData.mlcvColorCode;updateMaterial();this.renderColorEditor();},"mlcv-wb-reset");restore.append(element("span","",t("restoreColor","Restore original color")));editor.append(restore);});
  wrap("renderTree",function(){old.renderTree.call(this);const list=q("[data-tree-list]");if(!list){return;}const actions=element("div","mlcv-wb-part-actions");const all=button(null,t("showAll","Show all"),()=>{this.meshes.forEach(mesh=>{mesh.visible=true;});this.renderTree();});all.textContent=t("showAll","Show all");const isolate=button(null,t("isolate","Isolate selected"),()=>{this.meshes.forEach(mesh=>{mesh.visible=mesh===this.selectedMesh;});this.clearMeasure();this.renderTree();});isolate.textContent=t("isolate","Isolate selected");isolate.disabled=!this.selectedMesh;actions.append(all,isolate);list.append(actions);});
  wrap("selectMesh",function(...args){const result=old.selectMesh.apply(this,args);const isolate=q(".mlcv-wb-part-actions button:last-child");if(isolate){isolate.disabled=!this.selectedMesh;}return result;});
  wrap("clearModel",function(...args){cleanupEdges();originals.clear();originalBounds=null;return old.clearModel.apply(this,args);});
  wrap("setModel",function(...args){
    this.sectionEnabled=false;this.explodeValue=0;neutral=false;
    const result=old.setModel.apply(this,args);captureOriginals();
    const explodeButton=q('[data-action="explode"]');explodeButton.disabled=this.meshes.length<2;explodeButton.title=this.meshes.length<2?t("singlePart","Single part: explode unavailable"):t("explode","Explode");
    const renderSize=size().length();if(renderSize>0){this.controls.minDistance=renderSize*.015;this.controls.maxDistance=renderSize*50;}
    defer(()=>{if(!inspector.hidden){this.openPanel(activePanel);}this.resize();});return result;
  });
  wrap("canvasThemeColor",function(...args){const color=old.canvasThemeColor.apply(this,args);if(backgroundMode==="white"){return color.setHex(0xffffff);}if(backgroundMode==="dark"){return color.setHex(0x303438);}const light=color.r*.2126+color.g*.7152+color.b*.0722>.35;return color.setHex(light?0xf1f3f4:0x303438);});
  wrap("fit",function(...args){
    this.resize();
    const result=old.fit.apply(this,args);
    // The native fit uses vertical FOV only; portrait viewports also need horizontal clearance.
    if(this.camera.aspect>0&&this.camera.aspect<1){
      const offset=this.camera.position.clone().sub(this.controls.target).multiplyScalar(1/this.camera.aspect);
      this.camera.position.copy(this.controls.target).add(offset);this.controls.update();
    }
    scaleAtFit=this.camera.position.distanceTo(this.controls.target);return result;
  });
  wrap("setStatus",function(message,error=false,loading=false){
    failed=error;old.setStatus.call(this,message,error,loading);
    notice.hidden=!(error||loading);notice.replaceChildren();notice.classList.toggle("is-loading",loading);notice.classList.toggle("is-error",error);
    if(error||loading){notice.append(element("p","",message));if(error){const retry=button("FolderOpen",t("chooseAnotherFile","Choose another file"),()=>q("[data-file]").click());retry.append(element("span","",t("chooseAnotherFile","Choose another file")));notice.append(retry);}}
    if(!error&&!loading&&!this.dxfLayer){this.status.textContent=`${this.meshes.length} ${t("parts","parts")} · ${unitLabel()}`;}
  });
  wrap("loadFile",async function(nextFile){
    const remote=options.isRemote?.();
    file=nextFile;failed=false;
    sourceUnit=/\.(step|stp|igs|iges)$/i.test(file.name)?"mm":/\.(glb|gltf)$/i.test(file.name)?"m":"unknown";
    unit=sourceUnit==="unknown"?"unknown":"mm";lastDistance=null;
    title.textContent=file.name.replace(/\.[^.]+$/,"");crumbTitle.textContent=title.textContent;
    originalFileLabel.textContent=file.name;
    meta.textContent=`${file.name.split(".").pop().toUpperCase()} · ${(file.size/1048576).toFixed(2)} MB`;
    topicLink.hidden=true;foot.textContent=remote?t("localRendering","Rendered locally"):t("localNotUploaded","Local file · not uploaded");
    if(remote){const context=options.context?.();const url=safeTopicUrl(context?.topic_url,location.origin);if(url){topicLink.href=url;topicLink.hidden=false;}if(context?.title){title.textContent=context.title;crumbTitle.textContent=context.title;}if(context?.username){meta.textContent=`${context.username} · ${meta.textContent}`;}}
    await old.loadFile.call(this,nextFile);
    if(this.disposed){return;}
    if(!failed&&(this.meshes.length||this.dxfLayer?.querySelector("svg"))){options.onFile?.(nextFile,remote);captureOriginals();if(!inspector.hidden){this.openPanel(activePanel);}}
    else {options.onFileError?.();}
  });
  wrap("pickMeasure",function(event){
    // Use the existing raycaster/markers, retaining the unrounded distance for unit conversion.
    const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);
    const hit=this.raycaster.intersectObjects(this.meshes.filter(mesh=>mesh.visible),false)[0];
    if(!hit||(this.sectionEnabled&&this.clipPlane.distanceToPoint(hit.point)<0)){return;}
    const previous=this.measurePoints[0]?.clone();old.pickMeasure.call(this,event);
    if(previous){lastDistance=previous.distanceTo(hit.point);q("[data-measure-label]").textContent=`≈ ${scaled(lastDistance)} · ${t("approximate","Approximate")}`;}
  });
  wrap("action",function(name,node){
    if(node?.disabled){return;}
    if(name==="measure"){this.controls.autoRotate=false;this.inspectMode=false;this.syncInspectButton();}
    if(name==="orbit"||name==="pan"){this.setMeasure(false);}
    return old.action.call(this,name,node);
  });
  wrap("resize",function(){
    const rect=this.canvasHost.getBoundingClientRect();if(rect.width<2||rect.height<2){return;}
    this.renderer.setSize(rect.width,rect.height,true);this.camera.aspect=rect.width/rect.height;this.camera.updateProjectionMatrix();
  });
  const onControls=()=>{const distance=viewer.camera.position.distanceTo(viewer.controls.target);const value=distance>0?Math.round(scaleAtFit/distance*100):100;if(zoomText.textContent!==`${value}%`){zoomText.textContent=`${value}%`;}};
  viewer.controls.addEventListener("change",onControls);
  wrap("dispose",function(...args){abort.abort();localTimers.forEach(cancelAnimationFrame);this.controls.removeEventListener("change",onControls);grid.removeFromParent();grid.geometry.dispose();[].concat(grid.material).forEach(mat=>mat.dispose());cleanupEdges();return old.dispose.apply(this,args);});
  captureOriginals();viewer.applyCanvasTheme();
  title.textContent=t("localPreview","Local preview");crumbTitle.textContent=title.textContent;meta.textContent="STEP · IGES · DXF · DWG · GLB · GLTF · STL · OBJ";
  originalFileLabel.textContent=t("demo","Assembly demo");
  if(!options.embedded&&window.innerWidth>900){viewer.openPanel("style");}else{togglePanel(false);}
  defer(()=>{viewer.resize();viewer.fit();});
  return { setFileContext: (value) => { file=value; }, reset };
}
