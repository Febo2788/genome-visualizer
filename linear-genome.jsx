// Linear genome view + synteny (two genomes stacked with BLAST ribbons)
// Same coord system idea: a rectangle in (0..1) x (0..1)

function LinearGenome({
  features, gcContent, gcSkew, coverage, labels,
  genomeLen, genomeName, accession,
  viewStart, viewEnd,
  hoveredId, setHoveredId, setSelectedFeature,
  height = 0.58, yOffset = 0.2,
  showGC = true, showSkew = true, showCoverage = true, showLabels = true,
  compact = false,
  filterStart = null, filterEnd = null, onSetFilter = () => {},
  zoom = 1, panX = 0, panY = 0, onViewChange = () => {},
}) {
  // Label customization state
  const [labelSettings, setLabelSettings] = React.useState({
    fadeMode: 'fade-cross', // 'never', 'fade-cross', 'custom'
    fadeOpacity: 0.2,
    fadeDistance: 0.008,
    fadeStartDistance: 0.015, // distance from text where fade starts
    minHorizontalGap: 0.08,
    minVerticalGap: 0.025,
    maxVerticalExtent: 0.12,
    showMode: 'all', // 'all', 'top10', 'top20', 'top50'
    filterCategory: null,
    filterPositionRange: null,
    fontSize: 0.018,
    angleLabels: false,
    labelAngle: 0, // degrees
    showLeaders: true,
    positionMode: 'above', // 'above', 'below', 'alternating'
    verticalOffset: 0.040,
  });
  const [showLabelModal, setShowLabelModal] = React.useState(false);

  // Measure container aspect so we can counter-scale <text> and prevent
  // horizontal stretching caused by preserveAspectRatio="none".
  const svgRef = React.useRef(null);
  const [aspect, setAspect] = React.useState(3); // w/h
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });

  React.useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cr = e.contentRect;
        if (cr.height > 0) setAspect(Math.max(0.1, cr.width / cr.height));
      }
    });
    ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, []);

  // Pan with mouse drag
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = (e.clientX - dragStart.x) / (svgRef.current?.clientWidth || 1) * 0.2;
    const dy = (e.clientY - dragStart.y) / (svgRef.current?.clientHeight || 1) * 0.2;
    onViewChange({ zoom, panX: panX + dx, panY: panY + dy });
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  React.useEffect(() => {
    if (!isDragging) return;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, zoom, panX, panY]);
  // Helper: render text at fractional (fx, fy) counter-scaled to avoid the
  // non-uniform viewBox stretching.
  const UText = ({ fx, fy, children, ...rest }) => (
    <g transform={`translate(${fx} ${fy}) scale(${1 / aspect} 1)`}>
      <text {...rest}>{children}</text>
    </g>
  );

  // Determine effective display range: use filter if active, otherwise use view range
  const safeViewStart = viewStart ?? 0;
  const safeViewEnd = viewEnd ?? genomeLen;
  const displayStart = filterStart !== null ? filterStart : safeViewStart;
  const displayEnd = filterEnd !== null ? filterEnd : safeViewEnd;

  const effectiveSpan = displayEnd - displayStart || 1;
  const bpToX = (bp) => ((bp - displayStart) / effectiveSpan);
  const span = effectiveSpan;

  // Visible features only - filter to display range
  const visibleFeats = features.filter(f => f.end >= displayStart && f.start <= displayEnd);

  const yTop = yOffset;
  const H = height;
  const axisY = yTop + H * 0.48;
  const trackH = H * 0.08;
  const fwdY = axisY - trackH - 0.005;
  const revY = axisY + 0.005;

  // GC track area
  const gcY = yTop + H * 0.78;
  const gcH = H * 0.10;
  const skewY = yTop + H * 0.90;
  const skewH = H * 0.07;
  const covY = yTop + H * 0.04;
  const covH = H * 0.12;

  // Compute GC / skew / coverage indices for display range
  const gcN = gcContent.length;
  const winBp = genomeLen / gcN;
  const firstIdx = Math.max(0, Math.floor(displayStart / winBp));
  const lastIdx = Math.min(gcN - 1, Math.ceil(displayEnd / winBp));

  const colorMap = Object.fromEntries(
    Object.entries(FEATURE_CATEGORIES).map(([k, v]) => [k, v.color])
  );

  // CDS as arrows (rectangle with triangular head)
  const cdsArrow = (f) => {
    const x0 = bpToX(f.start);
    const x1 = bpToX(f.end);
    const w = x1 - x0;
    const y = f.strand >= 0 ? fwdY : revY;
    const h = trackH;
    const headW = Math.min(w * 0.5, 0.006);
    if (f.strand >= 0) {
      return `M ${x0} ${y} L ${x1 - headW} ${y} L ${x1} ${y + h / 2} L ${x1 - headW} ${y + h} L ${x0} ${y + h} Z`;
    } else {
      return `M ${x1} ${y} L ${x0 + headW} ${y} L ${x0} ${y + h / 2} L ${x0 + headW} ${y + h} L ${x1} ${y + h} Z`;
    }
  };

  // GC line
  const gcPath = (() => {
    let d = '';
    for (let i = firstIdx; i <= lastIdx; i++) {
      const bp = i * winBp;
      const x = bpToX(bp);
      const v = gcContent[i];
      const dev = (v - 0.655) / 0.08;
      const y = gcY + gcH / 2 - dev * (gcH / 2);
      d += `${i === firstIdx ? 'M' : 'L'} ${x} ${y} `;
    }
    return d;
  })();

  // Skew bars
  const skewBars = [];
  for (let i = firstIdx; i <= lastIdx; i++) {
    const bp = i * winBp;
    const x = bpToX(bp);
    const bpNext = (i + 1) * winBp;
    const xNext = bpToX(bpNext);
    const v = gcSkew[i];
    const dev = Math.max(-1, Math.min(1, v / 0.3));
    const h = dev * (skewH / 2);
    const baseY = skewY + skewH / 2;
    skewBars.push(
      <rect key={i} x={x} y={h < 0 ? baseY : baseY - Math.abs(h)}
            width={Math.max(0.0005, xNext - x)} height={Math.abs(h)}
            fill={v >= 0 ? "#7FA876" : "#B67777"} opacity={0.8} />
    );
  }

  // Coverage bars
  const covBars = [];
  for (let i = firstIdx; i <= lastIdx; i++) {
    const bp = i * winBp;
    const x = bpToX(bp);
    const bpNext = (i + 1) * winBp;
    const xNext = bpToX(bpNext);
    const v = coverage[i];
    const h = v * covH;
    covBars.push(
      <rect key={i} x={x} y={covY + covH - h}
            width={Math.max(0.0005, xNext - x)} height={h}
            fill="#5B8AA6" opacity={0.85} />
    );
  }

  // Labels (curated) - apply all filters
  let visibleLabels = labels.filter(l => l.position >= displayStart && l.position <= displayEnd);

  // Apply showMode filter (top N labels)
  if (labelSettings.showMode === 'top10') {
    visibleLabels = visibleLabels.slice(0, 10);
  } else if (labelSettings.showMode === 'top20') {
    visibleLabels = visibleLabels.slice(0, 20);
  } else if (labelSettings.showMode === 'top50') {
    visibleLabels = visibleLabels.slice(0, 50);
  }

  // Apply category filter if set
  if (labelSettings.filterCategory) {
    visibleLabels = visibleLabels.filter(l => l.category === labelSettings.filterCategory);
  }

  // Apply position range filter if set
  if (labelSettings.filterPositionRange) {
    const [minPos, maxPos] = labelSettings.filterPositionRange;
    visibleLabels = visibleLabels.filter(l => l.position >= minPos && l.position <= maxPos);
  }

  // Ruler ticks
  const tickStep = niceTickStep(span);
  const ticks = [];
  for (let bp = Math.ceil(displayStart / tickStep) * tickStep; bp <= displayEnd; bp += tickStep) {
    const x = bpToX(bp);
    ticks.push(
      <g key={bp}>
        <line x1={x} y1={axisY - 0.008} x2={x} y2={axisY + trackH + 0.008}
              stroke="#9A9484" strokeWidth={0.0006} />
        <UText fx={x} fy={axisY + trackH + 0.032}
               textAnchor="middle" fontSize={0.014}
               fontFamily="'IBM Plex Mono', monospace" fill="#6A6A6A">
          {formatBp(bp)}
        </UText>
      </g>
    );
  }

  // Measure container aspect so we can counter-scale <text> and prevent
  // horizontal stretching caused by preserveAspectRatio="none".
  // (aspect + UText defined at top of component)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} viewBox="0 0 1 1"
           style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none', cursor: isDragging ? 'grabbing' : 'grab' }}
           preserveAspectRatio="none"
           onMouseDown={handleMouseDown}>
      <defs>
        <pattern id="stripeBg" width="0.006" height="0.006" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="0.006" height="0.006" fill="#FAF8F2" />
          <line x1="0" y1="0" x2="0" y2="0.006" stroke="#EFEBE1" strokeWidth="0.002" />
        </pattern>
      </defs>

      <g transform={`translate(${panX} ${panY}) scale(${zoom})`}>
      {/* Header */}
      <UText fx={0.01} fy={0.055} fontSize={0.032} fontWeight={600}
             fontFamily="'IBM Plex Sans', sans-serif" fontStyle="italic"
             fill="#1A1A1A">{genomeName}</UText>
      <UText fx={0.01} fy={0.092} fontSize={0.02}
             fontFamily="'IBM Plex Mono', monospace" fill="#6A6A6A">
        {accession} · {formatBp(displayStart)}–{formatBp(displayEnd)} · {formatBp(span)} span
      </UText>


      {/* Coverage */}
      {showCoverage && (
        <g>
          <UText fx={0.01} fy={covY + 0.013} fontSize={0.013}
                 fontFamily="'IBM Plex Mono', monospace" fill="#6A6A6A">
            Coverage
          </UText>
          <rect x={0} y={covY} width={1} height={covH} fill="#FDFBF6" />
          {covBars}
          <line x1={0} y1={covY + covH} x2={1} y2={covY + covH} stroke="#D9D4C7" strokeWidth={0.0008} />
        </g>
      )}

      {/* Spine */}
      <line x1={0} y1={axisY + trackH / 2 + 0.005} x2={1} y2={axisY + trackH / 2 + 0.005}
            stroke="#C8C3B4" strokeWidth={0.0012} />

      {/* VCF variants — tick marks */}
      {window.USER_VCF && Object.entries(window.USER_VCF).flatMap(([trackId, variants]) =>
        variants.map(v => {
          if (v.pos < displayStart || v.pos > displayEnd) return null;
          const x = bpToX(v.pos);
          const color = (window.VCF_COLORS && window.VCF_COLORS[v.varType]) || '#999';
          const tickHeight = v.varType === 'SV' ? 0.014 : 0.010;
          return (
            <g key={v.id}
               style={{ cursor: 'pointer' }}
               onMouseEnter={() => setHoveredId(v.id)}
               onMouseLeave={() => setHoveredId(null)}
               onClick={() => setSelectedFeature(v)}>
              <line x1={x} y1={axisY} x2={x} y2={axisY - tickHeight}
                    stroke={color} strokeWidth={0.0015}
                    opacity={hoveredId === v.id ? 1 : 0.7} />
              <circle cx={x} cy={axisY - tickHeight} r={0.0018}
                      fill={color} opacity={hoveredId === v.id ? 1 : 0.8} />
            </g>
          );
        })
      )}

      {/* CDS — forward */}
      <UText fx={0.01} fy={fwdY - 0.006} fontSize={0.013}
             fontFamily="'IBM Plex Mono', monospace" fill="#6A6A6A">
        → forward
      </UText>
      {visibleFeats.filter(f => f.strand >= 0).map(f => (
        <path key={f.id} d={cdsArrow(f)}
              fill={colorMap[f.category]} opacity={hoveredId === f.id ? 1 : 0.9}
              stroke={hoveredId === f.id ? "#1A1A1A" : "none"} strokeWidth={0.0015}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredId(f.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => setSelectedFeature(f)} />
      ))}

      {/* Ruler */}
      {ticks}

      {/* CDS — reverse */}
      <UText fx={0.01} fy={revY + trackH + 0.018} fontSize={0.013}
             fontFamily="'IBM Plex Mono', monospace" fill="#6A6A6A">
        ← reverse
      </UText>
      {visibleFeats.filter(f => f.strand < 0).map(f => (
        <path key={f.id} d={cdsArrow(f)}
              fill={colorMap[f.category]} opacity={hoveredId === f.id ? 1 : 0.9}
              stroke={hoveredId === f.id ? "#1A1A1A" : "none"} strokeWidth={0.0015}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredId(f.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => setSelectedFeature(f)} />
      ))}

      {/* Labels with row-based stacking (like Geneious) */}
      {showLabels && (() => {
        // Create items sorted by position
        const items = visibleLabels.map((lbl) => {
          const origX = bpToX(lbl.position); // original feature position (stays fixed)
          // Use label's explicit color, or look up category color, or default to black
          const labelColor = lbl.color || (lbl.category && colorMap[lbl.category]) || '#1A1A1A';
          return {
            name: lbl.name,
            position: lbl.position,
            origX: origX,
            x: origX, // x position (can shift left/right for spacing)
            y: 0, // y will be set by row assignment
            color: labelColor,
            bold: lbl.bold,
            italic: lbl.italic,
          };
        });

        // Sort by x position (left to right) for row-based layout
        items.sort((a, b) => a.origX - b.origX);

        // Row-based stacking algorithm
        const minXGap = labelSettings.minHorizontalGap;
        const rowHeight = labelSettings.minVerticalGap + 0.010; // spacing between rows
        const isAboveMode = labelSettings.positionMode === 'above' || labelSettings.positionMode === 'alternating';
        const isBelowMode = labelSettings.positionMode === 'below' || labelSettings.positionMode === 'alternating';

        // Assign labels to rows
        const rowsAbove = []; // rows above the axis (negative direction)
        const rowsBelow = []; // rows below the axis (positive direction)

        for (const item of items) {
          const textWidth = item.name.length * labelSettings.fontSize * 0.55;
          const labelHalfWidth = textWidth / 2;

          let placed = false;

          // Try above rows first if above mode
          if (isAboveMode) {
            for (let r = 0; r < rowsAbove.length; r++) {
              const row = rowsAbove[r];
              // Check if fits in this row
              let fits = true;
              for (const other of row) {
                const otherWidth = other.name.length * labelSettings.fontSize * 0.55 / 2;
                const gap = Math.abs(item.origX - other.x);
                if (gap < minXGap + labelHalfWidth + otherWidth) {
                  fits = false;
                  break;
                }
              }
              if (fits) {
                row.push(item);
                placed = true;
                break;
              }
            }
          }

          // Try below rows if not placed and below mode enabled
          if (!placed && isBelowMode) {
            for (let r = 0; r < rowsBelow.length; r++) {
              const row = rowsBelow[r];
              let fits = true;
              for (const other of row) {
                const otherWidth = other.name.length * labelSettings.fontSize * 0.55 / 2;
                const gap = Math.abs(item.origX - other.x);
                if (gap < minXGap + labelHalfWidth + otherWidth) {
                  fits = false;
                  break;
                }
              }
              if (fits) {
                row.push(item);
                placed = true;
                break;
              }
            }
          }

          // If not placed, create new row
          if (!placed) {
            if (isAboveMode && (!isBelowMode || rowsAbove.length <= rowsBelow.length)) {
              rowsAbove.push([item]);
            } else if (isBelowMode) {
              rowsBelow.push([item]);
            } else {
              rowsAbove.push([item]);
            }
          }
        }

        // Assign Y positions based on row
        const baseY = fwdY - labelSettings.verticalOffset;
        for (let r = 0; r < rowsAbove.length; r++) {
          for (const item of rowsAbove[r]) {
            item.y = baseY - r * rowHeight;
          }
        }
        const baseYBelow = fwdY + labelSettings.verticalOffset;
        for (let r = 0; r < rowsBelow.length; r++) {
          for (const item of rowsBelow[r]) {
            item.y = baseYBelow + r * rowHeight;
          }
        }

        // Flatten back to single array
        const allRows = [...rowsAbove.reverse(), ...rowsBelow];
        const finalItems = [];
        for (const row of allRows) {
          finalItems.push(...row);
        }

        // Render labels with fading lines and better text detection
        return finalItems.map((lbl, idx) => {
          const xAnchor = lbl.origX; // feature position stays fixed
          const xLabel = lbl.origX; // labels stay at their feature position (no horizontal shifting)
          const yLabel = lbl.y;

          // Check if line passes through ANY label's text area
          let linePassesThroughText = false;

          for (const otherLbl of finalItems) {
            // Don't check against self
            if (otherLbl.name === lbl.name) continue;

            const textWidth = otherLbl.name.length * labelSettings.fontSize * 0.55;
            const textHeight = labelSettings.fontSize * 1.2;
            const otherBounds = {
              x: otherLbl.origX - textWidth / 2,
              y: otherLbl.y - textHeight / 2,
              right: otherLbl.origX + textWidth / 2,
              bottom: otherLbl.y + textHeight / 2,
            };

            // Check if this label's leader line passes through other label's text
            if (xAnchor > (otherBounds.x - labelSettings.fadeStartDistance) &&
                xAnchor < (otherBounds.right + labelSettings.fadeStartDistance)) {

              // Check if leader line would pass through text vertically
              const minLineY = Math.min(fwdY, yLabel);
              const maxLineY = Math.max(fwdY, yLabel);

              if (minLineY < otherBounds.bottom + labelSettings.fadeStartDistance &&
                  maxLineY > otherBounds.y - labelSettings.fadeStartDistance) {
                linePassesThroughText = true;
                break;
              }
            }
          }

          const shouldShowLeader = labelSettings.showLeaders;

          // Vertical leader line from feature to label row
          return (
            <g key={lbl.name}>
              {/* Simple vertical line from arrow to label */}
              {shouldShowLeader && (
                linePassesThroughText ? (
                  // If line passes through text, fade it out in the middle
                  <>
                    <path d={`M ${xAnchor} ${fwdY} L ${xAnchor} ${(fwdY + yLabel) / 2 - labelSettings.fadeStartDistance}`}
                          fill="none" stroke={lbl.color || "#1A1A1A"} strokeWidth={0.0008} opacity={0.6} />
                    <path d={`M ${xAnchor} ${(fwdY + yLabel) / 2 + labelSettings.fadeDistance} L ${xAnchor} ${yLabel}`}
                          fill="none" stroke={lbl.color || "#1A1A1A"} strokeWidth={0.0008} opacity={labelSettings.fadeOpacity} />
                  </>
                ) : (
                  // No crossing: simple clean vertical line
                  <path d={`M ${xAnchor} ${fwdY} L ${xAnchor} ${yLabel}`}
                        fill="none" stroke={lbl.color || "#1A1A1A"} strokeWidth={0.0008} opacity={0.6} />
                )
              )}
              <UText fx={xLabel} fy={yLabel}
                     textAnchor="middle" fontSize={labelSettings.fontSize} fontStyle={lbl.italic ? "italic" : "normal"}
                     fontFamily="'IBM Plex Sans', sans-serif" fontWeight={lbl.bold ? 700 : 500}
                     fill={lbl.color || "#1A1A1A"}>
                {lbl.name}
              </UText>
            </g>
          );
        });
      })()}

      {/* GC content */}
      {showGC && (
        <g>
          <UText fx={0.01} fy={gcY + 0.013} fontSize={0.013}
                 fontFamily="'IBM Plex Mono', monospace" fill="#6A6A6A">
            GC content
          </UText>
          <line x1={0} y1={gcY + gcH / 2} x2={1} y2={gcY + gcH / 2}
                stroke="#C8C3B4" strokeWidth={0.0008} strokeDasharray="0.004 0.004" />
          <path d={gcPath} fill="none" stroke="#3A3A3A" strokeWidth={0.0015} />
        </g>
      )}

      {/* GC skew */}
      {showSkew && (
        <g>
          <UText fx={0.01} fy={skewY + 0.013} fontSize={0.013}
                 fontFamily="'IBM Plex Mono', monospace" fill="#6A6A6A">
            GC skew
          </UText>
          <line x1={0} y1={skewY + skewH / 2} x2={1} y2={skewY + skewH / 2}
                stroke="#C8C3B4" strokeWidth={0.0008} />
          {skewBars}
        </g>
      )}
      </g>
      </svg>

      {/* Range Filter Control (top-right, always visible) */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 101 }}>
        <RangeFilterControl
          genomeLen={genomeLen}
          filterStart={filterStart}
          filterEnd={filterEnd}
          onSetFilter={onSetFilter}
        />
      </div>

      {/* Customize Labels button (bottom-left) */}
      <button
        onClick={() => setShowLabelModal(true)}
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          padding: '8px 12px',
          fontSize: 11,
          fontFamily: "'IBM Plex Sans', sans-serif",
          background: '#D4A84A',
          color: '#1A1A1A',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontWeight: 600,
          zIndex: 100,
        }}
      >
        ⚙ Customize labels
      </button>

      {/* Label Settings Modal */}
      {showLabelModal && (
        <LinearLabelSettingsModal
          settings={labelSettings}
          onSettingsChange={setLabelSettings}
          onClose={() => setShowLabelModal(false)}
          availableLabels={labels}
          onLabelsChange={(newLabels) => {
            // This would be passed back to parent if needed
          }}
        />
      )}
    </div>
  );
}

