import React, { createContext, useContext } from "react";
import { layoutZones, FRONT_ENGINE_GEOMETRY, DEFAULT_LAYOUT } from "@/lib/busZones";

// X-ray style bus drawing used by inspections. Two views: "outside" (side
// view, see-through to the engine, axles, tanks and wiring) and "inside"
// (top-down cabin plan), for each bus layout (city bus with the engine at
// the back, bus or minibus with the engine in front). Parts are grouped by zone so the zone being
// checked glows, finished zones turn green and zones with a problem turn red.
// Always drawn on its own dark "film" background, in light and dark mode.

const C = {
  line: "#5ee7ff",
  pass: "#4ade80",
  fail: "#fb7185",
  active: "#ffffff",
};

const STYLE = `
.tt-xr { background: radial-gradient(120% 90% at 50% 40%, #0b2340 0%, #051326 55%, #020912 100%); }
.tt-xr svg { display: block; width: 100%; height: auto; }
.tt-xr .p { fill: none; stroke: ${C.line}; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: stroke .25s, opacity .25s; }
.tt-xr .p .f { fill: ${C.line}; fill-opacity: .07; }
.tt-xr .p.dim { opacity: .38; }
.tt-xr .p.faint { opacity: .22; }
.tt-xr .p.z-pass { stroke: ${C.pass}; opacity: .95; }
.tt-xr .p.z-pass .f { fill: ${C.pass}; fill-opacity: .14; }
.tt-xr .p.z-fail { stroke: ${C.fail}; opacity: 1; }
.tt-xr .p.z-fail .f { fill: ${C.fail}; fill-opacity: .2; }
.tt-xr .p.z-active { stroke: ${C.active}; opacity: 1; filter: url(#xr-glow); }
.tt-xr .p.z-active .f { fill: ${C.line}; fill-opacity: .28; }
.tt-xr .scan { animation: tt-xr-scan 3.6s linear infinite; }
@keyframes tt-xr-scan { from { transform: translateX(-160px); } to { transform: translateX(1060px); } }
.tt-xr .ring { transform-box: fill-box; transform-origin: center; animation: tt-xr-ping 1.6s ease-out infinite; }
@keyframes tt-xr-ping { from { transform: scale(1); opacity: .9; } to { transform: scale(2.1); opacity: 0; } }
.tt-xr .hs { cursor: pointer; outline: none; }
.tt-xr .hs:focus-visible .hs-dot { stroke-width: 4; }
@media (prefers-reduced-motion: reduce) { .tt-xr .scan, .tt-xr .ring { animation: none; } .tt-xr .scan { display: none; } }
`;

function zoneClass(z, statuses, activeZone) {
  if (!z) return "";
  if (z === activeZone) return "z-active";
  const s = statuses?.[z];
  if (!s) return "";
  if (s.failed > 0) return "z-fail";
  if (s.total > 0 && s.done === s.total) return "z-pass";
  return "";
}

const XrCtx = createContext({ statuses: {}, activeZone: null });

function P({ z, className = "", children }) {
  const { statuses, activeZone } = useContext(XrCtx);
  return <g className={`p ${className} ${zoneClass(z, statuses, activeZone)}`}>{children}</g>;
}

function Defs({ id }) {
  return (
    <defs>
      <pattern id={`xr-grid-${id}`} width="25" height="25" patternUnits="userSpaceOnUse">
        <path d="M25 0H0V25" fill="none" stroke={C.line} strokeOpacity=".07" strokeWidth="1" />
      </pattern>
      <linearGradient id={`xr-scan-${id}`} x1="0" x2="1">
        <stop offset="0" stopColor={C.line} stopOpacity="0" />
        <stop offset=".85" stopColor={C.line} stopOpacity=".16" />
        <stop offset="1" stopColor={C.line} stopOpacity=".5" />
      </linearGradient>
      <filter id="xr-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  );
}

function Wheel({ cx, cy, z, brakeZ }) {
  return (
    <>
      <P z={z}>
        <circle className="f" cx={cx} cy={cy} r="44" strokeWidth="5" />
        <circle cx={cx} cy={cy} r="27" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <circle key={a} cx={cx + 17 * Math.cos((a * Math.PI) / 180)} cy={cy + 17 * Math.sin((a * Math.PI) / 180)} r="2.5" />
        ))}
      </P>
      <P z={brakeZ} className="dim">
        <circle cx={cx} cy={cy} r="34" strokeDasharray="4 5" />
        <path d={`M${cx - 12} ${cy - 30} a32 32 0 0 1 24 0`} strokeWidth="6" />
        <circle cx={cx} cy={cy} r="8" />
      </P>
    </>
  );
}

