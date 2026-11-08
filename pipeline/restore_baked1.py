import bpy

src_blend = '/home/aleocampodev/Work/joan-portfolio.blend'
dst_blend = '/home/aleocampodev/Work/portfolio-ale-web/joan-portfolio-worktree/static/assets/models/unified_room.blend'

bpy.ops.wm.open_mainfile(filepath=dst_blend)

# Reemplazar BAKED_1 con el BAKED_1 original completo de joan-portfolio.blend
if 'BAKED_1' in bpy.data.objects:
    bpy.data.objects.remove(bpy.data.objects['BAKED_1'], do_unlink=True)
if 'Floor' in bpy.data.objects:
    bpy.data.objects.remove(bpy.data.objects['Floor'], do_unlink=True)

with bpy.data.libraries.load(src_blend) as (data_from, data_to):
    if 'BAKED_1' in data_from.objects:
        data_to.objects.append('BAKED_1')

for obj in data_to.objects:
    if obj.name == 'BAKED_1':
        bpy.context.collection.objects.link(obj)
        print('BAKED_1 restaurado con sus slots originales:', [m.name for m in obj.data.materials if m])

bpy.ops.wm.save_mainfile()
print('unified_room.blend restaurado correctamente.')
