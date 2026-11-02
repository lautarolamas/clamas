"""
Genera variantes del logo SIN el teléfono a partir de assets/logo-original.png.

    python3 assets/make_logos.py

Salida: assets/logos/*.png (fondo negro y fondo transparente) + hoja comparativa.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'logos')
os.makedirs(OUT, exist_ok=True)

src = Image.open(os.path.join(HERE, 'logo-original.png')).convert('RGB')
A = np.asarray(src).astype(np.float32)
H, W = A.shape[:2]
lum = A.max(axis=2)

# ── geometría del original (medida sobre la imagen) ──
CX, CY = 543.0, 540.0           # centro del aro
yy, xx = np.mgrid[0:H, 0:W]
R = np.hypot(xx - CX, yy - CY)
RING_IN = 497                   # todo lo que está a r >= 497 es aro
PHONE_Y = 800                   # desde acá hacia abajo está el teléfono

# contenido = interior del aro sin el teléfono
content_mask = (R < RING_IN) & (yy < PHONE_Y)

# La foto de la casa del original viene recortada por el aro. Al achicar el logo ese
# borde curvo quedaría a la vista, así que se difumina suavemente hacia el negro.
t = np.clip((R - 360) / (RING_IN - 360), 0, 1)
feather = (1 - t) ** 1.8
tv = np.clip((596 - yy) / 70.0, 0, 1)
feather = feather * (tv * tv * (3 - 2 * tv))
feather = np.where((yy < 596) & (xx > CX + 40), feather, 1.0)
A_f = A * feather[..., None]
content = np.where(content_mask[..., None], A_f, 0).astype(np.uint8)
ring = np.where((R >= RING_IN)[..., None], A, 0).astype(np.uint8)

# bandas verticales del contenido (medidas)
MARK_Y = (88, 592)              # casa + CL + frente iluminado
TITLE_Y = (598, 782)            # "CAMBIO DE IMAGEN" + "DE TU CASA"


def bbox_of(img, thr=40):
    m = np.asarray(img).max(axis=2) > thr
    ys, xs = np.where(m)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def to_rgba_on_dark(img):
    """Fondo negro -> transparente (para usar sobre fondos oscuros)."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    alpha = np.clip(a.max(axis=2) * 1.15, 0, 255)
    safe = np.maximum(alpha, 1)[..., None]
    rgb = np.clip(a / safe * 255, 0, 255)
    return Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), 'RGBA')


def black_bg(img, size=None):
    out = Image.new('RGB', img.size, (0, 0, 0))
    out.paste(img.convert('RGB'))
    return out


def crop_region(y0, y1, pad=0):
    img = Image.fromarray(np.where(((yy >= y0) & (yy < y1))[..., None] & content_mask[..., None], A_f, 0).astype(np.uint8))
    x0, y0b, x1, y1b = bbox_of(img)
    return img.crop((max(0, x0 - pad), max(0, y0b - pad), x1 + pad, y1b + pad))


def fit_in_circle(piece, radius, margin=0):
    """Escala `piece` (RGB) lo máximo posible para que todo su contenido entre en un círculo."""
    p = np.asarray(piece)
    m = p.max(axis=2) > 40
    ys, xs = np.where(m)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    px, py = xs - cx, ys - cy
    far = np.sqrt(px ** 2 + py ** 2).max()
    s = (radius - margin) / far
    return s, (cx, cy)


def place_centered(canvas_size, piece, scale, center_in_piece, at):
    w, h = piece.size
    big = piece.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new('RGB', canvas_size, (0, 0, 0))
    ox = round(at[0] - center_in_piece[0] * scale)
    oy = round(at[1] - center_in_piece[1] * scale)
    canvas.paste(big, (ox, oy))
    return canvas