function CityOutside() {
  const windows = [[150, 228], [238, 316], [326, 404], [414, 492], [596, 674], [684, 762]];
  const seats = [162, 252, 342, 432, 610, 700];
  return (
    <>
      {/* frame ribs + floor + chassis rails: the "bones" */}
      <P className="faint">
        {[140, 233, 321, 409, 497, 591, 679, 767, 806].map((x) => <path key={x} d={`M${x} 72V308`} />)}
        <path d="M52 250H968" strokeDasharray="6 6" />
        <path d="M60 286H950M60 294H950" />
      </P>
      {/* seats seen through the side */}
      <P className="faint">
        {seats.map((x) => <path key={x} d={`M${x} 198V248M${x} 232H${x + 36}M${x + 30} 232V248`} />)}
      </P>
      {/* body shell */}
      <P z="body" className="">
        <path className="f" d="M40 300V92Q40 64 68 64H898Q930 64 948 92L966 130Q974 146 974 172V300Q974 316 958 316H846A58 58 0 0 0 730 316H316A58 58 0 0 0 200 316H56Q40 316 40 300Z" strokeWidth="2.5" />
        {windows.map(([a, b]) => <rect key={a} x={a} y="92" width={b - a} height="78" rx="6" />)}
        <rect x="776" y="92" width="28" height="78" rx="6" />
      </P>
      <P z="roof_ac"><rect className="f" x="380" y="46" width="240" height="18" rx="6" /><path d="M404 55H596" strokeDasharray="3 6" /></P>
      <P z="windshield"><path className="f" d="M904 72L942 94L960 136V214H912Z" /></P>
      <P z="wipers"><path d="M918 208L946 150M936 210L956 164" strokeWidth="3" /></P>
      <P z="mirrors"><path d="M946 92Q972 86 982 98" /><rect className="f" x="976" y="98" width="12" height="40" rx="4" /></P>
      <P z="front_door"><rect className="f" x="812" y="92" width="72" height="216" rx="4" /><path d="M848 96V304M812 180H884" /></P>
      <P z="rear_door"><rect className="f" x="510" y="92" width="76" height="216" rx="4" /><path d="M548 96V304M510 180H586" /></P>
      <P z="lights_front"><rect className="f" x="956" y="244" width="16" height="26" rx="5" /><rect x="958" y="276" width="14" height="10" rx="3" /></P>
      <P z="lights_rear"><rect className="f" x="36" y="232" width="12" height="40" rx="4" /><rect x="36" y="100" width="10" height="14" rx="3" /></P>
      {/* rear engine bay */}
      <P z="engine" className="dim">
        <rect className="f" x="62" y="196" width="112" height="84" rx="10" />
        {[82, 106, 130, 154].map((x) => <circle key={x} cx={x} cy="222" r="9" />)}
        <path d="M72 252H164M72 262H164" />
      </P>
      <P z="cooling" className="dim">
        <rect className="f" x="96" y="126" width="62" height="56" rx="6" />
        {[136, 146, 156, 166, 176].map((y) => <path key={y} d={`M102 ${y}H152`} />)}
        <path d="M127 182V196" />
      </P>
      <P z="exhaust" className="dim"><path d="M80 280V300Q80 312 68 312H38" strokeWidth="5" /><path d="M150 280V296" /></P>
      <P z="transmission" className="dim"><rect className="f" x="172" y="262" width="44" height="30" rx="6" /><path d="M216 280H250" strokeWidth="4" /></P>
      <P z="battery" className="dim"><rect className="f" x="336" y="284" width="64" height="24" rx="4" /><path d="M350 280V284M386 280V284M346 296H356M378 296H390M384 290V302" /></P>
      <P z="fuel" className="dim"><rect className="f" x="426" y="282" width="92" height="26" rx="12" /><path d="M504 282V270Q504 262 512 262" /></P>
      <P z="brakes" className="dim"><rect className="f" x="570" y="288" width="72" height="16" rx="8" /><path d="M642 296H740M320 296H360" strokeDasharray="5 5" /></P>
      <P z="suspension" className="dim">
        <ellipse className="f" cx="258" cy="280" rx="24" ry="8" /><ellipse className="f" cx="788" cy="280" rx="24" ry="8" />
        <path d="M232 286L222 302M284 286L294 302M762 286L752 302M814 286L824 302" />
      </P>
      <P z="steering" className="dim">
        <path d="M884 180L904 286" strokeWidth="3" /><rect className="f" x="894" y="284" width="24" height="16" rx="4" /><path d="M894 296L826 304" />
      </P>
      <P z="steering_wheel" className="faint"><ellipse cx="882" cy="176" rx="5" ry="17" strokeWidth="3" /></P>
      <P z="driver_seat" className="faint"><path d="M836 196V248M836 232H872" strokeWidth="3" /></P>
      <Wheel cx={258} cy={330} z="tyres" brakeZ="brakes" />
      <Wheel cx={788} cy={330} z="tyres" brakeZ="brakes" />
      <path d="M20 376H980" stroke={C.line} strokeOpacity=".25" strokeWidth="2" strokeDasharray="2 10" />
    </>
  );
}

