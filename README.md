# CL · Cambio de imagen de tu casa

Sitio web + panel de administración para mostrar obras (refacciones, pérgolas, pintura, techos, etc.) con fotos del **antes y después**.

- **Sitio público** (`/`): landing en negro y dorado, galería de obras con filtros por categoría, detalle con comparador antes/después, ubicación y botón de WhatsApp. 100 % responsive.
- **Panel** (`/admin`): crear, editar y eliminar obras; subir varias fotos del antes y del después; ubicación como texto, link de Google Maps o ambos; categorías propias.
- **Sin dependencias**: solo necesita [Node.js](https://nodejs.org) 18 o superior. No hace falta `npm install`.

## Cómo probarlo en tu computadora

```bash
cd elgarage-cl
node server.js
```

- Sitio: http://localhost:3000/
- Panel: http://localhost:3000/admin/ → usuario `clamas`, contraseña `1972`

La primera vez que arranca carga unas **obras de ejemplo** (con ilustraciones marcadas "FOTO DE EJEMPLO") para que veas cómo queda. Desde el panel hay un botón **"Borrar ejemplos"** que las elimina todas juntas. Para arrancar sin ejemplos: `SEED_DEMO=0 node server.js`.

## Cargar las obras reales (desde Instagram)

Desde el panel: **Nueva obra** → título, descripción, categorías, ubicación y fotos. Para traer fotos de `@_elgarage.cl_`, bajalas desde el Instagram (o pedíselas a tu papá desde la galería del celular) y subilas desde el panel. Las fotos se achican solas antes de subirse, así que se pueden usar directo las del celular.

## Poner el sitio online

Como guarda las obras y las fotos en disco, necesita un hosting que ejecute Node **con disco persistente** (hostings estáticos como Netlify o GitHub Pages no sirven para esto). Opciones habituales: un VPS, Render, Railway o Fly.io con un volumen/disco.

Pasos generales:

1. Subir esta carpeta al hosting y arrancar con `node server.js` (o `npm start`).
2. Montar un disco persistente y apuntar `DATA_DIR` a esa carpeta.
3. Definir las variables de entorno de abajo (¡sobre todo `ADMIN_PASS`!).
4. Si el hosting usa HTTPS con proxy (lo normal), definir `TRUST_PROXY=1`.

### Variables de entorno

| Variable | Para qué | Por defecto |
|---|---|---|
| `PORT` | Puerto | `3000` |
| `ADMIN_USER` | Usuario del panel | `clamas` |
| `ADMIN_PASS` | Contraseña del panel | `1972` |
| `DATA_DIR` | Carpeta de `db.json` y fotos | `./data` |
| `TRUST_PROXY` | `1` si está detrás de un proxy/hosting | desactivado |
| `WHATSAPP` | Número con código de país, sin `+` | `5491127231155` |
| `WHATSAPP_DISPLAY` | Cómo se muestra el número | `11 2723-1155` |
| `INSTAGRAM_URL` / `INSTAGRAM_HANDLE` | Link y nombre de Instagram | `@_elgarage.cl_` |
| `SEED_DEMO` | `0` para no cargar obras de ejemplo | cargar |
| `SESSION_SECRET` | Clave para firmar sesiones | se genera sola en `DATA_DIR` |

> **Importante:** `1972` es una contraseña corta y fácil de adivinar. Antes de publicar el sitio conviene cambiarla con `ADMIN_PASS`. El login ya limita los intentos (8 fallidos cada 15 minutos por IP), pero una clave más larga es mucho más segura.

## Copias de seguridad

Todo lo que carga tu papá vive en `DATA_DIR` (`db.json` + carpeta `uploads/`). Con copiar esa carpeta alcanza para respaldar o mover el sitio. `db.json.bak` guarda la versión anterior a cada cambio.

## Personalizar

- **Textos del sitio** (portada, servicios, "cómo trabajamos"): `public/index.html`. Los servicios y pasos son texto genérico: conviene ajustarlos a lo que realmente ofrece.
- **Colores y estilos**: variables al inicio de `public/css/site.css`.
- **Logo**: `public/img/logo.png`, `logo-192.png` y `favicon.png` (el original está en `assets/`).

## Estructura

```
server.js          servidor HTTP + API (sin dependencias)
seed.js            categorías iniciales y obras de ejemplo
lib/               base de datos JSON, login/sesión, validaciones
public/            sitio público (index.html, css, js, img)
public/admin/      panel de administración
data/              (se crea sola) db.json y fotos subidas
```

## Seguridad (resumen)

Sesión por cookie firmada (`HttpOnly`, `SameSite=Lax`), contraseña comparada en tiempo constante, límite de intentos de login, validación de origen en las peticiones que modifican datos, fotos verificadas por contenido real (JPG/PNG/WEBP, máx. 15 MB), links de ubicación restringidos a Google Maps, cabeceras CSP y sin `innerHTML` con datos cargados por el usuario.
