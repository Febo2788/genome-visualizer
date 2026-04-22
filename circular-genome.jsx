// Circular genome renderer — SVG. Real geometry, not placeholder.
// All radii/thicknesses are fractions of the canvas radius (0–1).

const TAU = Math.PI * 2;

// Convert bp to angle. 12 o'clock = 0 bp, clockwise.
function bpToAngle(bp, genomeLen) {
  return (bp / genomeLen) * TAU - Math.PI / 2;
}

function polar(cx, cy, r, angle) {
  return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
}

// Arc path (large-arc-flag aware)
function arcPath(cx, cy, r, a0, a1, sweep = 1) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const delta = a1 - a0;
  const large = Math.abs(delta) > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}

// Annular segment between two radii, two angles
function annularSegment(cx, cy, rIn, rOut, a0, a1) {
  const [x0o, y0o] = polar(cx, cy, rOut, a0);
  const [x1o, y1o] = polar(cx, cy, rOut, a1);
  const [x0i, y0i] = polar(cx, cy, rIn, a0);
  const [x1i, y1i] = polar(cx, cy, rIn, a1);
  const delta = a1 - a0;
  const large = Math.abs(delta) > Math.PI ? 1 : 0;
  return (
    `M ${x0o} ${y0o} ` +
    `A ${rOut} ${rOut} 0 ${large} 1 ${x1o} ${y1o} ` +
    `L ${x1i} ${y1i} ` +
    `A ${rIn} ${rIn} 0 ${large} 0 ${x0i} ${y0i} Z`
  );
}

// Arrow-shaped feature (annular segment with a pointed head) — head faces direction of strand
function featureArrow(cx, cy, rIn, rOut, a0, a1, strand, headFrac = 0.35, capPx = 0.012) {
  // Clip head length so it never exceeds the arc length
  const arcLen = Math.abs(a1 - a0);
  const headAng = Math.min(arcLen * headFrac, capPx);
  if (arcLen < 0.0008) {
    // degenerate — draw tiny triangle
    return annularSegment(cx, cy, rIn, rOut, a0, a1);
  }

  const rMid = (rIn + rOut) / 2;
  let tailStart, tailEnd, tip;
  if (strand >= 0) {
    // head at a1 end
    tailStart = a0;
    tailEnd = a1 - headAng;
    tip = a1;
  } else {
    // head at a0 end
    tailStart = a0 + headAng;
    tailEnd = a1;
    tip = a0;
  }

  const [pTailStartO_x, pTailStartO_y] = polar(cx, cy, rOut, tailStart);
  const [pTailEndO_x, pTailEndO_y]     = polar(cx, cy, rOut, tailEnd);
  const [pTipX, pTipY]                 = polar(cx, cy, rMid, tip);
  const [pTailEndI_x, pTailEndI_y]     = polar(cx, cy, rIn, tailEnd);
  const [pTailStartI_x, pTailStartI_y] = polar(cx, cy, rIn, tailStart);

  const tailArcLen = Math.abs(tailEnd - tailStart);
  const large = tailArcLen > Math.PI ? 1 : 0;

  if (strand >= 0) {
    return (
      `M ${pTailStartO_x} ${pTailStartO_y} ` +
      `A ${rOut} ${rOut} 0 ${large} 1 ${pTailEndO_x} ${pTailEndO_y} ` +
      `L ${pTipX} ${pTipY} ` +
      `L ${pTailEndI_x} ${pTailEndI_y} ` +
      `A ${rIn} ${rIn} 0 ${large} 0 ${pTailStartI_x} ${pTailStartI_y} Z`
    );
  } else {
    return (
      `M ${pTipX} ${pTipY} ` +
      `L ${pTailStartO_x} ${pTailStartO_y} ` +
      `A ${rOut} ${rOut} 0 ${large} 1 ${pTailEndO_x} ${pTailEndO_y} ` +
      `L ${pTailEndI_x} ${pTailEndI_y} ` +
      `A ${rIn} ${rIn} 0 ${large} 0 ${pTailStartI_x} ${pTailStartI_y} Z`
    );
  }
}

