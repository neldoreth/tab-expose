# Herramientas de la demo

Generan las imágenes de `docs/` sin instalar la extensión: sirven `expose.html` con la API
`browser` simulada (`demo.js`) y lo capturan con Firefox headless. `demo.js` puede congelar todas
las animaciones en un milisegundo concreto (`t=`), así que cada fotograma sale exacto.

```bash
W=/tmp/tab-expose-demo            # carpeta de trabajo
./capture-sites.sh $W              # páginas reales que hacen de pestañas → $W/sites/N.png
python3 server.py ../.. $W &       # sirve http://127.0.0.1:8765/harness.html

# Un fotograma: render.sh <perfil> <salida.png> "<parámetros>"
./render.sh $W/p1 $W/frames/grid.png "wait=2.2"
```

Parámetros de `harness.html?mock=demo&…`:

| Parámetro | Efecto |
| --- | --- |
| `wait=s` | segundos hasta que se toma la captura |
| `t=ms` | congela las animaciones en ese instante |
| `phase=outro&target=N` | tras la entrada, abre la pestaña N (con `t`, congela la salida) |
| `hover=N` | simula el ratón sobre la tarjeta N |
| `q=texto` | escribe en el buscador |
| `from=N`, `audio` | pestaña de origen; muestra el icono de sonido |

Para el modo oscuro, crea el perfil con `user_pref("ui.systemUsesDarkTheme", 1);` en `user.js`.
`build_gif.py <W>` monta `$W/seq/` (fotogramas con cursor + `list.txt`) a partir de
`$W/frames/intro-*.png`, `outro-*.png`, `grid.png` y `grid-hover.png`. `mock.js` es el banco de
pruebas simple con tarjetas de colores (`harness.html?mock=mock`).
