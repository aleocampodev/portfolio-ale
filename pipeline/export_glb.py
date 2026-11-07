import bpy
import os
import sys
import time

start_time = time.time()

blend_path = bpy.data.filepath
if not blend_path:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    blend_path = os.path.join(repo_root, "static", "assets", "models", "unified_room.blend")

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
output_glb = os.path.join(repo_root, "static", "assets", "models", "unified_room.glb")

print(f"[PIPELINE] Exporting {blend_path} -> {output_glb}")

bpy.ops.export_scene.gltf(
    filepath=output_glb,
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

elapsed = round(time.time() - start_time, 2)
size_mb = round(os.path.getsize(output_glb) / (1024 * 1024), 2)
print(f"[PIPELINE] GLB successfully exported in {elapsed}s ({size_mb} MB) -> {output_glb}")
