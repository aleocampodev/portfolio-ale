import bpy
import os
import time
import json

start_time = time.time()
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
models_dir = os.path.join(repo_root, 'static', 'assets', 'models')

print("[PIPELINE] Sincronizando modelos de Blender a Three.js...")

def export_objects(target_path, object_names):
    objs = [o for o in bpy.data.objects if any(name.lower() == o.name.lower() or name.lower() in o.name.lower() for name in object_names)]
    if objs:
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=target_path,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_texcoords=True,
            export_normals=True,
            export_materials='EXPORT',
            export_cameras=False,
            export_lights=False
        )
        print(f"[PIPELINE]  ✔ Exportado {os.path.basename(target_path)} ({len(objs)} objetos)")
    else:
        if os.path.exists(target_path):
            os.remove(target_path)
        print(f"[PIPELINE]  ✖ {os.path.basename(target_path)} no existe en Blender")

# 1. Export unified_room.glb
output_unified = os.path.join(models_dir, 'unified_room.glb')
bpy.ops.export_scene.gltf(
    filepath=output_unified,
    export_format='GLB',
    use_selection=False,
    export_apply=True,
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False
)
print("[PIPELINE]  ✔ Exportado unified_room.glb")

# 2. Exportación modular exacta de componentes para Three.js
# room.glb: BAKED_1 (paredes, piso, zócalo, pesas/puff), Floor y Claqueta
export_objects(os.path.join(models_dir, 'room.glb'), ['BAKED_1', 'Floor', 'Claqueta.002'])
# room2.glb: BAKED_2 contiene el escritorio y monitores
export_objects(os.path.join(models_dir, 'room2.glb'), ['BAKED_2', 'BAKED_2.001', 'LeftMonitor'])
# room3.glb: BAKED_3 contiene repisas, libros y logos
export_objects(os.path.join(models_dir, 'room3.glb'), ['BAKED_3', 'Cover', 'Interior', 'Github', 'Linkedin', 'Itchio'])
export_objects(os.path.join(models_dir, 'topChair.glb'), ['TopChair'])
export_objects(os.path.join(models_dir, 'whiteboard.glb'), ['Whiteboard', 'Whiteboard_Canvas'])
export_objects(os.path.join(models_dir, 'Rubik.glb'), ['Cube', 'RubiksCube'])
export_objects(os.path.join(models_dir, 'github.glb'), ['Github'])
export_objects(os.path.join(models_dir, 'linkedin.glb'), ['Linkedin'])
export_objects(os.path.join(models_dir, 'itchio.glb'), ['Itchio'])

# 3. Estado de alfombra (físicamente eliminada)
carpet_objs = [o for o in bpy.data.objects if 'carpet' in o.name.lower()]
carpet_exists = len(carpet_objs) > 0
with open(os.path.join(models_dir, 'carpet_status.json'), 'w') as f:
    json.dump({'exists': carpet_exists}, f)

elapsed = round(time.time() - start_time, 2)
print(f"[PIPELINE] Sincronización completada en {elapsed}s (Carpet exists: {carpet_exists})")
