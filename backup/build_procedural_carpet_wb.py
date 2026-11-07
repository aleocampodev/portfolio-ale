import bpy
import os
import math
from mathutils import Vector, Euler

bpy.ops.wm.read_factory_settings(use_empty=True)

models_dir = '/home/aleocampodev/Work/portfolio-ale-web/joan-portfolio/static/assets/models'
textures_dir = '/home/aleocampodev/Work/portfolio-ale-web/joan-portfolio/static/assets/textures'
output_blend = os.path.join(models_dir, 'unified_room.blend')
output_glb = os.path.join(models_dir, 'unified_room.glb')

def create_image_mat(name, filename, is_unlit=True):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(os.path.join(textures_dir, filename))
    
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 1.0
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if is_unlit:
        links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    
    out = nodes.new('ShaderNodeOutputMaterial')
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

mat_b1 = create_image_mat('Baked1_Arch', 'baked1.png')
mat_b2 = create_image_mat('Baked2_DeskFurniture', 'baked2.png')
mat_b3 = create_image_mat('Baked3_PropsSocial', 'baked3.png')

# 1. Whiteboard Canvas Material
mat_wb_paint = bpy.data.materials.new(name='Whiteboard_Canvas_Paint')
mat_wb_paint.use_nodes = True
wb_nodes = mat_wb_paint.node_tree.nodes
wb_links = mat_wb_paint.node_tree.links
wb_nodes.clear()

wb_tex = wb_nodes.new('ShaderNodeTexImage')
wb_tex.image = bpy.data.images.load(os.path.join(textures_dir, 'texture_paint.png'))

mix_col = wb_nodes.new('ShaderNodeMix')
mix_col.data_type = 'RGBA'
mix_col.clamp_factor = True
mix_col.inputs['A'].default_value = (0.98, 0.98, 0.98, 1.0)
wb_links.new(wb_tex.outputs['Alpha'], mix_col.inputs['Factor'])
wb_links.new(wb_tex.outputs['Color'], mix_col.inputs['B'])

wb_bsdf = wb_nodes.new('ShaderNodeBsdfPrincipled')
wb_bsdf.inputs['Roughness'].default_value = 0.2
wb_links.new(mix_col.outputs['Result'], wb_bsdf.inputs['Base Color'])
wb_links.new(mix_col.outputs['Result'], wb_bsdf.inputs['Emission Color'])
wb_bsdf.inputs['Emission Strength'].default_value = 1.0

wb_out = wb_nodes.new('ShaderNodeOutputMaterial')
wb_links.new(wb_bsdf.outputs['BSDF'], wb_out.inputs['Surface'])

# 2. Procedural Shell-Textured Carpet Material (Replicating Three.js shellTexturing fragment shader!)
# In Three.js: uColor = (0.753, 0.542, 0.439) with procedural dense noise texture representing strands with shadowing
mat_carpet = bpy.data.materials.new(name='Carpet_Procedural_Shell')
mat_carpet.use_nodes = True
cnodes = mat_carpet.node_tree.nodes
clinks = mat_carpet.node_tree.links
cnodes.clear()

coord = cnodes.new('ShaderNodeTexCoord')
noise1 = cnodes.new('ShaderNodeTexNoise')
noise1.inputs['Scale'].default_value = 150.0
noise1.inputs['Detail'].default_value = 8.0
noise1.inputs['Roughness'].default_value = 0.75
clinks.new(coord.outputs['Object'], noise1.inputs['Vector'])

# Voronoi noise for carpet strand fiber points (uDensity 250 in Three.js)
voronoi = cnodes.new('ShaderNodeTexVoronoi')
voronoi.inputs['Scale'].default_value = 250.0
clinks.new(coord.outputs['Object'], voronoi.inputs['Vector'])

# Color ramp to modulate shadow from 0.4 to 1.0 (matching Three.js: shadow = mix(0.4, 1.0, h))
ramp = cnodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.15
ramp.color_ramp.elements[0].color = (0.35, 0.35, 0.35, 1.0) # Shadow at root
ramp.color_ramp.elements[1].position = 0.85
ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0) # Highlight at tip
clinks.new(voronoi.outputs['Distance'], ramp.inputs['Fac'])

# Tint with Terracotta Color (0.7529412, 0.5424671, 0.4392157)
cmix = cnodes.new('ShaderNodeMix')
cmix.data_type = 'RGBA'
cmix.blend_type = 'MULTIPLY'
cmix.inputs['Factor'].default_value = 1.0
cmix.inputs['A'].default_value = (0.7529412, 0.5424671, 0.4392157, 1.0)
clinks.new(ramp.outputs['Color'], cmix.inputs['B'])

cbsdf = cnodes.new('ShaderNodeBsdfPrincipled')
cbsdf.inputs['Roughness'].default_value = 0.95
clinks.new(cmix.outputs['Result'], cbsdf.inputs['Base Color'])
clinks.new(cmix.outputs['Result'], cbsdf.inputs['Emission Color'])
cbsdf.inputs['Emission Strength'].default_value = 0.95

# Subtle bump for tactile 3D carpet feel
bump = cnodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = 0.25
bump.inputs['Distance'].default_value = 0.05
clinks.new(noise1.outputs['Fac'], bump.inputs['Height'])
clinks.new(bump.outputs['Normal'], cbsdf.inputs['Normal'])

cout = cnodes.new('ShaderNodeOutputMaterial')
clinks.new(cbsdf.outputs['BSDF'], cout.inputs['Surface'])

main_col = bpy.data.collections.new('UnifiedRoom')
bpy.context.scene.collection.children.link(main_col)