// ============================================================
// Tick marks for coordinate ruler
// ============================================================
function RulerTrack({ cx, cy, baseR, thickness, genomeLen, color, inside = false }) {
  const rIn = baseR;
  const rOut = baseR + thickness;

  // Dynamically determine tick intervals based on genome size
  const determineTickIntervals = (len) => {
    if (len < 10000) return { minor: 1000, major: 5000 }; // < 10 kb
    if (len < 100000) return { minor: 10000, major: 50000 }; // < 100 kb
    if (len < 1000000) return { minor: 50000, major: 250000 }; // < 1 Mb
    if (len < 5000000) return { minor: 100000, major: 500000 }; // < 5 Mb
    return { minor: 500000, major: 2000000 }; // > 5 Mb
  };
  const { minor: minorInterval, major: majorInterval } = determineTickIntervals(genomeLen);

  const majors = [];
  const minors = [];
  for (let bp = 0; bp < genomeLen; bp += minorInterval) {
    const a = bpToAngle(bp, genomeLen);
    const isMajor = bp % majorInterval === 0;
    const tickOut = isMajor ? rOut + 0.018 : rOut + 0.008;
    const [x0, y0] = polar(cx, cy, rOut, a);
    const [x1, y1] = polar(cx, cy, tickOut, a);
    (isMajor ? majors : minors).push(
      <line key={bp} x1={x0} y1={y0} x2={x1} y2={y1}
            stroke={color} strokeWidth={isMajor ? 0.002 : 0.001} />
    );
  }

  const labels = [];
  for (let bp = 0; bp < genomeLen; bp += majorInterval) {
    const a = bpToAngle(bp, genomeLen);
    const [lx, ly] = polar(cx, cy, rOut + 0.035, a);
    const rotDeg = (a * 180) / Math.PI + 90;
    const flip = rotDeg > 90 && rotDeg < 270;
    if (bp === 0) continue;
    const useMb = genomeLen >= 1e6;
    const labelText = useMb
      ? `${(bp / 1e6).toFixed(bp % 1e6 === 0 ? 0 : 1)} Mb`
      : `${(bp / 1e3).toFixed(0)} kb`;
    labels.push(
      <text key={`lbl-${bp}`} x={lx} y={ly}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={0.022} fontFamily="'IBM Plex Mono', monospace"
            fill={color}
            transform={`rotate(${flip ? rotDeg + 180 : rotDeg} ${lx} ${ly})`}>
        {labelText}
      </text>
    );
  }

  return (
    <g>
      <circle cx={cx} cy={cy} r={rIn} fill="none" stroke={color} strokeWidth={0.0015} />
      <circle cx={cx} cy={cy} r={rOut} fill="none" stroke={color} strokeWidth={0.0015} />
      {minors}
      {majors}
      {labels}
    </g>
  );
}

// ============================================================
// CDS arrows track — filtered by strand and source track ID
// ============================================================
function CDSTrack({ cx, cy, baseR, thickness, features, strand, genomeLen, colorMap, onHover, onClick, hoveredId, trackId }) {
  const rIn = baseR;
  const rOut = baseR + thickness;
  // Filter by strand AND by track ID prefix (so imported/genbank tracks only show their own features)
  const filtered = features.filter(f => f.strand === strand && (!trackId || f.id.startsWith(trackId)));
  return (
    <g>
      {filtered.map(f => {
        const a0 = bpToAngle(f.start, genomeLen);
        const a1 = bpToAngle(f.end, genomeLen);
        const color = colorMap[f.category] || "#888";
        const isHovered = hoveredId === f.id;
        return (
          <path
            key={f.id}
            d={featureArrow(cx, cy, rIn, rOut, a0, a1, strand)}
            fill={color}
            stroke={isHovered ? "#1A1A1A" : "none"}
            strokeWidth={isHovered ? 0.002 : 0}
            opacity={isHovered ? 1 : 0.92}
            onMouseEnter={() => onHover && onHover(f)}
            onMouseLeave={() => onHover && onHover(null)}
            onClick={() => onClick && onClick(f)}
            style={{ cursor: 'pointer', transition: 'opacity 120ms' }}
          />
        );
      })}
    </g>
  );
}

