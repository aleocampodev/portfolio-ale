import bpy
import bmesh
from mathutils import Vector

print("[SYNC-BLENDER] Sincronizando reconstrucción del escritorio en unified_room.blend...")

# Conversión entre Three.js (X_t, Y_t, Z_t) y Blender (X_b, Y_b, Z_b):
# X_b = X_t
# Y_b = -Z_t
# Z_b = Y_t

# ---------------------------------------------------------------------------
# 1. Eliminar objetos del Cubo de Rubik que ya no existen en la escena
# ---------------------------------------------------------------------------
removed_rubik = []
for obj in list(bpy.data.objects):
    if obj.name == "RubiksCube" or obj.name == "Cube" or obj.name.startswith("Cube."):
        removed_rubik.append(obj.name)
        bpy.data.objects.remove(obj, do_unlink=True)

if removed_rubik:
    print(f"[SYNC-BLENDER] Eliminados {len(removed_rubik)} objetos de RubiksCube.")

# ---------------------------------------------------------------------------
# 2. Actualizar BAKED_2 (quitar tapas viejas y mueble marrón antiguo, ajustar patas)
# ---------------------------------------------------------------------------
baked2 = bpy.data.objects.get("BAKED_2")
if baked2 and baked2.type == "MESH":
    bm = bmesh.new()
    bm.from_mesh(baked2.data)
    mw = baked2.matrix_world
    mw_inv = mw.inverted()

    faces_to_remove = []
    for f in bm.faces:
        wcoords = [mw @ v.co for v in f.verts]
        min_x = min(v.x for v in wcoords)
        max_x = max(v.x for v in wcoords)
        min_y = min(v.y for v in wcoords)
        max_y = max(v.y for v in wcoords)
        min_z = min(v.z for v in wcoords)
        max_z = max(v.z for v in wcoords)

        dx = max_x - min_x
        dy = max_y - min_y

        # Tapas escalonadas antiguas (sin tocar el mousepad en Z_b = 1.9279)
        is_old_slab = (dx > 0.95 or dy > 0.95) and (min_z >= 1.56 and max_z <= 1.922)
        # Gabinete marrón antiguo de 2 cajones a la izquierda (X < 0.02, Z_t < -3.30 -> Y_b > 3.30)
        is_old_brown_cab = (max_x < 0.02) and (min_y > 3.30)

        if is_old_slab or is_old_brown_cab:
            faces_to_remove.append(f)

    if faces_to_remove:
        bmesh.ops.delete(bm, geom=faces_to_remove, context="FACES")
        print(f"[SYNC-BLENDER] Eliminadas {len(faces_to_remove)} caras antiguas de BAKED_2.")

    for v in bm.verts:
        wv = mw @ v.co
        wx, wy_b, wz_b = wv.x, wv.y, wv.z
        wz_t = -wy_b
        wy_t = wz_b

        # Pata blanca frontal del retorno derecho
        if 2.78 <= wx <= 3.86 and -1.13 <= wz_t <= -0.97:
            if 1.55 <= wy_t <= 1.73:
                wv.z = 1.855
            if wx >= 3.82:
                wv.x = 3.978

        # Patas laterales y faldón trasero del escritorio principal
        if 0.04 <= wx <= 3.99 and -4.65 <= wz_t <= -2.93:
            if 1.78 <= wy_t <= 1.805:
                wv.z = 1.855

        v.co = mw_inv @ wv

    bm.to_mesh(baked2.data)
    bm.free()
    baked2.data.update()

