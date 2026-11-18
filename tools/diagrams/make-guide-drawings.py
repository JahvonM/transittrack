import os
# Writes the guide drawings for part pictures (src/assets/diagrams).
# Our own line drawings: generic, not drawn from Toyota or Nissan diagrams.
# Run from the repository root: python3 tools/diagrams/make-guide-drawings.py
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "assets", "diagrams")
NOTE = "Guide drawing: not to scale, not from Toyota or Nissan diagrams"
STYLE = """<style>
.b{fill:#e2e8f0;stroke:#1e293b;stroke-width:3;stroke-linejoin:round}
.m{fill:#cbd5e1;stroke:#1e293b;stroke-width:3;stroke-linejoin:round}
.d{fill:#94a3b8;stroke:#1e293b;stroke-width:3;stroke-linejoin:round}
.k{fill:#475569;stroke:#1e293b;stroke-width:2}
.a{fill:#67e8f9;stroke:#0e7490;stroke-width:3;stroke-linejoin:round}
.ln{fill:none;stroke:#1e293b;stroke-linecap:round;stroke-linejoin:round}
.ld{fill:none;stroke:#64748b;stroke-width:2}
.t{font:700 30px system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;fill:#0f172a}
.s{font:500 17px system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;fill:#475569}
.l{font:600 22px system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;fill:#0f172a}
</style>"""

def label(x1, y1, x2, y2, tx, ty, text, anchor="start"):
    return (f'<path class="ld" d="M{x1} {y1} L{x2} {y2}"/><circle cx="{x1}" cy="{y1}" r="5" fill="#0f172a"/>'
            f'<text class="l" x="{tx}" y="{ty}" text-anchor="{anchor}">{text}</text>')

def svg(key, title, desc, body, note=NOTE, extra_note=None):
    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 640" role="img" aria-labelledby="t d">',
             f'<title id="t">{title}: guide drawing</title>', f'<desc id="d">{desc}</desc>', STYLE,
             '<rect width="800" height="640" fill="#f8fafc"/>',
             f'<text class="t" x="24" y="44">{title}</text>', f'<text class="s" x="24" y="72">{note}</text>']
    if extra_note:
        lines.append(f'<text class="s" x="24" y="96">{extra_note}</text>')
    lines.append(body)
    lines.append('</svg>')
    with open(os.path.join(OUT, f"{key}.svg"), "w") as f:
        f.write("\n".join(lines) + "\n")

# 1. Front disc brake
studs = "".join(f'<circle class="k" cx="{x}" cy="{y}" r="10"/>' for x, y in [(300,318),(349.5,353.9),(330.6,412.1),(269.4,412.1),(250.5,353.9)])
svg("front-brakes", "Front disc brake", "Brake disc on the hub with the caliper over its edge; the pads sit inside the caliper; brake hose and bleed nipple on top.",
    f'''<circle class="b" cx="300" cy="370" r="190"/>
<circle cx="300" cy="370" r="150" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 8"/>
<circle class="m" cx="300" cy="370" r="85"/>{studs}<circle cx="300" cy="370" r="22" fill="#f8fafc" stroke="#1e293b" stroke-width="3"/>
<rect class="d" x="425" y="255" width="110" height="230" rx="28"/>
<rect class="a" x="470" y="290" width="22" height="160" rx="6"/>
<circle class="k" cx="535" cy="285" r="9"/><circle class="k" cx="535" cy="455" r="9"/>
<circle class="k" cx="508" cy="268" r="9"/>
<path class="ln" stroke-width="9" d="M500 256 C 512 196, 552 156, 612 140"/><circle class="k" cx="617" cy="139" r="10"/>
{label(481,370,600,370,608,377,"Brake pads")}
<text class="s" x="608" y="400">(inside the caliper)</text>
{label(535,455,600,478,608,485,"Caliper &amp; bolts")}
{label(508,268,600,240,608,247,"Bleed nipple")}
<text class="l" x="640" y="147">Brake hose</text>
{label(170,250,110,170,24,162,"Brake disc")}
{label(270,412,160,585,24,608,"Hub &amp; wheel studs")}''')

