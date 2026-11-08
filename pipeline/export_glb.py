import bpy
import os
import time
import json

start_time = time.time()
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
models_dir = os.path.join(repo_root, 'static', 'assets', 'models')

print("[PIPELINE] Sincronizando modelos de Blender a Three.js...")

def export_objects(target_path, object_names):
    objs = [o for o in bpy.data.objects if any(name.lower() in o.name.lower() for name in object_names)]
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
        print(f"[PIPELINE]  ✔ Exportado {os.path.basename(target_path)} ({len(objs)} objetos: {[o.name for o in objs]})")
    else:
        # Si el objeto fue eliminado en Blender, exportar escena vacía
        temp_scene = bpy.data.scenes.new('EmptyScene')
        old_scene = bpy.context.window.scene
        bpy.context.window.scene = temp_scene
        bpy.ops.export_scene.gltf(filepath=target_path, export_format='GLB', use_selection=False)
        bpy.context.window.scene = old_scene
        bpy.data.scenes.remove(temp_scene)
        print(f"[PIPELINE]  ✖ {os.path.basename(target_path)} vaciado (eliminado en Blender)")

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

# 2. Export individual modular components for Three.js with exact Blender names
export_objects(os.path.join(models_dir, 'room.glb'), ['BAKED_1', 'Claqueta'])
export_objects(os.path.join(models_dir, 'room2.glb'), ['BAKED_2', 'LeftMonitor', 'RightMonitor'])
export_objects(os.path.join(models_dir, 'room3.glb'), ['BAKED_3', 'Cover', 'Interior', 'Github', 'Linkedin', 'Itchio'])
export_objects(os.path.join(models_dir, 'topChair.glb'), ['TopChair'])
export_objects(os.path.join(models_dir, 'whiteboard.glb'), ['Whiteboard', 'Whiteboard_Canvas'])
export_objects(os.path.join(models_dir, 'Rubik.glb'), ['Rubik', 'Cube'])

# 3. Check Carpet presence
carpet_objs = [o for o in bpy.data.objects if 'carpet' in o.name.lower()]
carpet_exists = len(carpet_objs) > 0
carpet_meta = os.path.join(models_dir, 'carpet_status.json')
with open(carpet_meta, 'w') as f:
    json.dump({'exists': carpet_exists}, f)
print(f"[PIPELINE]  {'✔ Carpet activa' if carpet_exists else '✖ Carpet eliminada'} (carpet_status.json: {carpet_exists})")

elapsed = round(time.time() - start_time, 2)
print(f"[PIPELINE] Sincronización completada en {elapsed}s")
