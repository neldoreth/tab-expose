"use strict";

const windowId = Number(new URLSearchParams(location.search).get("w"));
const EXPOSE_URL = browser.runtime.getURL("expose.html");
const FALLBACK_ICON = "icons/globe.svg";
const RADIUS = 12;
const LABEL_H = 34;
const BAR_H = 64;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const grid = $("grid");
const bar = $("bar");
const search = $("search");
const countEl = $("count");
const emptyEl = $("empty");
const backdrop = $("backdrop");
const backdropImg = $("backdrop-img");
const cardTpl = $("card-tpl");

const state = {
  selfId: null,
  fromTabId: null,
  hero: null, // captura a resolución completa de la pestaña de origen
  cards: new Map(), // tabId -> card
  order: [], // tabIds en el orden de la barra de pestañas
  visible: [], // tabIds que pasan el filtro de búsqueda
  layout: null,
  selected: null,
  busy: true,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Movimiento: muelles reales simulados y convertidos a una curva linear().

function spring(dampingRatio, response) {
  if (!CSS.supports("animation-timing-function", "linear(0, 1)")) {
    return { easing: "cubic-bezier(0.2, 0.9, 0.25, 1)", duration: response * 1100 };
  }
  const k = (2 * Math.PI / response) ** 2;
  const c = (4 * Math.PI * dampingRatio) / response;
  const dt = 1 / 240;
  const pts = [0];
  let x = 0, v = 0, t = 0;
  while (t < 2) {
    v += (k * (1 - x) - c * v) * dt;
    x += v * dt;
    t += dt;
    pts.push(x);
    if (Math.abs(1 - x) < 1e-3 && Math.abs(v) < 1e-2) break;
  }
  const n = 60;
  const stops = [];
  for (let i = 0; i <= n; i++) stops.push(+pts[Math.round((i * (pts.length - 1)) / n)].toFixed(4));
  stops[n] = 1;
  return { easing: `linear(${stops.join(", ")})`, duration: Math.round(t * 1000) };
}

const MOTION = {
  intro: spring(0.84, 0.55),
  outro: spring(1, 0.42),
  reflow: spring(0.88, 0.42),
};

function timing(m, extra = {}) {
  if (reduceMotion) return { duration: 120, easing: "ease-out", ...extra, delay: 0 };
  return { duration: m.duration, easing: m.easing, ...extra };
}

// Transformación que escala un rectángulo w×h alrededor de su centro (transform-origin es 0 0).
const scaleAround = (w, h, s, dx = 0, dy = 0) =>
  `translate(${dx + (w * (1 - s)) / 2}px, ${dy + (h * (1 - s)) / 2}px) scale(${s})`;

function cancelAnimations(el, id) {
  for (const a of el.getAnimations()) if (!id || a.id === id) a.cancel();
}

// ---------------------------------------------------------------------------
// Tarjetas

function hostOf(url) {
  try {
    const u = new URL(url);
    return /^(https?|ftp):$/.test(u.protocol) ? u.hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

function hueOf(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

function setFavicon(img, tab) {
  const url = tab.favIconUrl;
  img.onerror = () => {
    img.onerror = null;
    img.src = FALLBACK_ICON;
  };
  img.src = url && /^(https?|data|moz-extension):/.test(url) ? url : FALLBACK_ICON;
}

function createCard(tab) {
  const el = cardTpl.content.firstElementChild.cloneNode(true);
  const card = {
    id: tab.id,
    tab,
    el,
    thumb: el.querySelector(".thumb"),
    label: el.querySelector(".label"),
    audio: el.querySelector(".audio"),
    shot: null,
    placeholder: null,
    rect: null,
    placed: false,
    hidden: false,
    removed: false,
  };
  el.dataset.id = tab.id;

  el.addEventListener("click", (e) => {
    if (e.target.closest(".close")) closeTab(card.id);
    else if (e.target.closest(".audio")) toggleMute(card);
    else openTab(card.id);
  });
  el.addEventListener("auxclick", (e) => {
    if (e.button === 1) closeTab(card.id);
  });
  el.addEventListener("pointermove", (e) => {
    if (e.movementX || e.movementY) select(card.id, false);
  });

  updateCard(card);
  return card;
}

function updateCard(card) {
  const { tab, el } = card;
  const title = tab.title || tab.url;
  el.querySelector(".title").textContent = title;
  el.title = tab.url && tab.url !== title ? `${title}\n${tab.url}` : title;
  el.classList.toggle("pinned", tab.pinned);
  setFavicon(el.querySelector(".favicon"), tab);

  const muted = !!tab.mutedInfo?.muted;
  card.audio.hidden = !tab.audible && !muted;
  card.audio.classList.toggle("muted", muted);
  card.audio.title = muted ? "Activar sonido" : "Silenciar";

  if (!card.shot) setPlaceholder(card);
  else if (card.placeholder) card.placeholder.remove();
}

function setPlaceholder(card) {
  if (!card.placeholder) {
    card.placeholder = document.createElement("div");
    card.placeholder.className = "placeholder";
    card.placeholder.append(document.createElement("img"), document.createElement("span"));
    card.thumb.prepend(card.placeholder);
  }
  const host = hostOf(card.tab.url);
  card.placeholder.style.setProperty("--h", hueOf(host || card.tab.title || ""));
  setFavicon(card.placeholder.querySelector("img"), card.tab);
  card.placeholder.querySelector("span").textContent = host || card.tab.title || "";
}

// Pone una captura en la tarjeta. Con `fade` la imagen aparece con un fundido.
async function setShot(card, url, { fade = false, wait = true } = {}) {
  const img = new Image();
  img.className = "shot";
  img.alt = "";
  img.draggable = false;
  img.src = url;
  const decoded = img.decode().catch(() => {});
  if (wait) await decoded;
  if (card.removed) return;

  if (card.shot) card.shot.replaceWith(img);
  else card.thumb.prepend(img);
  const hadPlaceholder = !!card.placeholder;
  card.placeholder?.remove();
  card.placeholder = null;
  card.shot = img;
  if (fade && hadPlaceholder && !reduceMotion) {
    img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
  }
  return decoded;
}

// ---------------------------------------------------------------------------
// Disposición: la cuadrícula con las miniaturas más grandes que quepan.

function computeLayout(n) {
  const W = stage.clientWidth;
  const H = innerHeight;
  const aspect = innerWidth / innerHeight;
  const padX = clamp(W * 0.05, 20, 80);
  const top = BAR_H + 20;
  const bottom = 40;
  const gap = clamp(W * 0.022, 18, 34);
  const availW = W - 2 * padX;
  const availH = H - top - bottom;
  const maxW = Math.min(availW, W * 0.36);
  const minW = Math.min(200, availW);

  let cols = 1;
  let w = 0;
  for (let c = 1; c <= Math.max(1, n); c++) {
    const rows = Math.ceil(n / c);
    const byW = (availW - gap * (c - 1)) / c;
    const byH = ((availH - gap * (rows - 1)) / rows - LABEL_H) * aspect;
    const cw = Math.min(byW, byH, maxW);
    if (cw > w) {
      w = cw;
      cols = c;
    }
  }
  let scroll = false;
  if (w < minW) {
    // No caben todas: miniaturas de tamaño mínimo y desplazamiento vertical.
    cols = Math.max(1, Math.floor((availW + gap) / (minW + gap)));
    w = Math.min(maxW, (availW - gap * (cols - 1)) / cols);
    scroll = true;
  }
  w = Math.floor(w);
  const h = Math.round(w / aspect);
  const rows = Math.ceil(n / cols);
  const gridW = cols * w + (cols - 1) * gap;
  const gridH = rows * (h + LABEL_H) + (rows - 1) * gap;
  const x0 = Math.round((W - gridW) / 2);
  const y0 = Math.round(scroll ? top : top + Math.max(0, (availH - gridH) / 2));

  const rects = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    rects.push({ x: x0 + c * (w + gap), y: y0 + r * (h + LABEL_H + gap), w, h });
  }
  return { rects, cols, w, h, height: y0 + gridH + bottom };
}

function applyLayout(animate) {
  const ids = state.visible;
  const cards = ids.map((id) => state.cards.get(id));
  const before = animate ? cards.map((c) => (c.placed ? c.el.getBoundingClientRect() : null)) : [];
  if (animate) cards.forEach((c) => cancelAnimations(c.el, "flip"));

  const L = computeLayout(ids.length);
  state.layout = L;
  cards.forEach((c, i) => {
    const r = L.rects[i];
    c.rect = r;
    c.el.style.left = `${r.x}px`;
    c.el.style.top = `${r.y}px`;
    c.el.style.width = `${r.w}px`;
    c.thumb.style.height = `${r.h}px`;
  });
  grid.style.height = `${L.height}px`;

  if (animate) {
    cards.forEach((c, i) => {
      const b = before[i];
      if (!b || !b.width) return;
      const a = c.el.getBoundingClientRect();
      const dx = b.left - a.left;
      const dy = b.top - a.top;
      const s = b.width / a.width;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(s - 1) < 1e-3) return;
      const anim = c.el.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: "none" }],
        timing(MOTION.reflow),
      );
      anim.id = "flip";
    });
  }
  cards.forEach((c) => (c.placed = true));
  updateChrome();
}

