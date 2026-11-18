import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import configure from "../javascripts/discourse/lib/cad-preview-depth.js";

function fixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 25000);
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(244, 81, 2.5);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  group.add(mesh);
  scene.add(group);
  const viewer = { scene, camera, group, material: () => new THREE.MeshStandardMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }) };
  configure(viewer);
  return { ...viewer, mesh };
}

function frame(viewer, position, target = new THREE.Vector3()) {
  viewer.camera.position.copy(position);
  viewer.camera.lookAt(target);
  viewer.scene.updateMatrixWorld(true);
  viewer.camera.updateMatrixWorld(true);
  viewer.scene.onBeforeRender(null, viewer.scene, viewer.camera);
  for (const x of [-122, 122]) for (const y of [-40.5, 40.5]) for (const z of [-1.25, 1.25]) {
    const depth = -new THREE.Vector3(x, y, z).applyMatrix4(viewer.mesh.matrixWorld).applyMatrix4(viewer.camera.matrixWorldInverse).z;
    if (depth > 0.01) {
      assert.ok(depth > viewer.camera.near && depth < viewer.camera.far, `depth ${depth} outside ${viewer.camera.near}..${viewer.camera.far}`);
    }
  }
}

test("removes surface offset without changing geometry or material colors", () => {
  const viewer = fixture();
  const geometry = viewer.mesh.geometry;
  const material = viewer.material();
  assert.equal(material.polygonOffset, false);
  assert.equal(material.polygonOffsetFactor, 0);
  assert.equal(material.polygonOffsetUnits, 0);
  assert.equal(viewer.mesh.geometry, geometry);
});

test("keeps thin plates inside tight clipping planes at close and distant views", () => {
  const viewer = fixture();
  for (const position of [[0, 0, 600], [0, 0, 10], [140, 60, 170], [0, 0, -300]]) {
    frame(viewer, new THREE.Vector3(...position));
    assert.ok(viewer.camera.far / viewer.camera.near < 20);
  }
});

test("tracks exploded and transformed models without clipping", () => {
  const viewer = fixture();
  viewer.mesh.position.set(1000, -200, 50);
  viewer.group.rotation.y = 0.4;
  frame(viewer, new THREE.Vector3(1100, 200, 900), viewer.mesh.position);
});

test("preserves render callback and ignores non-viewer cameras or empty models", () => {
  const viewer = fixture();
  const callback = viewer.scene.onBeforeRender;
  configure(viewer);
  assert.equal(viewer.scene.onBeforeRender, callback);
  const other = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  viewer.scene.onBeforeRender(null, viewer.scene, other);
  assert.equal(other.near, 0.1);
  viewer.group.clear();
  assert.doesNotThrow(() => frame(viewer, new THREE.Vector3(0, 0, 500)));
});