def import_glb(filename):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(models_dir, filename))
    new_objs = [o for o in bpy.data.objects if o not in before]
    for o in new_objs:
        for col in o.users_collection:
            col.objects.unlink(o)
        main_col.objects.link(o)
    return new_objs

# 1. ROOM 1 -> Baked 1
for o in import_glb('room.glb'):
    if o.type == 'MESH':
        o.data.materials.clear()
        o.data.materials.append(mat_b1)

# 2. ROOM 2 -> Baked 2
for o in import_glb('room2.glb'):
    if o.type == 'MESH':
        o.data.materials.clear()
        o.data.materials.append(mat_b2)

# 3. ROOM 3 -> Baked 3
for o in import_glb('room3.glb'):
    if o.type == 'MESH':
        o.data.materials.clear()
        o.data.materials.append(mat_b3)

# 4. WHITEBOARD FRAME & STAND -> Baked 1
for o in import_glb('whiteboard.glb'):
    if o.type == 'MESH':
        o.data.materials.clear()
        o.data.materials.append(mat_b1)

# 5. WHITEBOARD DRAWING CANVAS (Facing into room towards +X)
mesh_data = bpy.data.meshes.new('Whiteboard_Canvas_Mesh')
wb_obj = bpy.data.objects.new('Whiteboard_Canvas', mesh_data)
main_col.objects.link(wb_obj)

# Clockwise vertices in YZ plane so normal faces directly +X into the room:
verts = [
    (-3.210, 3.31366, 2.27774), # Bottom-Left (UV: 0, 0)
    (-3.210, 5.91366, 2.27774), # Bottom-Right (UV: 1, 0)
    (-3.210, 5.91366, 4.09774), # Top-Right (UV: 1, 1)
    (-3.210, 3.31366, 4.09774), # Top-Left (UV: 0, 1)
]
faces = [(0, 1, 2, 3)]
mesh_data.from_pydata(verts, [], faces)
mesh_data.update()

uv_layer = mesh_data.uv_layers.new(name='UVMap')
uvs = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
for i, loop in enumerate(mesh_data.loops):
    uv_layer.data[loop.index].uv = uvs[i]

mesh_data.materials.append(mat_wb_paint)

# 6. CARPET (ALFOMBRA CON TEXTURA Y FORMA RECTANGULAR/REDONDEADA SEGUN THREE.JS)
# In Three.js: PlaneGeometry(100, 100) scaled to 0.0355 = 3.55m x 3.55m
# Position: (-2.61408, 0.904327, 0.380)
bpy.ops.mesh.primitive_cylinder_add(
    vertices=64,
    radius=1.775,
    depth=0.012,
    location=(-2.61408, 0.904327, 0.380)
)
carpet = bpy.context.active_object
carpet.name = 'Carpet'
carpet.data.materials.append(mat_carpet)
for col in carpet.users_collection:
    col.objects.unlink(carpet)
main_col.objects.link(carpet)

# 7. ARCADE MACHINE -> Baked 2
for o in import_glb('arcadeMachine.glb'):
    if o.type == 'MESH':
        o.data.materials.clear()
        o.data.materials.append(mat_b2)

# 8. SOCIAL ICONS -> Baked 3
for s_file in ['github.glb', 'linkedin.glb', 'itchio.glb']:
    for o in import_glb(s_file):
        if o.type == 'MESH':
            o.data.materials.clear()
            o.data.materials.append(mat_b3)

# 9. TOP CHAIR -> Baked 2
chair_objs = import_glb('topChair.glb')
chair_parent = bpy.data.objects.new('TopChair', None)
chair_parent.location = (1.4027, 1.21048, 0.496728)
chair_parent.rotation_euler = (0, 0, math.radians(-45))
main_col.objects.link(chair_parent)
for o in chair_objs:
    if o.parent is None:
        o.parent = chair_parent
    if o.type == 'MESH':
        o.data.materials.clear()
        o.data.materials.append(mat_b2)

# 10. RUBIKS CUBE
rubik_objs = import_glb('Rubik.glb')
rubik_parent = bpy.data.objects.new('RubiksCube', None)
rubik_parent.location = (-0.67868, 3.92849, 1.499)
rubik_parent.rotation_euler = (0, 0, math.radians(152.484))
rubik_parent.scale = (0.021432, 0.021432, 0.021432)
main_col.objects.link(rubik_parent)
for o in rubik_objs:
    if o.parent is None:
        o.parent = rubik_parent

# 11. MONITORS -> Baked 2
for mon_file in ['leftMonitor.glb', 'rightMonitor.glb']:
    for o in import_glb(mon_file):
        if o.type == 'MESH':
            o.data.materials.clear()
            o.data.materials.append(mat_b2)

# Camera matching isometric view
cam_data = bpy.data.cameras.new('Camera')
cam_obj = bpy.data.objects.new('Camera', cam_data)
cam_obj.location = (8.5, -8.5, 7.0)
cam_obj.rotation_euler = (math.radians(60), 0, math.radians(48))
main_col.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

# Set Material Preview on 3D views
for scr in bpy.data.screens:
    for ar in scr.areas:
        if ar.type == 'VIEW_3D':
            for sp in ar.spaces:
                if sp.type == 'VIEW_3D':
                    sp.shading.type = 'MATERIAL'

bpy.ops.wm.save_as_mainfile(filepath=output_blend)
print('SCENE SAVED SUCCESSFULLY WITH PROCEDURAL SHELL TEXTURE CARPET!')

bpy.ops.export_scene.gltf(filepath=output_glb, export_format='GLB')
print('GLB EXPORTED SUCCESSFULLY!')
