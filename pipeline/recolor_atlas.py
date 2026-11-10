#!/usr/bin/env python3
"""
Repinta zonas del atlas horneado de la sala (baked1) sin romper la luz horneada.

El color de paredes, puff y cojines vive COCIDO en `baked1_clean.webp`: el runtime
(`src/Experience/Baked.js`) sustituye todos los materiales de `room1` por un unico
`MeshBasicMaterial({ map: baked1 })`, asi que los materiales del `.blend` no llegan
a la web. Este script recolorea el atlas en espacio UV, respetando la luminancia
horneada (luz de ventana, AO y sombras), en lugar de multiplicar el color:

    out_linear = tint_linear * min(luma_linear / luma_ref, max_ratio)
    luma_ref   = mediana de la luma en pixeles validos (ver REF_SCOPE)

Con eso, un pixel de luz media sale exactamente con el hex pedido y las sombras
quedan proporcionalmente mas oscuras (el bake se conserva). `--max-ratio 1.0`
(por defecto) impide que los brillos horneados se quemen a blanco: ninguna zona
supera el color pedido. Usa `--max-ratio 0` para dejar crecer los brillos.

REF_SCOPE decide si la mediana se calcula por pieza (`component`) o por grupo
(`group`): las paredes necesitan referencia por pared (la derecha esta a luma
~175 y la del fondo a ~125; una sola referencia quemaria la derecha), mientras
que puff y cojines la comparten para conservar su sombreado relativo.

Grupos (se separan por geometria, NO por slot de material):
  1. `walls`     las dos paredes grandes + sus cantos y tapas superiores. La pared
                 derecha usa el slot `Material_Pared`, pero la del fondo comparte
                 el slot 0 con el puff: por eso se identifican por geometria
                 (planos verticales >=5 m, cantos y tapas).
  2. `puff`      las 19 piezas sueltas del beanbag dentro de la esquina. Se
                 excluye el quad de sombra de contacto (plano, grande, casi negro).
  3. `cushions`  los 2 cojines (piezas calidas dentro de la misma esquina).

Uso:
    python3 pipeline/recolor_atlas.py --src /tmp/opencode/herdr/baked1_clean.orig.webp \
        --out static/assets/textures/baked1_clean.webp \
        --report /tmp/opencode/herdr/recolor_report.json

OJO: la herramienta NO es idempotente. Aplica el repintado sobre el atlas que
recibe; si le pasas un atlas ya repintado, el tinte se compone otra vez y queda
mas oscuro/saturado. Guarda siempre el original y parte de el.

Dependencias: numpy + Pillow y `blender` en el PATH (solo para leer el .blend).
No escribe el `.blend` ni ningun GLB.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
except ImportError as exc:  # pragma: no cover - checked at runtime
    sys.exit(
        "ERROR: faltan dependencias Python (%s). Instala numpy y Pillow: "
        "python3 -m pip install numpy pillow" % exc
    )


# ---------------------------------------------------------------------------
# Configuracion por defecto
# ---------------------------------------------------------------------------

ATLAS_SIZE = 4096

# Esquina del puff en coordenadas de mundo del blend (metros).
CORNER_MIN = (-5.0, -4.5, -0.1)
CORNER_MAX = (-1.7, -1.7, 2.0)

# La pared grande son 2 triangulos de ~29.6 m2. Cualquier cara >= 20 m2 es pared.
WALL_MIN_FACE_AREA = 20.0
# Los cantos de pared son tiras verticales de 6.5 m de alto y < 0.5 m de huella.
WALL_STRIP_MIN_HEIGHT = 6.0
WALL_STRIP_MAX_FOOTPRINT = 0.5

# Separacion cojin (calido) vs puff (azul) dentro de la esquina: R - B en 0..255.
WARM_R_MINUS_B = 20

# Tolerancia de la verificacion (por canal).
VERIFY_TOLERANCE = 10

# Pixeles mas oscuros que esto (luma lineal) se consideran zona ocluida/no
# horneada (los huecos negros del atlas) y NO cuentan para calcular luma_ref.
# Se siguen recoloreando (salen negros igualmente).
VALID_LUMA_MIN = 0.0025  # ~8/255 en sRGB

# Normalizacion de luminancia:
#   component -> cada pieza tiene su propio luma_ref. Necesario en las paredes:
#                la derecha esta a luma ~175 y la del fondo a ~125; con una sola
#                referencia la pared derecha se quemaria a blanco.
#   group     -> una referencia para todo el grupo. Mejor en puff/cojines: son
#                piezas de un mismo objeto y asi se conserva su sombreado relativo.
REF_SCOPE = {"walls": "component", "puff": "group", "cushions": "group"}


# ---------------------------------------------------------------------------
# Extraccion desde Blender
# ---------------------------------------------------------------------------

EXTRACT_SCRIPT = r"""
import bpy
import bmesh
import json
from mathutils import Vector

obj_name = "__OBJECT__"

obj = bpy.data.objects.get(obj_name)
if obj is None or obj.type != 'MESH':
    raise SystemExit("No existe el mesh %s" % obj_name)

me = obj.data
mw = obj.matrix_world
nmat = mw.to_3x3()

bm = bmesh.new()
bm.from_mesh(me)
bm.verts.ensure_lookup_table()

# Etiquetado de piezas sueltas (conectividad por vertices).
seen = set()
comps = []
for v in bm.verts:
    if v.index in seen:
        continue
    stack = [v]
    seen.add(v.index)
    comp = []
    while stack:
        x = stack.pop()
        comp.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen:
                seen.add(y.index)
                stack.append(y)
    comps.append(comp)

vcomp = {}
for ci, comp in enumerate(comps):
    for v in comp:
        vcomp[v.index] = ci