# ---------------------------------------------------------------------------
# 3. Actualizar BAKED_3 (elevar laptop +0.21m y mover lápices/borrador al Whiteboard)
# ---------------------------------------------------------------------------
baked3 = bpy.data.objects.get("BAKED_3")
if baked3 and baked3.type == "MESH":
    bm = bmesh.new()
    bm.from_mesh(baked3.data)
    mw = baked3.matrix_world
    mw_inv = mw.inverted()

    moved_laptop = 0
    moved_markers = 0
    for v in bm.verts:
        wv = mw @ v.co
        wx = wv.x
        wy_t = wv.z
        wz_t = -wv.y

        # Laptop cerrada sobre el retorno derecho (solo si aún está en la altura baja <= 1.85)
        if 3.10 <= wx <= 3.70 and 1.69 <= wy_t <= 1.85 and -2.50 <= wz_t <= -1.70:
            wv.z += 0.21
            moved_laptop += 1

        # Lápices/marcadores y borrador del antiguo gabinete marrón -> bandeja del Whiteboard
        if -1.28 <= wx <= -0.92 and 1.44 <= wy_t <= 1.80 and -4.46 <= wz_t <= -4.05:
            if wz_t > -4.22:
                nx = (wx - -1.1015) + -3.28
                ny_t = (wy_t - 1.4639) + 2.176
                nz_t = (wz_t - -4.150) * 0.75 + -4.51
            else:
                scale_cup = 0.72
                nx = (wx - -1.0965) * scale_cup + -2.36
                ny_t = (wy_t - 1.4639) * scale_cup + 2.176
                nz_t = (wz_t - -4.3255) * scale_cup + -4.50
            wv.x = nx
            wv.y = -nz_t
            wv.z = ny_t
            moved_markers += 1

        v.co = mw_inv @ wv

    bm.to_mesh(baked3.data)
    bm.free()
    baked3.data.update()
    print(f"[SYNC-BLENDER] BAKED_3 actualizado (laptop verts: {moved_laptop}, markers verts: {moved_markers}).")

# ---------------------------------------------------------------------------
# 4. Centrar y ampliar LeftMonitor (1.22x centrado en X = 1.524m)
# ---------------------------------------------------------------------------
left_mon = bpy.data.objects.get("LeftMonitor")
if left_mon and left_mon.type == "MESH":
    # Primero restaurar location original y llevar el bounding box exactamente a:
    # X: [0.6711, 2.3769] (centro 1.524), Y_b: [4.0437, 4.7093], Z_b: [1.9196, 3.1228]
    left_mon.location = (1.067531, 4.216008, 2.494902)
    left_mon.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()
    mw = left_mon.matrix_world
    mw_inv = mw.inverted()
    wcoords = [mw @ v.co for v in left_mon.data.vertices]
    cur_min_x, cur_max_x = min(v.x for v in wcoords), max(v.x for v in wcoords)
    cur_min_y, cur_max_y = min(v.y for v in wcoords), max(v.y for v in wcoords)
    cur_min_z, cur_max_z = min(v.z for v in wcoords), max(v.z for v in wcoords)

    target_w = 1.398515 * 1.22
    target_d = 0.545582 * 1.22
    target_h = 0.986209 * 1.22
    target_min_x = 1.524 - target_w * 0.5
    target_min_y = 4.23009 + 1.22 * (4.077307 - 4.23009)
    target_min_z = 1.9196

    for v in left_mon.data.vertices:
        wv = mw @ v.co
        tx = (wv.x - cur_min_x) / max(1e-6, cur_max_x - cur_min_x)
        ty = (wv.y - cur_min_y) / max(1e-6, cur_max_y - cur_min_y)
        tz = (wv.z - cur_min_z) / max(1e-6, cur_max_z - cur_min_z)
        nx = target_min_x + tx * target_w
        ny = target_min_y + ty * target_d
        nz = target_min_z + tz * target_h
        v.co = mw_inv @ Vector((nx, ny, nz))

    left_mon.data.update()
    print("[SYNC-BLENDER] LeftMonitor centrado exactamente en X=1.524 y Z_base=1.9196 (1.22x).")

# ---------------------------------------------------------------------------
# 5. Crear colección y objetos 3D en Blender para el Tablero en L, Patas Blancas,
#    Cajonera Blanca de 4 Cajones con uñeros y Bandeja del Whiteboard
# ---------------------------------------------------------------------------
def get_or_create_material(name, rgb):
    mat = bpy.data.materials.get(name)
    if not mat:
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
    mat.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        bsdf.inputs["Roughness"].default_value = 0.45
    return mat

mat_oak = get_or_create_material("Desk_WarmOak", (0.78, 0.55, 0.36))
mat_white = get_or_create_material("Desk_WarmWhite", (0.93, 0.91, 0.88))
mat_dark = get_or_create_material("Desk_DarkRecess", (0.13, 0.11, 0.10))
mat_tray = get_or_create_material("Whiteboard_TrayMat", (0.35, 0.32, 0.30))

