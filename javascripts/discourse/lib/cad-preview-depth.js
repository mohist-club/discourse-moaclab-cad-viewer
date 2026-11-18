export default function configureCadPreviewDepth(viewer) {
  if (viewer.moaclabInspectionDepth) { return; }
  viewer.moaclabInspectionDepth = true;

  // Solid surfaces have no overlaid wire layer: slope bias can expose thin faces.
  const originalMaterial = viewer.material;
  viewer.material = function (...args) {
    const material = originalMaterial.apply(this, args);
    material.polygonOffset = false;
    material.polygonOffsetFactor = 0;
    material.polygonOffsetUnits = 0;
    return material;
  };

  const bounds = new WeakMap();
  const originalBeforeRender = viewer.scene.onBeforeRender;
  viewer.scene.onBeforeRender = function (...args) {
    originalBeforeRender?.apply(this, args);
    const camera = args[2];
    if (camera !== viewer.camera || !camera.isPerspectiveCamera || !viewer.group) { return; }
    let nearest = Infinity;
    let farthest = -Infinity;
    let scale = 0;
    viewer.group.traverse((object) => {
      if (!object.isMesh || !object.geometry) { return; }
      const geometry = object.geometry;
      if (!bounds.has(geometry)) {
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (!box || box.isEmpty()) { return; }
        const corners = [];
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
              corners.push(box.min.clone().set(x, y, z));
            }
          }
        }
        bounds.set(geometry, { corners, scratch: box.min.clone(), size: box.max.distanceTo(box.min) });
      }
      const bound = bounds.get(geometry);
      scale = Math.max(scale, bound.size * object.matrixWorld.getMaxScaleOnAxis());
      for (const corner of bound.corners) {
        const point = bound.scratch.copy(corner).applyMatrix4(object.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        nearest = Math.min(nearest, -point.z);
        farthest = Math.max(farthest, -point.z);
      }
    });
    if (!Number.isFinite(nearest) || !Number.isFinite(farthest) || farthest <= 0) { return; }
    // Use camera-space depth, not a large sphere: thin plates need a tight range.
    const padding = Math.max((farthest - nearest) * 0.05, scale * 0.001, 0.00001);
    const near = Math.max(nearest - padding, scale * 0.00001, 0.000001);
    const far = Math.max(farthest + padding, near * 2);
    if (camera.near !== near || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  };
}