# 2. Rear drum brake
spr_top = "262,250 279,238 296,262 313,238 330,262 347,238 364,262 381,238 398,250"
spr_bot = "262,480 279,468 296,492 313,468 330,492 347,468 364,492 381,468 398,480"
hstuds = "".join(f'<circle class="k" cx="{330+38*c:.1f}" cy="{370+38*s:.1f}" r="7"/>' for c, s in [(0,-1),(0.951,-0.309),(0.588,0.809),(-0.588,0.809),(-0.951,-0.309)])
svg("rear-brakes", "Rear drum brake", "Backing plate with the drum taken off: two brake shoes with linings, the wheel cylinder at the top, return springs, the adjuster at the bottom and the handbrake cable.",
    f'''<circle class="b" cx="330" cy="370" r="200"/>
<path class="a" d="M245 222.8 A170 170 0 0 0 245 517.2 L257 496.4 A146 146 0 0 1 257 243.6 Z"/>
<path class="a" d="M415 222.8 A170 170 0 0 1 415 517.2 L403 496.4 A146 146 0 0 0 403 243.6 Z"/>
<rect class="d" x="290" y="188" width="80" height="28" rx="8"/>
<polyline points="{spr_top}" fill="none" stroke="#475569" stroke-width="4" stroke-linejoin="round"/>
<polyline points="{spr_bot}" fill="none" stroke="#475569" stroke-width="4" stroke-linejoin="round"/>
<rect class="d" x="280" y="505" width="100" height="20" rx="6"/><circle class="k" cx="330" cy="515" r="14"/>
<circle class="m" cx="330" cy="370" r="60"/>{hstuds}
<path class="ln" stroke="#475569" stroke-width="7" d="M396 262 L382 458"/>
<path class="ln" stroke-width="6" d="M382 458 C 430 520, 520 556, 640 566"/>
{label(370,202,600,172,608,179,"Wheel cylinder")}
{label(495,370,600,330,608,337,"Brake shoes")}
<text class="s" x="608" y="360">(linings in blue)</text>
{label(380,515,600,500,608,507,"Adjuster")}
<text class="l" x="560" y="604">Handbrake cable</text>
{label(279,238,140,175,24,168,"Return springs")}
{label(150,455,90,560,24,584,"Backing plate")}''',
    extra_note="Drum taken off to show the shoes")

# 3. Engine oil and oil filter
svg("oil-filter", "Engine oil &amp; oil filter", "Side of an engine: oil filler cap on top, dipstick, the oil filter on the side of the block, the sump underneath with its drain plug.",
    f'''<rect class="d" x="200" y="150" width="320" height="60" rx="14"/>
<rect class="k" x="300" y="128" width="50" height="26" rx="6"/>
<rect class="m" x="180" y="200" width="360" height="230" rx="12"/>
<path class="d" d="M200 430 L520 430 L500 500 L220 500 Z"/>
<circle class="k" cx="360" cy="505" r="12"/>
<path class="ln" stroke="#475569" stroke-width="6" d="M442 118 L452 300"/>
<circle cx="440" cy="105" r="13" fill="none" stroke="#f59e0b" stroke-width="6"/>
<rect class="a" x="100" y="300" width="80" height="110" rx="14"/>
<path class="ln" stroke="#0e7490" stroke-width="3" d="M100 330 H180 M100 355 H180 M100 380 H180"/>
{label(350,140,600,120,608,127,"Oil filler cap")}
{label(450,110,600,182,608,189,"Dipstick")}
{label(470,330,600,320,608,327,"Engine block")}
{label(512,470,600,450,608,457,"Sump (oil pan)")}
{label(372,505,545,545,552,552,"Drain plug &amp; washer")}
{label(110,320,70,250,24,240,"Oil filter")}''')