function updateChrome() {
  const total = state.cards.size;
  const shown = state.visible.length;
  const noun = (n) => (n === 1 ? "pestaña" : "pestañas");
  countEl.textContent = shown === total ? `${total} ${noun(total)}` : `${shown} de ${total} ${noun(total)}`;
  emptyEl.hidden = shown > 0;
  emptyEl.textContent = total === 0 ? "No hay más pestañas en esta ventana" : "Ninguna pestaña coincide";
}

// ---------------------------------------------------------------------------
// Selección y teclado

function select(id, reveal) {
  if (state.selected === id) return;
  state.cards.get(state.selected)?.el.classList.remove("selected");
  state.selected = id;
  const card = state.cards.get(id);
  if (!card) return;
  card.el.classList.add("selected");
  if (reveal && card.rect) {
    const top = card.rect.y - BAR_H - 16;
    const bottom = card.rect.y + card.rect.h + LABEL_H + 16;
    const behavior = reduceMotion ? "auto" : "smooth";
    if (top < stage.scrollTop) stage.scrollTo({ top, behavior });
    else if (bottom > stage.scrollTop + stage.clientHeight) {
      stage.scrollTo({ top: bottom - stage.clientHeight, behavior });
    }
  }
}

function move(delta) {
  const ids = state.visible;
  if (!ids.length) return;
  const i = ids.indexOf(state.selected);
  if (i < 0) return select(ids[0], true);
  const j = i + delta;
  if (j >= 0 && j < ids.length) select(ids[j], true);
  else if (Math.abs(delta) === 1) select(ids[clamp(j, 0, ids.length - 1)], true);
}

