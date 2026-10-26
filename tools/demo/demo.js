const P = new URLSearchParams(location.search);
const T = [
  [1, "Safari (navegador) - Wikipedia, la enciclopedia libre", "https://es.wikipedia.org/wiki/Safari_(navegador)", "https://es.wikipedia.org/static/favicon/wikipedia.ico"],
  [2, "Extensiones del navegador - Mozilla | MDN", "https://developer.mozilla.org/es/docs/Mozilla/Add-ons/WebExtensions", "https://developer.mozilla.org/favicon.ico"],
  [3, "Hacker News", "https://news.ycombinator.com/", "https://news.ycombinator.com/favicon.ico"],
  [4, "Wikipedia", "https://www.wikipedia.org/", "https://www.wikipedia.org/static/favicon/wikipedia.ico"],
  [5, "Firefox — El navegador independiente", "https://www.mozilla.org/es-ES/firefox/", "https://www.mozilla.org/favicon.ico"],
  [6, "OpenStreetMap", "https://www.openstreetmap.org/", "https://www.openstreetmap.org/favicon.ico"],
  [7, "MDN Web Docs", "https://developer.mozilla.org/es/", "https://developer.mozilla.org/favicon.ico"],
  [8, "Mozilla Firefox - Wikipedia, la enciclopedia libre", "https://es.wikipedia.org/wiki/Firefox", "https://es.wikipedia.org/static/favicon/wikipedia.ico"],
];
const shot = (id) => `${location.origin}/sites/${id}.png`;
const tabs = T.map(([id, title, url, fav], i) => ({ id, index: i, title, url, favIconUrl: fav, pinned: false, audible: id === 6 && P.has("audio"), mutedInfo: { muted: false }, discarded: false, hidden: false }));
tabs.push({ id: 99, index: 8, title: "Pestañas", url: "x" });
const FROM = +(P.get("from") || 5);
window.browser = {
  runtime: { getURL: (p) => location.origin + "/" + p, sendMessage: async (m) => m.type === "init" ? { fromTabId: FROM, hero: shot(FROM), thumbs: Object.fromEntries(T.map(([id]) => [id, { dataUrl: shot(id) }])) } : undefined, onMessage: { addListener() {} } },
  tabs: { getCurrent: async () => ({ id: 99, index: 8 }), query: async () => tabs, captureTab: async (id) => shot(id), update: async () => {}, remove: async () => {}, create: async () => {}, onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
};
const freeze = P.has("t") ? +P.get("t") : null;
const phase = P.get("phase") || "intro";
let armed = phase === "intro" && freeze != null;
const animate = Element.prototype.animate;
Element.prototype.animate = function (k, o) {
  const a = animate.call(this, k, o);
  if (armed) { a.pause(); a.currentTime = freeze; }
  return a;
};
if (phase === "outro") setTimeout(() => { armed = freeze != null; document.querySelector(`[data-id="${P.get("target") || 2}"]`).click(); }, 1500);
const q = P.get("q");
if (q) setTimeout(() => { const s = document.getElementById("search"); s.value = q; s.dispatchEvent(new Event("input")); }, 1300);
const hover = P.get("hover");
if (hover) setTimeout(() => { const c = document.querySelector(`[data-id="${hover}"]`); c.dispatchEvent(new PointerEvent("pointermove", { movementX: 1, bubbles: true })); c.classList.add("demo-hover"); }, 1300);
