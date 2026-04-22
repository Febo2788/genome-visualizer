// Side panels — left track list, right properties inspector
// Styled to match the clean-scientific aesthetic.

const UI = {
  bg:        '#FAF8F2',    // warm paper
  panel:     '#F2EDDF',    // subtle panel
  panelAlt:  '#FFFFFF',
  border:    '#E5DFCF',
  divider:   '#D9D4C7',
  ink:       '#1A1A1A',
  ink2:      '#3A3A3A',
  muted:     '#6A6A6A',
  mutedLite: '#9A9484',
  accent:    '#2B5F6B',    // muted teal
  accentBg:  '#E8EFEE',
  warn:      '#B67777',
};

const FONT_SANS = "'IBM Plex Sans', system-ui, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

// ============================================================
// Left panel — track list (inner → outer)
// ============================================================
function TrackPanel({ tracks, selectedTrackId, onSelect, onToggleVisible, onReorder, onAddFeatureTrack, onImportBedGraph, onImportVCF }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: 260, flexShrink: 0,
      background: UI.panel, borderRight: `1px solid ${UI.border}`,
      height: '100%', overflow: 'visible',
    }}>
      <PanelHeader
        eyebrow="01 · Workspace"
        title="Tracks"
        subtitle="Drawn inner → outer"
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {/* Reverse so innermost is at bottom, outermost at top — matches visual */}
        {[...tracks].reverse().map((t, i) => (
          <TrackRow
            key={t.id}
            track={t}
            selected={t.id === selectedTrackId}
            onSelect={() => onSelect(t.id)}
            onToggleVisible={() => onToggleVisible(t.id)}
            onMoveUp={() => onReorder(t.id, +1)}
            onMoveDown={() => onReorder(t.id, -1)}
            canMoveUp={i > 0}
            canMoveDown={i < tracks.length - 1}
          />
        ))}
      </div>

      <div style={{
        padding: '12px 16px', borderTop: `1px solid ${UI.border}`,
        display: 'flex', flexDirection: 'column', gap: 6, overflow: 'visible',
      }}>
        <SmallButton
          icon="+"
          label="Add feature track"
          onClick={onAddFeatureTrack}
          info={{
            title: 'Feature track · BED / GFF3',
            body: 'Adds a new ring of arrow-style features (CDS, ncRNA, etc). Accepts BED (min 3 cols: chrom, start, end; optional name, score, strand) or GFF3. Coordinates should be 0-based for BED, 1-based for GFF3.',
            example: 'chrom\tstart\tend\tname\tscore\tstrand\nchr1\t1000\t1500\tgeneA\t0\t+\nchr1\t2100\t2600\tgeneB\t0\t-',
            position: 'above',
          }}
        />
        <SmallButton
          icon="↑"
          label="Import BED graph"
          onClick={onImportBedGraph}
          info={{
            title: 'BedGraph · continuous track',
            body: 'Adds a quantitative ring (e.g. coverage, methylation). Four-column tab-separated format: chrom, start, end, value. Lines starting with "track" or "#" are ignored.',
            example: 'track type=bedGraph name="coverage"\nchr1\t0\t1000\t12.5\nchr1\t1000\t2000\t14.1\nchr1\t2000\t3000\t11.8',
            position: 'above',
          }}
        />
        <SmallButton
          icon="◆"
          label="Import VCF"
          onClick={onImportVCF}
          info={{
            title: 'VCF · Variant Call Format',
            body: 'Adds variant markers to the genome. Supports single and multi-sample VCF files with SNPs, indels, and structural variants. Annotations (VEP/SnpEff) are parsed from INFO fields.',
            example: '##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSample1\nchr1\t1000\t.\tA\tT\t60\tPASS\t.\tGT:DP\t0/1:30',
            position: 'above',
          }}
        />
      </div>
    </div>
  );
}