document.addEventListener("keydown", (e) => {
  if (state.busy) {
    e.preventDefault();
    return;
  }
  const cols = state.layout?.cols ?? 1;
  const handlers = {
    ArrowLeft: () => move(-1),
    ArrowRight: () => move(1),
    ArrowUp: () => move(-cols),
    ArrowDown: () => move(cols),
    Tab: () => move(e.shiftKey ? -1 : 1),
    Enter: () => {
      const id = state.visible.includes(state.selected) ? state.selected : state.visible[0];
      if (id != null) openTab(id);
    },
    Escape: () => {
      if (search.value) {
        search.value = "";
        applyFilter();
      } else dismiss();
    },
    Delete: () => {
      if (!search.value && state.selected != null) closeTab(state.selected);
    },
  };
  const handler = handlers[e.key];
  if (handler && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    handler();
  } else if (document.activeElement !== search && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    search.focus();
  }
});

// ---------------------------------------------------------------------------
// Búsqueda

const normalize = (s) =>
  (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function applyFilter() {
  const q = normalize(search.value.trim());
  const terms = q.split(/\s+/).filter(Boolean);
  const matches = (c) => {
    const hay = normalize(`${c.tab.title} ${c.tab.url}`);
    return terms.every((t) => hay.includes(t));
  };

  const next = state.order.filter((id) => matches(state.cards.get(id)));
  const nextSet = new Set(next);

  for (const id of state.order) {
    const c = state.cards.get(id);
    const show = nextSet.has(id);
    if (show === !c.hidden) continue;
    c.hidden = !show;
    cancelAnimations(c.el, "vis");
    if (show) {
      c.el.hidden = false;
      c.placed = false;
    } else {
      const { w, h } = c.rect ?? { w: 0, h: 0 };
      const a = c.el.animate(
        [{ opacity: 1 }, { opacity: 0, transform: scaleAround(w, h, 0.9) }],
        { duration: reduceMotion ? 1 : 180, easing: "ease-in", fill: "forwards" },
      );
      a.id = "vis";
      a.finished.then(() => {
        if (c.hidden) c.el.hidden = true;
        a.cancel();
      }, () => {});
    }
  }

  const entering = next.filter((id) => !state.cards.get(id).placed);
  state.visible = next;
  applyLayout(true);

  for (const id of entering) {
    const c = state.cards.get(id);
    const a = c.el.animate(
      [{ opacity: 0, transform: scaleAround(c.rect.w, c.rect.h, 0.9) }, { opacity: 1, transform: "none" }],
      timing(MOTION.reflow),
    );
    a.id = "vis";
  }

  if (!nextSet.has(state.selected)) select(next[0] ?? null, false);
  if (stage.scrollTop > grid.offsetHeight - stage.clientHeight) stage.scrollTop = 0;
}

search.addEventListener("input", applyFilter);

// ---------------------------------------------------------------------------
// Acciones

// Abre una pestaña: su miniatura crece hasta ocupar toda la ventana y entonces se activa.
async function openTab(id) {
  const card = state.cards.get(id);
  if (state.busy || !card || card.removed) return;
  state.busy = true;
  document.body.classList.add("busy");
  state.cards.get(state.selected)?.el.classList.remove("selected");
  card.el.classList.add("zooming");

  // Mientras dura la animación pedimos una captura nítida para que el final no se vea borroso.
  if (id !== state.fromTabId || !state.hero) {
    if (!card.tab.discarded) {
      browser.tabs
        .captureTab(id, { format: "jpeg", quality: 90 })
        .then((url) => setShot(card, url))
        .catch(() => {});
    }
  }

  cancelAnimations(card.el);
  const r = card.el.getBoundingClientRect();
  const s = innerWidth / r.width;
  const t = timing(MOTION.outro, { fill: "forwards" });

  const zoom = card.el.animate(
    [{ transform: "none" }, { transform: `translate(${-r.left}px, ${-r.top}px) scale(${s})` }],
    t,
  );
  card.thumb.animate(
    [{ borderRadius: `${RADIUS}px` }, { borderRadius: "0px", boxShadow: "none" }],
    t,
  );
  card.label.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" });

  for (const other of state.cards.values()) {
    if (other === card || other.hidden || !other.rect) continue;
    cancelAnimations(other.el);
    other.el.animate(
      [{ opacity: 1 }, { opacity: 0, transform: scaleAround(other.rect.w, other.rect.h, 0.92) }],
      { duration: reduceMotion ? 1 : 260, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
    );
  }
  bar.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" });

  await zoom.finished;
  try {
    await browser.tabs.update(id, { active: true });
    // El fondo también la cierra al cambiar de pestaña; esto cubre el caso de una recarga.
    browser.tabs.remove(state.selfId).catch(() => {});
  } catch {
    // La pestaña desapareció mientras tanto: deshacer y quitar la tarjeta.
    document.getAnimations().forEach((a) => a.cancel());
    card.el.classList.remove("zooming");
    state.busy = false;
    document.body.classList.remove("busy");
    removeCard(card);
  }
}

function dismiss() {
  const from = state.cards.get(state.fromTabId);
  const target = from && !from.hidden ? from : state.cards.get(state.selected) ?? state.cards.get(state.visible[0]);
  if (target) openTab(target.id);
  else if (from) browser.tabs.update(from.id, { active: true });
  else newTab();
}

async function newTab() {
  if (state.busy) return;
  state.busy = true;
  document.body.classList.add("busy");
  await Promise.all(
    [stage, bar].map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }).finished),
  );
  await browser.tabs.create({ windowId, active: true });
  browser.tabs.remove(state.selfId).catch(() => {});
}