function Seat({ x, y }) {
  return (
    <>
      <rect className="f" x={x} y={y} width="42" height="30" rx="6" />
      <path d={`M${x + 4} ${y + 2}V${y + 28}`} strokeWidth="4" />
    </>
  );
}

function CityInside() {
  const topRows = [110, 170, 230, 290, 350, 410, 470, 530, 590, 650, 710];
  const bottomRows = [110, 170, 230, 290, 350, 410, 470];
  return (
    <>
      <P z="body">
        <path className="f" d="M72 50H928Q976 50 980 102V258Q976 310 928 310H72Q40 310 40 278V82Q40 50 72 50Z" strokeWidth="2.5" />
      </P>
      {/* wheels poking out + under-floor engine */}
      <P z="tyres" className="dim">
        {[228, 758].map((x) => <React.Fragment key={x}><rect x={x} y="36" width="60" height="14" rx="4" /><rect x={x} y="310" width="60" height="14" rx="4" /></React.Fragment>)}
      </P>
      <P z="engine" className="faint"><rect x="50" y="92" width="64" height="176" rx="10" strokeDasharray="6 6" /></P>
      <P z="floor" className="faint"><path d="M120 180H790" strokeDasharray="8 8" /></P>
      <P z="passenger_seats">
        {topRows.map((x) => <React.Fragment key={x}><Seat x={x} y={62} /><Seat x={x} y={96} /></React.Fragment>)}
        {bottomRows.map((x) => <React.Fragment key={x}><Seat x={x} y={232} /><Seat x={x} y={266} /></React.Fragment>)}
      </P>
      <P z="interior_lights">{[170, 290, 410, 530, 650, 770].map((x) => <circle key={x} className="f" cx={x} cy="180" r="5" />)}</P>
      <P z="wheelchair"><rect className="f" x="600" y="226" width="110" height="74" rx="8" strokeDasharray="6 5" /><circle cx="655" cy="252" r="7" /><path d="M655 259V274H668L674 288M646 268A14 14 0 1 0 666 286" /></P>
      <P z="rear_door"><rect className="f" x="512" y="298" width="76" height="14" rx="4" /></P>
      <P z="front_door"><rect className="f" x="812" y="298" width="72" height="14" rx="4" /></P>
      <P z="handrails">
        <rect x="818" y="246" width="60" height="12" rx="3" /><rect x="818" y="266" width="60" height="12" rx="3" />
        <circle cx="804" cy="248" r="4" /><circle cx="894" cy="248" r="4" /><circle cx="598" cy="222" r="4" /><circle cx="506" cy="222" r="4" />
      </P>
      <P z="driver_seat"><rect className="f" x="812" y="66" width="46" height="46" rx="8" /><path d="M816 70V108" strokeWidth="5" /></P>
      <P z="steering_wheel"><circle className="f" cx="890" cy="90" r="19" strokeWidth="3" /><path d="M871 90H909M890 90V109" /></P>
      <P z="dashboard"><path className="f" d="M916 62Q962 180 916 298L934 298Q976 180 934 62Z" /><rect x="930" y="164" width="14" height="24" rx="3" /></P>
      <P z="windshield" className="dim"><path d="M958 70Q990 180 958 290" strokeWidth="4" /></P>
      <P z="fire_extinguisher"><rect className="f" x="768" y="136" width="16" height="28" rx="6" /><path d="M772 136V130H782" /></P>
      <P z="first_aid"><rect className="f" x="764" y="200" width="26" height="22" rx="4" /><path d="M777 205V217M771 211H783" strokeWidth="3" /></P>
      <P z="emergency_exit">
        <path d="M40 108V252" strokeWidth="6" />
        <rect className="f" x="300" y="152" width="44" height="56" rx="4" strokeDasharray="5 4" />
        <rect className="f" x="660" y="152" width="44" height="56" rx="4" strokeDasharray="5 4" />
      </P>
    </>
  );
}


