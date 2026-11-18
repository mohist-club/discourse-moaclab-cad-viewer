// DXF lightweight polylines store the outgoing circular arc as tan(sweep / 4).
// Adapt them to the runtime's XY polyline renderer, including the closing edge.
export function expandPolyline(vertices, closed, tolerance = 0.005) {
  if (!vertices.length) { return []; }
  const points = [[vertices[0].x, vertices[0].y]];
  const count = closed ? vertices.length : vertices.length - 1;
  for (let index = 0; index < count; index++) {
    const from = vertices[index];
    const to = vertices[(index + 1) % vertices.length];
    const bulge = from.bulge || 0;
    const dx = to.x - from.x, dy = to.y - from.y;
    const chord = Math.hypot(dx, dy);
    if (Math.abs(bulge) > 1e-10 && chord > 1e-10) {
      const sweep = 4 * Math.atan(bulge);
      const offset = chord * (1 - bulge * bulge) / (4 * bulge);
      const cx = (from.x + to.x) / 2 - dy / chord * offset;
      const cy = (from.y + to.y) / 2 + dx / chord * offset;
      const radius = Math.hypot(from.x - cx, from.y - cy);
      const start = Math.atan2(from.y - cy, from.x - cx);
      const step = Math.max(1e-5, Math.min(Math.PI / 36,
        2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / radius)))));
      const segments = Math.min(8192, Math.max(2, Math.ceil(Math.abs(sweep) / step)));
      for (let sample = 1; sample < segments; sample++) {
        const angle = start + sweep * sample / segments;
        points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
      }
    }
    points.push([to.x, to.y]);
  }
  return points;
}

export function normalizeDxfPolylines(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const pairs = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    pairs.push([lines[index].trim(), lines[index + 1].trim()]);
  }
  const output = [];
  let section = "";
  for (let index = 0; index < pairs.length;) {
    const pair = pairs[index];
    if (pair[0] === "0" && pair[1] === "SECTION") { section = pairs[index + 1]?.[1]; }
    if (pair[0] === "0" && pair[1] === "ENDSEC") { section = ""; }
    if (section !== "ENTITIES" || pair[0] !== "0" || pair[1] !== "LWPOLYLINE") {
      output.push(pair); index++; continue;
    }
    let end = index + 1;
    while (end < pairs.length && pairs[end][0] !== "0") { end++; }
    const entity = pairs.slice(index + 1, end);
    const vertices = [];
    let vertex;
    for (const [code, value] of entity) {
      if (code === "10") { vertex = { x: Number(value), y: NaN, bulge: 0 }; vertices.push(vertex); }
      else if (vertex && code === "20") { vertex.y = Number(value); }
      else if (vertex && code === "42") { vertex.bulge = Number(value); }
    }
    if (vertices.some(v => !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.bulge))) {
      throw new Error("Invalid DXF polyline coordinates");
    }
    const closed = (Number(entity.find(([code]) => code === "70")?.[1] || 0) & 1) === 1;
    const points = expandPolyline(vertices, closed);
    // Keep layer, elevation, extrusion, and other entity metadata intact.
    const metadata = entity.filter(([code]) => !["10", "20", "40", "41", "42", "90", "91"].includes(code));
    output.push(pair, ...metadata, ["90", String(points.length)]);
    for (const [x, y] of points) { output.push(["10", String(x)], ["20", String(y)]); }
    index = end;
  }
  return output.map(pair => pair.join("\n")).join("\n") + "\n";
}

export default function installDxfPolylines(viewer) {
  const original = viewer.setDxf;
  viewer.setDxf = function (input, name) {
    return original.call(this, typeof input === "string" ? normalizeDxfPolylines(input) : input, name);
  };
}