function closeTab(id) {
  const card = state.cards.get(id);
  if (!card || state.busy) return;
  browser.tabs.remove(id).catch(() => {});
  removeCard(card);
}

function removeCard(card) {
  if (card.removed) return;
  card.removed = true;
  const idx = state.visible.indexOf(card.id);
  state.cards.delete(card.id);
  state.order = state.order.filter((x) => x !== card.id);
  state.visible = state.visible.filter((x) => x !== card.id);

  if (card.hidden || !card.rect) {
    card.el.remove();
  } else {
    card.el.style.pointerEvents = "none";
    card.el.style.zIndex = "0";
    cancelAnimations(card.el);
    card.el
      .animate(
        [{ opacity: 1 }, { opacity: 0, transform: scaleAround(card.rect.w, card.rect.h, 0.8) }],
        { duration: reduceMotion ? 1 : 220, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "forwards" },
      )
      .finished.then(() => card.el.remove());
  }

  if (state.selected === card.id) {
    state.selected = null;
    const next = state.visible[Math.min(idx, state.visible.length - 1)];
    if (next != null) select(next, false);
  }
  applyLayout(true);
}

function toggleMute(card) {
  browser.tabs.update(card.id, { muted: !card.tab.mutedInfo?.muted }).catch(() => {});
}