// Bus / minibus with the engine at the front (no wheelchair space). The
// geometry comes from FRONT_ENGINE_GEOMETRY so the hotspots line up.
function FrontEngineOutside({ g }) {
  const { x0, x1, roof, frontWheel: fw, rearWheel: rw, frontDoor: [dx, dw], rearDoor: [rx, rwid] } = g;
  const [ex, ey, ew, eh] = g.engine;
  const [cx, cy, cw, ch] = g.cooling;
  const [tx, ty] = g.trans;
  const ribs = [];
  for (let x = x0 + 90; x < x1 - 80; x += 88) ribs.push(x);
  const seats = g.windows.slice(0, -2).map(([a]) => a + 14);
  const shell = `M${x0} 300V${roof + 28}Q${x0} ${roof} ${x0 + 28} ${roof}H${x1 - 76}Q${x1 - 44} ${roof} ${x1 - 26} ${roof + 28}L${x1 - 8} ${roof + 66}Q${x1} ${roof + 82} ${x1} ${roof + 108}V300Q${x1} 316 ${x1 - 16} 316H${fw + 58}A58 58 0 0 0 ${fw - 58} 316H${rw + 58}A58 58 0 0 0 ${rw - 58} 316H${x0 + 16}Q${x0} 316 ${x0} 300Z`;
  return (
    <>
      <P className="faint">
        {ribs.map((x) => <path key={x} d={`M${x} ${roof + 8}V308`} />)}
        <path d={`M${x0 + 12} 250H${x1 - 6}`} strokeDasharray="6 6" />
        <path d={`M${x0 + 20} 286H${x1 - 24}M${x0 + 20} 294H${x1 - 24}`} />
      </P>
      <P className="faint">{seats.map((x) => <path key={x} d={`M${x} 198V248M${x} 232H${x + 36}M${x + 30} 232V248`} />)}</P>
      <P z="body">
        <path className="f" d={shell} strokeWidth="2.5" />
        {g.windows.map(([a, b]) => <rect key={a} x={a} y={roof + 28} width={b - a} height="78" rx="6" />)}
      </P>
      <P z="roof_ac"><rect className="f" x={g.ac[0]} y={roof - 18} width={g.ac[1]} height="18" rx="6" /><path d={`M${g.ac[0] + 24} ${roof - 9}H${g.ac[0] + g.ac[1] - 24}`} strokeDasharray="3 6" /></P>
      <P z="windshield"><path className="f" d={`M${x1 - 70} ${roof + 8}L${x1 - 32} ${roof + 30}L${x1 - 14} ${roof + 72}V${roof + 150}H${x1 - 62}Z`} /></P>
      <P z="wipers"><path d={`M${x1 - 56} ${roof + 144}L${x1 - 28} ${roof + 86}M${x1 - 38} ${roof + 146}L${x1 - 18} ${roof + 100}`} strokeWidth="3" /></P>
      <P z="mirrors"><path d={`M${x1 - 28} ${roof + 28}Q${x1 - 2} ${roof + 22} ${x1 + 8} ${roof + 34}`} /><rect className="f" x={x1 + 2} y={roof + 34} width="12" height="40" rx="4" /></P>
      <P z="front_door"><rect className="f" x={dx} y={roof + 28} width={dw} height={308 - roof - 28} rx="4" /><path d={`M${dx + dw / 2} ${roof + 32}V304M${dx} 180H${dx + dw}`} /></P>
      <P z="rear_door"><rect className="f" x={rx} y={roof + 28} width={rwid} height={290 - roof - 28} rx="4" /><path d={`M${rx + 10} 180H${rx + rwid - 10}`} /><circle cx={rx + rwid - 12} cy="200" r="3" /></P>
      <P z="lights_front"><rect className="f" x={x1 - 18} y="244" width="16" height="26" rx="5" /><rect x={x1 - 16} y="276" width="14" height="10" rx="3" /></P>
      <P z="lights_rear"><rect className="f" x={x0 - 4} y="232" width="12" height="40" rx="4" /><rect x={x0 - 4} y={roof + 36} width="10" height="14" rx="3" /></P>
      {/* front engine bay */}
      <P z="engine" className="dim">
        <rect className="f" x={ex} y={ey} width={ew} height={eh} rx="10" />
        {[0.2, 0.4, 0.6, 0.8].map((f) => <circle key={f} cx={ex + ew * f} cy={ey + 24} r="8" />)}
        <path d={`M${ex + 8} ${ey + 54}H${ex + ew - 8}M${ex + 8} ${ey + 64}H${ex + ew - 8}`} />
      </P>
      <P z="cooling" className="dim">
        <rect className="f" x={cx} y={cy} width={cw} height={ch} rx="5" />
        {[0.2, 0.4, 0.6, 0.8].map((f) => <path key={f} d={`M${cx + 4} ${cy + ch * f}H${cx + cw - 4}`} />)}
      </P>
      <P z="exhaust" className="dim"><path d={`M${ex + 30} ${ey + eh}V304H${x0 + 70}V318`} strokeWidth="4" /></P>
      <P z="transmission" className="dim">
        <rect className="f" x={tx} y={ty} width="44" height="26" rx="6" />
        <path d={`M${tx} 276H${rw + 30}`} strokeWidth="4" strokeDasharray="10 4" />
        <rect x={rw - 20} y="268" width="40" height="18" rx="6" />
      </P>
      <P z="battery" className="dim"><rect className="f" x={g.battery} y="284" width="60" height="24" rx="4" /><path d={`M${g.battery + 12} 280V284M${g.battery + 48} 280V284M${g.battery + 8} 296H${g.battery + 18}M${g.battery + 40} 296H${g.battery + 52}M${g.battery + 46} 290V302`} /></P>
      <P z="fuel" className="dim"><rect className="f" x={g.fuel} y="282" width="92" height="26" rx="12" /><path d={`M${g.fuel + 14} 282V270Q${g.fuel + 14} 262 ${g.fuel + 6} 262`} /></P>
      <P z="brakes" className="dim"><rect className="f" x={g.airTank} y="288" width="64" height="16" rx="8" /><path d={`M${g.airTank + 64} 296H${fw - 50}M${rw + 50} 296H${g.fuel}`} strokeDasharray="5 5" /></P>
      <P z="suspension" className="dim">
        <ellipse className="f" cx={rw} cy="280" rx="26" ry="8" /><ellipse className="f" cx={fw} cy="280" rx="24" ry="8" />
        <path d={`M${rw - 26} 286L${rw - 36} 302M${rw + 26} 286L${rw + 36} 302M${fw - 24} 286L${fw - 34} 302M${fw + 24} 286L${fw + 34} 302`} />
      </P>
      <P z="steering" className="dim">
        <path d={`M${x1 - 74} 180L${x1 - 70} 286`} strokeWidth="3" /><rect className="f" x={x1 - 82} y="284" width="24" height="16" rx="4" /><path d={`M${x1 - 82} 296L${fw + 20} 304`} />
      </P>
      <P z="steering_wheel" className="faint"><ellipse cx={x1 - 76} cy="176" rx="5" ry="17" strokeWidth="3" /></P>
      <P z="driver_seat" className="faint"><path d={`M${x1 - 120} 196V248M${x1 - 120} 232H${x1 - 88}`} strokeWidth="3" /></P>
      <Wheel cx={rw} cy={330} z="tyres" brakeZ="brakes" />
      <Wheel cx={fw} cy={330} z="tyres" brakeZ="brakes" />
      <path d="M20 376H980" stroke={C.line} strokeOpacity=".25" strokeWidth="2" strokeDasharray="2 10" />
    </>
  );
}

