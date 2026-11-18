import configureCadPreviewDepth from "./cad-preview-depth";

export default function configureCadPreviewLighting(viewer) {
  if (viewer.moaclabInspectionLighting) { return; }
  viewer.moaclabInspectionLighting = true;
  configureCadPreviewDepth(viewer);
  if (viewer.root) { viewer.root.dataset.cadRenderProfile = "0.5.3"; }
  // Thin, double-sided CAD faces can self-shadow across their tessellation.
  // Preserve surface lighting, but disable cast shadows for inspection views.
  viewer.renderer.shadowMap.enabled = false;
  viewer.renderer.shadowMap.autoUpdate = false;
  viewer.renderer.toneMappingExposure = 0.92;
  let directionalIndex = 0;
  const directions = [
    { intensity: 2.8, position: [-3, 5, 4] },
    { intensity: 0.55, position: [4, 1, 2] },
    { intensity: 0.85, position: [-4, 3, -4] },
  ];
  const disableMeshShadows = (object) => {
    if (!object.isMesh) { return; }
    object.castShadow = false;
    object.receiveShadow = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material) { material.needsUpdate = true; }
    });
  };
  viewer.scene.traverse((object) => {
    if (object.isLight) {
      object.castShadow = false;
    }
    if (object.isHemisphereLight) {
      object.intensity = 0.75;
      object.color.setHex(0xffffff);
      object.groundColor.setHex(0x687078);
    }
    if (object.isDirectionalLight) {
      const preset = directions[directionalIndex++];
      if (preset) {
        object.intensity = preset.intensity;
        object.color.setHex(0xffffff);
        object.position.set(...preset.position);
      }
    }
    disableMeshShadows(object);
  });

  // Keep native theme detection, but separate pale CAD surfaces from the canvas.
  const originalCanvasThemeColor = viewer.canvasThemeColor;
  viewer.canvasThemeColor = function (...args) {
    const color = originalCanvasThemeColor.apply(this, args);
    const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    return color.setHex(luminance > 0.5 ? 0xcbd0d5 : 0x252a30);
  };
  viewer.applyCanvasTheme();

  // New files use the same profile without altering authored colors or geometry.
  const originalSetModel = viewer.setModel;
  viewer.setModel = function (...args) {
    const result = originalSetModel.apply(this, args);
    this.group?.traverse(disableMeshShadows);
    return result;
  };
}