$("new-tab").addEventListener("click", newTab);

// Clic en una zona vacía: volver a la pestaña de partida, como en Mission Control.
stage.addEventListener("click", (e) => {
  if (!e.target.closest(".card")) dismiss();
});

// Mantener el foco en el buscador para que escribir filtre siempre.
stage.addEventListener("mousedown", (e) => e.preventDefault());

stage.addEventListener("scroll", () => bar.classList.toggle("scrolled", stage.scrollTop > 4), {
  passive: true,
});

let resizeTimer;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!state.busy) applyLayout(true);
  }, 100);
});

// ---------------------------------------------------------------------------
// Cambios en las pestañas mientras la vista está abierta

browser.tabs.onRemoved.addListener((tabId) => {
  const card = state.cards.get(tabId);
  if (card) removeCard(card);
});

browser.tabs.onUpdated.addListener((tabId, info, tab) => {
  const card = state.cards.get(tabId);
  if (!card) return;
  card.tab = tab;
  updateCard(card);
  if (info.status === "complete" && !tab.discarded) captureQueue.push(card);
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "dismiss" && msg.windowId === windowId && !state.busy) dismiss();
});

// ---------------------------------------------------------------------------
// Capturas en segundo plano: primero las que se ven, de tres en tres.

const captureQueue = {
  items: [],
  running: 0,
  push(...cards) {
    for (const c of cards) if (!this.items.includes(c)) this.items.push(c);
    while (this.running < 3 && this.items.length) this.run();
  },
  async run() {
    this.running++;
    for (let c; (c = this.items.shift()); ) {
      if (state.busy) break;
      if (c.removed || c.tab.discarded) continue;
      const L = state.layout;
      const scale = Math.min(devicePixelRatio, ((L?.w ?? 400) * devicePixelRatio * 1.3) / innerWidth);
      try {
        const url = await browser.tabs.captureTab(c.id, { format: "jpeg", quality: 82, scale });
        await setShot(c, url, { fade: true });
        browser.runtime.sendMessage({ type: "storeThumb", tabId: c.id, dataUrl: url, url: c.tab.url }).catch(() => {});
      } catch {
        // Pestañas sin contenido capturable (about:, descargando…): se queda la tarjeta de reserva.
      }
    }
    this.running--;
  },
};

function refreshThumbs() {
  const mid = stage.scrollTop + innerHeight / 2;
  const cards = [...state.cards.values()]
    .filter((c) => !(c.id === state.fromTabId && state.hero))
    .sort((a, b) => {
      const da = a.hidden ? Infinity : Math.abs(a.rect.y + a.rect.h / 2 - mid);
      const db = b.hidden ? Infinity : Math.abs(b.rect.y + b.rect.h / 2 - mid);
      return da - db;
    });
  captureQueue.push(...cards);
}

// ---------------------------------------------------------------------------
// Entrada: la pestaña actual se encoge hasta su sitio y las demás aparecen a su alrededor.

