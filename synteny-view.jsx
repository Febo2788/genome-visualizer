// Synteny view — N stacked linear genomes with BLAST ribbons between adjacent pairs.
// FIXES applied:
//  - Pan moves EVERYTHING (labels + left header block), like a PNG translation
//  - Midline thickness uses a sensible px-scaled value
//  - Labels overlay onto their row (forward top / reverse bottom) and de-overlap
//  - Ribbons flush to arrow edges (no stray label band at top)

function SyntenyView({
  genomeLen, features, labels,
  genomes,              // [{id, name, strain, color}, ...]
  synteny,              // [{from, to, pairs: [{a:[s,e], b:[s,e], identity, inverted}]}]
  hoveredId, setHoveredId, setSelectedFeature,
  paletteTick,

  // customizations
  config,
  syntenyLabels,
  syntenyHighlights,
  view,
  onViewChange,
  exportPreview,        // { width, height } — when set, container is fixed that size
  featuresMap,          // optional: {genomeId: features[]} for per-genome features
}) {
  const N = genomes.length;

  // vertical layout — no more label band at top; labels overlay the strip itself
  const headerH = 40;
  const rowH = 110;
  const ribbonH = 70;
  const totalH = headerH + N * rowH + (N - 1) * ribbonH + 20;

  const { zoom = 1, panX = 0, panY = 0 } = view || {};
  const cfg = {
    forwardColor: '#5B8AA6',
    invertedColor: '#B67777',
    midlineColor: '#C8C3B4',
    midlineThickness: 1.2,
    ribbonOpacityMin: 0.15,
    ribbonOpacityMax: 0.55,
    ribbonInset: 0,
    ...config,
  };

  const scrollRef = React.useRef(null);
  const panState = React.useRef(null);

  const defaultView = { zoom: 1, panX: 0, panY: 0 };
  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const scale = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      onViewChange(v => { const s = v || defaultView; return { ...s, zoom: Math.max(0.5, Math.min(12, (s.zoom || 1) * scale)) }; });
    }
  };
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    panState.current = { x: e.clientX, y: e.clientY, panX, panY };
  };
  const onMouseMove = (e) => {
    if (!panState.current) return;
    const dx = e.clientX - panState.current.x;
    const dy = e.clientY - panState.current.y;
    onViewChange(v => { const s = v || defaultView; return { ...s, panX: panState.current.panX + dx, panY: panState.current.panY + dy }; });
  };
  const endPan = () => { panState.current = null; };

  const containerStyle = exportPreview
    ? { width: exportPreview.width, height: exportPreview.height, margin: '0 auto',
        background: UI.bg, border: `1px dashed ${UI.divider}`, position: 'relative', overflow: 'hidden' }
    : { width: '100%', height: '100%', position: 'relative', background: UI.bg, overflow: 'hidden' };

  return (
    <div style={containerStyle}>
      <div
        ref={scrollRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        style={{
          width: '100%', height: '100%',
          overflow: 'hidden',
          cursor: panState.current ? 'grabbing' : 'grab',
          userSelect: 'none',
          position: 'relative',
        }}
      >
        {/* Everything below this point translates together as one PNG-like unit */}
        <div style={{
          position: 'absolute', left: 0, top: 0,
          width: '100%',
          transform: `translate(${panX}px, ${panY}px)`,
          transformOrigin: '0 0',
          padding: '0 16px',
          boxSizing: 'border-box',
        }}>
          <div style={{ position: 'relative', width: '100%', minHeight: totalH }}>

            <div style={{ height: headerH, display: 'flex', alignItems: 'flex-end',
                          paddingBottom: 6 }}>
              <div style={{ fontSize: 11, fontFamily: FONT_MONO, color: UI.muted,
                             textTransform: 'uppercase', letterSpacing: 0.5 }}>
                BLAST comparison · {N} genomes · identity shown by opacity
              </div>
            </div>

            {genomes.map((g, i) => {
              const stripY = headerH + i * (rowH + ribbonH);
              const nextStripY = stripY + rowH + ribbonH;
              const pair = i < N - 1 ? synteny.find(s => s.from === i && s.to === i + 1) : null;
              return (
                <React.Fragment key={g.id}>
                  <GenomeStrip
                    genome={g}
                    genomeId={g.id}
                    features={featuresMap?.[g.id] || features}
                    labels={syntenyLabels[g.id] || []}
                    highlights={syntenyHighlights[g.id] || []}
                    genomeLen={g.length} y={stripY} height={rowH}
                    isRef={i === 0}
                    hoveredId={hoveredId} setHoveredId={setHoveredId}
                    setSelectedFeature={setSelectedFeature}
                    midlineColor={cfg.midlineColor}
                    midlineThickness={cfg.midlineThickness}
                    zoom={zoom}
                  />
                  {pair && (
                    <RibbonBand
                      pairs={pair.pairs}
                      yTop={stripY + rowH}
                      yBot={nextStripY}
                      genomeLen={genomeLen}
                      forwardColor={cfg.forwardColor}
                      invertedColor={cfg.invertedColor}
                      opacityMin={cfg.ribbonOpacityMin}
                      opacityMax={cfg.ribbonOpacityMax}
                      ribbonInset={cfg.ribbonInset}
                      ribbonStyle={cfg.ribbonStyle}
                      zoom={zoom}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
      {!exportPreview && <SyntenyZoomControls view={{ zoom, panX, panY }} setView={onViewChange} />}
    </div>
  );
}

const LEFT_PAD = 150;
const RIGHT_PAD = 20;
// Row-internal layout (px-ish fractions of rowH)
const FORWARD_TOP_FRAC = 0.30;
const FORWARD_BOT_FRAC = 0.47;
const MID_FRAC         = 0.50;
const REVERSE_TOP_FRAC = 0.53;
const REVERSE_BOT_FRAC = 0.70;

// ============================================================
// Single genome strip — arrows + midline + overlay labels (de-overlapped, never upside down)
// Ribbons attach at row top (y=0) and row bottom (y=rowH) — flush with arrow rows.
// For flush, we put the forward strand exactly at top edge and reverse at bottom.
// ============================================================
function GenomeStrip({
  genome, features, labels, highlights,
  genomeLen, y, height, isRef,
  hoveredId, setHoveredId, setSelectedFeature,
  midlineColor, midlineThickness,
  zoom,
  genomeId,
}) {
  const colorMap = Object.fromEntries(
    Object.entries(FEATURE_CATEGORIES).map(([k, v]) => [k, v.color])
  );

  const stripRef = React.useRef(null);
  const [stripW, setStripW] = React.useState(800);
  React.useEffect(() => {
    if (stripRef.current) {
      const ro = new ResizeObserver((entries) => {
        setStripW(entries[0].contentRect.width);
      });
      ro.observe(stripRef.current);
      return () => ro.disconnect();
    }
  }, []);

  // Make forward strand flush with top of row, reverse flush with bottom
  // So ribbons (which attach to row edges) reach the arrow outer edges exactly.
  const stripInnerW = Math.max(1, stripW);
  const pxPerFrac = stripInnerW * zoom; // horizontal px per fractional 0..1

  // Compute label positions in px (horizontal)
  const labelPx = labels.map(l => {
    const xFrac = l.position / genomeLen;
    return { ...l, xFrac, x: xFrac * pxPerFrac };
  });

  // De-overlap per row; forward labels bubble upward, reverse labels bubble downward
  const forwardLabels = labelPx.filter(l => (l.strand ?? 1) >= 0);
  const reverseLabels = labelPx.filter(l => (l.strand ?? 1) < 0);

  const labelBounds = [24, Math.max(40, stripInnerW * zoom) - 24];
  const dodgedForward = deoverlapLabels1D(forwardLabels, 72, labelBounds);
  const dodgedReverse = deoverlapLabels1D(reverseLabels, 72, labelBounds);

  // Pixel y-positions within strip
  const forwardTopPx = FORWARD_TOP_FRAC * height;
  const forwardBotPx = FORWARD_BOT_FRAC * height;
  const midPx        = MID_FRAC * height;
  const reverseTopPx = REVERSE_TOP_FRAC * height;
  const reverseBotPx = REVERSE_BOT_FRAC * height;

  // Label vertical positions — above forward / below reverse
  const fwdLabelY = 14; // at top of strip
  const revLabelY = height - 6;

  return (
    <div ref={stripRef} style={{ position: 'absolute', left: 0, right: 0, top: y, height }}>
      {/* Left label block — INSIDE the panned container, so it moves when you pan */}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: LEFT_PAD - 10,
        height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', gap: 2, paddingLeft: 4,
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 14, fontFamily: FONT_SANS, fontWeight: 600,
                      color: UI.ink, fontStyle: 'italic',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {genome.name}
        </div>
        <div style={{ fontSize: 11, fontFamily: FONT_MONO, color: UI.muted,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {genome.strain}
        </div>
        {isRef && (
          <div style={{ fontSize: 9, fontFamily: FONT_MONO, color: UI.accent,
                         textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 }}>
            Reference
          </div>
        )}
      </div>

      {/* SVG strip — use pixel coordinates so labels stay upright and at fixed size */}
      <svg
        width={stripInnerW}
        height={height}
        style={{
          position: 'absolute', left: LEFT_PAD,
          top: 0, overflow: 'visible', userSelect: 'none',
        }}>

        {/* Background band tint — confined to the ARROW zone only, so it
            doesn't sit over the strip's top/bottom edges where ribbons attach.
            (Previously ran y=0..height, which visually "cut off" ribbon ends.) */}
        <rect x={0} y={forwardTopPx} width={stripInnerW * zoom}
              height={reverseBotPx - forwardTopPx}
              fill={genome.color} opacity={0}
              pointerEvents="none" />

        {/* Highlights */}
        {highlights.map((h, i) => {
          const x0 = (h.start / genomeLen) * pxPerFrac;
          const x1 = (h.end / genomeLen) * pxPerFrac;
          return (
            <rect key={i} x={x0} y={0} width={x1 - x0} height={height}
                  fill={h.color} opacity={h.opacity ?? 0.18} />
          );
        })}

        {/* Midline — width in real pixels, not scaled fraction */}
        <line x1={0} y1={midPx} x2={stripInnerW * zoom} y2={midPx}
              stroke={midlineColor} strokeWidth={Math.max(0.2, midlineThickness)} />

        {/* CDS arrows — every 2nd feature, in pixel space */}
        {features.filter((_, j) => j % 2 === 0).map((f) => {
          try {
            const x0 = (f.start / genomeLen) * pxPerFrac;
            const x1 = (f.end / genomeLen) * pxPerFrac;
            const w = x1 - x0;
            const onFwd = f.strand > 0;
            const yT = onFwd ? forwardTopPx : reverseTopPx;
            const yB = onFwd ? forwardBotPx : reverseBotPx;
            const h = yB - yT;
            const head = Math.min(w * 0.5, 6);
            const d = onFwd
              ? `M ${x0} ${yT} L ${x1 - head} ${yT} L ${x1} ${yT + h/2} L ${x1 - head} ${yB} L ${x0} ${yB} Z`
              : `M ${x1} ${yT} L ${x0 + head} ${yT} L ${x0} ${yT + h/2} L ${x0 + head} ${yB} L ${x1} ${yB} Z`;
            const handleClick = () => {
              console.log('[GenomeStrip] Feature clicked:', { id: f.id, uniqueId: f.uniqueId, product: f.product, category: f.category });
              console.log('[GenomeStrip] Feature object:', f);
              setSelectedFeature(f);
            };
            return (
              <path key={f.uniqueId || f.id} d={d} fill={colorMap[f.category]}
                    opacity={hoveredId === f.id ? 1 : 0.85}
                    onMouseEnter={() => { console.log('[GenomeStrip] Hover:', f.id); setHoveredId(f.id); }}
                    onMouseLeave={() => { console.log('[GenomeStrip] Unhover:', f.id); setHoveredId(null); }}
                    onClick={handleClick}
                    style={{ cursor: 'pointer' }} />
            );
          } catch (err) {
            console.error('[GenomeStrip] Error rendering feature:', f, err);
            return null;
          }
        })}

        {/* Forward labels — anchored above forward strand (top of row) */}
        {dodgedForward.map((l, i) => {
          const x = l.dodgedX !== undefined ? l.dodgedX : l.x;
          const anchorX = l.x;
          // Leader from label to actual position
          return (
            <g key={`fl-${i}`}>
              <line x1={x} y1={fwdLabelY + 3} x2={anchorX} y2={forwardTopPx - 1}
                    stroke={l.color || '#1A1A1A'} strokeWidth={0.6} opacity={0.6} />
              <text x={x} y={fwdLabelY}
                    textAnchor="middle"
                    fontSize={11} fontStyle="italic"
                    fontFamily="'IBM Plex Sans', sans-serif" fontWeight={500}
                    fill={l.color || '#1A1A1A'}>
                {l.name}
              </text>
            </g>
          );
        })}

        {/* Reverse labels — anchored below reverse strand (bottom of row) */}
        {dodgedReverse.map((l, i) => {
          const x = l.dodgedX !== undefined ? l.dodgedX : l.x;
          const anchorX = l.x;
          return (
            <g key={`rl-${i}`}>
              <line x1={anchorX} y1={reverseBotPx + 1} x2={x} y2={revLabelY - 10}
                    stroke={l.color || '#1A1A1A'} strokeWidth={0.6} opacity={0.6} />
              <text x={x} y={revLabelY}
                    textAnchor="middle"
                    fontSize={11} fontStyle="italic"
                    fontFamily="'IBM Plex Sans', sans-serif" fontWeight={500}
                    fill={l.color || '#1A1A1A'}>
                {l.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ============================================================
// Ribbon band — connects genome[i] top to genome[i+1] bottom, flush.
// ============================================================
function RibbonBand({ pairs, yTop, yBot, genomeLen,
                     forwardColor, invertedColor,
                     opacityMin, opacityMax,
                     ribbonInset = 0,
                     ribbonStyle = 'curvy',
                     zoom }) {
  const height = yBot - yTop;
  const bandRef = React.useRef(null);
  const [bandW, setBandW] = React.useState(800);
  React.useEffect(() => {
    if (bandRef.current) {
      const ro = new ResizeObserver((entries) => {
        setBandW(entries[0].contentRect.width);
      });
      ro.observe(bandRef.current);
      return () => ro.disconnect();
    }
  }, []);

  const pxPerFrac = Math.max(1, bandW) * zoom;

  // IMPORTANT: ribbons must reach the arrow rows above and below.
  // Row internal fractions: forward bottom = 0.47 * prevRowH, reverse top = 0.53 * nextRowH.
  // Actually compute from row heights: rowH = 110 in current layout
  const rowH = 110;
  // `ribbonInset` (px) pushes ribbon attach points AWAY from arrow row edges
  // toward this band. At 0 ribbons kiss the arrow edges; larger values create
  // a visible gap from the midline/arrow.
  const yAttachTop = -(rowH - rowH * FORWARD_BOT_FRAC) + ribbonInset;
  const yAttachBot = height + rowH * REVERSE_TOP_FRAC   - ribbonInset;

  return (
    <svg ref={bandRef}
         width="100%"
         height={height}
         style={{
           position: 'absolute',
           left: LEFT_PAD,
           right: RIGHT_PAD,
           top: yTop,
           width: `calc(100% - ${LEFT_PAD + RIGHT_PAD}px)`,
           pointerEvents: 'none',
           userSelect: 'none',
           overflow: 'visible',
         }}>
      {pairs.map((p, i) => {
        const x0a = (p.a[0] / genomeLen) * pxPerFrac;
        const x1a = (p.a[1] / genomeLen) * pxPerFrac;
        const x0b = (p.b[0] / genomeLen) * pxPerFrac;
        const x1b = (p.b[1] / genomeLen) * pxPerFrac;
        const color = p.inverted ? invertedColor : forwardColor;
        const op = opacityMin + (p.identity - 0.7) / 0.3 * (opacityMax - opacityMin);
        const midY = (yAttachTop + yAttachBot) / 2;

        let d;
        if (p.inverted) {
          // Inverted: ribbon flips halfway through (visual rotation showing reversal)
          // Top: x0a to x1a
          // Bottom: x1b to x0b (reversed order shows the flip)
          if (ribbonStyle === 'straight') {
            d = `M ${x0a} ${yAttachTop} L ${x1b} ${yAttachBot} L ${x0b} ${yAttachBot} L ${x1a} ${yAttachTop} Z`;
          } else {
            // Curvy with flip: left side goes from x0a→x1b, right side goes from x1a→x0b
            d = `
              M ${x0a} ${yAttachTop}
              C ${x0a} ${midY}, ${x1b} ${midY}, ${x1b} ${yAttachBot}
              L ${x0b} ${yAttachBot}
              C ${x0b} ${midY}, ${x1a} ${midY}, ${x1a} ${yAttachTop}
              Z`;
          }
        } else {
          // Forward orientation: normal trapezoid/curve
          if (ribbonStyle === 'straight') {
            d = `M ${x0a} ${yAttachTop} L ${x0b} ${yAttachBot} L ${x1b} ${yAttachBot} L ${x1a} ${yAttachTop} Z`;
          } else {
            // Curvy (Bezier) — original style
            d = `
              M ${x0a} ${yAttachTop}
              C ${x0a} ${midY}, ${x0b} ${midY}, ${x0b} ${yAttachBot}
              L ${x1b} ${yAttachBot}
              C ${x1b} ${midY}, ${x1a} ${midY}, ${x1a} ${yAttachTop}
              Z`;
          }
        }
        return <path key={i} d={d} fill={color}
                     opacity={Math.max(opacityMin, Math.min(opacityMax, op))} />;
      })}
    </svg>
  );
}

// ============================================================
// De-overlap labels with a 1D force push (pixel coordinates).
// Each label gets a `dodgedX` that may differ from its anchor `x`.
// ============================================================
function deoverlapLabels1D(labels, minPx, bounds) {
  if (labels.length === 0) return [];
  const sorted = [...labels].sort((a, b) => a.x - b.x);
  sorted.forEach(l => { l.dodgedX = l.x; });
  for (let iter = 0; iter < 200; iter++) {
    let moved = false;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const gap = b.dodgedX - a.dodgedX;
      if (gap < minPx) {
        const push = (minPx - gap) / 2 + 0.001;
        a.dodgedX -= push;
        b.dodgedX += push;
        moved = true;
      }
    }
    // Clamp to bounds if provided, then re-resolve neighbors
    if (bounds) {
      const [lo, hi] = bounds;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].dodgedX < lo) { sorted[i].dodgedX = lo; moved = true; }
        if (sorted[i].dodgedX > hi) { sorted[i].dodgedX = hi; moved = true; }
      }
      // Forward pass: ensure min spacing after clamping left
      for (let i = 1; i < sorted.length; i++) {
        const need = sorted[i - 1].dodgedX + minPx;
        if (sorted[i].dodgedX < need) {
          sorted[i].dodgedX = need;
          moved = true;
        }
      }
      // Backward pass: ensure min spacing after clamping right
      for (let i = sorted.length - 2; i >= 0; i--) {
        const need = sorted[i + 1].dodgedX - minPx;
        if (sorted[i].dodgedX > need) {
          sorted[i].dodgedX = need;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return sorted;
}

// ============================================================
// Zoom controls for synteny view
// ============================================================
function SyntenyZoomControls({ view, setView }) {
  const safeView = view || { zoom: 1, panX: 0, panY: 0 };
  const btn = {
    width: 30, height: 30, padding: 0,
    background: UI.panel, border: `1px solid ${UI.border}`,
    color: UI.ink, fontSize: 14, fontFamily: FONT_MONO,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  return (
    <div style={{
      position: 'absolute', right: 16, bottom: 16,
      display: 'flex', flexDirection: 'column', gap: 2,
      background: UI.bg, borderRadius: 4, padding: 4,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      zIndex: 10,
    }}>
      <button style={btn} onClick={() => { const s = safeView || { zoom: 1, panX: 0, panY: 0 }; setView({ ...s, zoom: Math.min(12, s.zoom * 1.25) }); }}>+</button>
      <div style={{ fontSize: 9, fontFamily: FONT_MONO, color: UI.muted,
                     textAlign: 'center', padding: '2px 0' }}>
        {Math.round((safeView.zoom || 1) * 100)}%
      </div>
      <button style={btn} onClick={() => { const s = safeView || { zoom: 1, panX: 0, panY: 0 }; setView({ ...s, zoom: Math.max(0.5, s.zoom / 1.25) }); }}>−</button>
      <button style={{ ...btn, fontSize: 10 }}
              onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })} title="Reset">⟲</button>
    </div>
  );
}

Object.assign(window, {
  SyntenyView, GenomeStrip, RibbonBand,
  SyntenyZoomControls, deoverlapLabels1D,
});
