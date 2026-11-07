import bpy
import os
import time
import json

start_time = time.time()
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
models_dir = os.path.join(repo_root, 'static', 'assets', 'models')

output_unified = os.path.join(models_dir, 'unified_room.glb')
output_arcade = os.path.join(models_dir, 'arcadeMachine.glb')
carpet_meta = os.path.join(models_dir, 'carpet_status.json')

print("[PIPELINE] Exportando unified_room.glb desde Blender...")

# 1. Export unified_room.glb
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

# 2. Check arcade machine presence
arcade_objs = [o for o in bpy.data.objects if 'arcade' in o.name.lower()]
if arcade_objs:
    bpy.ops.object.select_all(action='DESELECT')
    for o in arcade_objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=output_arcade, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
    print("[PIPELINE] arcadeMachine presente y exportada.")
else:
    temp_scene = bpy.data.scenes.new('EmptyScene')
    old_scene = bpy.context.window.scene
    bpy.context.window.scene = temp_scene
    bpy.ops.export_scene.gltf(filepath=output_arcade, export_format='GLB', use_selection=False)
    bpy.context.window.scene = old_scene
    bpy.data.scenes.remove(temp_scene)
    print("[PIPELINE] arcadeMachine no existe en Blender -> arcadeMachine.glb vaciado.")

# 3. Check Carpet presence and write status
carpet_objs = [o for o in bpy.data.objects if 'carpet' in o.name.lower()]
carpet_exists = len(carpet_objs) > 0
with open(carpet_meta, 'w') as f:
    json.dump({'exists': carpet_exists}, f)
print(f"[PIPELINE] Carpet en Blender: {'PRESENTE' if carpet_exists else 'ELIMINADA'} (carpet_status.json: {carpet_exists})")

elapsed = round(time.time() - start_time, 2)
print(f"[PIPELINE] Pipeline completado exitosamente en {elapsed}s")