uv_layer = me.uv_layers.active
if uv_layer is None:
    raise SystemExit("El mesh no tiene capa UV activa")

def world_area(poly):
    pts = [mw @ me.vertices[vi].co for vi in poly.vertices]
    acc = Vector((0.0, 0.0, 0.0))
    for i in range(len(pts)):
        a = pts[i]
        b = pts[(i + 1) % len(pts)]
        acc.x += (a.y - b.y) * (a.z + b.z)
        acc.y += (a.z - b.z) * (a.x + b.x)
        acc.z += (a.x - b.x) * (a.y + b.y)
    return acc.length * 0.5

faces = []
for p in me.polygons:
    uvs = []
    for li in p.loop_indices:
        uv = uv_layer.data[li].uv
        uvs.append([round(uv.x, 7), round(uv.y, 7)])
    wc = mw @ p.center
    wn = (nmat @ p.normal)
    if wn.length > 0:
        wn.normalize()
    faces.append({
        "c": vcomp[p.vertices[0]],
        "m": p.material_index,
        "uv": uvs,
        "p": [round(wc.x, 4), round(wc.y, 4), round(wc.z, 4)],
        "n": [round(wn.x, 4), round(wn.y, 4), round(wn.z, 4)],
        "a": round(world_area(p), 6),
        # Posicion de mundo por vertice (mismo orden que las UV): imprescindible
        # para generar el ruido de pared en espacio de mundo y evitar costuras.
        "w": [[round(v, 6) for v in (mw @ me.vertices[vi].co)] for vi in p.vertices],
    })

comp_info = {}
for ci, comp in enumerate(comps):
    co = [mw @ v.co for v in comp]
    comp_info[ci] = {
        "min": [round(min(c[k] for c in co), 4) for k in range(3)],
        "max": [round(max(c[k] for c in co), 4) for k in range(3)],
        "verts": len(comp),
    }

