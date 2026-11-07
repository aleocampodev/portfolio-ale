import bpy
import os
import math
from mathutils import Vector

models_dir = '/home/aleocampodev/Work/portfolio-ale-web/joan-portfolio/static/assets/models'
output_blend = os.path.join(models_dir, 'unified_room.blend')
output_glb = os.path.join(models_dir, 'unified_room.glb')

bpy.ops.wm.open_mainfile(filepath=output_blend)

wb_canvas = bpy.data.objects.get('Whiteboard_Canvas')
if wb_canvas:
    mesh = wb_canvas.data
    # Exact dimensions of the inner board face:
    # Center: (-3.364, 4.606, 3.187)
    # Normal is approx -Y (normal: [-0.038, 0.999, 0.0] facing +Y, back face facing -Y)
    # Width across X: 2.54m (from X=-4.63 to -2.09)
    # Height across Z: 1.78m
    # Offset by 0.015m in front of the board surface into the room:
    Y_FRONT = 4.585
    X_MIN = -4.634
    X_MAX = -2.094
    Z_MIN = 2.297
    Z_MAX = 4.077

    verts = [
        (X_MIN, Y_FRONT, Z_MAX), # Top-Left (UV: 0, 1)
        (X_MAX, Y_FRONT, Z_MAX), # Top-Right (UV: 1, 1)
        (X_MAX, Y_FRONT, Z_MIN), # Bottom-Right (UV: 1, 0)
        (X_MIN, Y_FRONT, Z_MIN), # Bottom-Left (UV: 0, 0)
    ]
    faces = [(0, 1, 2, 3)]
    mesh.clear_geometry()
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    uv_layer = mesh.uv_layers.new(name='UVMap')
    uvs = [(0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0)]
    for i, loop in enumerate(mesh.loops):
        uv_layer.data[loop.index].uv = uvs[i]

bpy.ops.wm.save_as_mainfile(filepath=output_blend)
print('CANVAS PERFECTLY EMBEDDED INSIDE THE WHITEBOARD FRAME!')

bpy.ops.export_scene.gltf(filepath=output_glb, export_format='GLB')
print('GLB EXPORTED!')
