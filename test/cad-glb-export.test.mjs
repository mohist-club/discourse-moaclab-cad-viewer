import assert from "node:assert/strict";
import test from "node:test";
import { meshesToGlb } from "../javascripts/discourse/lib/cad-glb-export.js";

const box = (name, offset, color) => ({
  name,
  visible: true,
  geometry: {
    attributes: {
      position: { array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), itemSize: 3, count: 4 },
      normal: { array: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), itemSize: 3, count: 4 },
    },
    index: { array: new Uint16Array([0, 1, 2, 0, 2, 3]), count: 6 },
  },
  matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, offset, 0, 0, 1] },
  material: { color, metalness: 0.5, roughness: 0.4 },
});

function readGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(4, true), 2);
  assert.equal(view.getUint32(8, true), bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const binLength = view.getUint32(20 + jsonLength, true);
  assert.equal(view.getUint32(24 + jsonLength, true), 0x004e4942);
  return { json, bin: bytes.subarray(28 + jsonLength, 28 + jsonLength + binLength) };
}

test("writes a valid GLB of the visible meshes only", () => {
  const hidden = { ...box("hidden", 9, { r: 0, g: 0, b: 0 }), visible: false };
  const glb = meshesToGlb([box("case", 0, { r: 0.5, g: 0.1, b: 0.3 }), box("plate", 5, { r: 0.6, g: 0.6, b: 0.6 }), hidden], { name: "BOT60" });
  const { json, bin } = readGlb(glb);
  assert.equal(json.nodes.length, 2);
  assert.deepEqual(json.nodes.map((n) => n.name), ["case", "plate"]);
  assert.equal(json.nodes[0].matrix, undefined); // identity left out
  assert.equal(json.nodes[1].matrix[12], 5);
  assert.equal(json.materials.length, 2);
  assert.deepEqual(json.accessors[0].min, [0, 0, 0]);
  assert.deepEqual(json.accessors[0].max, [1, 1, 1]);
  assert.equal(json.buffers[0].byteLength, bin.byteLength);
  assert.equal(json.bufferViews.every((v) => v.byteOffset % 4 === 0), true);
  assert.equal(json.scenes[0].name, "BOT60");
});

test("refuses an empty scene", () => {
  assert.throws(() => meshesToGlb([]), /no visible meshes/);
});

test("three.js GLTFLoader reads it back", async () => {
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const glb = meshesToGlb([box("case", 0, { r: 0.5, g: 0.1, b: 0.3 }), box("plate", 5, { r: 0.6, g: 0.6, b: 0.6 })]);
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "", resolve, reject));
  const meshes = [];
  gltf.scene.traverse((node) => { if (node.isMesh) { meshes.push(node); } });
  assert.equal(meshes.length, 2);
  assert.equal(meshes[0].geometry.index.count, 6);
  assert.equal(meshes[1].position.x, 5);
});