payload = {
    "object": obj_name,
    "materials": [m.name if m else None for m in me.materials],
    "faces": faces,
    "comps": comp_info,
}
print("RECOLOR_PAYLOAD " + json.dumps(payload))
"""


def blender_binary() -> str:
    found = shutil.which("blender") or "/usr/bin/blender"
    if not os.path.exists(found):
        sys.exit("ERROR: no encuentro el binario `blender` (PATH ni /usr/bin/blender).")
    return found


def extract_mesh_data(blend_path: str, object_name: str) -> dict:
    script = EXTRACT_SCRIPT.replace("__OBJECT__", object_name)
    proc = subprocess.run(
        [blender_binary(), "-b", blend_path, "--factory-startup", "--python-expr", script],
        capture_output=True,
        text=True,
    )
    marker = "RECOLOR_PAYLOAD "
    for line in proc.stdout.splitlines():
        if line.startswith(marker):
            return json.loads(line[len(marker):])
    sys.stderr.write(proc.stdout[-3000:])
    sys.stderr.write(proc.stderr[-3000:])
    sys.exit("ERROR: Blender no devolvio el payload de geometria.")


# ---------------------------------------------------------------------------
# Color
# ---------------------------------------------------------------------------


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(np.asarray(c, dtype=np.float64), 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * (c ** (1.0 / 2.4)) - 0.055)


def hex_to_rgb(h: str):
    h = h.strip().lstrip("#")
    if len(h) != 6:
        raise ValueError("Color hex invalido: #%s" % h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def hex_to_linear(h: str):
    return srgb_to_linear([v / 255.0 for v in hex_to_rgb(h)])


def linear_to_hex(rgb_linear):
    rgb = np.clip(np.asarray(rgb_linear, dtype=np.float64), 0.0, 1.0)
    srgb = linear_to_srgb(rgb)
    return "#" + "".join("%02X" % int(round(v * 255)) for v in srgb)


def luma_of(linear_rgb):
    return (
        0.2126 * linear_rgb[..., 0]
        + 0.7152 * linear_rgb[..., 1]
        + 0.0722 * linear_rgb[..., 2]
    )


# ---------------------------------------------------------------------------
# Textura de pared (yeso/pintura) generada en ESPACIO DE MUNDO
# ---------------------------------------------------------------------------
#
# Las dos paredes son islas UV distintas y perpendiculares: un ruido en UV
# quedaria cortado en la esquina. Aqui el ruido es una funcion 3D de la posicion
# de mundo de cada texel, asi que el valor en la esquina coincide por ambos lados
# y no hay costura.
#
# El ruido NO reemplaza nada: multiplica (1 + campo) la luma ya tintada. El AO y
# las sombras horneadas siguen intactos; el campo tiene media 0 (multiplicador
# medio = 1.0), de modo que el color medio no se desplaza.

WALL_TEXTURE_DEFAULTS = {
    # (escala en metros, peso relativo, semilla)
    "octaves": ((1.2, 0.30, 11), (0.7, 0.40, 23), (0.35, 0.50, 37)),
    "grain_scale": 0.015,  # grano fino: 1.5 cm
    "grain_weight": 0.35,
    "sigma": 0.030,        # desviacion tipica del multiplicador (~+-6 % a 2 sigma)
    "max_amp": 0.065,      # tope duro +-6.5 %
    "gradient": 0.02,      # gradiente vertical +-2 %
    "seed": 7,
}


def _hash3(ix, iy, iz, seed):
    n = (
        ix * np.int64(374761393)
        + iy * np.int64(668265263)
        + iz * np.int64(1274126177)
        + np.int64(seed) * np.int64(1013904223)
    )
    n = (n ^ (n >> np.int64(13))) * np.int64(1274126177)
    n = n ^ (n >> np.int64(16))
    return (n & np.int64(0x7FFFFFFF)).astype(np.float64) / 2147483647.0


def value_noise3(x, y, z, scale, seed):
    """Value noise 3D trilineal en [0,1]. Determinista."""
    px = np.asarray(x, dtype=np.float64) / scale
    py = np.asarray(y, dtype=np.float64) / scale
    pz = np.asarray(z, dtype=np.float64) / scale
    ix = np.floor(px)
    iy = np.floor(py)
    iz = np.floor(pz)
    fx = px - ix
    fy = py - iy
    fz = pz - iz
    ux = fx * fx * (3.0 - 2.0 * fx)
    uy = fy * fy * (3.0 - 2.0 * fy)
    uz = fz * fz * (3.0 - 2.0 * fz)
    ix = ix.astype(np.int64)
    iy = iy.astype(np.int64)
    iz = iz.astype(np.int64)
    c000 = _hash3(ix, iy, iz, seed)
    c100 = _hash3(ix + 1, iy, iz, seed)
    c010 = _hash3(ix, iy + 1, iz, seed)
    c110 = _hash3(ix + 1, iy + 1, iz, seed)
    c001 = _hash3(ix, iy, iz + 1, seed)
    c101 = _hash3(ix + 1, iy, iz + 1, seed)
    c011 = _hash3(ix, iy + 1, iz + 1, seed)
    c111 = _hash3(ix + 1, iy + 1, iz + 1, seed)
    x00 = c000 + (c100 - c000) * ux
    x10 = c010 + (c110 - c010) * ux
    x01 = c001 + (c101 - c001) * ux
    x11 = c011 + (c111 - c011) * ux
    y0 = x00 + (x10 - x00) * uy
    y1 = x01 + (x11 - x01) * uy
    return y0 + (y1 - y0) * uz


def raw_wall_noise(x, y, z, cfg):
    """Campo bruto (media ~0, sin normalizar) sumando octavas + grano."""
    acc = np.zeros_like(x, dtype=np.float64)
    for scale, weight, seed in cfg["octaves"]:
        acc += weight * (value_noise3(x, y, z, scale, seed) * 2.0 - 1.0)
    acc += cfg["grain_weight"] * (
        value_noise3(x, y, z, cfg["grain_scale"], cfg["seed"]) * 2.0 - 1.0
    )
    return acc


def affine_world_from_uv(uv, world):
    """mundo = A*u + B*v + C. Exacto para caras planas (paredes)."""
    m = np.array([[p[0], p[1], 1.0] for p in uv], dtype=np.float64)
    w = np.array(world, dtype=np.float64)
    coef, _res, _rank, _sv = np.linalg.lstsq(m, w, rcond=None)
    resid = float(np.max(np.abs(m @ coef - w))) if len(uv) else 0.0
    return coef, resid


def build_wall_field(faces, wall_ids, size, cfg, chunk=256):
    """Devuelve (campo, cubierto, info): multiplicador 1+campo por texel de pared.

    `campo` es zero-mean sobre los texeles cubiertos y esta limitado a +-max_amp.
    """
    field = np.zeros((size, size), dtype=np.float32)
    zmap = np.zeros((size, size), dtype=np.float32)
    covered = np.zeros((size, size), dtype=bool)
    info = {"faces_used": 0, "faces_skipped": 0, "max_planarity_residual_m": 0.0}

    for f in faces:
        if f["c"] not in wall_ids:
            continue
        uv = f["uv"]
        world = f.get("w")
        if not world or len(uv) < 3 or has_duplicate_uvs(uv):
            info["faces_skipped"] += 1
            continue
        coef, resid = affine_world_from_uv(uv, world)
        info["max_planarity_residual_m"] = max(info["max_planarity_residual_m"], resid)

        img = Image.new("L", (size, size), 0)
        draw = ImageDraw.Draw(img)
        for tri in triangulate(uv):
            pts = [(p[0] * size, (1.0 - p[1]) * size) for p in tri]
            if poly_area2(pts) < 0.75:
                continue
            draw.polygon(pts, fill=255)
        bbox = img.getbbox()
        if not bbox:
            continue
        bx0, by0, bx1, by1 = bbox
        info["faces_used"] += 1

        for y0 in range(by0, by1, chunk):
            y1 = min(by1, y0 + chunk)
            sub = np.asarray(img.crop((bx0, y0, bx1, y1))) > 127
            if not sub.any():
                continue
            xs = (np.arange(bx0, bx1) + 0.5) / size
            ys = (np.arange(y0, y1) + 0.5) / size
            uu, vv = np.meshgrid(xs, 1.0 - ys)
            wx = coef[0, 0] * uu + coef[1, 0] * vv + coef[2, 0]
            wy = coef[0, 1] * uu + coef[1, 1] * vv + coef[2, 1]
            wz = coef[0, 2] * uu + coef[1, 2] * vv + coef[2, 2]
            raw = raw_wall_noise(wx, wy, wz, cfg)
            field[y0:y1, bx0:bx1][sub] = raw[sub].astype(np.float32)
            zmap[y0:y1, bx0:bx1][sub] = wz[sub].astype(np.float32)
            covered[y0:y1, bx0:bx1] |= sub

    n = int(covered.sum())
    if n == 0:
        return field, covered, info

    vals = field[covered].astype(np.float64)
    vals = vals - vals.mean()
    std = vals.std()
    info["raw_std"] = float(std)
    if std > 1e-9:
        vals = vals / std

    # Gradiente vertical muy leve (+-gradient), relativo a la altura de la pared.
    zs = zmap[covered].astype(np.float64)
    zspan = float(zs.max() - zs.min())
    if cfg["gradient"] > 0.0 and zspan > 1e-6:
        zn = (zs - zs.min()) / zspan - 0.5
    else:
        zn = np.zeros_like(zs)
    vals = vals * cfg["sigma"] + cfg["gradient"] * zn

    # Media 0 exacta (multiplicador medio 1.0) y tope de amplitud.
    vals = vals - vals.mean()
    vals = np.clip(vals, -cfg["max_amp"], cfg["max_amp"])

    field[covered] = vals.astype(np.float32)
    info.update(
        covered_px=n,
        mean=float(vals.mean()),
        std=float(vals.std()),
        min=float(vals.min()),
        max=float(vals.max()),
        amp_p2_5=float(np.percentile(vals, 2.5)),
        amp_p97_5=float(np.percentile(vals, 97.5)),
        z_span_m=round(zspan, 3),
    )
    info["config"] = {
        "octaves": [list(o) for o in cfg["octaves"]],
        "grain_scale_m": cfg["grain_scale"],
        "grain_weight": cfg["grain_weight"],
        "sigma": cfg["sigma"],
        "max_amp": cfg["max_amp"],
        "gradient": cfg["gradient"],
    }
    return field, covered, info


# ---------------------------------------------------------------------------
# Rasterizado de mascaras
# ---------------------------------------------------------------------------


def triangulate(uvs):
    """Fan triangulation. Devuelve triangulos de 3 puntos UV."""
    if len(uvs) < 3:
        return []
    first = uvs[0]
    out = []
    for i in range(1, len(uvs) - 1):
        out.append([first, uvs[i], uvs[i + 1]])
    return out


def poly_area2(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return abs(a) * 0.5


def has_duplicate_uvs(uvs, eps=1e-6):
    for i in range(len(uvs)):
        for j in range(i + 1, len(uvs)):
            if abs(uvs[i][0] - uvs[j][0]) <= eps and abs(uvs[i][1] - uvs[j][1]) <= eps:
                return True
    return False


def rasterize_faces(faces, size):
    """Rasteriza las UV de las caras en una mascara L.

    OJO: varias caras del mesh tienen las UV rotas (dos vertices con la MISMA UV,
    p.ej. dos (0,0) en las tiras de suelo). Esas caras se descartan enteras: sus
    triangulos barren medio atlas y envenenarian la mascara. NO se descarta una
    cara solo por tener un vertice en (0,0): en este atlas (0,0) es una esquina
    valida de la pared derecha.
    """
    img = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(img)
    skipped = 0
    for f in faces:
        uv = f["uv"]
        if len(uv) < 3 or has_duplicate_uvs(uv):
            skipped += 1
            continue
        for tri in triangulate(uv):
            pts = [(u * size, (1.0 - v) * size) for u, v in tri]
            if poly_area2(pts) < 0.75:
                continue
            if poly_area2(pts) > 0.25 * size * size:
                skipped += 1
                continue
            draw.polygon(pts, fill=255)
    return img, skipped


def dilate(mask_img, radius):
    if radius <= 0:
        return mask_img
    return mask_img.filter(ImageFilter.MaxFilter(radius * 2 + 1))


# ---------------------------------------------------------------------------
# Clasificacion
# ---------------------------------------------------------------------------


def bbox_inside(b, lo, hi, eps=1e-3):
    return all(b["min"][i] >= lo[i] - eps and b["max"][i] <= hi[i] + eps for i in range(3))


def classify(payload, src_rgb):
    """Devuelve {group: set(comp_ids)} y un log de decisiones."""
    comps = {int(k): v for k, v in payload["comps"].items()}
    faces = payload["faces"]
    # Color de referencia por pieza a baja resolucion (rapido y suficiente).
    small = 512
    src_small = np.asarray(
        Image.fromarray(src_rgb.astype(np.uint8), "RGB").resize((small, small), Image.LANCZOS)
    ).astype(np.float64)

    by_comp = {}
    for f in faces:
        by_comp.setdefault(f["c"], []).append(f)

    log = {"walls": [], "puff": [], "cushions": [], "ignored": []}

    # Slot del suelo (Material_Piso) por nombre: sirve para descartar las tiras de
    # suelo que caen dentro de la esquina del puff. NO se usa para las paredes.
    piso_slot = next(
        (i for i, name in enumerate(payload.get("materials", [])) if name and "piso" in name.lower()),
        None,
    )

    def comp_slot(ci):
        cfaces = by_comp.get(ci, [])
        if not cfaces:
            return None
        counts = {}
        for f in cfaces:
            counts[f["m"]] = counts.get(f["m"], 0) + 1
        return max(counts, key=counts.get)

    # --- 1. Paredes: geometria, nunca slot.
    #   (a) las dos paredes grandes: bbox vertical de >=6 m de alto, larga en un eje
    #       horizontal (>=5 m) y plana en el otro (<=0.5 m). La pared derecha esta
    #       partida en triangulos de <=12.6 m2, asi que el area sola NO vale.
    #   (b) los cantos verticales: tiras de >=6 m de alto y <0.5 m de huella.
    #   Se conserva tambien el criterio de cara >=20 m2 como salvaguarda.
    walls = set()
    for ci, b in comps.items():
        cfaces = by_comp.get(ci, [])
        has_big = any(f["a"] >= WALL_MIN_FACE_AREA for f in cfaces)
        height = b["max"][2] - b["min"][2]
        span_x = b["max"][0] - b["min"][0]
        span_y = b["max"][1] - b["min"][1]
        is_plane = (
            height >= WALL_STRIP_MIN_HEIGHT
            and max(span_x, span_y) >= 5.0
            and min(span_x, span_y) <= WALL_STRIP_MAX_FOOTPRINT
        )
        is_strip = (
            height >= WALL_STRIP_MIN_HEIGHT
            and span_x <= WALL_STRIP_MAX_FOOTPRINT
            and span_y <= WALL_STRIP_MAX_FOOTPRINT
        )
        # Tapa superior del muro (canto horizontal a la altura del techo): si no
        # se incluye, queda una banda beige sin pintar en el borde de la pared.
        span_z = b["max"][2] - b["min"][2]
        is_cap = (
            span_z < 0.05
            and b["max"][2] > 5.9
            and max(span_x, span_y) >= 5.0
            and min(span_x, span_y) <= WALL_STRIP_MAX_FOOTPRINT
        )
        if has_big or is_plane or is_strip or is_cap:
            walls.add(ci)
            if has_big:
                reason = "cara>=%.0fm2" % WALL_MIN_FACE_AREA
            elif is_plane:
                reason = "plano vertical >=5m"
            elif is_cap:
                reason = "tapa superior del muro"
            else:
                reason = "canto vertical"
            log["walls"].append(
                {"comp": ci, "reason": reason, "bbox": [b["min"], b["max"]]}
            )

    # --- 2/3. Esquina del puff: cojines (calidos) vs puff (frios).
    comp_color = {}
    for ci, b in comps.items():
        if ci in walls:
            continue
        if not bbox_inside(b, CORNER_MIN, CORNER_MAX):
            continue
        img, _ = rasterize_faces(by_comp.get(ci, []), small)
        m = np.asarray(img) > 0
        if not m.any():
            continue
        px = src_small[m]
        comp_color[ci] = px[px.sum(axis=1) > 10].mean(axis=0) if (px.sum(axis=1) > 10).any() else None

    puff, cushions = set(), set()
    for ci, b in comps.items():
        if ci in walls or ci not in comp_color:
            continue
        span_x = b["max"][0] - b["min"][0]
        span_y = b["max"][1] - b["min"][1]
        span_z = b["max"][2] - b["min"][2]
        slot = comp_slot(ci)
        # Suelo: piezas planas del material Material_Piso (tiras del suelo que
        # entran en la caja de la esquina). El puff tiene 1 sola cara en ese slot,
        # pero la mayoria de sus caras son del slot 0, asi que no se ve afectado.
        is_floor = piso_slot is not None and slot == piso_slot and span_z < 0.3
        # Quad de sombra de contacto: plano, grande, casi negro. Nunca se repinta.
        # (No se descarta nada solo por estar bajo de z: las piezas inferiores de
        # los cojines tambien tocan el suelo y SI deben pintarse.)
        is_shadow = span_z < 0.25 and (span_x * span_y) > 1.0
        if is_floor or is_shadow:
            why = "suelo (Material_Piso plano)" if is_floor else "quad de sombra (plano y grande)"
            log["ignored"].append({"comp": ci, "reason": why, "bbox": [b["min"], b["max"]]})
            continue
        col = comp_color[ci]
        if col is None:
            continue
        warm = (col[0] - col[2]) >= WARM_R_MINUS_B
        entry = {
            "comp": ci,
            "bbox": [b["min"], b["max"]],
            "atlas_mean_hex": linear_to_hex(srgb_to_linear(col / 255.0)),
            "r_minus_b": round(float(col[0] - col[2]), 1),
        }
        if warm:
            cushions.add(ci)
            entry["reason"] = "calido (R-B>=%d)" % WARM_R_MINUS_B
            log["cushions"].append(entry)
        else:
            puff.add(ci)
            entry["reason"] = "frio (R-B<%d)" % WARM_R_MINUS_B
            log["puff"].append(entry)

    return {"walls": walls, "puff": puff, "cushions": cushions}, log


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv=None):
    ap = argparse.ArgumentParser(description="Repinta paredes/puff/cojines del atlas baked1.")
    ap.add_argument("--blend", default=None, help="ruta al .blend (por defecto static/assets/models/unified_room.blend)")
    ap.add_argument("--object", default="BAKED_1")
    ap.add_argument("--src", default=None, help="atlas de entrada (por defecto static/assets/textures/baked1_clean.webp)")
    ap.add_argument("--out", required=True, help="atlas de salida (.webp o .png)")
    ap.add_argument("--size", type=int, default=ATLAS_SIZE)
    ap.add_argument("--dilate", type=int, default=3, help="radio de dilatacion en px (default 3)")
    ap.add_argument("--wall-tint", default="#F2C4CE")
    ap.add_argument("--puff-tint", default="#1E6B63")
    ap.add_argument("--cushion-tint", default="#E9DCC9")
    ap.add_argument(
        "--max-ratio",
        type=float,
        default=1.0,
        help="tope de luma/luma_ref (1.0 = ninguna zona supera el color pedido; "
             "evita que los brillos horneados se quemen a blanco). 0 o negativo = sin tope.",
    )
    ap.add_argument(
        "--shadow-lift",
        type=float,
        default=0.0,
        help="0..1: sube las sombras para que el lado oscuro no quede casi negro "
             "(ratio' = lift + (1-lift)*ratio). 0 = sin lift.",
    )
    ap.add_argument("--force", action="store_true", help="ignora la guardia de idempotencia")
    ap.add_argument(
        "--wall-texture",
        dest="wall_texture",
        action="store_true",
        default=True,
        help="anade ruido de yeso/pintura (espacio de mundo) dentro de las paredes",
    )
    ap.add_argument("--no-wall-texture", dest="wall_texture", action="store_false")
    ap.add_argument("--wall-noise-sigma", type=float, default=WALL_TEXTURE_DEFAULTS["sigma"])
    ap.add_argument("--wall-gradient", type=float, default=WALL_TEXTURE_DEFAULTS["gradient"])
    ap.add_argument("--wall-grain-scale", type=float, default=WALL_TEXTURE_DEFAULTS["grain_scale"])
    ap.add_argument(
        "--expect-walls",
        default=None,
        help="comps esperados en el grupo paredes, separados por comas (falla si no coincide)",
    )
    ap.add_argument("--report", default=None, help="ruta del JSON de diagnostico")
    ap.add_argument("--dump-masks", default=None, help="directorio donde guardar las mascaras (auditoria)")
    ap.add_argument("--allow-missing-groups", action="store_true", help="no fallar si falta un grupo")
    args = ap.parse_args(argv)

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    blend = args.blend or os.path.join(repo_root, "static", "assets", "models", "unified_room.blend")
    src = args.src or os.path.join(repo_root, "static", "assets", "textures", "baked1_clean.webp")

    if not os.path.exists(blend):
        sys.exit("ERROR: no existe el blend %s" % blend)
    if not os.path.exists(src):
        sys.exit("ERROR: no existe el atlas %s" % src)

    print("[1/5] Extrayendo geometria/UV de %s (%s)..." % (args.object, blend))
    payload = extract_mesh_data(blend, args.object)

    print("[2/5] Leyendo atlas %s" % src)
    src_img = Image.open(src).convert("RGB")
    if src_img.size != (args.size, args.size):
        print("      aviso: el atlas es %s, se reescala a %d^2" % (src_img.size, args.size))
        src_img = src_img.resize((args.size, args.size), Image.LANCZOS)
    src_rgb = np.asarray(src_img).astype(np.float64)

    print("[3/5] Clasificando piezas (geometria + firma de color)...")
    groups, log = classify(payload, src_rgb)

    for name, ids in groups.items():
        if not ids and not args.allow_missing_groups:
            sys.exit("ERROR: el grupo '%s' quedo vacio; abortando para no repintar de mas." % name)
    print("      paredes: %d piezas | puff: %d piezas | cojines: %d piezas"
          % (len(groups["walls"]), len(groups["puff"]), len(groups["cushions"])))

    if args.expect_walls:
        expected = {int(v) for v in args.expect_walls.split(",") if v.strip()}
        if set(groups["walls"]) != expected:
            sys.exit(
                "ERROR: el grupo paredes no coincide con lo esperado.\n"
                "       esperado: %s\n       obtenido: %s"
                % (sorted(expected), sorted(groups["walls"]))
            )
        print("      paredes OK: exactamente %s" % sorted(expected))

    faces = payload["faces"]

    # Config del ruido de pared (se puede ajustar por CLI).
    wcfg = dict(WALL_TEXTURE_DEFAULTS)
    wcfg["sigma"] = args.wall_noise_sigma
    wcfg["gradient"] = args.wall_gradient
    wcfg["grain_scale"] = args.wall_grain_scale
    wall_texture_info = {}

    print("[4/5] Rasterizando mascaras a %d^2..." % args.size)
    masks_dilated = {}
    masks_own = {}
    overlap_report = {}
    for name, ids in groups.items():
        own_faces = [f for f in faces if f["c"] in ids]
        other_faces = [f for f in faces if f["c"] not in ids]
        own_img, skip_own = rasterize_faces(own_faces, args.size)
        other_img, _ = rasterize_faces(other_faces, args.size)
        own = np.asarray(own_img) > 127
        other = np.asarray(other_img) > 127
        dil = np.asarray(dilate(own_img, args.dilate)) > 127
        intruded = dil & other
        final = dil & ~other
        masks_dilated[name] = final
        masks_own[name] = own
        overlap_report[name] = {
            "own_px": int(own.sum()),
            "own_overlap_other_px": int((own & other).sum()),
            "dilated_px": int(dil.sum()),
            "other_surface_px_blocked": int(intruded.sum()),
            "skipped_faces": skip_own,
        }
        print("      %-9s px=%8d  (+%d por dilatacion, %d px de otra superficie bloqueados)"
              % (name, int(own.sum()), int(dil.sum()) - int(own.sum()), int(intruded.sum())))

    print("[5/5] Recoloreando (out = tint * luma/luma_ref) y escribiendo %s" % args.out)
    lin = srgb_to_linear(src_rgb / 255.0)
    luma = luma_of(lin)
    out_lin = lin.copy()

    tints = {
        "walls": args.wall_tint,
        "puff": args.puff_tint,
        "cushions": args.cushion_tint,
    }

    # Guardia de idempotencia: este script NO se puede aplicar dos veces sobre el
    # mismo atlas (el tinte se compondria y quedaria mas oscuro). Si la mediana de
    # alguna isla ya coincide con su tint, el atlas de entrada ya esta repintado.
    if not args.force:
        already = []
        for name, mask in masks_dilated.items():
            sel = mask & (luma > VALID_LUMA_MIN)
            if not sel.any():
                continue
            med = np.median(lin[sel], axis=0)
            med_hex = linear_to_hex(med)
            tint = np.array(hex_to_rgb(tints[name]), dtype=np.float64)
            med_rgb = np.array(hex_to_rgb(med_hex), dtype=np.float64)
            if np.max(np.abs(med_rgb - tint)) <= 20:
                already.append("%s: mediana %s ~ tint %s" % (name, med_hex, tints[name]))
        if already:
            sys.exit(
                "ERROR: el atlas de entrada ya parece repintado (%s).\n"
                "       Parte siempre del atlas ORIGINAL (baked1_clean.orig.webp).\n"
                "       Si de verdad quieres volver a aplicarlo, usa --force."
                % "; ".join(already)
            )

    stats = {}
    for name, mask in masks_dilated.items():
        valid = mask & (luma > VALID_LUMA_MIN)
        if not valid.any():
            sys.exit("ERROR: la mascara de '%s' no tiene pixeles validos." % name)

        tint_lin = hex_to_linear(tints[name])
        group_ref = float(np.median(luma[valid]))

        # Mapa de referencias por pixel (solo hace falta en modo component).
        ref_map = None
        ref_components = {}
        if REF_SCOPE.get(name, "group") == "component":
            ref_map = np.full(luma.shape, np.nan, dtype=np.float64)
            owned = np.zeros(luma.shape, dtype=bool)
            for ci in sorted(groups[name]):
                comp_faces = [f for f in faces if f["c"] == ci]
                comp_img, _ = rasterize_faces(comp_faces, args.size)
                comp_mask = np.asarray(comp_img) > 127
                comp_valid = comp_mask & (luma > VALID_LUMA_MIN)
                if not comp_valid.any():
                    continue
                cref = float(np.median(luma[comp_valid]))
                ref_components[ci] = round(cref, 6)
                ring = np.asarray(dilate(comp_img, args.dilate)) > 127
                fill = ring & ~owned
                ref_map[fill] = cref
                owned |= fill
            ref_map[np.isnan(ref_map)] = group_ref
            ref_values_all = ref_map
        else:
            ref_values_all = np.full(luma.shape, group_ref, dtype=np.float64)

        # IMPORTANTE: se repintan TODOS los pixeles de la mascara, no solo los
        # "validos". Los pixeles casi negros (luma <= VALID_LUMA_MIN) tambien son
        # superficie del objeto: si se dejan fuera, conservan el color original
        # (p.ej. el azul marino de la base del puff) y se ven como un parche.
        # `valid` se usa solo para calcular luma_ref.
        ref_values = ref_values_all[mask]

        ratio = luma[mask] / ref_values
        if args.shadow_lift and 0.0 < args.shadow_lift < 1.0:
            ratio = args.shadow_lift + (1.0 - args.shadow_lift) * ratio
        if args.max_ratio and args.max_ratio > 0:
            ratio = np.minimum(ratio, args.max_ratio)
        scaled = tint_lin[None, :] * ratio[:, None]
        out_lin[mask] = np.clip(scaled, 0.0, 1.0)

        # Ruido de yeso/pintura SOLO dentro de la isla de paredes y SOLO sobre la
        # luma ya tintada: multiplica (1 + campo). No toca AO ni sombras.
        if name == "walls" and args.wall_texture:
            field, covered, winfo = build_wall_field(faces, groups["walls"], args.size, wcfg)
            out_lin[covered] *= (1.0 + field[covered])[:, None]
            np.clip(out_lin[covered], 0.0, 1.0, out=out_lin[covered])
            wall_texture_info = winfo
            print("      pared: ruido sigma=%.4f min=%.4f max=%.4f std=%.4f (%d px)"
                  % (wcfg["sigma"], winfo.get("min", 0), winfo.get("max", 0),
                     winfo.get("std", 0), winfo.get("covered_px", 0)))

        # Estadisticas sobre las islas reales (sin el anillo de dilatacion, que
        # cae sobre relleno negro y falsearia medianas y medias).
        stat = masks_own[name]
        out_rgb = linear_to_srgb(out_lin[stat]) * 255.0
        src_masked = src_rgb[stat]
        ratio_stat = luma[stat] / ref_values_all[stat]
        if args.shadow_lift and 0.0 < args.shadow_lift < 1.0:
            ratio_stat = args.shadow_lift + (1.0 - args.shadow_lift) * ratio_stat
        mid = ratio_stat >= 0.5
        out_mid = out_rgb[mid] if mid.any() else out_rgb
        # Pixeles justo en la referencia: ahi el resultado debe ser el tint exacto.
        at_ref = np.abs(ratio_stat - 1.0) <= 0.05
        out_ref = out_rgb[at_ref] if at_ref.any() else out_rgb

        stats[name] = {
            "tint": tints[name],
            "px": int(stat.sum()),
            "valid_px": int((stat & (luma > VALID_LUMA_MIN)).sum()),
            "dark_px": int((stat & (luma <= VALID_LUMA_MIN)).sum()),
            "ref_scope": REF_SCOPE.get(name, "group"),
            "luma_ref_median": round(group_ref, 6),
            "luma_ref_srgb": round(float(linear_to_srgb(group_ref)) * 255.0, 1),
            "ref_components": ref_components,
            "source_mean_hex": "#" + "".join("%02X" % int(round(v)) for v in src_masked.mean(axis=0)),
            "out_mean_hex": "#" + "".join("%02X" % int(round(v)) for v in out_rgb.mean(axis=0)),
            "out_median_hex": "#" + "".join("%02X" % int(round(v)) for v in np.median(out_rgb, axis=0)),
            "out_mid_band_hex": "#" + "".join("%02X" % int(round(v)) for v in out_mid.mean(axis=0)),
            "out_at_ref_hex": "#" + "".join("%02X" % int(round(v)) for v in out_ref.mean(axis=0)),
            "mid_band_px": int(mid.sum()),
            "out_p05_hex": "#" + "".join("%02X" % int(round(v)) for v in np.percentile(out_rgb, 5, axis=0)),
            "out_p95_hex": "#" + "".join("%02X" % int(round(v)) for v in np.percentile(out_rgb, 95, axis=0)),
        }

    # Auditoria: los pixeles fuera de las 3 mascaras no deben cambiar.
    union = np.zeros(luma.shape, dtype=bool)
    for m in masks_dilated.values():
        union |= m
    untouched_delta = np.abs(src_rgb[~union] - linear_to_srgb(out_lin[~union]) * 255.0)

    out_rgb_full = linear_to_srgb(out_lin) * 255.0

    def mask_delta(m):
        if m is None or not m.any():
            return None
        d = np.abs(out_rgb_full[m] - src_rgb[m])
        return {
            "px": int(m.sum()),
            "max_delta_255": int(np.ceil(d.max())),
            "mean_delta_255": round(float(d.mean()), 4),
        }

    # --- Intocables --------------------------------------------------------
    # (a) todo BAKED_1 que no sea pared/puff/cojin (suelo, props, etc.)
    grouped = set(groups["walls"]) | set(groups["puff"]) | set(groups["cushions"])
    prot_faces = [f for f in faces if f["c"] not in grouped]
    prot_img, _ = rasterize_faces(prot_faces, args.size)
    prot = np.asarray(prot_img) > 127

    # (b) la pizarra es un objeto aparte que en la web usa ESTE mismo atlas
    #     (Whiteboard.js -> baked.model.material), asi que hay que comprobarla.
    wb_mask = None
    try:
        wb_payload = extract_mesh_data(blend, "Whiteboard")
        wb_img, _ = rasterize_faces(wb_payload["faces"], args.size)
        wb_mask = np.asarray(wb_img) > 127
    except SystemExit:
        print("      aviso: no se pudo leer el objeto Whiteboard; se omite su auditoria")

    prot_union = prot | wb_mask if wb_mask is not None else prot
    wall_dilated = masks_dilated["walls"]
    wall_own = masks_own["walls"]
    protected = {
        "wall_mask_overlap_px": int((wall_dilated & prot_union).sum()),
        "wall_own_overlap_px": int((wall_own & prot_union).sum()),
        "baked1_non_group": mask_delta(prot),
        "whiteboard": mask_delta(wb_mask),
        "note": "los logos LinkedIn/GitHub y los estantes usan baked3.ktx2; "
                "la chapa X se construye en runtime: este script no los abre ni los escribe",
    }

    # --- Metricas de la textura de pared -----------------------------------
    wall_metrics = {}
    if args.wall_texture and wall_own.any():
        lum_before = luma[wall_own]
        lum_after = luma_of(out_lin)[wall_own]

        def highpass_std(values_full, mask):
            img = Image.fromarray(
                (np.clip(values_full, 0.0, 1.0) * 255.0).astype(np.uint8), "L"
            )
            smooth = np.asarray(img.filter(ImageFilter.GaussianBlur(8))).astype(np.float64) / 255.0
            return float((values_full - smooth)[mask].std())

        wall_metrics = {
            "luma_std_before": round(float(lum_before.std()), 5),
            "luma_std_after": round(float(lum_after.std()), 5),
            "highpass_std_before": round(highpass_std(luma, wall_own), 5),
            "highpass_std_after": round(highpass_std(luma_of(out_lin), wall_own), 5),
            "multiplier_mean": 1.0 + (wall_texture_info.get("mean", 0.0)),
        }

    # Los pixeles no enmascarados se re-codifican desde lineal; el error de
    # ida y vuelta srgb->linear->srgb es ~0 (aritmetica float).
    res = Image.fromarray(
        np.clip(np.round(linear_to_srgb(out_lin) * 255.0), 0, 255).astype(np.uint8), "RGB"
    )
    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    if args.out.lower().endswith(".webp"):
        res.save(args.out, "WEBP", quality=95, method=6)
    else:
        res.save(args.out)

    if args.dump_masks:
        os.makedirs(args.dump_masks, exist_ok=True)
        for name, mask in masks_dilated.items():
            Image.fromarray((mask * 255).astype(np.uint8), "L").save(
                os.path.join(args.dump_masks, "mask_%s.png" % name)
            )

    # Verificacion: hex medio por canal vs objetivo.
    verification = {}
    ok = True
    for name, st in stats.items():
        target = hex_to_rgb(st["tint"])
        mean = hex_to_rgb(st["out_mean_hex"])
        median = hex_to_rgb(st["out_median_hex"])
        mid = hex_to_rgb(st["out_mid_band_hex"])
        d_mean = [mean[i] - target[i] for i in range(3)]
        d_median = [median[i] - target[i] for i in range(3)]
        d_mid = [mid[i] - target[i] for i in range(3)]
        passed = all(abs(v) <= VERIFY_TOLERANCE for v in d_mid)
        ok = ok and passed
        verification[name] = {
            "target": st["tint"],
            "delta_mean": d_mean,
            "delta_median": d_median,
            "delta_mid_band": d_mid,
            "passed_mid_band_tolerance_%d" % VERIFY_TOLERANCE: passed,
        }

    report = {
        "blend": blend,
        "source": src,
        "output": os.path.abspath(args.out),
        "size": args.size,
        "dilate_px": args.dilate,
        "groups": {k: sorted(v) for k, v in groups.items()},
        "classification_log": log,
        "masks": overlap_report,
        "wall_texture": {"enabled": bool(args.wall_texture), **wall_texture_info, **wall_metrics},
        "protected": protected,
        "untouched_outside_masks_max_delta": int(np.ceil(untouched_delta.max())) if untouched_delta.size else 0,
        "untouched_outside_masks_mean_delta": round(float(untouched_delta.mean()), 4) if untouched_delta.size else 0.0,
        "stats": stats,
        "verification": verification,
        "all_passed": ok,
    }

    if args.report:
        os.makedirs(os.path.dirname(os.path.abspath(args.report)), exist_ok=True)
        with open(args.report, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2, ensure_ascii=False)
        print("      informe: %s" % args.report)

    print()
    print("%-9s %-8s %-8s %-8s %-8s %-8s %s" % ("grupo", "tint", "en-ref", "luz-media", "medio", "p05", "p95"))
    for name, st in stats.items():
        print("%-9s %-8s %-8s %-8s %-8s %-8s %s"
              % (name, st["tint"], st["out_at_ref_hex"], st["out_mid_band_hex"], st["out_mean_hex"], st["out_p05_hex"], st["out_p95_hex"]))
    print()
    for name, v in verification.items():
        print("%-9s target=%s  delta_luz_media=%s  %s"
              % (name, v["target"], v["delta_mid_band"],
                 "OK" if v["passed_mid_band_tolerance_%d" % VERIFY_TOLERANCE] else "FUERA DE TOLERANCIA"))
    print()
    print("OK -> %s" % args.out)
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
