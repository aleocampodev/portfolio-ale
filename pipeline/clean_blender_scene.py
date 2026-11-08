import bpy

blend_path = '/home/aleocampodev/Work/portfolio-ale-web/joan-portfolio/unified_room.blend'
bpy.ops.wm.open_mainfile(filepath=blend_path)

# 1. Eliminar Carpet_Rug si existe
carpet = bpy.data.objects.get('Carpet_Rug')
if carpet:
    bpy.data.objects.remove(carpet, do_unlink=True)
    print('Carpet_Rug eliminado.')

# 2. Eliminar RightMonitor si existe
rm = bpy.data.objects.get('RightMonitor')
if rm:
    bpy.data.objects.remove(rm, do_unlink=True)
    print('RightMonitor eliminado.')

# 3. Guardar cambios
bpy.ops.wm.save_mainfile()
print('unified_room.blend guardado con éxito.')
