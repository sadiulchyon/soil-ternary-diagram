import { useState, useRef, useCallback } from "react";

// ─── USDA Classification ────────────────────────────────────────────────────
// All checks: clay, silt, sand as fractions 0-1
function classifyTexture(c, si, sa) {
  if (c >= 0.40 && si <= 0.40 && sa <= 0.45) return "Clay";
  if (c >= 0.40 && si >= 0.40)               return "Silty Clay";
  if (c >= 0.35 && sa >= 0.45)               return "Sandy Clay";
  if (c >= 0.27 && si >= 0.40)               return "Silty Clay Loam";
  if (c >= 0.27 && c < 0.40 && sa < 0.45)   return "Clay Loam";
  if (c >= 0.20 && c < 0.35 && sa >= 0.45)  return "Sandy Clay Loam";
  if (c >= 0.07 && c < 0.27 && si >= 0.28 && si < 0.50 && sa < 0.52) return "Loam";
  if ((c < 0.27 && si >= 0.50) || (c < 0.12 && si >= 0.50)) return "Silt Loam";
  if (c < 0.12 && si >= 0.80)  return "Silt";
  if (sa + 1.5 * c < 0.15)     return "Sand";
  if (sa + 2 * c < 0.30)       return "Loamy Sand";
  return "Sandy Loam";
}

// ─── USDA Region Polygons ───────────────────────────────────────────────────
// Vertices: [clay, silt, sand] as fractions — match the uploaded USDA triangle
// Axis orientation: top=Clay 100%, bottom-left=Sand 100%, bottom-right=Silt 100%
const REGIONS = [
  {
    name: "Clay",
    color: "#7a3b10",
    light: "#c87941",
    pts: [[1.00,0.00,0.00],[0.60,0.40,0.00],[0.40,0.40,0.20],[0.40,0.15,0.45],[0.55,0.00,0.45]],
  },
  {
    name: "Silty Clay",
    color: "#6b3fa0",
    light: "#b07ad6",
    pts: [[0.60,0.40,0.00],[0.40,0.60,0.00],[0.40,0.40,0.20]],
  },
  {
    name: "Sandy Clay",
    color: "#b83232",
    light: "#e07070",
    pts: [[0.55,0.00,0.45],[0.40,0.15,0.45],[0.35,0.20,0.45],[0.35,0.00,0.65]],
  },
  {
    name: "Silty Clay Loam",
    color: "#8a55b8",
    light: "#c49dd6",
    pts: [[0.40,0.60,0.00],[0.27,0.73,0.00],[0.27,0.40,0.33],[0.40,0.40,0.20]],
  },
  {
    name: "Clay Loam",
    color: "#b06030",
    light: "#d4975a",
    pts: [[0.40,0.40,0.20],[0.40,0.15,0.45],[0.35,0.20,0.45],[0.27,0.28,0.45],[0.27,0.40,0.33]],
  },
  {
    name: "Sandy Clay Loam",
    color: "#c07840",
    light: "#e0aa72",
    pts: [[0.35,0.00,0.65],[0.35,0.20,0.45],[0.27,0.28,0.45],[0.20,0.28,0.52],[0.20,0.00,0.80]],
  },
  {
    name: "Loam",
    color: "#5a8a30",
    light: "#8dc45a",
    // Bottom-right now at (7,41,52) — shared with sandy loam constant-sand=52% boundary
    pts: [[0.27,0.28,0.45],[0.27,0.50,0.23],[0.07,0.50,0.43],[0.07,0.41,0.52],[0.20,0.28,0.52]],
  },
  {
    name: "Silt Loam",
    color: "#3a7a7a",
    light: "#6ababa",
    pts: [[0.27,0.50,0.23],[0.27,0.73,0.00],[0.12,0.88,0.00],[0.12,0.80,0.08],[0.00,0.80,0.20],[0.00,0.50,0.50],[0.07,0.50,0.43]],
  },
  {
    name: "Silt",
    color: "#2a6888",
    light: "#5aaac0",
    // Trapezium: base-edge (clay=0) from silt=100 to silt=80,
    // then silt=80% line to clay=12, then clay=12% horizontal back to right edge
    pts: [[0.00,1.00,0.00],[0.00,0.80,0.20],[0.12,0.80,0.08],[0.12,0.88,0.00]],
  },
  {
    name: "Sandy Loam",
    color: "#b89030",
    light: "#e0c060",
    // Right boundary follows constant sand=52% from (20,28,52) → (7,41,52)
    // then silt loam boundary to base at (0,48,52)
    pts: [[0.20,0.00,0.80],[0.20,0.28,0.52],[0.07,0.41,0.52],[0.07,0.50,0.43],[0.00,0.50,0.50],[0.00,0.30,0.70],[0.15,0.00,0.85]],
  },
  {
    name: "Loamy Sand",
    color: "#a09020",
    light: "#d0c040",
    pts: [[0.10,0.00,0.90],[0.15,0.00,0.85],[0.00,0.30,0.70],[0.00,0.15,0.85]],
  },
  {
    name: "Sand",
    color: "#c8a820",
    light: "#e8d050",
    pts: [[0.00,0.00,1.00],[0.10,0.00,0.90],[0.00,0.15,0.85]],
  },
];