function PanelHeader({ eyebrow, title, subtitle }) {
  return (
    <div style={{ padding: '18px 16px 14px', borderBottom: `1px solid ${UI.border}` }}>
      <div style={{
        fontSize: 10, fontFamily: FONT_MONO, letterSpacing: 0.8,
        color: UI.muted, textTransform: 'uppercase', marginBottom: 6,
      }}>{eyebrow}</div>
      <div style={{
        fontSize: 17, fontFamily: FONT_SANS, fontWeight: 600,
        color: UI.ink, letterSpacing: -0.2,
      }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 11, fontFamily: FONT_MONO, color: UI.muted, marginTop: 2 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function TrackRow({ track, selected, onSelect, onToggleVisible, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  const swatchColor = track.color || track.posColor || track.bg || '#888';
  const typeLabels = {
    'ruler': 'Ruler',
    'cds': 'CDS',
    'rna': 'RNA',
    'mobile': 'Mobile',
    'gc': 'GC%',
    'gc-skew': 'Skew',
    'bed': 'BED',
    'bedgraph': 'BedGraph',
    'blast-ring': 'BLAST',
    'vcf': 'VCF',
    'labels': 'Labels',
  };
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 16px',
        cursor: 'pointer',
        background: selected ? UI.accentBg : 'transparent',
        borderLeft: `3px solid ${selected ? UI.accent : 'transparent'}`,
        paddingLeft: 13,
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleVisible(); }}
        title={track.visible ? 'Hide' : 'Show'}
        style={{
          width: 16, height: 16, padding: 0, border: `1px solid ${UI.divider}`,
          borderRadius: 3, background: track.visible ? UI.ink : 'transparent',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        {track.visible && (
          <svg width="10" height="10" viewBox="0 0 10 10" style={{ display: 'block', margin: 'auto' }}>
            <path d="M2 5 L4 7 L8 3" stroke="#FAF8F2" strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Color swatch */}
      <div style={{
        width: 10, height: 10, borderRadius: 2,
        background: swatchColor, flexShrink: 0,
        opacity: track.visible ? 1 : 0.3,
      }} />

      {/* Link indicator */}
      {track.linkedTo && (
        <div title="Linked to complement" style={{
          width: 12, height: 12, borderRadius: 2,
          border: `1px solid ${UI.accent}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="8" height="8" viewBox="0 0 8 8">
            <circle cx="2" cy="4" r="1.5" stroke={UI.accent} fill="none" strokeWidth="1"/>
            <circle cx="6" cy="4" r="1.5" stroke={UI.accent} fill="none" strokeWidth="1"/>
            <line x1="3.5" y1="4" x2="4.5" y2="4" stroke={UI.accent} strokeWidth="1"/>
          </svg>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontFamily: FONT_SANS, color: UI.ink,
          fontWeight: selected ? 500 : 400,
          opacity: track.visible ? 1 : 0.45,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {track.name}
        </div>
        <div style={{
          fontSize: 10, fontFamily: FONT_MONO, color: UI.muted,
          opacity: track.visible ? 1 : 0.45,
        }}>
          {typeLabels[track.type] || track.type} · r={track.radius.toFixed(2)}{track.linkedTo ? ' · linked' : ''}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <button onClick={(e) => { e.stopPropagation(); canMoveUp && onMoveUp(); }}
                disabled={!canMoveUp}
                style={chevronBtnStyle(canMoveUp)}>▲</button>
        <button onClick={(e) => { e.stopPropagation(); canMoveDown && onMoveDown(); }}
                disabled={!canMoveDown}
                style={chevronBtnStyle(canMoveDown)}>▼</button>
      </div>
    </div>
  );
}

function chevronBtnStyle(enabled) {
  return {
    width: 14, height: 10, padding: 0, border: 'none', background: 'transparent',
    fontSize: 7, color: enabled ? UI.muted : UI.divider,
    cursor: enabled ? 'pointer' : 'default', lineHeight: 1,
  };
}

function SmallButton({ icon, label, onClick, info }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch', gap: 0 }}>
      <button
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px',
          fontFamily: FONT_SANS, fontSize: 12,
          background: hover ? UI.panelAlt : 'transparent',
          border: `1px solid ${UI.divider}`,
          borderRadius: 4, color: UI.ink,
          cursor: 'pointer', textAlign: 'left',
          flex: 1,
        }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: UI.muted, width: 12 }}>{icon}</span>
        {label}
      </button>
      {info && <InfoIcon {...info} />}
    </div>
  );
}

// ============================================================
// InfoIcon — circle-i with a rich hover popover for explaining
// file formats, button semantics, etc.
// ============================================================
function InfoIcon({ title, body, example, position = 'right' }) {
  const [open, setOpen] = React.useState(false);
  const hideTimer = React.useRef(null);

  const show = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setOpen(true);
  };
  const scheduleHide = () => {
    // small grace period so the user can move cursor into the popover
    hideTimer.current = setTimeout(() => setOpen(false), 140);
  };

  const popoverPos = {
    right:  { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' },
    left:   { right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' },
    below:  { left: '50%', top: 'calc(100% + 8px)', transform: 'translateX(-50%)' },
    above:  { left: '50%', bottom: 'calc(100% + 8px)', transform: 'translateX(-50%)' },
  }[position];

  return (
    <span
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, marginLeft: 4,
        fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600,
        color: UI.muted, border: `1px solid ${UI.divider}`, borderRadius: '50%',
        cursor: 'help', flexShrink: 0, alignSelf: 'center',
        background: UI.panelAlt,
        userSelect: 'none',
      }}
    >
      i
      {open && (
        <div
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
          style={{
            position: 'absolute',
            ...popoverPos,
            width: 320,
            background: UI.panelAlt,
            border: `1px solid ${UI.border}`,
            borderRadius: 6,
            padding: '12px 14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 1000,
            fontFamily: FONT_SANS, fontSize: 12, color: UI.ink2,
            textAlign: 'left', lineHeight: 1.5,
            fontWeight: 400, letterSpacing: 0,
            cursor: 'default',
          }}
        >
          {title && (
            <div style={{
              fontSize: 10.5, fontFamily: FONT_MONO, color: UI.muted,
              textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
            }}>{title}</div>
          )}
          <div style={{ whiteSpace: 'pre-wrap' }}>{body}</div>
          {example && (
            <pre style={{
              marginTop: 10, marginBottom: 0,
              padding: '8px 10px', background: UI.panel,
              border: `1px solid ${UI.divider}`, borderRadius: 4,
              fontFamily: FONT_MONO, fontSize: 10.5, color: UI.ink2,
              whiteSpace: 'pre', overflowX: 'auto',
            }}>{example}</pre>
          )}
        </div>
      )}
    </span>
  );
}

Object.assign(window, { TrackPanel, PanelHeader, TrackRow, SmallButton, InfoIcon, UI, FONT_SANS, FONT_MONO });