# Limpiar objetos previos de reconstrucción si ya existían para que sea idempotente
custom_prefixes = (
    "DeskMainWoodTop",
    "DeskReturnWoodTop",
    "DeskCabinetWoodTop",
    "DeskLeftWhiteLeg",
    "DeskRightWhiteLeg",
    "DeskLeftCabinet_",
    "DeskLeftDrawer_",
    "WhiteboardMarkerTray_",
    "MarkerTray_",
)
for obj in list(bpy.data.objects):
    if obj.name.startswith(custom_prefixes):
        bpy.data.objects.remove(obj, do_unlink=True)

def create_box_object(name, min_three, max_three, mat):
    # min_three = (x0, y0, z0) en Three.js -> Blender: x in [x0, x1], y in [-z1, -z0], z in [y0, y1]
    x0, y0, z0 = min_three
    x1, y1, z1 = max_three
    bx0, bx1 = min(x0, x1), max(x0, x1)
    by0, by1 = min(-z0, -z1), max(-z0, -z1)
    bz0, bz1 = min(y0, y1), max(y0, y1)

    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    v0 = bm.verts.new((bx0, by0, bz0))
    v1 = bm.verts.new((bx1, by0, bz0))
    v2 = bm.verts.new((bx1, by1, bz0))
    v3 = bm.verts.new((bx0, by1, bz0))
    v4 = bm.verts.new((bx0, by0, bz1))
    v5 = bm.verts.new((bx1, by0, bz1))
    v6 = bm.verts.new((bx1, by1, bz1))
    v7 = bm.verts.new((bx0, by1, bz1))

    bm.faces.new((v0, v3, v2, v1))
    bm.faces.new((v4, v5, v6, v7))
    bm.faces.new((v0, v1, v5, v4))
    bm.faces.new((v1, v2, v6, v5))
    bm.faces.new((v2, v3, v7, v6))
    bm.faces.new((v3, v0, v4, v7))

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    target_col = bpy.data.collections.get("UnifiedRoom") or bpy.context.collection
    target_col.objects.link(obj)
    return obj

# Tablero en L + Tapa de madera de la cajonera (Y_t: 1.8385..1.9185)
create_box_object("DeskMainWoodTop", (0.048, 1.8385, -4.638), (3.980, 1.9185, -2.942), mat_oak)
create_box_object("DeskReturnWoodTop", (2.792, 1.8385, -2.942), (3.980, 1.9185, -0.984), mat_oak)
create_box_object("DeskCabinetWoodTop", (-1.220, 1.8385, -4.638), (0.046, 1.9185, -2.942), mat_oak)

# Patas blancas
create_box_object("DeskLeftWhiteLeg", (0.050, 0.020, -4.636), (0.183, 1.845, -2.942), mat_white)
create_box_object("DeskRightWhiteLeg", (2.792, 0.020, -1.117), (3.979, 1.845, -0.984), mat_white)

# Cajonera blanca izquierda de 4 cajones
create_box_object("DeskLeftCabinet_SideWall", (-1.220, 0.020, -4.638), (-1.175, 1.845, -2.942), mat_white)
create_box_object("DeskLeftCabinet_Carcass", (-1.175, 0.020, -4.638), (0.046, 1.845, -2.968), mat_dark)
create_box_object("DeskLeftCabinet_Plinth", (-1.172, 0.020, -2.966), (0.027, 0.102, -2.942), mat_white)
create_box_object("DeskLeftCabinet_TopRail", (-1.172, 1.8125, -2.966), (0.027, 1.8385, -2.942), mat_white)

def create_notched_drawer_object(name, cx, y_min, h, width, z_back, z_front, mat):
    half_w = width / 2.0
    nt = 0.145
    nb = 0.105
    nd = 0.044
    # Puntos del polígono frontal con uñero trapezoidal en el borde superior
    poly_2d = [
        (cx - half_w, y_min),
        (cx + half_w, y_min),
        (cx + half_w, y_min + h),
        (cx + nt, y_min + h),
        (cx + nb, y_min + h - nd),
        (cx - nb, y_min + h - nd),
        (cx - nt, y_min + h),
        (cx - half_w, y_min + h),
    ]
    by_front = -z_front
    by_back = -z_back

    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    front_verts = [bm.verts.new((px, by_front, py)) for (px, py) in poly_2d]
    back_verts = [bm.verts.new((px, by_back, py)) for (px, py) in poly_2d]

    bm.faces.new(front_verts)
    bm.faces.new(list(reversed(back_verts)))
    n = len(poly_2d)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front_verts[i], front_verts[j], back_verts[j], back_verts[i]))

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    target_col = bpy.data.collections.get("UnifiedRoom") or bpy.context.collection
    target_col.objects.link(obj)
    return obj

