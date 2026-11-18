import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { readFile } from "node:fs/promises";
const lightingUrl = new URL("../javascripts/discourse/lib/cad-preview-lighting.js", import.meta.url);
const lightingSource = (await readFile(lightingUrl, "utf8")).replace('"./cad-preview-depth"', JSON.stringify(new URL("./cad-preview-depth.js", lightingUrl).href));
const { default: configure } = await import(`data:text/javascript;base64,${Buffer.from(lightingSource).toString("base64")}`);

function fixture() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaeb6bd, 2.35));
  for (const intensity of [5.2, 1.15, 1.25]) {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.castShadow = true;
    scene.add(light);
  }
  return {
    scene,
    dark: false,
    renderer: { shadowMap: { enabled: true, autoUpdate: true } },
    canvasThemeColor() { return new THREE.Color(this.dark ? 0x17191c : 0xe9ecef); },
    applyCanvasTheme() { this.scene.background = this.canvasThemeColor(); },
    setModel(group) {
      this.group = group;
      group.traverse((object) => { object.castShadow = object.receiveShadow = true; });
      return "loaded";
    },
  };
}

test("calibrates neutral lights and exposure without casting shadows", () => {
  const viewer = fixture();
  configure(viewer);
  assert.equal(viewer.renderer.shadowMap.enabled, false);
  assert.equal(viewer.renderer.shadowMap.autoUpdate, false);
  assert.equal(viewer.renderer.toneMappingExposure, 0.92);
  assert.deepEqual(viewer.scene.children.map((light) => light.intensity), [0.75, 2.8, 0.55, 0.85]);
  assert.ok(viewer.scene.children.every((light) => !light.castShadow));
  assert.equal(viewer.scene.background.getHex(), 0xcbd0d5);
});

test("preserves authored materials and geometry on subsequent models", () => {
  const viewer = fixture();
  configure(viewer);
  for (let i = 0; i < 2; i++) {
    const material = new THREE.MeshStandardMaterial({ color: 0x164c38, metalness: 0.7, roughness: 0.25 });
    const geometry = new THREE.BoxGeometry();
    const mesh = new THREE.Mesh(geometry, [material, material.clone()]);
    assert.equal(viewer.setModel(mesh), "loaded");
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.receiveShadow, false);
    assert.equal(mesh.geometry, geometry);
    assert.equal(material.color.getHex(), 0x164c38);
    assert.equal(material.metalness, 0.7);
    assert.equal(material.roughness, 0.25);
    geometry.dispose();
    mesh.material.forEach((value) => value.dispose());
  }
});

test("retains theme switching and installs wrappers only once", () => {
  const viewer = fixture();
  configure(viewer);
  const wrappedSetModel = viewer.setModel;
  configure(viewer);
  assert.equal(viewer.setModel, wrappedSetModel);
  viewer.dark = true;
  viewer.applyCanvasTheme();
  assert.equal(viewer.scene.background.getHex(), 0x252a30);
  viewer.dark = false;
  viewer.applyCanvasTheme();
  assert.equal(viewer.scene.background.getHex(), 0xcbd0d5);
});