# 4. Diesel fuel filter
inj = "".join(f'<rect class="k" x="{x}" y="230" width="20" height="60" rx="5"/>' for x in (500, 560, 620, 680))
svg("fuel-filter", "Diesel fuel filter", "Diesel fuel system: tank, the fuel filter and water separator with its priming pump and water drain, the high-pressure pump, the common rail and the injectors.",
    f'''<rect class="m" x="30" y="430" width="170" height="110" rx="16"/>
<path class="ln" stroke-width="6" d="M200 480 C 240 480, 250 290, 285 290"/>
<rect class="d" x="280" y="270" width="110" height="36" rx="8"/>
<circle class="k" cx="335" cy="255" r="18"/>
<rect class="a" x="290" y="306" width="90" height="164" rx="16"/>
<rect class="k" x="325" y="470" width="20" height="24" rx="4"/>
<path class="ln" stroke="#475569" stroke-width="3" d="M345 494 C 352 506, 360 512, 372 518"/>
<path class="ln" stroke-width="6" d="M390 288 C 440 288, 450 400, 500 400"/>
<rect class="d" x="500" y="370" width="90" height="70" rx="12"/>
<path class="ln" stroke-width="6" d="M545 370 L545 230"/>
<rect class="m" x="470" y="200" width="280" height="30" rx="15"/>{inj}
<text class="l" x="470" y="186">Common rail</text>
{label(690,290,700,320,660,350,"Injectors")}
{label(545,440,555,480,560,500,"High-pressure pump")}
{label(380,440,430,575,420,600,"Fuel filter + water separator")}
{label(335,237,250,170,110,160,"Priming pump")}
{label(115,430,115,385,40,375,"Fuel tank")}
{label(335,494,250,585,24,612,"Water drain &amp; sensor")}''')

# 5. Air filter
pleats = " ".join(f"{x},{180 if i % 2 == 0 else 226}" for i, x in enumerate(range(196, 448, 12)))
svg("air-filter", "Air filter", "Air box opened: the lid lifted, the filter element taken out, the clips, the air intake on one side and the hose to the engine on the other.",
    f'''<rect class="d" x="170" y="118" width="300" height="46" rx="14"/>
<rect class="a" x="190" y="178" width="260" height="50" rx="8"/>
<polyline points="{pleats}" fill="none" stroke="#0e7490" stroke-width="2"/>
<rect class="m" x="170" y="245" width="300" height="180" rx="18"/>
<rect class="k" x="180" y="238" width="20" height="18" rx="3"/><rect class="k" x="440" y="238" width="20" height="18" rx="3"/>
<rect class="b" x="40" y="305" width="135" height="50" rx="10"/>
<path class="ln" stroke="#94a3b8" stroke-width="40" d="M470 335 C 540 335, 560 420, 640 420"/>
<rect class="b" x="640" y="380" width="130" height="80" rx="12"/>
<text class="s" x="705" y="427" text-anchor="middle">Engine</text>
{label(470,141,560,130,568,137,"Air box lid")}
{label(450,203,560,200,568,207,"Filter element")}
{label(452,247,560,265,568,272,"Clips")}
{label(320,425,320,495,250,522,"Air box")}
{label(70,355,70,440,24,466,"Air intake")}
<text class="l" x="560" y="510">Hose to the engine</text>''')

# 6. Front suspension
svg("front-suspension", "Front suspension", "Front suspension seen from the front: upper and lower arms from the frame to the wheel hub, ball joints, bushes, the shock absorber, the tie-rod end and the anti-roll bar link.",
    f'''<rect class="b" x="60" y="150" width="60" height="330" rx="8"/>
<rect class="k" x="450" y="170" width="100" height="330" rx="40"/>
<rect class="d" x="405" y="250" width="45" height="170" rx="10"/>
<polygon class="m" points="130,225 130,255 405,275 405,255"/>
<polygon class="m" points="120,420 120,450 405,410 405,390"/>
<path class="ln" stroke="#94a3b8" stroke-width="26" d="M320 405 L270 160"/>
<path class="ln" stroke="#475569" stroke-width="8" d="M285 230 L270 160"/>
<path class="ln" stroke="#475569" stroke-width="8" d="M405 330 L170 340"/>
<path class="ln" stroke="#475569" stroke-width="6" d="M240 430 L240 525"/>
<path class="ln" stroke="#475569" stroke-width="10" d="M240 525 L70 525"/>
<circle class="a" cx="405" cy="265" r="12"/><circle class="a" cx="405" cy="400" r="12"/><circle class="a" cx="405" cy="330" r="10"/>
<circle class="k" cx="130" cy="240" r="14"/><circle class="k" cx="120" cy="435" r="14"/>
{label(417,262,575,200,582,207,"Upper ball joint")}
{label(415,330,575,300,582,307,"Tie-rod end")}
{label(417,402,575,400,582,407,"Lower ball joint")}
{label(275,180,330,115,300,108,"Shock absorber")}
{label(120,450,170,560,130,588,"Arm bushes")}
{label(240,480,330,565,320,588,"Anti-roll bar link")}''')

