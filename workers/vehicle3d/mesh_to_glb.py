"""Blender background script: import a textured OBJ and export one GLB."""
import pathlib
import sys
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
if len(args) != 2:
    raise SystemExit("Usage: blender -b --python mesh_to_glb.py -- input.obj output.glb")
source, target = map(pathlib.Path, args)
if not source.is_file():
    raise SystemExit("OBJ does not exist")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
# Blender 4.x uses wm.obj_import (not the removed import_scene.obj).
bpy.ops.wm.obj_import(filepath=str(source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes:
    raise SystemExit("No mesh objects imported")
bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", use_selection=False)
if not target.is_file():
    raise SystemExit("GLB export did not create an output file")