const REGION_MAP = Object.fromEntries(REGIONS.map(r => [r.name, r]));

// ─── Coordinate System ───────────────────────────────────────────────────────
// Top  = clay=100%
// BL   = sand=100%
// BR   = silt=100%
function triXY(clay, silt, sand, cx, cy, size) {
  const h = (Math.sqrt(3) / 2) * size;
  const tx = cx,           ty = cy - (2 / 3) * h;  // top (clay=100)
  const bx = cx - size / 2, by = cy + (1 / 3) * h; // bottom-left (sand=100)
  const rx = cx + size / 2, ry = cy + (1 / 3) * h; // bottom-right (silt=100)
  return {
    x: clay * tx + sand * bx + silt * rx,
    y: clay * ty + sand * by + silt * ry,
  };
}

function xyToTri(px, py, cx, cy, size) {
  const h = (Math.sqrt(3) / 2) * size;
  const tx = cx,           ty = cy - (2 / 3) * h;
  const bx = cx - size / 2, by = cy + (1 / 3) * h;
  const rx = cx + size / 2, ry = cy + (1 / 3) * h;
  const denom = (by - ry) * (tx - rx) + (rx - bx) * (ty - ry);
  const clay  = ((by - ry) * (px - rx) + (rx - bx) * (py - ry)) / denom;
  const sand  = ((ry - ty) * (px - rx) + (tx - rx) * (py - ry)) / denom;
  const silt  = 1 - clay - sand;
  return { clay, silt, sand };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SoilTernary() {
  const W = 600, H = 560;
  const CX = 295, CY = 275, SIZE = 420;

  const svgRef = useRef(null);
  const [pt, setPt]       = useState({ clay: 0.30, silt: 0.40, sand: 0.30 });
  const [drag, setDrag]   = useState(false);
  const [hover, setHover] = useState(null);
  const [locks, setLocks] = useState({ clay: false, silt: false, sand: false });
  const [inputVals, setInputVals] = useState({ clay: "30", silt: "40", sand: "30" });

  const lockedKeys  = ['clay','silt','sand'].filter(k => locks[k]);
  const lockedCount = lockedKeys.length;

  // Toggle a lock — prevent locking all 3
  const toggleLock = (key) => {
    if (!locks[key] && lockedCount >= 2) return; // already 2 locked
    setLocks(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // If we now have 2 locked, recalculate the free one
      const newLocked = ['clay','silt','sand'].filter(k => next[k]);
      if (newLocked.length === 2) {
        const freeKey = ['clay','silt','sand'].find(k => !next[k]);
        const calc = Math.max(0, 1 - pt[newLocked[0]] - pt[newLocked[1]]);
        setPt(p => ({ ...p, [freeKey]: calc }));
      }
      return next;
    });
  };

  // Apply lock constraints to a raw ternary point from triangle drag
  const applyLocks = useCallback((raw) => {
    const lk = ['clay','silt','sand'].filter(k => locks[k]);
    if (lk.length === 0) return raw;
    if (lk.length >= 2) return pt; // fully determined — no movement
    const [lockedKey] = lk;
    const lockedVal   = pt[lockedKey];
    const freeKeys    = ['clay','silt','sand'].filter(k => !locks[k]);
    const rem         = 1 - lockedVal;
    const rawSum      = freeKeys.reduce((s, k) => s + Math.max(0, raw[k]), 0);
    if (rawSum <= 0) return pt;
    return {
      [lockedKey]:  lockedVal,
      [freeKeys[0]]: rem * Math.max(0, raw[freeKeys[0]]) / rawSum,
      [freeKeys[1]]: rem * Math.max(0, raw[freeKeys[1]]) / rawSum,
    };
  }, [locks, pt]);

  // Slider change with lock awareness
  const handleSlider = (key, val) => {
    const v      = val / 100;
    const others = ['clay','silt','sand'].filter(k => k !== key);
    const freeOthers   = others.filter(k => !locks[k]);
    const lockedOthers = others.filter(k =>  locks[k]);
    let newPt;
    if (freeOthers.length === 2) {
      const rem     = Math.max(0, 1 - v);
      const sumOth  = others.reduce((s, k) => s + pt[k], 0) || 1;
      newPt = {
        ...pt, [key]: v,
        [others[0]]: rem * pt[others[0]] / sumOth,
        [others[1]]: rem * pt[others[1]] / sumOth,
      };
    } else if (freeOthers.length === 1) {
      const lockedVal = pt[lockedOthers[0]];
      const freeVal   = Math.max(0, 1 - v - lockedVal);
      newPt = { ...pt, [key]: v, [freeOthers[0]]: freeVal };
    } else {
      return;
    }
    syncInputs(newPt);
  };

  // While typing — update input string only, don't move dot yet
  const handleNumberInput = (key, raw) => {
    setInputVals(prev => ({ ...prev, [key]: raw }));
  };

  // On blur or Enter — commit the value and recalculate
  const handleNumberCommit = (key) => {
    const v = Math.min(100, Math.max(0, parseFloat(inputVals[key]) || 0));
    handleSlider(key, v);
    // Ensure input reflects the clamped/recalculated value after commit
    setInputVals(prev => ({ ...prev, [key]: String(Math.round(v)) }));
  };

  const className = classifyTexture(pt.clay, pt.silt, pt.sand);
  const region    = REGION_MAP[className] ?? { name: className, color: "#888", light: "#aaa" };

  // Convert pixel click/touch to ternary coords
  const fromEvent = useCallback((e) => {
    const svg  = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    if (!src) return null;
    const px   = (src.clientX - rect.left) * (W / rect.width);
    const py   = (src.clientY - rect.top)  * (H / rect.height);
    const t    = xyToTri(px, py, CX, CY, SIZE);
    if (t.clay < 0 || t.silt < 0 || t.sand < 0) return null;
    return {
      clay: Math.max(0, Math.min(1, t.clay)),
      silt: Math.max(0, Math.min(1, t.silt)),
      sand: Math.max(0, Math.min(1, t.sand)),
    };
  }, []);

  const syncInputs = (newPt) => {
    setInputVals({
      clay: String(Math.round(newPt.clay * 100)),
      silt: String(Math.round(newPt.silt * 100)),
      sand: String(Math.round(newPt.sand * 100)),
    });
    setPt(newPt);
  };

  const onDown  = useCallback((e) => { const t = fromEvent(e); if (t) { setDrag(true); syncInputs(applyLocks(t)); } }, [fromEvent, applyLocks]);
  const onMove  = useCallback((e) => { if (drag) { const t = fromEvent(e); if (t) syncInputs(applyLocks(t)); } }, [drag, fromEvent, applyLocks]);
  const onUp    = () => setDrag(false);

  // Triangle vertices
  const TOP = triXY(1, 0, 0, CX, CY, SIZE);
  const BL  = triXY(0, 0, 1, CX, CY, SIZE);
  const BR  = triXY(0, 1, 0, CX, CY, SIZE);

  // Grid lines
  const grid = [];
  for (let v = 0.1; v < 1.0; v += 0.1) {
    const r = Math.round(v * 10) / 10;
    // Constant clay (parallel to base): left-edge → right-edge
    const cl1 = triXY(r, 0,   1-r, CX, CY, SIZE);
    const cl2 = triXY(r, 1-r, 0,   CX, CY, SIZE);
    grid.push(<line key={`c${r}`} x1={cl1.x} y1={cl1.y} x2={cl2.x} y2={cl2.y} stroke="#bbb" strokeWidth="0.6" />);
    // Constant silt (parallel to left edge): right-edge → bottom
    const si1 = triXY(1-r, r,  0,   CX, CY, SIZE);
    const si2 = triXY(0,   r,  1-r, CX, CY, SIZE);
    grid.push(<line key={`s${r}`} x1={si1.x} y1={si1.y} x2={si2.x} y2={si2.y} stroke="#bbb" strokeWidth="0.6" />);
    // Constant sand (parallel to right edge): left-edge → bottom
    const sa1 = triXY(1-r, 0, r,   CX, CY, SIZE);
    const sa2 = triXY(0, 1-r, r,   CX, CY, SIZE);
    grid.push(<line key={`a${r}`} x1={sa1.x} y1={sa1.y} x2={sa2.x} y2={sa2.y} stroke="#bbb" strokeWidth="0.6" />);
  }

  // Tick marks and labels
  // Clay: LEFT edge (silt=0), values increase upward → label to the left
  // Silt: RIGHT edge (sand=0), values increase downward → label to the right
  // Sand: BOTTOM edge (clay=0), values increase right-to-left → label below
  const ticks = [];
  for (let v = 0.1; v <= 0.9; v += 0.1) {
    const r   = Math.round(v * 10) / 10;
    const pct = Math.round(r * 100);

    // Clay ticks: left edge (silt=0)
    const cp  = triXY(r, 0, 1-r, CX, CY, SIZE);
    ticks.push(
      <g key={`ct${r}`}>
        <line x1={cp.x} y1={cp.y} x2={cp.x - 6} y2={cp.y} stroke="#555" strokeWidth="1" />
        <text x={cp.x - 9} y={cp.y + 4} textAnchor="end" fontSize="10" fill="#444">{pct}</text>
      </g>
    );

    // Silt ticks: right edge (sand=0)
    const sp  = triXY(1-r, r, 0, CX, CY, SIZE);
    ticks.push(
      <g key={`si${r}`}>
        <line x1={sp.x} y1={sp.y} x2={sp.x + 6} y2={sp.y} stroke="#555" strokeWidth="1" />
        <text x={sp.x + 9} y={sp.y + 4} textAnchor="start" fontSize="10" fill="#444">{pct}</text>
      </g>
    );

    // Sand ticks: bottom edge (clay=0), sand increases right-to-left
    const ap  = triXY(0, 1-r, r, CX, CY, SIZE);
    ticks.push(
      <g key={`sa${r}`}>
        <line x1={ap.x} y1={ap.y} x2={ap.x} y2={ap.y + 6} stroke="#555" strokeWidth="1" />
        <text x={ap.x} y={ap.y + 17} textAnchor="middle" fontSize="10" fill="#444">{pct}</text>
      </g>
    );
  }

  // Dot position
  const dot = triXY(pt.clay, pt.silt, pt.sand, CX, CY, SIZE);

  // Crosshair lines to each axis
  const crosshairs = [
    [triXY(pt.clay, 0,      1-pt.clay, CX, CY, SIZE)],
    [triXY(0,       pt.silt, 1-pt.silt, CX, CY, SIZE)],
    [triXY(1-pt.sand, 0,    pt.sand,   CX, CY, SIZE)],
  ].map((ep, i) => (
    <line key={i}
      x1={dot.x} y1={dot.y} x2={ep[0].x} y2={ep[0].y}
      stroke={region.color} strokeWidth="1" strokeDasharray="5,4" opacity="0.7"
    />
  ));

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f6f2eb",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      padding: "24px 16px",
      boxSizing: "border-box",
    }}>

      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: "16px" }}>
        <div style={{ fontSize: "17px", fontWeight: "bold", color: "#2a1a08", letterSpacing: "1.5px", textTransform: "uppercase" }}>
          USDA Soil Texture Classification
        </div>
        <div style={{ fontSize: "11px", color: "#7a6a50", marginTop: "3px", fontStyle: "italic" }}>
          Tap or drag inside the triangle · Source: USDA NRCS
        </div>
      </div>

      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", width: "100%", maxWidth: "860px" }}>

        {/* SVG Triangle */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{
            display: "block",
            flex: "1 1 auto",
            minWidth: 0,
            maxWidth: `${W}px`,
            height: "auto",
            cursor: drag ? "grabbing" : "crosshair",
            background: "white",
            border: "1px solid #d0c8b8",
            borderRadius: "4px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
            touchAction: "none",
          }}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          onTouchStart={onDown}
          onTouchMove={onMove}
          onTouchEnd={onUp}
        >
          <defs>
            <clipPath id="triClip2">
              <polygon points={`${TOP.x},${TOP.y} ${BL.x},${BL.y} ${BR.x},${BR.y}`} />
            </clipPath>
          </defs>

          {/* Background */}
          <polygon points={`${TOP.x},${TOP.y} ${BL.x},${BL.y} ${BR.x},${BR.y}`} fill="#fafaf6" />

          {/* Colored texture regions */}
          <g clipPath="url(#triClip2)">
            {REGIONS.map(r => {
              const pts = r.pts.map(([c, si, sa]) => {
                const p = triXY(c, si, sa, CX, CY, SIZE);
                return `${p.x},${p.y}`;
              }).join(" ");
              const isHov = hover === r.name;
              const isSel = className === r.name;
              return (
                <polygon
                  key={r.name}
                  points={pts}
                  fill={isHov || isSel ? r.light : r.color}
                  opacity={isHov || isSel ? 0.85 : 0.55}
                  onMouseEnter={() => setHover(r.name)}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </g>

          {/* Grid lines inside triangle */}
          <g clipPath="url(#triClip2)">{grid}</g>

          {/* Region boundary lines (bold) */}
          <g clipPath="url(#triClip2)">
            {REGIONS.map(r => {
              const pts = r.pts.map(([c, si, sa]) => {
                const p = triXY(c, si, sa, CX, CY, SIZE);
                return `${p.x},${p.y}`;
              }).join(" ");
              return (
                <polygon
                  key={`b-${r.name}`}
                  points={pts}
                  fill="none"
                  stroke="#1a1a1a"
                  strokeWidth="1.6"
                  style={{ pointerEvents: "none" }}
                />
              );
            })}
          </g>

          {/* Triangle outer border */}
          <polygon
            points={`${TOP.x},${TOP.y} ${BL.x},${BL.y} ${BR.x},${BR.y}`}
            fill="none" stroke="#1a1a1a" strokeWidth="2.2"
          />

          {/* Tick marks and numeric labels */}
          {ticks}

          {/* Axis corner labels */}
          <text x={TOP.x} y={TOP.y - 18} textAnchor="middle" fontSize="13" fontWeight="bold" fill="#1a1a1a">100</text>
          <text x={BL.x  -  8} y={BL.y + 22} textAnchor="middle" fontSize="13" fontWeight="bold" fill="#1a1a1a">100</text>
          <text x={BR.x  +  8} y={BR.y + 22} textAnchor="middle" fontSize="13" fontWeight="bold" fill="#1a1a1a">100</text>

          {/* Axis directional labels with arrows */}
          {/* Clay — left side, label parallel to left edge */}
          <g transform={`translate(${(TOP.x + BL.x) / 2 - 32}, ${(TOP.y + BL.y) / 2}) rotate(-60)`}>
            <text textAnchor="middle" fontSize="11" fontWeight="bold" fill="#2a1a08" letterSpacing="0.5">
              percent clay
            </text>
            <text textAnchor="middle" dy="14" fontSize="12" fill="#2a1a08">↑</text>
          </g>

          {/* Silt — right side, label parallel to right edge */}
          <g transform={`translate(${(TOP.x + BR.x) / 2 + 32}, ${(TOP.y + BR.y) / 2}) rotate(60)`}>
            <text textAnchor="middle" fontSize="11" fontWeight="bold" fill="#2a1a08" letterSpacing="0.5">
              percent silt
            </text>
            <text textAnchor="middle" dy="14" fontSize="12" fill="#2a1a08">↓</text>
          </g>

          {/* Sand — bottom, centered below */}
          <text
            x={(BL.x + BR.x) / 2} y={BL.y + 36}
            textAnchor="middle" fontSize="11" fontWeight="bold" fill="#2a1a08" letterSpacing="0.5"
          >
            percent sand  ←
          </text>

          {/* Crosshair lines */}
          {crosshairs}

          {/* Dot */}
          <circle cx={dot.x} cy={dot.y} r={7} fill="white"   stroke={region.color} strokeWidth={2.5} style={{ filter: "drop-shadow(0 0 4px rgba(0,0,0,0.3))" }} />
          <circle cx={dot.x} cy={dot.y} r={4} fill={region.color} />

          {/* Region labels */}
          {REGIONS.map(r => {
            const n  = r.pts.length;
            const ac = r.pts.reduce((s, p) => s + p[0], 0) / n;
            const as = r.pts.reduce((s, p) => s + p[1], 0) / n;
            const aa = r.pts.reduce((s, p) => s + p[2], 0) / n;
            const lp = triXY(ac, as, aa, CX, CY, SIZE);
            const words = r.name.split(" ");
            return (
              <g key={`lbl-${r.name}`} style={{ pointerEvents: "none" }}>
                {words.map((w, i) => (
                  <text
                    key={i}
                    x={lp.x}
                    y={lp.y + (i - (words.length - 1) / 2) * 12}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="bold"
                    fill="white"
                    style={{ textShadow: "0 0 4px rgba(0,0,0,0.8)" }}
                    paintOrder="stroke"
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth="3"
                  >
                    {w}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>

        {/* Info Panel */}
        <div style={{ width: "210px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "10px" }}>

          {/* Classification */}
          <div style={{
            background: "white",
            border: `2.5px solid ${region.color}`,
            borderRadius: "6px",
            padding: "14px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}>
            <div style={{ fontSize: "9px", color: "#7a6a50", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
              Texture Class
            </div>
            <div style={{ fontSize: "19px", fontWeight: "bold", color: region.color, marginBottom: "10px" }}>
              {className}
            </div>
            {[
              { label: "Clay",  val: pt.clay,  color: region.color },
              { label: "Silt",  val: pt.silt,  color: "#3a7a7a" },
              { label: "Sand",  val: pt.sand,  color: "#b89030" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ marginBottom: "7px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "10px", color: "#555" }}>{label}</span>
                  <span style={{ fontSize: "10px", fontWeight: "bold", color }}>{Math.round(val * 100)}%</span>
                </div>
                <div style={{ background: "#ece8e0", borderRadius: "3px", height: "6px", overflow: "hidden" }}>
                  <div style={{
                    width: `${val * 100}%`, height: "100%", background: color,
                    borderRadius: "3px", transition: "width 0.08s linear",
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Sliders */}
          <div style={{
            background: "white", border: "1px solid #d0c8b8",
            borderRadius: "6px", padding: "12px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ fontSize: "9px", color: "#7a6a50", textTransform: "uppercase", letterSpacing: "1px" }}>
                Adjust Composition
              </div>
              {lockedCount === 2 && (
                <div style={{ fontSize: "8px", color: "#2a7a2a", fontWeight: "bold", background: "#e8f5e8", padding: "2px 5px", borderRadius: "3px" }}>
                  AUTO
                </div>
              )}
            </div>
            {[
              { key: "clay", label: "Clay %",  color: region.color  },
              { key: "silt", label: "Silt %",  color: "#3a7a7a"     },
              { key: "sand", label: "Sand %",  color: "#b89030"     },
            ].map(({ key, label, color }) => {
              const isLocked  = locks[key];
              const isAuto    = lockedCount === 2 && !isLocked;
              const canLock   = lockedCount < 2 || isLocked;
              const val       = Math.round(pt[key] * 100);
              return (
                <div key={key} style={{ marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px" }}>
                    {/* Lock button */}
                    <button
                      onClick={() => toggleLock(key)}
                      title={isAuto ? "Auto-calculated" : isLocked ? "Click to unlock" : canLock ? "Click to lock" : "Unlock another first"}
                      style={{
                        width: "18px", height: "18px", border: "none", cursor: isAuto ? "default" : canLock ? "pointer" : "not-allowed",
                        borderRadius: "3px", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center",
                        background: isLocked ? "#2a7a2a" : isAuto ? "#e0e0e0" : "#f0ece4",
                        color: isLocked ? "white" : "#888",
                        flexShrink: 0, padding: 0,
                        opacity: (!canLock && !isLocked) ? 0.4 : 1,
                      }}
                    >
                      {isLocked ? "🔒" : isAuto ? "=" : "🔓"}
                    </button>
                    <span style={{ fontSize: "10px", color: isAuto ? "#999" : "#555", flex: 1 }}>{label}</span>
                    {/* Number input */}
                    <input
                      type="number" min="0" max="100"
                      value={inputVals[key]}
                      disabled={isAuto}
                      onChange={e => handleNumberInput(key, e.target.value)}
                      onBlur={() => handleNumberCommit(key)}
                      onKeyDown={e => e.key === "Enter" && handleNumberCommit(key)}
                      style={{
                        width: "44px", fontSize: "10px", fontWeight: "bold",
                        color: isAuto ? "#999" : color,
                        border: `1px solid ${isAuto ? "#ddd" : color + "88"}`,
                        borderRadius: "3px", padding: "1px 4px",
                        background: isAuto ? "#f5f5f5" : "white",
                        textAlign: "right", outline: "none",
                        MozAppearance: "textfield",
                      }}
                    />
                    <span style={{ fontSize: "9px", color: isAuto ? "#bbb" : "#888" }}>%</span>
                  </div>
                  <input
                    type="range" min="0" max="100" value={val}
                    disabled={isAuto}
                    onChange={e => handleSlider(key, Number(e.target.value))}
                    style={{
                      width: "100%", accentColor: isAuto ? "#ccc" : color,
                      cursor: isAuto ? "default" : "pointer",
                      opacity: isAuto ? 0.4 : 1,
                    }}
                  />
                </div>
              );
            })}
            {lockedCount === 2 && (
              <div style={{ fontSize: "9px", color: "#7a6a50", fontStyle: "italic", borderTop: "1px solid #ece8e0", paddingTop: "6px", marginTop: "2px" }}>
                Adjust the two locked sliders — third updates automatically
              </div>
            )}
            {lockedCount < 2 && (
              <div style={{ fontSize: "9px", color: "#b0a890", fontStyle: "italic", borderTop: "1px solid #ece8e0", paddingTop: "6px", marginTop: "2px" }}>
                🔒 Lock 2 sliders to auto-calculate the third
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{
            background: "white", border: "1px solid #d0c8b8",
            borderRadius: "6px", padding: "12px",
          }}>
            <div style={{ fontSize: "9px", color: "#7a6a50", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
              Classes
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {REGIONS.map(r => (
                <div
                  key={r.name}
                  onClick={() => {
                    // Find centroid of region and jump dot there
                    const n  = r.pts.length;
                    const c  = r.pts.reduce((s, p) => s + p[0], 0) / n;
                    const si = r.pts.reduce((s, p) => s + p[1], 0) / n;
                    const sa = r.pts.reduce((s, p) => s + p[2], 0) / n;
                    const tot = c + si + sa;
                    setPt({ clay: c/tot, silt: si/tot, sand: sa/tot });
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    cursor: "pointer", borderRadius: "3px",
                    padding: "2px 4px",
                    background: className === r.name ? `${r.color}22` : "transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={() => setHover(r.name)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div style={{ width: "11px", height: "11px", background: r.color, borderRadius: "2px", flexShrink: 0 }} />
                  <span style={{
                    fontSize: "10px",
                    fontWeight: className === r.name ? "bold" : "normal",
                    color: className === r.name ? r.color : "#444",
                  }}>{r.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "12px", fontSize: "9px", color: "#aaa", fontStyle: "italic" }}>
        USDA NRCS soil texture triangle · click legend items to jump to class centroid
      </div>
    </div>
  );
}