function niceTickStep(span) {
  const targets = [1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6];
  for (const t of targets) if (span / t < 14) return t;
  return 5e6;
}
function formatBp(bp) {
  if (bp >= 1e6) return (bp / 1e6).toFixed(2) + ' Mb';
  if (bp >= 1e3) return (bp / 1e3).toFixed(1) + ' kb';
  return bp + ' bp';
}

// Linear Label Settings Modal
function LinearLabelSettingsModal({ settings, onSettingsChange, onClose, availableLabels }) {
  const handleChange = (key, value) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const modalStyle = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  };

  const panelStyle = {
    background: '#FDFBF6',
    borderRadius: 8,
    padding: 24,
    maxWidth: 500,
    maxHeight: '80vh',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    fontFamily: "'IBM Plex Sans', sans-serif",
  };

  const sectionStyle = { marginBottom: 20, borderBottom: '1px solid #E5DFCF', paddingBottom: 16 };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#6A6A6A', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 };
  const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 };

  return (
    <div style={modalStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: 20, color: '#1A1A1A' }}>Label Settings</h2>

        {/* Line Fade Settings */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Line Fade</div>
          <div style={rowStyle}>
            <label>Mode:</label>
            <select value={settings.fadeMode} onChange={(e) => handleChange('fadeMode', e.target.value)}
                    style={{ padding: '6px 8px', fontSize: 11, borderRadius: 3, border: '1px solid #D9D4C7' }}>
              <option value="never">Never fade</option>
              <option value="fade-cross">Fade on cross</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {settings.fadeMode !== 'never' && (
            <>
              <div style={rowStyle}>
                <label>Fade Start Distance:</label>
                <input type="range" min="0.005" max="0.03" step="0.002" value={settings.fadeStartDistance}
                       onChange={(e) => handleChange('fadeStartDistance', parseFloat(e.target.value))}
                       style={{ width: 100 }} />
              </div>
              <div style={rowStyle}>
                <label>Fade Opacity:</label>
                <input type="range" min="0" max="1" step="0.05" value={settings.fadeOpacity}
                       onChange={(e) => handleChange('fadeOpacity', parseFloat(e.target.value))}
                       style={{ width: 100 }} />
                <span style={{ fontSize: 11 }}>{(settings.fadeOpacity * 100).toFixed(0)}%</span>
              </div>
              <div style={rowStyle}>
                <label>Fade Distance:</label>
                <input type="range" min="0.002" max="0.02" step="0.001" value={settings.fadeDistance}
                       onChange={(e) => handleChange('fadeDistance', parseFloat(e.target.value))}
                       style={{ width: 100 }} />
              </div>
            </>
          )}
        </div>

        {/* Spacing Settings */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Spacing</div>
          <div style={rowStyle}>
            <label>Min Horizontal Gap:</label>
            <input type="range" min="0.02" max="0.15" step="0.01" value={settings.minHorizontalGap}
                   onChange={(e) => handleChange('minHorizontalGap', parseFloat(e.target.value))}
                   style={{ width: 100 }} />
          </div>
          <div style={rowStyle}>
            <label>Min Vertical Gap:</label>
            <input type="range" min="0.01" max="0.05" step="0.005" value={settings.minVerticalGap}
                   onChange={(e) => handleChange('minVerticalGap', parseFloat(e.target.value))}
                   style={{ width: 100 }} />
          </div>
          <div style={rowStyle}>
            <label>Max Vertical Extent:</label>
            <input type="range" min="0.05" max="0.2" step="0.01" value={settings.maxVerticalExtent}
                   onChange={(e) => handleChange('maxVerticalExtent', parseFloat(e.target.value))}
                   style={{ width: 100 }} />
          </div>
        </div>

        {/* Label Filtering */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Show Labels</div>
          <div style={rowStyle}>
            <select value={settings.showMode} onChange={(e) => handleChange('showMode', e.target.value)}
                    style={{ padding: '6px 8px', fontSize: 11, borderRadius: 3, border: '1px solid #D9D4C7', flex: 1 }}>
              <option value="all">All labels</option>
              <option value="top10">Top 10</option>
              <option value="top20">Top 20</option>
              <option value="top50">Top 50</option>
            </select>
          </div>
        </div>

        {/* Styling */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Styling</div>
          <div style={rowStyle}>
            <label>Font Size:</label>
            <input type="range" min="0.01" max="0.03" step="0.001" value={settings.fontSize}
                   onChange={(e) => handleChange('fontSize', parseFloat(e.target.value))}
                   style={{ width: 100 }} />
          </div>
          <div style={rowStyle}>
            <label>Angle Labels:</label>
            <input type="checkbox" checked={settings.angleLabels}
                   onChange={(e) => handleChange('angleLabels', e.target.checked)} />
          </div>
          {settings.angleLabels && (
            <div style={rowStyle}>
              <label>Angle (°):</label>
              <input type="range" min="-45" max="45" step="5" value={settings.labelAngle}
                     onChange={(e) => handleChange('labelAngle', parseInt(e.target.value))}
                     style={{ width: 100 }} />
              <span style={{ fontSize: 11 }}>{settings.labelAngle}°</span>
            </div>
          )}
          <div style={rowStyle}>
            <label>Show Leaders:</label>
            <input type="checkbox" checked={settings.showLeaders}
                   onChange={(e) => handleChange('showLeaders', e.target.checked)} />
          </div>
        </div>

        {/* Position */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Position</div>
          <div style={rowStyle}>
            <label>Mode:</label>
            <select value={settings.positionMode} onChange={(e) => handleChange('positionMode', e.target.value)}
                    style={{ padding: '6px 8px', fontSize: 11, borderRadius: 3, border: '1px solid #D9D4C7' }}>
              <option value="above">Above track</option>
              <option value="below">Below track</option>
              <option value="alternating">Alternating</option>
            </select>
          </div>
        </div>

        {/* Close Button */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    fontSize: 12,
                    background: '#D4A84A',
                    color: '#1A1A1A',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Range Filter Control - sleek top-bar filter with real-time updates and draggable sliders
function RangeFilterControl({ genomeLen, filterStart, filterEnd, onSetFilter }) {
  const [localStart, setLocalStart] = React.useState(filterStart !== null ? filterStart : 0);
  const [localEnd, setLocalEnd] = React.useState(filterEnd !== null ? filterEnd : genomeLen);
  const sliderRef = React.useRef(null);
  const [isDragging, setIsDragging] = React.useState(null);

  const isActive = filterStart !== null && filterEnd !== null;
  const displayStart = isActive ? filterStart : localStart;
  const displayEnd = isActive ? filterEnd : localEnd;

  const sliderStartPercent = (displayStart / genomeLen) * 100;
  const sliderEndPercent = (displayEnd / genomeLen) * 100;
  const sliderWidth = sliderEndPercent - sliderStartPercent;

  const handleStartChange = (e) => {
    const val = parseInt(e.target.value) || 0;
    const clamped = Math.max(0, Math.min(val, displayEnd - 1));
    setLocalStart(clamped);
    onSetFilter(clamped, displayEnd);
  };

  const handleEndChange = (e) => {
    const val = parseInt(e.target.value) || genomeLen;
    const clamped = Math.max(displayStart + 1, Math.min(val, genomeLen));
    setLocalEnd(clamped);
    onSetFilter(displayStart, clamped);
  };

  const handleSliderMouseDown = (handle) => (e) => {
    setIsDragging(handle);
    e.preventDefault();
  };

  React.useEffect(() => {
    if (!isDragging || !sliderRef.current) return;

    const handleMouseMove = (e) => {
      const rect = sliderRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const bp = Math.round((percent / 100) * genomeLen);

      if (isDragging === 'start') {
        const clamped = Math.max(0, Math.min(bp, displayEnd - 1));
        setLocalStart(clamped);
        onSetFilter(clamped, displayEnd);
      } else if (isDragging === 'end') {
        const clamped = Math.max(displayStart + 1, Math.min(bp, genomeLen));
        setLocalEnd(clamped);
        onSetFilter(displayStart, clamped);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, displayStart, displayEnd, genomeLen, onSetFilter]);

  return (
    <div style={{
      background: '#F5F2ED',
      border: '1px solid #D9D4C7',
      borderRadius: 4,
      padding: '6px 8px',
      fontFamily: "'IBM Plex Sans', sans-serif",
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 10,
      color: '#6A6A6A',
      whiteSpace: 'nowrap',
    }}>
      {/* From input */}
      <input
        type="text"
        value={displayStart}
        onChange={handleStartChange}
        style={{
          width: 55,
          padding: '3px 4px',
          fontSize: 9,
          border: '1px solid #D9D4C7',
          borderRadius: 2,
          fontFamily: "'IBM Plex Mono', monospace",
          background: '#FDFBF6',
          color: '#1A1A1A',
        }}
      />

      {/* Range indicator */}
      <span style={{ color: '#999', fontSize: 9, minWidth: 16, textAlign: 'center' }}>→</span>

      {/* To input */}
      <input
        type="text"
        value={displayEnd}
        onChange={handleEndChange}
        style={{
          width: 55,
          padding: '3px 4px',
          fontSize: 9,
          border: '1px solid #D9D4C7',
          borderRadius: 2,
          fontFamily: "'IBM Plex Mono', monospace",
          background: '#FDFBF6',
          color: '#1A1A1A',
        }}
      />

      {/* Draggable slider visualization */}
      <div
        ref={sliderRef}
        style={{
          display: 'inline-block',
          position: 'relative',
          width: 70,
          height: 12,
          background: '#E5DFCF',
          borderRadius: 2,
          overflow: 'visible',
          marginLeft: 2,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        {/* Orange range area */}
        <div style={{
          position: 'absolute',
          left: `${sliderStartPercent}%`,
          width: `${sliderWidth}%`,
          height: '100%',
          background: '#D4A84A',
          opacity: 0.7,
          borderRadius: 2,
        }} />

        {/* Left handle (in orange area) */}
        <div
          onMouseDown={handleSliderMouseDown('start')}
          style={{
            position: 'absolute',
            left: `${sliderStartPercent}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 6,
            height: 14,
            background: '#1A1A1A',
            borderRadius: 1,
            cursor: isDragging === 'start' ? 'grabbing' : 'grab',
            zIndex: isDragging === 'start' ? 10 : 2,
          }}
        />

        {/* Right handle (in orange area) */}
        <div
          onMouseDown={handleSliderMouseDown('end')}
          style={{
            position: 'absolute',
            left: `${sliderEndPercent}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 6,
            height: 14,
            background: '#1A1A1A',
            borderRadius: 1,
            cursor: isDragging === 'end' ? 'grabbing' : 'grab',
            zIndex: isDragging === 'end' ? 10 : 2,
          }}
        />
      </div>

      {/* Range display */}
      <span style={{
        fontSize: 8,
        color: '#999',
        fontFamily: "'IBM Plex Mono', monospace",
        minWidth: 55,
      }}>
        {formatBp(displayStart)}–{formatBp(displayEnd)}
      </span>
    </div>
  );
}

Object.assign(window, { LinearGenome, formatBp, niceTickStep, LinearLabelSettingsModal, RangeFilterControl });
