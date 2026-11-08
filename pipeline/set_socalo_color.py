import bpy

blend_path = '/home/aleocampodev/Work/portfolio-ale-web/joan-portfolio-worktree/static/assets/models/unified_room.blend'
bpy.ops.wm.open_mainfile(filepath=blend_path)

mat = bpy.data.materials.get('Material_socalo')
if mat:
    # Asignar un tono oscuro / madera / zocalo definido (ej. marrón oscuro o gris grafito oscuro)
    # para que no quede blanco plano
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        # Tono oscuro elegante (café madera oscuro / zócalo wengué)
        # [0.18, 0.12, 0.09, 1.0]
        bsdf.inputs['Base Color'].default_value = (0.18, 0.12, 0.09, 1.0)
        print('Color de Material_socalo actualizado a madera oscura/wengué.')

bpy.ops.wm.save_mainfile()
print('Guardado.')