function FrontEngineInside({ g }) {
  const { x0, x1, frontWheel: fw, rearWheel: rw, frontDoor: [dx, dw] } = g;
  const s = g.inside;
  const [ecx, ecy, ecw, ech] = s.engineCover;
  return (
    <>
      <P z="body">
        <path className="f" d={`M${x0 + 32} 50H${x1 - 72}Q${x1 - 24} 50 ${x1 - 20} 102V258Q${x1 - 24} 310 ${x1 - 72} 310H${x0 + 32}Q${x0} 310 ${x0} 278V82Q${x0} 50 ${x0 + 32} 50Z`} strokeWidth="2.5" />
      </P>
      <P z="tyres" className="dim">
        {[rw - 30, fw - 30].map((x) => <React.Fragment key={x}><rect x={x} y="36" width="60" height="14" rx="4" /><rect x={x} y="310" width="60" height="14" rx="4" /></React.Fragment>)}
      </P>
      {/* engine under a cover beside the driver */}
      <P z="engine" className="dim"><rect className="f" x={ecx} y={ecy} width={ecw} height={ech} rx="10" strokeDasharray="6 5" /><path d={`M${ecx + 8} ${ecy + 20}H${ecx + ecw - 8}M${ecx + 8} ${ecy + 34}H${ecx + ecw - 8}`} /></P>
      <P z="floor" className="faint"><path d={`M${x0 + 70} 180H${dx - 10}`} strokeDasharray="8 8" /></P>
      <P z="passenger_seats">
        {s.topRows.map((x) => <React.Fragment key={x}><Seat x={x} y={62} /><Seat x={x} y={96} /></React.Fragment>)}
        {s.bottomRows.map((x) => <React.Fragment key={x}><Seat x={x} y={232} /><Seat x={x} y={266} /></React.Fragment>)}
      </P>
      <P z="interior_lights">{s.lights.map((x) => <circle key={x} className="f" cx={x} cy="180" r="5" />)}</P>
      <P z="rear_door"><path d={`M${x0} 128V232`} strokeWidth="7" /></P>
      <P z="front_door"><rect className="f" x={dx} y="298" width={dw} height="14" rx="4" /></P>
      <P z="handrails">
        <rect x={dx + 6} y="246" width={dw - 12} height="12" rx="3" /><rect x={dx + 6} y="266" width={dw - 12} height="12" rx="3" />
        <circle cx={dx - 6} cy="248" r="4" /><circle cx={dx + dw + 6} cy="248" r="4" />
      </P>
      <P z="driver_seat"><rect className="f" x={s.driverSeat} y="66" width="46" height="46" rx="8" /><path d={`M${s.driverSeat + 4} 70V108`} strokeWidth="5" /></P>
      <P z="steering_wheel"><circle className="f" cx={s.wheel} cy="90" r="19" strokeWidth="3" /><path d={`M${s.wheel - 19} 90H${s.wheel + 19}M${s.wheel} 90V109`} /></P>
      <P z="dashboard"><path className="f" d={`M${x1 - 64} 62Q${x1 - 18} 180 ${x1 - 64} 298L${x1 - 46} 298Q${x1 - 4} 180 ${x1 - 46} 62Z`} /><rect x={x1 - 50} y="164" width="14" height="24" rx="3" /></P>
      <P z="windshield" className="dim"><path d={`M${x1 - 22} 70Q${x1 + 10} 180 ${x1 - 22} 290`} strokeWidth="4" /></P>
      <P z="fire_extinguisher"><rect className="f" x={s.fireExt[0]} y={s.fireExt[1]} width="16" height="28" rx="6" /><path d={`M${s.fireExt[0] + 4} ${s.fireExt[1]}V${s.fireExt[1] - 6}H${s.fireExt[0] + 14}`} /></P>
      <P z="first_aid"><rect className="f" x={s.firstAid[0]} y={s.firstAid[1]} width="26" height="22" rx="4" /><path d={`M${s.firstAid[0] + 13} ${s.firstAid[1] + 5}V${s.firstAid[1] + 17}M${s.firstAid[0] + 7} ${s.firstAid[1] + 11}H${s.firstAid[0] + 19}`} strokeWidth="3" /></P>
      <P z="emergency_exit">
        {s.hatches.map((x) => <rect key={x} className="f" x={x} y="152" width="44" height="56" rx="4" strokeDasharray="5 4" />)}
      </P>
    </>
  );
}

