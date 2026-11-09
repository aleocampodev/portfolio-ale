import bpy
import bmesh

blend_path = '/home/aleocampodev/Work/portfolio-ale-web/joan-portfolio-worktree/static/assets/models/unified_room.blend'
bpy.ops.wm.open_mainfile(filepath=blend_path)

# 1. Eliminar el objeto RightMonitor si existe
rm = bpy.data.objects.get('RightMonitor')
if rm:
    bpy.data.objects.remove(rm, do_unlink=True)
    print('Objeto RightMonitor eliminado de la escena.')

# 2. Eliminar la geometría del monitor derecho dentro de BAKED_2
b2 = bpy.data.objects.get('BAKED_2')
if b2:
    bm = bmesh.new()
    bm.from_mesh(b2.data)
    # Buscar islas conexas
    faces_left = set(bm.faces)
    islands = []
    while faces_left:
        f = faces_left.pop()
        island = [f]
        queue = [f]
        while queue:
            curr = queue.pop(0)
            for edge in curr.edges:
                for linked in edge.link_faces:
                    if linked in faces_left:
                        faces_left.remove(linked)
                        island.append(linked)
                        queue.append(linked)
        islands.append(island)
    
    # Eliminar islas que correspondan al monitor derecho (x > 0.4 y z > 1.0)
    faces_to_delete = []
    for isl in islands:
        xs = [v.co.x for f in isl for v in f.verts]
        ys = [v.co.y for f in isl for v in f.verts]
        zs = [v.co.z for f in isl for v in f.verts]
        min_x, max_x = min(xs), max(xs)
        min_z = min(zs)
        # Isla 2 (pantalla derecha: x: 0.44..1.44, z > 1.2)
        # Isla 3 (soporte monitor derecho: x: 0.77..1.03, z > 1.1)
        # Isla 5 (brazo articulado derecho: x: 0.49..1.27, z > 1.0)
        if min_x > 0.4 and min_z > 1.0:
            print(f'Eliminando sub-malla de monitor derecho ({len(isl)} caras, x: {min_x:.2f}..{max_x:.2f})')
            faces_to_delete.extend(isl)
            
    bmesh.ops.delete(bm, geom=faces_to_delete, context='FACES')
    bm.to_mesh(b2.data)
    bm.free()
    b2.data.update()
    print('Malla BAKED_2 actualizada sin el monitor derecho.')

bpy.ops.wm.save_mainfile()
print('unified_room.blend guardado con éxito.')