drawer_specs = [
    ("DeskLeftDrawer_4", 0.116, 0.482),
    ("DeskLeftDrawer_3", 0.613, 0.382),
    ("DeskLeftDrawer_2", 1.010, 0.382),
    ("DeskLeftDrawer_1", 1.407, 0.382),
]
for d_name, y_min, d_h in drawer_specs:
    create_notched_drawer_object(d_name, -0.5725, y_min, d_h, 1.199, -2.966, -2.942, mat_white)

# Bandeja porta-marcadores del Whiteboard
create_box_object("MarkerTray_Base", (-3.53, 2.149, -4.655), (-2.11, 2.175, -4.405), mat_tray)
create_box_object("MarkerTray_Lip", (-3.53, 2.149, -4.423), (-2.11, 2.185, -4.405), mat_tray)

# -------------------------------------------------------------------------
# Torre Gamer PC contemporánea ocupando el bloque de CPU bajo el escritorio
# En Three.js: pcX = 3.32, pcZ = -3.42, width=0.44, height=1.16, depth=0.92
# En Blender (X_b = X, Y_b = -Z, Z_b = Y):
# X: 3.32 +- 0.22 = [3.10, 3.54]
# Y_b: 3.42 +- 0.46 = [2.96, 3.88]
# Z_b: 0.02 .. 1.18
# -------------------------------------------------------------------------
mat_pc_case = get_or_create_material("GamingPC_Chassis", (0.04, 0.04, 0.045, 1.0))
mat_pc_glass = get_or_create_material("GamingPC_Glass", (0.08, 0.05, 0.12, 0.4))
mat_pc_rgb = get_or_create_material("GamingPC_RGB_Violet", (0.75, 0.18, 1.0, 1.0))

# Chasis principal
create_box_object("GamingPC_Chassis", (3.10, 0.02, 2.96), (3.54, 1.18, 3.88), mat_pc_case)
# Panel lateral de vidrio templado (cara -X en Three.js, visible hacia la silla)
create_box_object("GamingPC_GlassPanel", (3.095, 0.05, 2.98), (3.105, 1.15, 3.85), mat_pc_glass)
# Aros luminosos RGB violeta frontales
create_box_object("GamingPC_RGB_Strip", (3.11, 0.35, 3.10), (3.13, 0.38, 3.75), mat_pc_rgb)
create_box_object("GamingPC_FanRing_Top", (3.18, 0.75, 2.95), (3.46, 0.98, 2.97), mat_pc_rgb)
create_box_object("GamingPC_FanRing_Bottom", (3.18, 0.38, 2.95), (3.46, 0.61, 2.97), mat_pc_rgb)

# Eliminar vértices de la laptop cerrada en BAKED_3
b3 = bpy.data.objects.get("BAKED_3")
if b3:
    # La laptop cerrada vive en X: 3.10..3.70, Y_b: 1.70..2.50, Z_b: 1.69..2.15
    mw = b3.matrix_world
    to_collapse = [v for v in b3.data.vertices if 3.0 <= (mw @ v.co).x <= 3.8 and 1.6 <= (mw @ v.co).y <= 2.6 and 1.6 <= (mw @ v.co).z <= 2.25]
    for v in to_collapse:
        v.co.z = -50.0

# Actualizar texturas de Baked1_Arch y Baked2_DeskFurniture en Blender para que
# apunten a baked1_clean.webp (paredes rosas) y baked2_clean.webp:
import os
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tex_dir = os.path.join(repo_root, "static", "assets", "textures")

for mat_name, webp_name in [("Baked1_Arch", "baked1_clean.webp"), ("Baked2_DeskFurniture", "baked2_clean.webp")]:
    mat = bpy.data.materials.get(mat_name)
    webp_path = os.path.join(tex_dir, webp_name)
    if mat and mat.node_tree and os.path.exists(webp_path):
        img = bpy.data.images.load(webp_path, check_existing=True)
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE":
                node.image = img

bpy.ops.wm.save_mainfile()
print("[SYNC-BLENDER] ✔ unified_room.blend guardado con toda la reconstrucción actual.")