// ============================================================
// BLAST ring — BRIG-style presence/absence ring.
// Solid wherever there's a hit, gap where absent. Color intensity by identity.
// ============================================================
function BlastRingTrack({ cx, cy, baseR, thickness, segments, color, genomeLen, opacity = 1 }) {
  const rIn = baseR;
  const rOut = baseR + thickness;
  return (
    <g opacity={opacity}>
      {/* faint backing so gaps are visible */}
      <path d={annularSegment(cx, cy, rIn, rOut, 0, TAU - 0.0001)}
            fill={color} opacity={0.08} />
      {segments.map((s, i) => {
        let a0 = bpToAngle(s.start, genomeLen);
        let a1 = bpToAngle(s.end, genomeLen);
        // If this is a full-circle segment, reduce end slightly to avoid SVG arc issues
        if (Math.abs(a1 - a0) >= TAU - 0.001) {
          a1 = a0 + TAU - 0.0001;
        }
        // identity 0..1.0 → opacity 0.1..1.0 (0% = white, 100% = solid)
        const op = 0.1 + (s.identity * 0.9);
        return <path key={i} d={annularSegment(cx, cy, rIn, rOut, a0, a1)}
                     fill={color} opacity={op} />;
      })}
    </g>
  );
}

// ============================================================
// VCF track — variants as lollipops (SNP/INS/DEL) and arcs (SV)
// ============================================================
function VCFTrack({ cx, cy, baseR, thickness, variants, genomeLen, hoveredId, onHover, onClick }) {
  const rIn = baseR;
  const rOut = baseR + thickness;
  const VCF_COLORS = { SNP: '#5B8AA6', INS: '#7FA876', DEL: '#B67777', SV: '#8878A8' };

  return (
    <g>
      {variants.map(v => {
        const color = VCF_COLORS[v.varType] || '#999';
        const isHovered = hoveredId === v.id;
        const strokeWidth = isHovered ? 0.0025 : 0.0015;
        const angle = bpToAngle(v.pos, genomeLen);

        if (v.varType === 'SV') {
          // Draw quadratic bezier arc from pos to end
          const angleEnd = bpToAngle(v.end, genomeLen);
          const [x0, y0] = polar(cx, cy, rOut, angle);
          const [x1, y1] = polar(cx, cy, rOut, angleEnd);
          const midAngle = (angle + angleEnd) / 2;
          const [xMid, yMid] = polar(cx, cy, rOut + 0.02, midAngle);

          const pathD = `M ${x0} ${y0} Q ${xMid} ${yMid} ${x1} ${y1}`;
          return (
            <path key={v.id}
                  d={pathD}
                  stroke={color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  opacity={isHovered ? 1 : 0.7}
                  onMouseEnter={() => onHover(v)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onClick(v)}
                  style={{ cursor: 'pointer' }} />
          );
        } else {
          // SNP/INS/DEL: vertical lollipop
          const [tipX, tipY] = polar(cx, cy, rOut, angle);
          const [baseX, baseY] = polar(cx, cy, rIn, angle);

          return (
            <g key={v.id}
               onMouseEnter={() => onHover(v)}
               onMouseLeave={() => onHover(null)}
               onClick={() => onClick(v)}
               style={{ cursor: 'pointer' }}>
              <line x1={baseX} y1={baseY} x2={tipX} y2={tipY}
                    stroke={color} strokeWidth={strokeWidth}
                    opacity={isHovered ? 1 : 0.7} />
              <circle cx={tipX} cy={tipY} r={isHovered ? 0.0035 : 0.0025}
                      fill={color} opacity={isHovered ? 1 : 0.8} />
            </g>
          );
        }
      })}
    </g>
  );
}

// ============================================================
// Simple feature track (RNA, mobile elements) — just filled segments
// ============================================================
function SegmentTrack({ cx, cy, baseR, thickness, features, color, genomeLen }) {
  const rIn = baseR;
  const rOut = baseR + thickness;
  return (
    <g>
      {features.map(f => {
        const a0 = bpToAngle(f.start, genomeLen);
        const a1 = bpToAngle(f.end, genomeLen);
        return (
          <path key={f.id} d={annularSegment(cx, cy, rIn, rOut, a0, a1)}
                fill={color} opacity={0.9} />
        );
      })}
    </g>
  );
}

// ============================================================
// GC content — per-window wedge from midline outward/inward
// ============================================================
function GCTrack({ cx, cy, baseR, thickness, values, color, genomeLen }) {
  // Calculate mean from actual values if not explicitly provided
  const mean = values.length > 0
    ? values.reduce((a, b) => a + b, 0) / values.length
    : 0.5;

  const rIn = baseR;
  const rOut = baseR + thickness;
  const rMid = (rIn + rOut) / 2;
  const n = values.length;
  const wedges = [];
  for (let i = 0; i < n; i++) {
    const a0 = bpToAngle((i / n) * genomeLen, genomeLen);
    const a1 = bpToAngle(((i + 1) / n) * genomeLen, genomeLen);
    const dev = Math.max(-1, Math.min(1, (values[i] - mean) / 0.08));
    const h = dev * (thickness / 2);
    const rA = h >= 0 ? rMid : rMid + h;
    const rB = h >= 0 ? rMid + h : rMid;
    if (Math.abs(h) < 0.0001) continue;
    wedges.push(
      <path key={i} d={annularSegment(cx, cy, rA, rB, a0, a1)}
            fill={color} opacity={0.85} />
    );
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={rIn} fill="none" stroke="#D9D4C7" strokeWidth={0.001} />
      <circle cx={cx} cy={cy} r={rOut} fill="none" stroke="#D9D4C7" strokeWidth={0.001} />
      <circle cx={cx} cy={cy} r={rMid} fill="none" stroke="#C8C3B4" strokeWidth={0.0008} strokeDasharray="0.004 0.004" />
      {wedges}
    </g>
  );
}

// ============================================================
// GC skew — two colors above/below baseline
// ============================================================
function GCSkewTrack({ cx, cy, baseR, thickness, values, posColor, negColor, genomeLen }) {
  const rIn = baseR;
  const rOut = baseR + thickness;
  const rMid = (rIn + rOut) / 2;

  // Calculate normalization factor from actual data range
  const absValues = values.map(v => Math.abs(v));
  const maxAbsValue = absValues.length > 0 ? Math.max(...absValues) : 0.5;
  const normFactor = maxAbsValue > 0 ? maxAbsValue : 0.5;

  const n = values.length;
  const wedges = [];
  for (let i = 0; i < n; i++) {
    const a0 = bpToAngle((i / n) * genomeLen, genomeLen);
    const a1 = bpToAngle(((i + 1) / n) * genomeLen, genomeLen);
    const v = values[i];
    const dev = Math.max(-1, Math.min(1, v / normFactor));
    const h = dev * (thickness / 2);
    if (Math.abs(h) < 0.0001) continue;
    const rA = h >= 0 ? rMid : rMid + h;
    const rB = h >= 0 ? rMid + h : rMid;
    wedges.push(
      <path key={i} d={annularSegment(cx, cy, rA, rB, a0, a1)}
            fill={v >= 0 ? posColor : negColor} opacity={0.85} />
    );
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={rMid} fill="none" stroke="#C8C3B4" strokeWidth={0.0008} strokeDasharray="0.004 0.004" />
      {wedges}
    </g>
  );
}

// ============================================================
// BED / coverage track — outward bars from inner radius
// ============================================================
function BEDTrack({ cx, cy, baseR, thickness, values, color, bg, genomeLen }) {
  const rIn = baseR;
  const rOut = baseR + thickness;
  // draw as stacked thin wedges
  const n = values.length;
  const bars = [];
  for (let i = 0; i < n; i++) {
    const a0 = bpToAngle((i / n) * genomeLen, genomeLen);
    const a1 = bpToAngle(((i + 1) / n) * genomeLen, genomeLen);
    const h = values[i] * thickness;
    bars.push(
      <path key={i} d={annularSegment(cx, cy, rIn, rIn + h, a0, a1)}
            fill={color} opacity={0.85} />
    );
  }
  return (
    <g>
      <path d={annularSegment(cx, cy, rIn, rOut, 0, TAU - 0.0001)}
            fill={bg || "#EFEBE1"} opacity={0.7} />
      {bars}
    </g>
  );
}

// ============================================================
// Gene labels — curated, UPRIGHT always, with leader lines.
// De-overlap: push angularly so labels never stack on top of each other.
// ============================================================
function LabelsTrack({ cx, cy, baseR, labels, genomeLen, color, autoR }) {
  const effectiveR = autoR !== undefined ? autoR : baseR;

  // Push labels further out so they sit clearly above all visible tracks,
  // not kissing them. Each label has a leader from the track edge out to
  // its de-overlapped position.
  const labelR = effectiveR + 0.08;
  // Desired min angular separation (in radians). At ~labelR radius this
  // corresponds to roughly the height of the text label.
  const minAngular = 0.085 / labelR;
  const sorted = labels.map(l => {
    const a = bpToAngle(l.position, genomeLen);
    return { ...l, a, da: a };
  }).sort((x, y) => x.a - y.a);

  for (let iter = 0; iter < 120; iter++) {
    let moved = false;
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const b = sorted[(i + 1) % sorted.length];
      let gap = b.da - a.da;
      if (i === sorted.length - 1) gap += Math.PI * 2;
      if (gap < minAngular) {
        const push = (minAngular - gap) / 2 + 0.0001;
        a.da -= push;
        b.da += push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return (
    <g>
      {sorted.map((lbl) => {
        const aAnchor = lbl.a;
        const aDodged = lbl.da;
        // Leader from OUTSIDE the outer track edge to the label anchor point.
        const [x0, y0] = polar(cx, cy, effectiveR + 0.005, aAnchor);
        const [x1, y1] = polar(cx, cy, effectiveR + 0.04, aAnchor);
        const [xk, yk] = polar(cx, cy, effectiveR + 0.07, aDodged);
        // Text placement: anchor based on angular position so labels don't
        // slice back through the rings on left/right sides.
        const cosA = Math.cos(aDodged);
        const isRight = cosA > 0.12;   // clearly right half → left-anchor
        const isLeft  = cosA < -0.12;  // clearly left half  → right-anchor
        const anchorMode = isRight ? 'start' : isLeft ? 'end' : 'middle';
        // Push text further on sides so leader has room
        const textOffset = (isRight || isLeft) ? 0.092 : 0.085;
        const [tx, ty] = polar(cx, cy, effectiveR + textOffset, aDodged);
        return (
          <g key={lbl.name}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={lbl.color || color} strokeWidth={0.0012} />
            <line x1={x1} y1={y1} x2={xk} y2={yk} stroke={lbl.color || color} strokeWidth={0.0008} opacity={0.6} />
            {/* UPRIGHT label — no rotation, always readable */}
            <text x={tx} y={ty}
                  textAnchor={anchorMode} dominantBaseline="middle"
                  fontSize={0.022} fontFamily="'IBM Plex Sans', sans-serif"
                  fontStyle={lbl.italic ? "italic" : "normal"}
                  fontWeight={lbl.bold ? 700 : 500}
                  fill={lbl.color || color}>
              {lbl.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ============================================================
// Main circular genome SVG
// ============================================================
function CircularGenome({
  tracks, features, gcContent, gcSkew, coverage, labels,
  genomeLen, genomeName, accession,
  hoveredId, setHoveredId, setSelectedFeature,
  highlights = [],
  zoom = 1, panX = 0, panY = 0,
  onViewChange,
}) {
  // Ensure values are never null/undefined
  const safeZoom = zoom ?? 1;
  const safePanX = panX ?? 0;
  const safePanY = panY ?? 0;

  // We use a 1×1 coordinate system centered at (0.5, 0.5). Expanded viewBox gives headroom for outer rings.
  const cx = 0.5, cy = 0.5;
  const svgRef = React.useRef(null);
  const panState = React.useRef(null);

  const onWheel = (e) => {
    if (!onViewChange) return;
    try {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.max(0.5, Math.min(8, safeZoom * factor));
      onViewChange({ zoom: newZoom, panX: safePanX, panY: safePanY });
    } catch (err) {
      console.warn('[Gyre] Wheel event error:', err);
    }
  };

  const onMouseDown = (e) => {
    try {
      panState.current = { startX: e.clientX, startY: e.clientY, panX: safePanX, panY: safePanY };
    } catch (err) {
      console.warn('[Gyre] Mouse down error:', err);
    }
  };
  const onMouseMove = (e) => {
    if (!panState.current || !onViewChange) return;
    try {
      const dx = (e.clientX - panState.current.startX) / (svgRef.current?.clientWidth || 800);
      const dy = (e.clientY - panState.current.startY) / (svgRef.current?.clientHeight || 800);
      const newPanX = (panState.current.panX ?? 0) + dx;
      const newPanY = (panState.current.panY ?? 0) + dy;
      onViewChange({ zoom: safeZoom, panX: newPanX, panY: newPanY });
    } catch (err) {
      console.warn('[Gyre] Mouse move error:', err);
    }
  };
  const endPan = () => { panState.current = null; };

  // Highlight regions (wedges spanning from center out through all track rings)
  const highlightEls = highlights.map((h, i) => {
    const a0 = bpToAngle(h.start, genomeLen);
    const a1 = bpToAngle(h.end, genomeLen);
    return (
      <path key={i}
            d={annularSegment(cx, cy, 0.14, 0.90, a0, a1)}
            fill={h.color} opacity={h.opacity ?? 0.18} />
    );
  });

  return (
    <svg ref={svgRef} viewBox="-0.18 -0.18 1.36 1.36"
         style={{ width: '100%', height: '100%', display: 'block',
                  cursor: panState.current ? 'grabbing' : 'grab',
                  touchAction: 'none', userSelect: 'none' }}
         onWheel={onWheel}
         onMouseDown={onMouseDown}
         onMouseMove={onMouseMove}
         onMouseUp={endPan}
         onMouseLeave={endPan}
         preserveAspectRatio="xMidYMid meet">
      <g transform={`translate(${safePanX} ${safePanY}) translate(${cx} ${cy}) scale(${safeZoom}) translate(${-cx} ${-cy})`}>
      {/* soft paper background */}
      <defs>
        <radialGradient id="paper" cx="0.5" cy="0.5" r="0.7">
          <stop offset="0%" stopColor="#FDFBF6" />
          <stop offset="100%" stopColor="#F5F1E6" />
        </radialGradient>
      </defs>

      {/* inner cartouche */}
      <circle cx={cx} cy={cy} r={0.14} fill="url(#paper)" stroke="#E5DFCF" strokeWidth={0.0012} />

      {/* Genome title in the middle — single line, scaled to fit the cartouche */}
      {(() => {
        // Pick a font size so the whole name fits inside the inner cartouche (r=0.14).
        // We have roughly 0.24 units of horizontal room (with margin for the accession line below).
        const nameLen = genomeName.length;
        const titleSize = Math.min(0.028, 0.22 / Math.max(6, nameLen * 0.55));
        return (
          <text x={cx} y={cy - 0.005} textAnchor="middle"
                fontSize={titleSize} fontWeight={600}
                fontFamily="'IBM Plex Sans', sans-serif"
                fill="#1A1A1A" fontStyle="italic">
            {genomeName}
          </text>
        );
      })()}
      <text x={cx} y={cy + 0.035} textAnchor="middle"
            fontSize={0.014}
            fontFamily="'IBM Plex Mono', monospace"
            fill="#6A6A6A">
        {accession}
      </text>
      <text x={cx} y={cy + 0.055} textAnchor="middle"
            fontSize={0.013}
            fontFamily="'IBM Plex Mono', monospace"
            fill="#6A6A6A">
        {(genomeLen / 1000).toFixed(0).toLocaleString()},{String(genomeLen).slice(-3)} bp
      </text>

      {/* highlights behind tracks */}
      {highlightEls}

      {/* render each visible track in order (inner → outer) */}
      {(() => {
        const vis = tracks.filter(t => t.visible);
        // Outermost non-label top (r + half thickness) — labels auto-push above this
        const maxTop = Math.max(
          0,
          ...vis.filter(t => t.type !== 'labels')
                .map(t => (t.radius || 0) + (t.thickness || 0) / 2)
        );
        const labelAutoR = maxTop + 0.04;
        return vis.map(t => {
        if (t.type === 'ruler') {
          return <RulerTrack key={t.id} cx={cx} cy={cy} baseR={t.radius} thickness={t.thickness}
                             genomeLen={genomeLen} color={t.color} />;
        }
        if (t.type === 'gc') {
          return <GCTrack key={t.id} cx={cx} cy={cy} baseR={t.radius} thickness={t.thickness}
                           values={gcContent} color={t.color} genomeLen={genomeLen} />;
        }
        if (t.type === 'gc-skew') {
          return <GCSkewTrack key={t.id} cx={cx} cy={cy} baseR={t.radius} thickness={t.thickness}
                               values={gcSkew} posColor={t.posColor} negColor={t.negColor} genomeLen={genomeLen} />;
        }
        if (t.type === 'bed') {
          return <BEDTrack key={t.id} cx={cx} cy={cy} baseR={t.radius} thickness={t.thickness}
                            values={coverage} color={t.color} bg={t.bg} genomeLen={genomeLen} />;
        }
        if (t.type === 'bedgraph') {
          const bg = (window.USER_BEDGRAPHS && window.USER_BEDGRAPHS[t.id]) || { values: [] };
          return <BEDTrack key={t.id} cx={cx} cy={cy} baseR={t.radius} thickness={t.thickness}
                            values={bg.values} color={t.color} bg={t.bg} genomeLen={genomeLen} />;
        }
        if (t.type === 'cds') {
          const colorMap = Object.fromEntries(
            Object.entries(FEATURE_CATEGORIES).map(([k, v]) => [k, v.color])
          );
          return <CDSTrack key={t.id} cx={cx} cy={cy} baseR={t.radius} thickness={t.thickness}
                            features={features} strand={t.strand} genomeLen={genomeLen}
                            colorMap={colorMap}
                            hoveredId={hoveredId}
                            onHover={f => setHoveredId(f ? f.id : null)}
                            onClick={f => setSelectedFeature(f)}
                            trackId={t.userImported ? t.id.split('-').slice(0, -1).join('-') : null} />;
        }
        if (t.type === 'rna') {
          return <SegmentTrack key={t.id} cx={cx} cy={cy} baseR={t.radius} thickness={t.thickness}
                                features={features.filter(f => f.category === 'RNA')}
                                color={t.color} genomeLen={genomeLen} />;
        }
        if (t.type === 'mobile') {
          return <SegmentTrack key={t.id} cx={cx} cy={cy} baseR={t.radius} thickness={t.thickness}
                                features={features.filter(f => f.category === 'Mobile elements')}
                                color={t.color} genomeLen={genomeLen} />;
        }
        if (t.type === 'blast-ring') {
          const segments = (window.BLAST_RINGS && window.BLAST_RINGS[t.ringId]) || [];
          return <BlastRingTrack key={t.id} cx={cx} cy={cy} baseR={t.radius} thickness={t.thickness}
                                  segments={segments} color={t.color} genomeLen={genomeLen}
                                  opacity={t.opacity ?? 1} />;
        }
        if (t.type === 'vcf') {
          const variants = (window.USER_VCF && window.USER_VCF[t.id]) || [];
          return <VCFTrack key={t.id} cx={cx} cy={cy} baseR={t.radius} thickness={t.thickness}
                           variants={variants} genomeLen={genomeLen}
                           hoveredId={hoveredId} onHover={v => setHoveredId(v ? v.id : null)}
                           onClick={v => setSelectedFeature(v)} />;
        }
        if (t.type === 'labels') {
          return <LabelsTrack key={t.id} cx={cx} cy={cy} baseR={t.radius}
                               autoR={labelAutoR}
                               labels={labels} genomeLen={genomeLen} color={t.color} />;
        }
        return null;
      });
      })()}
      </g>
    </svg>
  );
}

Object.assign(window, { CircularGenome, bpToAngle, polar });
