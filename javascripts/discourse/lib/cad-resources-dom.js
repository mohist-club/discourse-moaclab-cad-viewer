// DOM helpers and icons shared by the resources page (cad-resources.js) and
// its detail pop-up (cad-resources-detail.js). Icons are static strings,
// the only HTML ever set through innerHTML here.

// Tab icons: one set, 24px, rounded 18px frame, 1.8 stroke; the active tab
// draws the same shape heavier (CSS), like Instagram's profile tabs.
const FRAME = '<rect x="3" y="3" width="18" height="18" rx="5"/>';
const tabIcon = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FRAME}${inner}</svg>`;

export const ICONS = {
  cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/></svg>',
  // the avatar's cube, stroked with Instagram's gradient
  cubeRainbow: '<svg viewBox="0 0 24 24" fill="none" stroke="url(#mlcv-res-cube-gradient)" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><defs><linearGradient id="mlcv-res-cube-gradient" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#feda75"/><stop offset=".3" stop-color="#fa7e1e"/><stop offset=".55" stop-color="#d62976"/><stop offset=".8" stop-color="#962fbf"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs><path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/></svg>',
  tabAll: tabIcon('<path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'),
  tabShare: tabIcon('<circle cx="9" cy="9" r="1.6"/><path d="m21 15-4.5-4.5L7 20"/>'),
  tabDownload: tabIcon('<path d="M12 7.5v7M8.8 11.5 12 14.7l3.2-3.2M8 17h8"/>'),
  tabOther: tabIcon('<circle cx="8" cy="12" r=".6" fill="currentColor"/><circle cx="12" cy="12" r=".6" fill="currentColor"/><circle cx="16" cy="12" r=".6" fill="currentColor"/>'),
  heart: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.5s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5.9-8 10.6-8 10.6z"/></svg>',
  heartLine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.9c0 5.9-8 10.6-8 10.6z"/></svg>',
  reply: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 12a8 8 0 1 1 3.6 6.7L4 20l1.3-3.6A8 8 0 0 1 4 12z"/></svg>',
  replyLine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 1 3.6 6.7L4 20l1.3-3.6A8 8 0 0 1 4 12z"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-5-6 5z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.4 2.6a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4l-1.8 1.8a1 1 0 0 1-1.1.2l-3.3 3.3.3 3.4a1 1 0 0 1-.3.8l-1.2 1.2a1 1 0 0 1-1.4 0l-3.2-3.2-4.7 4.7-1.4-1.4 4.7-4.7-3.2-3.2a1 1 0 0 1 0-1.4l1.2-1.2a1 1 0 0 1 .8-.3l3.4.3 3.3-3.3a1 1 0 0 1 .2-1.1z"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="4"/><path d="M17 6.5 19 8l-2 1.6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
};

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) { continue; }
    if (key === "text") { node.textContent = value; }
    else if (key === "html") { node.innerHTML = value; } // only the static ICONS above
    else if (key.startsWith("on")) { node.addEventListener(key.slice(2), value); }
    else { node.setAttribute(key, value === true ? "" : String(value)); }
  }
  for (const child of [].concat(children)) { if (child) { node.append(child); } }
  return node;
}

export const icon = (name, className = "mlcv-res__icon") => el("span", { class: className, html: ICONS[name] });
