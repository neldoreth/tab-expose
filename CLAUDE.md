# Tab Exposé: notas para seguir

Extensión de Firefox que imita la vista general de pestañas de Safari. Repositorio público:
<https://github.com/neldoreth/tab-expose>. La interfaz está en español.

## Arquitectura

- **Manifest V2** a propósito. Con MV3, Firefox pide al usuario que conceda `<all_urls>` a mano
  (sin él no hay `captureTab`) y el fondo deja de ser persistente, con lo que se perdería la caché
  de miniaturas en memoria.
- `background.js`: caché `thumbs` (tabId → dataURL a escala 0,5, máximo 300) que se rellena al
  activar o terminar de cargar una pestaña. `overviews` (windowId → { tabId, fromTabId, hero }).
  Al pulsar el botón captura la pestaña visible a resolución completa (`hero`) y abre
  `expose.html?w=<windowId>` a su lado. Si se activa cualquier otra pestaña, cierra la vista. Si se
  pulsa el botón con la vista abierta, envía `dismiss`.
- `expose.js`: pide `init` al fondo y coloca las tarjetas en posición absoluta (`computeLayout`
  busca el número de columnas que maximiza el tamaño de la miniatura y, si no caben, pasa a
  scroll). Las animaciones son WAAPI con muelles simulados → `linear()` (`spring()`); los cambios
  de disposición usan FLIP (`applyLayout(true)`). Entrada: `intro()`. Salida: `openTab()` amplía
  la tarjeta a pantalla completa y luego `tabs.update(active)`. `captureQueue` refresca
  miniaturas de tres en tres, empezando por las visibles.

## Publicar una versión nueva

1. Sube `version` en `manifest.json`. AMO rechaza números repetidos.
2. Crea el zip con los archivos en la raíz: `manifest.json background.js expose.* icons/`.
   Nada de `tools/`, `docs/` ni `dist/`.
3. Súbelo en <https://addons.mozilla.org/developers/> → Tab Exposé → nueva versión, como
   **sin listar** (*On your own*). Descarga el `.xpi` firmado.
4. Guárdalo en `dist/tab-expose-X.Y.Z.xpi`, haz commit y crea la release con dos copias: la
   versionada y una llamada `tab-expose.xpi`, que es a la que enlaza el README
   (`releases/latest/download/tab-expose.xpi`):
   `cp dist/tab-expose-X.Y.Z.xpi /tmp/tab-expose.xpi && gh release create vX.Y.Z dist/tab-expose-X.Y.Z.xpi /tmp/tab-expose.xpi`
5. El ID del complemento (`tab-expose@36228cdd83a0`) no puede cambiar nunca.

## Probar

- Carga temporal: `about:debugging#/runtime/this-firefox` → `manifest.json`.
- Sin instalar: `tools/demo/` sirve la página con la API `browser` simulada y la captura con
  Firefox headless. Puede congelar animaciones en un instante concreto. Ver `tools/demo/README.md`.
  Las imágenes de `docs/` salen de ahí.

## Ideas pendientes

- Actualizaciones automáticas con `update_url` y un `updates.json` alojado en GitHub Pages.
- Reordenar pestañas arrastrando las tarjetas.
- Color de las pestañas contenedor (`contextualIdentities`).
- Pestañas de todas las ventanas, agrupadas.
- Traducción con `_locales/` (ahora el texto está fijo en español).
