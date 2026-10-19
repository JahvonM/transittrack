"""Regenerate McSween Transport icons from the approved emblem.

The emblem (assets/brand/mcsween-emblem.png) is the McSween's Transport bus
artwork with a see-through background. Every icon puts it on white, the way
the owner approved it on 19 Oct 2026.

Requires Pillow: python3 -m pip install Pillow
Run from repository root: python3 tools/build-icons.py
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw
import base64, io, json

root = Path(__file__).resolve().parents[1]
emblem = Image.open(root / 'assets/brand/mcsween-emblem.png').convert('RGBA')
WHITE = (255, 255, 255)
SPLASH_BG = (15, 23, 42)  # the dark start-up screen colour the native apps already use

brand = root / 'public/brand'
brand.mkdir(parents=True, exist_ok=True)
sizes = [16, 20, 24, 29, 32, 40, 48, 57, 58, 60, 64, 72, 76, 80, 87, 96, 114, 120, 128,
         144, 152, 167, 180, 192, 196, 216, 256, 384, 432, 512, 1024]


def emblem_at(height):
    width = max(1, round(height * emblem.width / emblem.height))
    return emblem.resize((width, height), Image.Resampling.LANCZOS)


def on_canvas(n, fraction, background=WHITE):
    """The emblem centred on an n x n square, fraction = emblem height / n.

    background=None keeps the square see-through (Android adaptive layers)."""
    canvas = Image.new('RGBA', (n, n), (255, 255, 255, 0) if background is None else background + (255,))
    art = emblem_at(max(1, round(n * fraction)))
    canvas.alpha_composite(art, ((n - art.width) // 2, (n - art.height) // 2))
    return canvas


def icon(n):
    # Small icons get a bigger emblem so the bus still reads at 16-48 px.
    return on_canvas(n, .92 if n <= 48 else .80).convert('RGB')


def rounded(img, radius_fraction=.225):
    img = img.convert('RGBA')
    n = img.width
    mask = Image.new('L', img.size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, n - 1, n - 1), radius=round(n * radius_fraction), fill=255)
    img.putalpha(mask)
    return img


# Master copy for designers and app stores.
icon(1024).save(root / 'assets/brand/mcsween-master.png', optimize=True)

for n in sizes:
    icon(n).save(brand / f'icon-{n}.png', optimize=True)
icon(32).save(brand / 'favicon-32.png')
icon(16).save(brand / 'favicon-16.png')
icon(180).save(brand / 'apple-touch-icon.png')
for n in [192, 512]:
    # Maskable icons get cropped to a circle or squircle, so keep the emblem inside the safe zone.
    on_canvas(n, .60).convert('RGB').save(brand / f'maskable-{n}.png', optimize=True)
icon(512).save(root / 'public/app-icon-512.png', optimize=True)
icon(1024).save(root / 'public/app-icon-1024.png', optimize=True)

ico_sizes = [16, 24, 32, 48, 64, 128, 256]
ico = rounded(icon(256))
ico.save(brand / 'favicon.ico', sizes=[(n, n) for n in ico_sizes])

desktop = root / 'desktop/assets'
desktop.mkdir(parents=True, exist_ok=True)
ico.save(desktop / 'icon.ico', sizes=[(n, n) for n in ico_sizes])
icon(1024).save(desktop / 'icon.png', optimize=True)

# Compatibility asset for older cached pages; current pages use the PNGs.
buf = io.BytesIO()
icon(512).save(buf, 'WEBP', quality=85)
data = base64.b64encode(buf.getvalue()).decode()
(brand / 'icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
                                '<image width="512" height="512" href="data:image/webp;base64,' + data + '"/></svg>')

# Android launcher icons (main app and the kiosk helper).
for target in ['android/app/src/main/res', 'kiosk-helper/res']:
    res = root / target
    if not res.exists():
        continue
    for density, n, layer in [('ldpi', 36, 81), ('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216),
                              ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]:
        p = res / f'mipmap-{density}'
        p.mkdir(exist_ok=True)
        icon(n).save(p / 'ic_launcher.png')
        circle = on_canvas(n, .74)
        alpha = Image.new('L', (n, n))
        ImageDraw.Draw(alpha).ellipse((0, 0, n - 1, n - 1), fill=255)
        circle.putalpha(ImageChops.multiply(circle.getchannel('A'), alpha))
        circle.save(p / 'ic_launcher_round.png')
        # Adaptive icon: Android shows the middle 66 of 108 units, so the emblem stays well inside.
        on_canvas(layer, .58, background=None).save(p / 'ic_launcher_foreground.png')
        Image.new('RGB', (layer, layer), WHITE).save(p / 'ic_launcher_background.png')
    p = res / 'mipmap-anydpi-v26'
    p.mkdir(exist_ok=True)
    xml = ('<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">'
           '<background android:drawable="@mipmap/ic_launcher_background"/>'
           '<foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>\n')
    for name in ['ic_launcher.xml', 'ic_launcher_round.xml']:
        (p / name).write_text(xml)


def splash(path, fraction):
    """Dark start-up screen with the white app icon in the middle."""
    with Image.open(path) as old:
        w, h = old.size
    canvas = Image.new('RGBA', (w, h), SPLASH_BG + (255,))
    n = max(16, round(min(w, h) * fraction))
    tile = rounded(icon(n))
    canvas.alpha_composite(tile, ((w - n) // 2, (h - n) // 2))
    canvas.convert('RGB').save(path, optimize=True)


android_res = root / 'android/app/src/main/res'
if android_res.exists():
    for path in sorted(android_res.glob('drawable*/splash.png')):
        w, h = Image.open(path).size
        splash(path, .22 if h > w else .34)

appicon = root / 'ios/App/App/Assets.xcassets/AppIcon.appiconset'
if appicon.exists():
    icon(1024).save(appicon / 'AppIcon-512@2x.png')  # App Store icons must not be see-through
ios_splash = root / 'ios/App/App/Assets.xcassets/Splash.imageset'
if ios_splash.exists():
    for path in sorted(ios_splash.glob('Default@*.png')):
        splash(path, .12)

# Link-preview card (WhatsApp, Facebook, etc.). Not a launcher icon.
share = Image.new('RGBA', (1200, 630), WHITE + (255,))
art = emblem_at(560)
share.alpha_composite(art, ((1200 - art.width) // 2, 35))
share.convert('RGB').save(brand / 'share-1200x630.png', optimize=True)

(brand / 'icon-sizes.json').write_text(json.dumps({
    'design': 'McSween Transport emblem on white',
    'source': 'assets/brand/mcsween-emblem.png',
    'png_sizes': sizes,
    'windows_ico_sizes': ico_sizes,
    'maskable': [192, 512],
    'apple_touch': 180,
    'ios_store': 1024,
    'android_density_sizes': [36, 48, 72, 96, 144, 192],
}, indent=2) + '\n')
print('Generated web, Windows, Android, iOS and splash icons.')
