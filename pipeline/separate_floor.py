import bpy
import bmesh

blend_path = '/home/aleocampodev/Work/portfolio-ale-web/joan-portfolio-worktree/static/assets/models/unified_room.blend'
bpy.ops.wm.open_mainfile(filepath=blend_path)

b1 = bpy.data.objects.get('BAKED_1')
if not b1:
    print('BAKED_1 not found!')
    exit(1)

# Ensure edit mode with bmesh to cleanly separate the floor polygon
bpy.context.view_layer.objects.active = b1
bpy.ops.object.mode_set(mode='OBJECT')

# Find existing Floor object if any, or separate poly 0 from BAKED_1
existing_floor = bpy.data.objects.get('Floor')
if not existing_floor:
    # Deselect all polygons
    for p in b1.data.polygons:
        p.select = False
    
    # Select floor polygon(s)
    floor_found = False
    for p in b1.data.polygons:
        zs = [(b1.matrix_world @ b1.data.vertices[v].co).z for v in p.vertices]
        if p.normal.z > 0.8 and max(zs) < 0.2 and min(zs) > -0.2:
            p.select = True
            floor_found = True
            print(f'Selected floor polygon {p.index}')
            break
    
    if floor_found:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        
        # The separated object will be in bpy.context.selected_objects
        for obj in bpy.context.selected_objects:
            if obj != b1:
                obj.name = 'Floor'
                existing_floor = obj
                print('Separated floor object created:', obj.name)
                break

if existing_floor:
    # Assign Material_Piso
    mat_piso = bpy.data.materials.get('Material_Piso')
    if not mat_piso:
        mat_piso = bpy.data.materials.new(name='Material_Piso')
        mat_piso.use_nodes = True
    
    # Assign to floor
    existing_floor.data.materials.clear()
    existing_floor.data.materials.append(mat_piso)
    print('Assigned Material_Piso to Floor')

# Save file
bpy.ops.wm.save_mainfile()
print('Successfully saved unified_room.blend with separated Floor object.')
