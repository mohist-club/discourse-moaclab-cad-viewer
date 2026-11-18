// SVG images loaded through Blob URLs cannot inherit the page's CSS.
// Freeze paint and typography before rasterizing, so cutouts stay unfilled.
export function serializeDrawingSvg(svg, width, height) {
  const clone = svg.cloneNode(true);
  const sourceNodes = [svg, ...svg.querySelectorAll("*")];
  const targetNodes = [clone, ...clone.querySelectorAll("*")];
  const properties = [
    "color", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
    "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
    "stroke-dasharray", "stroke-dashoffset", "opacity", "vector-effect",
    "font-family", "font-size", "font-weight", "font-style", "letter-spacing",
    "text-anchor", "dominant-baseline", "visibility", "display",
  ];
  sourceNodes.forEach((source, index) => {
    const style = getComputedStyle(source);
    const target = targetNodes[index];
    for (const property of properties) {
      const value = style.getPropertyValue(property);
      if (value) { target.style.setProperty(property, value); }
    }
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  // Paint widths are frozen above; layout comes from the export dimensions.
  clone.style.setProperty("width", `${width}px`);
  clone.style.setProperty("height", `${height}px`);
  clone.style.setProperty("max-width", "none");
  clone.style.setProperty("max-height", "none");
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return new XMLSerializer().serializeToString(clone);
}
