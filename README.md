# CL · Cambio de imagen de tu casa

Sitio web + panel de administración para mostrar obras (refacciones, pérgolas, pintura, techos, etc.) con fotos del **antes y después**.

- **Sitio público** (`/`): landing en negro y dorado, galería de obras con filtros por categoría, detalle con comparador antes/después, ubicación y botón de WhatsApp. 100 % responsive.
- **Panel** (`/admin`): crear, editar y eliminar obras; subir varias fotos del antes y del después; ubicación como texto, link de Google Maps o ambos; categorías propias.

## Cómo funciona (Vercel + Supabase)

- **Vercel** sirve el sitio (`public/`) y la API (`api/[...path].js`, una función).
- **Supabase** guarda las obras y categorías (Postgres) y las fotos (Storage, bucket público `works`).
- Sin dependencias: no hace falta `npm install`.

### Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Para qué | Obligatoria |
|---|---|---|
| `SUPABASE_URL` | `https://wymlrmrcmlvghpibvcbx.supabase.co` | sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role` (Supabase → Project Settings → API Keys). **Secreta**: nunca va al código ni al navegador | sí |
| `ADMIN_USER` | Usuario del panel (por defecto `clamas`) | no |
| `ADMIN_PASS` | Contraseña del panel (por defecto `1972`, conviene cambiarla) | recomendado |
| `SESSION_SECRET` | Clave para firmar sesiones (si falta, se deriva de la clave de Supabase) | no |
| `WHATSAPP` / `WHATSAPP_DISPLAY` | Número con código de país y cómo se muestra | no |
| `INSTAGRAM_URL` / `INSTAGRAM_HANDLE` | Link y nombre de Instagram | no |

Después de cargar las variables hay que **volver a desplegar** (Deployments → ⋯ → Redeploy).

### Probar en la computadora

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node dev.js
```

Sitio: http://localhost:3000/ · Panel: http://localhost:3000/admin/ (usuario `clamas`, contraseña `1972` si no definiste `ADMIN_PASS`).

### Obras de ejemplo

Vienen cargadas unas obras de ejemplo (ilustraciones marcadas "FOTO DE EJEMPLO", en `public/samples/`). Desde el panel el botón **"Borrar ejemplos"** las elimina todas juntas.

### Cargar las obras reales

Panel → **Nueva obra** → título, descripción, categorías, ubicación y fotos. Las fotos se achican solas antes de subirse (Vercel acepta hasta ~4 MB por foto).

### Copias de seguridad

Todo vive en el proyecto de Supabase (tablas `works`, `categories` y bucket `works`).

## Personalizar

- **Textos del sitio** (portada, servicios, "cómo trabajamos"): `public/index.html`. Los servicios y pasos son texto genérico: conviene ajustarlos a lo que realmente ofrece.
- **Colores y estilos**: variables al inicio de `public/css/site.css`.
- **Logo**: versiones sin teléfono en `assets/logos/` (hoja comparativa en `assets/logos/comparativa.png`; se regeneran con `python3 assets/make_logos.py`). El sitio usa la insignia completa (`A`) en la portada y el ícono compacto (`D`) en el encabezado y favicon: `public/img/logo.png`, `logo-192.png` y `favicon.png`. El logo original está en `assets/`.
- **Teléfono**: se cambia con las variables `WHATSAPP` y `WHATSAPP_DISPLAY`; aparece en el botón "Obtené tu presupuesto" de la sección de contacto y en los botones de WhatsApp.

## Estructura

```
api/[...path].js   API (función de Vercel)
lib/               Supabase por REST, login/sesión, validaciones
public/            sitio público (index.html, css, js, img, samples)
public/admin/      panel de administración
vercel.json        salida estática, /admin y cabeceras de seguridad
dev.js             servidor local para probar
```

## Seguridad (resumen)

Tablas con RLS activado y sin políticas (solo la API, con la clave de servicio, accede). Sesión por cookie firmada (`HttpOnly`, `SameSite=Lax`), contraseña comparada en tiempo constante, límite de intentos de login (guardado en Supabase), validación de origen en las peticiones que modifican datos, fotos verificadas por contenido real (JPG/PNG/WEBP, máx. 15 MB), links de ubicación restringidos a Google Maps, cabeceras CSP y sin `innerHTML` con datos cargados por el usuario.