function intro() {
  const hero = state.hero ? state.cards.get(state.fromTabId) : null;
  const t = timing(MOTION.intro);

  if (hero) {
    const maxScroll = grid.offsetHeight - stage.clientHeight;
    if (maxScroll > 0) {
      stage.scrollTop = clamp(hero.rect.y - (innerHeight - hero.rect.h) / 2, 0, maxScroll);
    }
  }

  backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduceMotion ? 1 : 420, easing: "ease-out", fill: "forwards" });
  bar.animate(
    [{ opacity: 0, transform: "translateY(-10px)" }, { opacity: 1, transform: "none" }],
    { duration: reduceMotion ? 120 : 400, delay: reduceMotion ? 0 : 160, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards" },
  );

  let center;
  let main;
  if (hero) {
    const b = hero.el.getBoundingClientRect();
    const s = innerWidth / b.width;
    hero.el.classList.add("zooming");
    main = hero.el.animate(
      [{ transform: `translate(${-b.left}px, ${-b.top}px) scale(${s})` }, { transform: "none" }],
      t,
    );
    hero.thumb.animate([{ borderRadius: "0px", boxShadow: "none" }, { borderRadius: `${RADIUS}px` }], t);
    hero.label.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 260,
      delay: reduceMotion ? 0 : t.duration * 0.35,
      easing: "ease-out",
      fill: "backwards",
    });
    main.finished.then(() => hero.el.classList.remove("zooming"));
    center = { x: hero.rect.x + hero.rect.w / 2, y: hero.rect.y + hero.rect.h / 2 };
  } else {
    center = { x: stage.clientWidth / 2, y: stage.scrollTop + innerHeight / 2 };
  }

  for (const id of state.visible) {
    const c = state.cards.get(id);
    if (c === hero) continue;
    const { x, y, w, h } = c.rect;
    const dx = (center.x - (x + w / 2)) * 0.18;
    const dy = (center.y - (y + h / 2)) * 0.18;
    const dist = Math.hypot(dx, dy) / 0.18;
    const d = reduceMotion ? 0 : Math.min(dist * 0.09, 150);
    const a = c.el.animate(
      [{ transform: scaleAround(w, h, 0.84, dx, dy) }, { transform: "none" }],
      timing(MOTION.intro, { delay: d, fill: "backwards" }),
    );
    c.el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduceMotion ? 120 : 320,
      delay: d,
      easing: "ease-out",
      fill: "backwards",
    });
    main ??= a;
  }

  return main ? main.finished : Promise.resolve();
}

async function init() {
  const [self, tabs, info] = await Promise.all([
    browser.tabs.getCurrent(),
    browser.tabs.query({ windowId }),
    browser.runtime.sendMessage({ type: "init", windowId }),
  ]);
  state.selfId = self.id;

  const list = tabs.filter((t) => t.id !== self.id && !t.hidden && !t.url?.startsWith(EXPOSE_URL));
  state.fromTabId = info.fromTabId ?? list[Math.max(0, self.index - 1)]?.id ?? null;
  state.hero = info.fromTabId != null ? info.hero : null;

  const decodes = [];
  let heroReady;
  for (const tab of list) {
    const card = createCard(tab);
    state.cards.set(tab.id, card);
    state.order.push(tab.id);
    grid.append(card.el);
    if (tab.id === state.fromTabId && state.hero) {
      heroReady = setShot(card, state.hero, { wait: false });
    } else if (info.thumbs[tab.id]) {
      decodes.push(setShot(card, info.thumbs[tab.id].dataUrl, { wait: false }));
    }
  }
  state.visible = [...state.order];

  if (state.hero) backdropImg.src = state.hero;
  // La captura principal tiene que estar lista antes del primer fotograma; las demás, si llegan a tiempo.
  await Promise.all([heroReady, Promise.race([Promise.all(decodes), delay(160)])]);

  applyLayout(false);
  await intro();

  state.busy = false;
  document.body.classList.remove("busy");
  select(state.cards.has(state.fromTabId) ? state.fromTabId : state.visible[0] ?? null, false);
  search.focus();
  refreshThumbs();
}

init();
