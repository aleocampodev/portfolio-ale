import bpy

src_blend = '/home/aleocampodev/Work/joan-portfolio.blend'
dst_blend = '/home/aleocampodev/Work/portfolio-ale-web/joan-portfolio-worktree/static/assets/models/unified_room.blend'

# 1. Abrir src_blend para tener la escena fiel y completa
bpy.ops.wm.open_mainfile(filepath=src_blend)

# 2. Asegurarse de que no haya Arcade
arcade_objs = [o for o in bpy.data.objects if 'arcade' in o.name.lower()]
for o in arcade_objs:
    bpy.data.objects.remove(o, do_unlink=True)

# 3. Verificar objetos clave
print('Objetos en escena recuperada:')
for o in bpy.data.objects:
    print(' -', o.name)

# 4. Guardar exactamente en dst_blend
bpy.ops.wm.save_as_mainfile(filepath=dst_blend)
print('unified_room.blend restablecido exactamente desde joan-portfolio.blend!')
