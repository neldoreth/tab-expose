"use strict";

const EXPOSE_URL = browser.runtime.getURL("expose.html");
const THUMB_SCALE = 0.5;
const MAX_THUMBS = 300;

// tabId -> { dataUrl, url, ts }
const thumbs = new Map();
// windowId -> { tabId, fromTabId, hero }
const overviews = new Map();

const isExposeUrl = (url) => typeof url === "string" && url.startsWith(EXPOSE_URL);

function storeThumb(tabId, dataUrl, url) {
  thumbs.delete(tabId);
  thumbs.set(tabId, { dataUrl, url, ts: Date.now() });
  // Map conserva el orden de inserción: los primeros son los más antiguos.
  while (thumbs.size > MAX_THUMBS) thumbs.delete(thumbs.keys().next().value);
}

// Sin `scale` se captura a la resolución del dispositivo (nítida en pantallas HiDPI).
async function captureActive(windowId, scale) {
  const [tab] = await browser.tabs.query({ active: true, windowId });
  if (!tab || isExposeUrl(tab.url)) return null;
  try {
    const opts = { format: "jpeg", quality: scale ? 80 : 92 };
    if (scale) opts.scale = scale;
    const dataUrl = await browser.tabs.captureVisibleTab(windowId, opts);
    storeThumb(tab.id, dataUrl, tab.url);
    return { tab, dataUrl };
  } catch {
    // Páginas privilegiadas (about:addons, visor de PDF de otro origen…) no se pueden capturar.
    return { tab, dataUrl: null };
  }
}

// Mantiene una miniatura reciente de la pestaña activa de cada ventana.
const pending = new Map();
function scheduleCapture(windowId, delay = 450) {
  clearTimeout(pending.get(windowId));
  pending.set(
    windowId,
    setTimeout(() => {
      pending.delete(windowId);
      if (overviews.has(windowId)) return;
      captureActive(windowId, THUMB_SCALE);
    }, delay),
  );
}

async function openOverview(windowId) {
  const existing = overviews.get(windowId);
  if (existing) {
    // Segunda pulsación: cerrar la vista y volver a la pestaña de origen.
    browser.runtime.sendMessage({ type: "dismiss", windowId }).catch(() => {});
    return;
  }

  const captured = await captureActive(windowId);
  if (!captured) return;
  const { tab: from, dataUrl: hero } = captured;

  const state = { tabId: null, fromTabId: from.id, hero };
  overviews.set(windowId, state);
  try {
    const tab = await browser.tabs.create({
      url: `${EXPOSE_URL}?w=${windowId}`,
      windowId,
      index: from.index + 1,
      active: true,
    });
    state.tabId = tab.id;
  } catch (e) {
    overviews.delete(windowId);
    throw e;
  }
}

browser.browserAction.onClicked.addListener((tab) => openOverview(tab.windowId));

browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
  const ov = overviews.get(windowId);
  if (ov && ov.tabId !== null && ov.tabId !== tabId) {
    // El usuario ha cambiado de pestaña por otra vía: la vista general sobra.
    overviews.delete(windowId);
    browser.tabs.remove(ov.tabId).catch(() => {});
  }
  scheduleCapture(windowId);
});

browser.tabs.onUpdated.addListener(
  (tabId, info, tab) => {
    if (tab.active && info.status === "complete") scheduleCapture(tab.windowId, 300);
  },
  { properties: ["status"] },
);

browser.tabs.onRemoved.addListener((tabId, { windowId }) => {
  thumbs.delete(tabId);
  const ov = overviews.get(windowId);
  if (ov && ov.tabId === tabId) overviews.delete(windowId);
});

browser.windows.onRemoved.addListener((windowId) => overviews.delete(windowId));

browser.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case "init": {
      const ov = overviews.get(msg.windowId);
      return Promise.resolve({
        fromTabId: ov ? ov.fromTabId : null,
        hero: ov ? ov.hero : null,
        thumbs: Object.fromEntries([...thumbs].map(([id, t]) => [id, t])),
      });
    }
    case "storeThumb":
      storeThumb(msg.tabId, msg.dataUrl, msg.url);
      return;
  }
});

// Primera miniatura de cada ventana ya abierta al arrancar.
browser.windows.getAll().then((wins) => wins.forEach((w) => scheduleCapture(w.id, 1000)));