# 7. Cooling
fins = "".join(f'<path d="M{x} 202 V438" stroke="#94a3b8" stroke-width="2"/>' for x in range(100, 296, 14))
svg("cooling", "Cooling system", "Radiator with its cap, the fan, upper and lower hoses to the engine, the thermostat housing, the water pump and the coolant reservoir.",
    f'''<rect class="m" x="80" y="170" width="230" height="300" rx="10"/>{fins}
<rect class="d" x="80" y="170" width="230" height="30" rx="8"/><rect class="d" x="80" y="440" width="230" height="30" rx="8"/>
<rect class="k" x="250" y="148" width="40" height="24" rx="6"/>
<ellipse class="d" cx="365" cy="320" rx="14" ry="110"/>
<rect class="b" x="430" y="200" width="300" height="230" rx="14"/>
<circle class="d" cx="450" cy="380" r="26"/>
<rect class="a" x="440" y="180" width="50" height="36" rx="8"/>
<path class="ln" stroke-width="16" d="M310 190 C 360 160, 410 170, 445 196"/>
<path class="ln" stroke-width="16" d="M310 450 C 380 470, 420 430, 450 405"/>
<rect class="b" x="130" y="500" width="110" height="80" rx="14"/>
<path class="ln" stroke="#94a3b8" stroke-width="2" d="M140 525 H230 M140 555 H230"/>
<text class="s" x="185" y="520" text-anchor="middle">MAX</text><text class="s" x="185" y="574" text-anchor="middle">MIN</text>
<path class="ln" stroke="#475569" stroke-width="4" d="M240 520 C 280 500, 290 200, 275 172"/>
{label(100,178,60,150,24,140,"Radiator")}
{label(270,148,230,112,130,104,"Radiator cap")}
{label(380,168,420,128,400,120,"Upper hose")}
{label(490,198,555,160,560,153,"Thermostat housing")}
{label(470,395,560,500,568,507,"Water pump")}
{label(365,430,350,598,330,622,"Fan")}
{label(400,445,470,598,420,622,"Lower hose")}
{label(130,560,100,588,24,612,"Coolant reservoir")}''')

# 8. Drive belt
belt = ("M400,540 C 360,540 335,520 333,490 L 245,455 C 215,470 160,460 151,420 C 145,385 165,365 190,372 "
        "L 197,232 C 190,200 210,158 245,156 C 270,156 290,180 286,205 L 360,215 C 380,205 420,205 440,215 "
        "L 525,205 C 545,185 590,190 600,225 C 605,255 585,272 560,270 L 495,322 C 497,345 480,357 465,355 "
        "L 468,455 C 478,500 445,540 400,540 Z")
svg("drive-belt", "Drive belt", "Pulleys at the front of an engine with one belt around them: crankshaft pulley, air-conditioning compressor, power steering pump, water pump, alternator and the belt tensioner.",
    f'''<circle class="m" cx="400" cy="470" r="70"/><circle class="k" cx="400" cy="470" r="14"/>
<circle class="m" cx="200" cy="420" r="50"/><circle class="k" cx="200" cy="420" r="10"/>
<circle class="m" cx="240" cy="200" r="45"/><circle class="k" cx="240" cy="200" r="10"/>
<circle class="m" cx="400" cy="250" r="42"/><circle class="k" cx="400" cy="250" r="10"/>
<circle class="m" cx="560" cy="230" r="40"/><circle class="k" cx="560" cy="230" r="9"/>
<path class="ln" stroke="#475569" stroke-width="10" d="M470 330 L520 385"/><circle class="k" cx="520" cy="385" r="9"/>
<circle class="d" cx="470" cy="330" r="26"/>
<path d="{belt}" fill="none" stroke="#0e7490" stroke-width="10" stroke-linejoin="round"/>
{label(420,535,470,595,480,615,"Crankshaft pulley")}
{label(600,230,640,205,648,212,"Alternator")}
{label(160,440,80,520,24,545,"A/C compressor")}
{label(210,170,150,140,24,132,"Power steering pump")}
{label(494,320,640,330,648,337,"Tensioner")}
{label(420,215,440,165,420,157,"Water pump")}''',
    extra_note="Belt routing differs by engine: follow the label under the bonnet")
print("ok", sorted(os.listdir(OUT)))