// statuses: { [zoneId]: { total, done, failed } } — only zones listed here
// get a hotspot. activeZone glows and pulses.
export default function XrayBus({ view = "outside", layout = DEFAULT_LAYOUT, statuses = {}, activeZone, onZoneClick, scanning = true, className = "", label }) {
  const id = `${layout}-${view}`;
  const g = FRONT_ENGINE_GEOMETRY[layout];
  const vb = view === "inside" ? "0 0 1000 360" : "0 0 1000 400";
  const [, , w, h] = vb.split(" ").map(Number);
  const zones = layoutZones(layout).filter((z) => z.view === view && statuses[z.id]);
  return (
    <div className={`tt-xr relative overflow-hidden rounded-2xl ${className}`}>
      <style>{STYLE}</style>
      <svg viewBox={vb} role="img" aria-label={label || (view === "inside" ? "X-ray of the bus cabin" : "X-ray of the bus from the side")}>
        <Defs id={id} />
        <rect width={w} height={h} fill={`url(#xr-grid-${id})`} />
        <XrCtx.Provider value={{ statuses, activeZone }}>
          {g
            ? (view === "inside" ? <FrontEngineInside g={g} /> : <FrontEngineOutside g={g} />)
            : (view === "inside" ? <CityInside /> : <CityOutside />)}
        </XrCtx.Provider>
        {scanning && (
          <g className="scan" aria-hidden="true">
            <rect x="0" y="0" width="140" height={h} fill={`url(#xr-scan-${id})`} />
            <rect x="138" y="0" width="2" height={h} fill={C.line} fillOpacity=".7" />
          </g>
        )}
        {zones.map((z) => {
          const s = statuses[z.id];
          const active = z.id === activeZone;
          const failed = s.failed > 0;
          const done = s.total > 0 && s.done === s.total;
          const color = active ? C.active : failed ? C.fail : done ? C.pass : C.line;
          const r = active ? 19 : 15;
          const state = failed ? "problem reported" : done ? "all OK" : `${s.total - s.done} to check`;
          return (
            <g
              key={z.id}
              className="hs"
              role="button"
              tabIndex={onZoneClick ? 0 : -1}
              aria-label={`${z.label}: ${state}`}
              onClick={() => onZoneClick?.(z.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onZoneClick?.(z.id); } }}
            >
              <circle cx={z.x} cy={z.y} r="30" fill="transparent" />
              {(active || (!done && !failed)) && <circle className="ring" cx={z.x} cy={z.y} r={r} fill="none" stroke={color} strokeWidth="2" />}
              <circle className="hs-dot" cx={z.x} cy={z.y} r={r} fill="#04101f" fillOpacity=".85" stroke={color} strokeWidth="2.5" />
              {failed ? (
                <path d={`M${z.x} ${z.y - 8}V${z.y + 2}M${z.x} ${z.y + 7}V${z.y + 8}`} stroke={color} strokeWidth="3.5" strokeLinecap="round" />
              ) : done ? (
                <path d={`M${z.x - 7} ${z.y}L${z.x - 2} ${z.y + 5}L${z.x + 7} ${z.y - 5}`} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <text x={z.x} y={z.y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill={color} fontFamily="inherit">{s.total - s.done}</text>
              )}
              {active && (() => {
                // Label pill above the hotspot (below it near the top edge),
                // kept inside the frame.
                const half = z.label.length * 4.9 + 14;
                const lx = Math.min(Math.max(z.x, half + 6), w - half - 6);
                const ly = z.y - r - 30 < 6 ? z.y + r + 10 : z.y - r - 34;
                return (
                  <g pointerEvents="none">
                    <rect x={lx - half} y={ly} width={half * 2} height="26" rx="13" fill="#04101f" fillOpacity=".9" stroke={C.line} strokeOpacity=".6" />
                    <text x={lx} y={ly + 18} textAnchor="middle" fontSize="16" fontWeight="700" fill={C.active} fontFamily="inherit">{z.label}</text>
                  </g>
                );
              })()}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
