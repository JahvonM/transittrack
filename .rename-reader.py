"""One-off: card reader helper shows the new name and accepts the new web address."""
from pathlib import Path
import re

R = Path('/app')
OLD_SITE = 'https://eager-transit-track-go.base44.app'
NEW_SITE = 'https://app.mcsweenstransport.com'
problems = []

def edit(rel, pairs):
    p = R / rel
    raw = p.read_bytes().decode('utf-8')
    for old, new, want in pairs:
        n = raw.count(old)
        if n != want:
            problems.append(f'{rel}: expected {want} of {old[:70]!r}, found {n}')
            continue
        raw = raw.replace(old, new)
    p.write_bytes(raw.encode('utf-8'))

LNK = "'TransitTrack Card Reader.lnk'"
def names(rel, extra):
    p = R / rel
    raw = p.read_bytes().decode('utf-8')
    raw = raw.replace(LNK, '\0LNK\0')  # keep the existing Startup shortcut name
    pairs = extra + [
        ('TransitTrack Card Reader', 'McSween Card Reader', None),
        ('reader to TransitTrack in your browser', 'reader to McSween Transport in your browser', None),
        ('# TransitTrack (Admin > Card issuing)', '# McSween Transport (Admin > Card issuing)', None),
        ('"TransitTrack page connected"', '"McSween Transport page connected"', None),
        ('passes each card\'s ID to the\n// TransitTrack page', 'passes each card\'s ID to the\n// McSween Transport page', None),
        ('" - open TransitTrack at ' + OLD_SITE + ' instead"', '" - open McSween Transport at ' + NEW_SITE + ' instead"', None),
        ("open " + OLD_SITE + "/admin/cards'", "open " + NEW_SITE + "/admin/cards'", None),
        ('        AllowedOrigins.Add("' + OLD_SITE + '");\n',
         '        AllowedOrigins.Add("' + OLD_SITE + '");\n        AllowedOrigins.Add("' + NEW_SITE + '");\n', None),
    ]
    for old, new, want in pairs:
        for variant in (old, old.replace('\n', '\r\n')):
            raw = raw.replace(variant, new if variant == old else new.replace('\n', '\r\n'))
    raw = raw.replace('\0LNK\0', LNK)
    p.write_bytes(raw.encode('utf-8'))

names('tools/card-reader/TTCardReader.cs', [])
names('tools/card-reader/build.py', [])
names('desktop/reader.ps1', [])
print('\n'.join(problems) or 'done')
