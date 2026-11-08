import bpy

# Rutas
src_blend = '/home/aleocampodev/Work/joan-portfolio.blend'
dst_blend = '/home/aleocampodev/Work/portfolio-ale-web/joan-portfolio-worktree/static/assets/models/unified_room.blend'

# 1. Abrir destino
bpy.ops.wm.open_mainfile(filepath=dst_blend)

# 2. Cargar materiales Material.Pared y Material_Piso desde src_blend
with bpy.data.libraries.load(src_blend) as (data_from, data_to):
    for m in ['Material.Pared', 'Material_Piso']:
        if m in data_from.materials:
            data_to.materials.append(m)

mat_pared = bpy.data.materials.get('Material.Pared')
mat_piso = bpy.data.materials.get('Material_Piso')

print('Material.Pared cargado:', mat_pared is not None)
print('Material_Piso cargado:', mat_piso is not None)

# Asignar a Floor
floor_obj = bpy.data.objects.get('Floor')
if floor_obj and mat_piso:
    floor_obj.data.materials.clear()
    floor_obj.data.materials.append(mat_piso)
    print('Asignado Material_Piso a Floor con color:', list(mat_piso.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value))

# Asignar a BAKED_1 (la pared)
b1 = bpy.data.objects.get('BAKED_1')
if b1 and mat_pared:
    b1.data.materials.clear()
    b1.data.materials.append(mat_pared)
    print('Asignado Material.Pared a BAKED_1 con color:', list(mat_pared.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value))

# Guardar
bpy.ops.wm.save_mainfile()
print('Guardado unified_room.blend con los materiales y colores de joan-portfolio.blend')