def tint_gradient(img, stops):
    """Mapa de degradado por luminancia (para versiones monocromas)."""
    a = np.asarray(img.convert('RGB')).astype(np.float32).max(axis=2) / 255.0
    xs = np.array([s[0] for s in stops])
    out = np.zeros(a.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(a, xs, [s[1][c] for s in stops])
    return Image.fromarray(out.astype(np.uint8))


GOLD = [(0, (0, 0, 0)), (0.25, (110, 76, 18)), (0.6, (214, 168, 66)), (1, (252, 232, 150))]
WHITE = [(0, (0, 0, 0)), (1, (255, 255, 255))]

CANVAS = 1080
saved = {}


def save(name, img, transparent=True):
    img.convert('RGB').save(os.path.join(OUT, name + '.png'), optimize=True)
    if transparent:
        to_rgba_on_dark(img).save(os.path.join(OUT, name + '-transparente.png'), optimize=True)
    saved[name] = img.convert('RGB')


# ── A · Insignia completa, sin teléfono ──
whole = Image.fromarray(content)
s, c = fit_in_circle(whole, RING_IN - 14)
body = place_centered((W, H), whole, s, c, (CX, CY))
A_img = Image.fromarray(np.maximum(np.asarray(body), ring))
save('A-insignia-completa', A_img)

# ── B · Sin aro (para usar sobre fotos / fondos) ──
x0, y0, x1, y1 = bbox_of(whole)
B_crop = whole.crop((x0 - 24, y0 - 24, x1 + 24, y1 + 24))
side = max(B_crop.size)
B_img = Image.new('RGB', (side, side), (0, 0, 0))
B_img.paste(B_crop, ((side - B_crop.width) // 2, (side - B_crop.height) // 2))
B_img = B_img.resize((CANVAS, CANVAS), Image.LANCZOS)
save('B-sin-aro', B_img)

# ── C · Horizontal (marca a la izquierda, texto a la derecha) ──
mark = crop_region(*MARK_Y)
title_top = crop_region(TITLE_Y[0], 706)          # CAMBIO DE IMAGEN
title_bot = crop_region(712, TITLE_Y[1])          # — DE TU CASA —
mh = 520
mark_s = mark.resize((round(mark.width * mh / mark.height), mh), Image.LANCZOS)
tw = 880
t1 = title_top.resize((tw, round(title_top.height * tw / title_top.width)), Image.LANCZOS)
bw = round(tw * 0.62)
t2 = title_bot.resize((bw, round(title_bot.height * bw / title_bot.width)), Image.LANCZOS)
gap, pad = 70, 60
block_h = t1.height + 34 + t2.height
HW = pad + mark_s.width + gap + tw + pad
C_img = Image.new('RGB', (HW, mh + 2 * pad), (0, 0, 0))
C_img.paste(mark_s, (pad, pad))
ty = pad + (mh - block_h) // 2
C_img.paste(t1, (pad + mark_s.width + gap, ty))
C_img.paste(t2, (pad + mark_s.width + gap + (tw - bw) // 2, ty + t1.height + 34))
save('C-horizontal', C_img)

# ── D · Insignia compacta (solo la marca dentro del aro; ideal ícono / foto de perfil) ──
s2, c2 = fit_in_circle(mark, RING_IN - 30)
body2 = place_centered((W, H), mark, s2, c2, (CX, CY))
D_img = Image.fromarray(np.maximum(np.asarray(body2), ring))
save('D-icono-compacto', D_img)

# ── E · Monocromo dorado (insignia completa) ──
E_img = tint_gradient(A_img, GOLD)
save('E-monocromo-dorado', E_img)

# ── F · Monocromo blanco (horizontal; para estampar / sellos / fotos oscuras) ──
F_img = tint_gradient(C_img, WHITE)
save('F-horizontal-blanco', F_img)

# ── Hoja comparativa ──
try:
    font_b = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 40)
    font_s = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 28)
    font_t = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 64)
except OSError:
    font_b = font_s = font_t = ImageFont.load_default()

cards = [
    ('A', 'Insignia completa', 'La más parecida al original, sin el teléfono.', 'A-insignia-completa'),
    ('B', 'Sin aro', 'Más liviana. Va bien sobre fotos y fondos oscuros.', 'B-sin-aro'),
    ('C', 'Horizontal', 'Para el encabezado de la web y documentos.', 'C-horizontal'),
    ('D', 'Ícono compacto', 'Solo la marca. Foto de perfil, favicon, redes.', 'D-icono-compacto'),
    ('E', 'Monocromo dorado', 'Un solo tono. Ideal para impresión y sellos.', 'E-monocromo-dorado'),
    ('F', 'Horizontal blanco', 'Para estampar sobre fotos de obras.', 'F-horizontal-blanco'),
]
CW, CH, GAP, M = 1100, 1020, 40, 60
cols = 3
rows = 2
sheet = Image.new('RGB', (M * 2 + cols * CW + (cols - 1) * GAP, M * 2 + 150 + rows * CH + (rows - 1) * GAP), (18, 18, 19))
d = ImageDraw.Draw(sheet)
d.text((M, M), 'Versiones del logo — sin teléfono', font=font_t, fill=(240, 214, 130))
for i, (k, title, desc, key) in enumerate(cards):
    cx0 = M + (i % cols) * (CW + GAP)
    cy0 = M + 150 + (i // cols) * (CH + GAP)
    d.rounded_rectangle([cx0, cy0, cx0 + CW, cy0 + CH], 36, fill=(0, 0, 0), outline=(70, 58, 30), width=3)
    im = saved[key]
    maxw, maxh = CW - 120, CH - 260
    sc = min(maxw / im.width, maxh / im.height)
    im2 = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
    sheet.paste(im2, (cx0 + (CW - im2.width) // 2, cy0 + 50 + (maxh - im2.height) // 2))
    d.text((cx0 + 50, cy0 + CH - 190), f'{k} · {title}', font=font_b, fill=(246, 224, 142))
    d.text((cx0 + 50, cy0 + CH - 120), desc, font=font_s, fill=(190, 186, 176))
sheet.save(os.path.join(OUT, 'comparativa.png'), optimize=True)
print('listo:', sorted(os.listdir(OUT)))
