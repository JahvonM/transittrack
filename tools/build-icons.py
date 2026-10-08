"""Regenerate TransitTrack platform icons from the approved Hiace artwork.
Requires Pillow: python3 -m pip install Pillow
Run from repository root: python3 tools/build-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw
import base64, json
root=Path(__file__).resolve().parents[1]
im=Image.open(root/'assets/brand/hiace-master.webp').convert('RGB')
brand=root/'public/brand';brand.mkdir(parents=True,exist_ok=True)
sizes=[16,20,24,29,32,40,48,57,58,60,64,72,76,80,87,96,114,120,128,144,152,167,180,192,196,216,256,384,432,512,1024]
def resize(n):return im.resize((n,n),Image.Resampling.LANCZOS)
def padded(n,fraction=.68,alpha=False):
 canvas=Image.new('RGBA' if alpha else 'RGB',(n,n),(13,21,32,0) if alpha else '#0D1520')
 k=round(n*fraction);canvas.paste(resize(k),((n-k)//2,(n-k)//2));return canvas
for n in sizes:resize(n).save(brand/f'icon-{n}.png',optimize=True)
resize(32).save(brand/'favicon-32.png');resize(16).save(brand/'favicon-16.png')
resize(180).save(brand/'apple-touch-icon.png')
for n in [192,512]:padded(n).save(brand/f'maskable-{n}.png')
resize(512).save(root/'public/app-icon-512.png');resize(1024).save(root/'public/app-icon-1024.png')
rgba=resize(256).convert('RGBA');mask=Image.new('L',(256,256));ImageDraw.Draw(mask).rounded_rectangle((0,0,255,255),radius=57,fill=255);rgba.putalpha(mask)
rgba.save(brand/'favicon.ico',sizes=[(n,n) for n in [16,24,32,48,64,128,256]])
desktop=root/'desktop/assets';desktop.mkdir(parents=True,exist_ok=True)
rgba.save(desktop/'icon.ico',sizes=[(n,n) for n in [16,24,32,48,64,128,256]])
resize(1024).save(desktop/'icon.png')
# Compatibility asset for older cached pages; current pages use native PNGs.
data=base64.b64encode((root/'assets/brand/hiace-master.webp').read_bytes()).decode()
(brand/'icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/webp;base64,'+data+'"/></svg>')
for target in ['android/app/src/main/res','kiosk-helper/res']:
 res=root/target
 if not res.exists():continue
 for density,n,layer in [('ldpi',36,81),('mdpi',48,108),('hdpi',72,162),('xhdpi',96,216),('xxhdpi',144,324),('xxxhdpi',192,432)]:
  p=res/f'mipmap-{density}';p.mkdir(exist_ok=True)
  resize(n).save(p/'ic_launcher.png')
  circle=padded(n);alpha=Image.new('L',(n,n));ImageDraw.Draw(alpha).ellipse((0,0,n-1,n-1),fill=255);circle=circle.convert('RGBA');circle.putalpha(alpha);circle.save(p/'ic_launcher_round.png')
  padded(layer,.60,True).save(p/'ic_launcher_foreground.png')
  Image.new('RGB',(layer,layer),'#0D1520').save(p/'ic_launcher_background.png')
 p=res/'mipmap-anydpi-v26';p.mkdir(exist_ok=True)
 xml='<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@mipmap/ic_launcher_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>\n'
 for name in ['ic_launcher.xml','ic_launcher_round.xml']:(p/name).write_text(xml)
appicon=root/'ios/App/App/Assets.xcassets/AppIcon.appiconset'
if appicon.exists():
 resize(1024).save(appicon/'AppIcon-512@2x.png')
# Sharing card has a real wide canvas; it is not used as a launcher icon.
share=Image.new('RGB',(1200,630),'#0D1520');share.paste(resize(570),(315,30));share.save(brand/'share-1200x630.png')
(brand/'icon-sizes.json').write_text(json.dumps({'design':'TransitTrack Hiace navy/lime','png_sizes':sizes,'windows_ico_sizes':[16,24,32,48,64,128,256],'maskable':[192,512],'apple_touch':180,'ios_store':1024,'android_density_sizes':[36,48,72,96,144,192]},indent=2)+'\n')
print('Generated web, Windows and available native platform icons.')
