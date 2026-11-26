// "Share" without the source: the viewer's display meshes written as one
// binary glTF (GLB), so a shared post carries triangles to look at, never
// the STEP / IGES file itself. Only what is on screen is written: positions,
// normals and indices of each visible mesh, its world matrix and a plain
// colour. No B-rep, no feature tree, no original file bytes.
//
// Takes three.js-like meshes ({ geometry.attributes, geometry.index,
// matrixWorld.elements, material(s).color, visible, name }) and returns a
// Uint8Array. Pure (no DOM), so it runs under node --test.

const FLOAT = 5126;
const UINT16 = 5123;
const UINT32 = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

const pad4 = (length) => (4 - (length % 4)) % 4;

function colorOf(mesh) {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const color = material?.color;
  const channel = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.7));
  return {
    base: [channel(color?.r), channel(color?.g), channel(color?.b), 1],
    metallic: Math.min(1, Math.max(0, material?.metalness ?? 0.1)),
    roughness: Math.min(1, Math.max(0, material?.roughness ?? 0.6)),
  };
}

export function meshesToGlb(meshes, { name = "Moaclab CAD" } = {}) {
  const chunks = [];
  let byteLength = 0;
  const bufferViews = [];
  const accessors = [];
  const gltfMeshes = [];
  const nodes = [];
  const materials = [];
  const materialIndex = new Map();

  const addView = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const copy = bytes.slice();
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: copy.byteLength, target });
    chunks.push(copy);
    byteLength += copy.byteLength;
    const padding = pad4(byteLength);
    if (padding) { chunks.push(new Uint8Array(padding)); byteLength += padding; }
    return bufferViews.length - 1;
  };

  for (const mesh of meshes || []) {
    if (!mesh || mesh.visible === false) { continue; }
    const position = mesh.geometry?.attributes?.position;
    if (!position?.array || position.itemSize !== 3 || !position.count) { continue; }

    const positions = Float32Array.from(position.array.subarray ? position.array.subarray(0, position.count * 3) : position.array);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const value = positions[i + k];
        if (value < min[k]) { min[k] = value; }
        if (value > max[k]) { max[k] = value; }
      }
    }
    accessors.push({ bufferView: addView(positions, ARRAY_BUFFER), componentType: FLOAT, count: position.count, type: "VEC3", min, max });
    const attributes = { POSITION: accessors.length - 1 };

    const normal = mesh.geometry.attributes.normal;
    if (normal?.array && normal.itemSize === 3 && normal.count === position.count) {
      accessors.push({ bufferView: addView(Float32Array.from(normal.array.subarray ? normal.array.subarray(0, normal.count * 3) : normal.array), ARRAY_BUFFER), componentType: FLOAT, count: normal.count, type: "VEC3" });
      attributes.NORMAL = accessors.length - 1;
    }

    const primitive = { attributes, mode: 4 };
    const index = mesh.geometry.index;
    if (index?.array && index.count) {
      const wide = position.count > 65535;
      const indices = wide ? Uint32Array.from(index.array.subarray ? index.array.subarray(0, index.count) : index.array) : Uint16Array.from(index.array.subarray ? index.array.subarray(0, index.count) : index.array);
      accessors.push({ bufferView: addView(indices, ELEMENT_ARRAY_BUFFER), componentType: wide ? UINT32 : UINT16, count: index.count, type: "SCALAR" });
      primitive.indices = accessors.length - 1;
    }

    const color = colorOf(mesh);
    const colorKey = JSON.stringify(color);
    if (!materialIndex.has(colorKey)) {
      materials.push({ pbrMetallicRoughness: { baseColorFactor: color.base, metallicFactor: color.metallic, roughnessFactor: color.roughness }, doubleSided: true });
      materialIndex.set(colorKey, materials.length - 1);
    }
    primitive.material = materialIndex.get(colorKey);

    gltfMeshes.push({ primitives: [primitive] });
    const node = { mesh: gltfMeshes.length - 1 };
    if (mesh.name) { node.name = String(mesh.name).slice(0, 120); }
    const matrix = mesh.matrixWorld?.elements;
    if (matrix && matrix.length === 16 && !isIdentity(matrix)) { node.matrix = Array.from(matrix); }
    nodes.push(node);
  }

  if (!nodes.length) { throw new Error("no visible meshes to share"); }

  const json = {
    asset: { version: "2.0", generator: "Moaclab CAD Viewer (display mesh)" },
    scene: 0,
    scenes: [{ name: String(name).slice(0, 120), nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: gltfMeshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = new Uint8Array(jsonBytes.length + pad4(jsonBytes.length)).fill(0x20);
  jsonPadded.set(jsonBytes);
  const total = 12 + 8 + jsonPadded.length + 8 + byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonPadded.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonPadded, 20);
  let offset = 20 + jsonPadded.length;
  view.setUint32(offset, byteLength, true);
  view.setUint32(offset + 4, 0x004e4942, true); // "BIN\0"
  offset += 8;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

function isIdentity(m) {
  for (let i = 0; i < 16; i++) {
    if (Math.abs(m[i] - (i % 5 === 0 ? 1 : 0)) > 1e-9) { return false; }
  }
  return true;
}
