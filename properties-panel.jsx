// Right-side properties inspector — context-sensitive based on selected track,
// plus tabs for Labels / Highlights / Colors / Synteny / Export

function PropertiesPanel({
  selectedTrack, onUpdateTrack,
  selectedFeature,
  tab, onTabChange,
  highlights, onAddHighlight, onRemoveHighlight,
  labels, onAddLabel, onRemoveLabel, onClearLabels, availableLabels = [],
  viewMode,
  onExport,
  resolution, onResolution,
  genomeLen = 4411532,
  paletteTick = 0,
  onPaletteChange = () => {},
  tracks = [],
  onLinkTracks = () => {},
  onUnlinkTrack = () => {},
  // Synteny editing
  syntenyConfig = {},
  onSyntenyConfigChange = () => {},
  mergedGenomes = [],
  syntenySelectedGenomeId,
  onSyntenySelectedGenomeId = () => {},
  onRenameGenome = () => {},
  syntenyLabels = {},
  onAddSyntenyLabel = () => {},
  onRemoveSyntenyLabel = () => {},
  syntenyHighlights = {},
  onAddSyntenyHighlight = () => {},
  onRemoveSyntenyHighlight = () => {},
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: 320, flexShrink: 0,
      background: UI.panel, borderLeft: `1px solid ${UI.border}`,
      height: '100%', overflow: 'hidden',
    }}>
      <PanelHeader
        eyebrow="02 · Inspector"
        title={tabTitle(tab)}
      />

      {/* Tab strip */}
      <div style={{
        display: 'flex', gap: 0, padding: '0 8px',
        borderBottom: `1px solid ${UI.border}`, background: UI.panel,
      }}>
        {['Track', 'Colors', 'Labels', 'Highlights', 'Synteny', 'Export'].map(t => (
          <TabButton key={t} label={t} active={tab === t} onClick={() => onTabChange(t)} />
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'Track' && (
          <TrackEditor selectedTrack={selectedTrack} onUpdateTrack={onUpdateTrack}
                       selectedFeature={selectedFeature} tracks={tracks}
                       onLinkTracks={onLinkTracks} onUnlinkTrack={onUnlinkTrack} />
        )}
        {tab === 'Colors' && <ColorsEditor paletteTick={paletteTick} onPaletteChange={onPaletteChange} />}
        {tab === 'Labels' && <LabelsEditor labels={labels} onAddLabel={onAddLabel} onRemoveLabel={onRemoveLabel} onClearLabels={onClearLabels} genomeLen={genomeLen} availableLabels={availableLabels} />}
        {tab === 'Highlights' && <HighlightsEditor highlights={highlights} onAddHighlight={onAddHighlight} onRemoveHighlight={onRemoveHighlight} genomeLen={genomeLen} />}
        {tab === 'Synteny' && <SyntenyEditor
          config={syntenyConfig} onConfigChange={onSyntenyConfigChange}
          genomes={mergedGenomes}
          selectedGenomeId={syntenySelectedGenomeId}
          onSelectGenome={onSyntenySelectedGenomeId}
          onRenameGenome={onRenameGenome}
          syntenyLabels={syntenyLabels}
          onAddSyntenyLabel={onAddSyntenyLabel}
          onRemoveSyntenyLabel={onRemoveSyntenyLabel}
          syntenyHighlights={syntenyHighlights}
          onAddSyntenyHighlight={onAddSyntenyHighlight}
          onRemoveSyntenyHighlight={onRemoveSyntenyHighlight}
          genomeLen={genomeLen}
        />}
        {tab === 'Export' && <ExportPanel onExport={onExport} resolution={resolution} onResolution={onResolution} viewMode={viewMode} />}
      </div>
    </div>
  );
}

function tabTitle(t) {
  return {
    'Track': 'Track properties',
    'Colors': 'Color palette',
    'Labels': 'Gene labels',
    'Highlights': 'Highlight regions',
    'Synteny': 'Synteny settings',
    'Export': 'Export figure',
  }[t];
}

function TabButton({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 4px',
      fontFamily: FONT_SANS, fontSize: 11.5,
      color: active ? UI.ink : UI.muted,
      fontWeight: active ? 500 : 400,
      background: 'transparent', border: 'none',
      borderBottom: active ? `2px solid ${UI.accent}` : '2px solid transparent',
      cursor: 'pointer',
      marginBottom: -1,
    }}>{label}</button>
  );
}

// ============================================================
// Track editor
// ============================================================
function findComplement(track, tracks) {
  const cdsTracks = tracks.filter(t => t.type === 'cds' && t.id !== track.id && t.strand !== track.strand);
  if (!cdsTracks.length) return null;
  // Prefer same import prefix (e.g. t-user-1234 or t-gb-1234)
  const prefix = track.id.replace(/-(?:fwd|rev)$/, '');
  const sameSource = cdsTracks.find(t => t.id.startsWith(prefix));
  if (sameSource) return sameSource;
  // Fallback: closest by radius
  return cdsTracks.reduce((best, t) =>
    Math.abs(t.radius - track.radius) < Math.abs(best.radius - track.radius) ? t : best
  );
}

function TrackEditor({ selectedTrack, onUpdateTrack, selectedFeature, tracks = [], onLinkTracks = () => {}, onUnlinkTrack = () => {} }) {
  if (selectedFeature && selectedFeature._vcf) return <VCFDetail variant={selectedFeature} />;
  if (selectedFeature) return <FeatureDetail feature={selectedFeature} />;
  if (!selectedTrack) {
    return (
      <EmptyState
        text="Select a track on the left to edit its radius, thickness, color, and visibility."
      />
    );
  }
  const t = selectedTrack;
  return (
    <div style={{ padding: 18 }}>
      <FieldGroup label="Name">
        <input type="text" value={t.name} readOnly style={inputStyle} />
      </FieldGroup>

      <FieldGroup label={`Inner radius · ${(t.radius ?? 0.5).toFixed(2)}`}>
        <input type="range" min="0.10" max="0.90" step="0.01"
               value={t.radius ?? 0.5}
               onChange={(e) => { const newVal = parseFloat(e.target.value); if (!isNaN(newVal)) onUpdateTrack(t.id, { radius: newVal }); }}
               style={sliderStyle} />
      </FieldGroup>

      <FieldGroup label={`Thickness · ${(t.thickness ?? 0.05).toFixed(3)}`}>
        <input type="range" min="0.005" max="0.15" step="0.001"
               value={t.thickness ?? 0.05}
               onChange={(e) => { const newVal = parseFloat(e.target.value); if (!isNaN(newVal)) onUpdateTrack(t.id, { thickness: newVal }); }}
               style={sliderStyle} />
      </FieldGroup>

      {t.type === 'blast-ring' && (
        <FieldGroup label={`Ring opacity · ${Math.round(((t.opacity ?? 1) * 100))}%`}>
          <input type="range" min="0.05" max="1" step="0.01"
                 value={t.opacity ?? 1}
                 onChange={(e) => onUpdateTrack(t.id, { opacity: parseFloat(e.target.value) })}
                 style={sliderStyle} />
        </FieldGroup>
      )}

      {t.color !== undefined && (
        <FieldGroup label="Color">
          <ColorSwatchPicker value={t.color}
                             onChange={(c) => onUpdateTrack(t.id, { color: c })} />
        </FieldGroup>
      )}

      {t.posColor !== undefined && (
        <>
          <FieldGroup label="Positive color">
            <ColorSwatchPicker value={t.posColor}
                               onChange={(c) => onUpdateTrack(t.id, { posColor: c })} />
          </FieldGroup>
          <FieldGroup label="Negative color">
            <ColorSwatchPicker value={t.negColor}
                               onChange={(c) => onUpdateTrack(t.id, { negColor: c })} />
          </FieldGroup>
        </>
      )}

      {t.bg !== undefined && (
        <FieldGroup label="Background">
          <ColorSwatchPicker value={t.bg}
                             onChange={(c) => onUpdateTrack(t.id, { bg: c })} />
        </FieldGroup>
      )}

      {t.type === 'cds' && (
        <div style={{ marginTop: 18, padding: 12, background: UI.accentBg, borderRadius: 6 }}>
          <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: UI.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {t.strand > 0 ? 'Forward strand' : 'Reverse strand'}
          </div>
          {t.linkedTo ? (
            <>
              <div style={{ fontSize: 12, color: UI.ink, marginBottom: 8 }}>
                Linked to: {tracks.find(x => x.id === t.linkedTo)?.name ?? t.linkedTo}
              </div>
              <button onClick={() => onUnlinkTrack(t.id)} style={{
                padding: '7px 12px', fontSize: 11, fontFamily: FONT_SANS,
                background: UI.panelAlt, border: `1px solid ${UI.border}`,
                borderRadius: 4, color: UI.ink, cursor: 'pointer',
                width: '100%',
              }}>
                Unlink
              </button>
            </>
          ) : (
            (() => {
              const candidate = findComplement(t, tracks);
              return candidate ? (
                <>
                  <div style={{ fontSize: 12, color: UI.ink, marginBottom: 8 }}>
                    Complement: {candidate.name}
                  </div>
                  <button onClick={() => onLinkTracks(t.id, candidate.id)} style={{
                    padding: '7px 12px', fontSize: 11, fontFamily: FONT_SANS,
                    background: UI.panelAlt, border: `1px solid ${UI.border}`,
                    borderRadius: 4, color: UI.ink, cursor: 'pointer',
                    width: '100%',
                  }}>
                    Link to complement
                  </button>
                </>
              ) : (
                <div style={{ fontSize: 12, color: UI.muted }}>No complement track found</div>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}

// Genetic code codon table: DNA codon → 1-letter amino acid code
const CODON_TABLE = {
  'TTT': 'F', 'TTC': 'F', 'TTA': 'L', 'TTG': 'L', 'TCT': 'S', 'TCC': 'S', 'TCA': 'S', 'TCG': 'S',
  'TAT': 'Y', 'TAC': 'Y', 'TAA': '*', 'TAG': '*', 'TGT': 'C', 'TGC': 'C', 'TGA': '*', 'TGG': 'W',
  'CTT': 'L', 'CTC': 'L', 'CTA': 'L', 'CTG': 'L', 'CCT': 'P', 'CCC': 'P', 'CCA': 'P', 'CCG': 'P',
  'CAT': 'H', 'CAC': 'H', 'CAA': 'Q', 'CAG': 'Q', 'CGT': 'R', 'CGC': 'R', 'CGA': 'R', 'CGG': 'R',
  'ATT': 'I', 'ATC': 'I', 'ATA': 'I', 'ATG': 'M', 'ACT': 'T', 'ACC': 'T', 'ACA': 'T', 'ACG': 'T',
  'AAT': 'N', 'AAC': 'N', 'AAA': 'K', 'AAG': 'K', 'AGT': 'S', 'AGC': 'S', 'AGA': 'R', 'AGG': 'R',
  'GTT': 'V', 'GTC': 'V', 'GTA': 'V', 'GTG': 'V', 'GCT': 'A', 'GCC': 'A', 'GCA': 'A', 'GCG': 'A',
  'GAT': 'D', 'GAC': 'D', 'GAA': 'E', 'GAG': 'E', 'GGT': 'G', 'GGC': 'G', 'GGA': 'G', 'GGG': 'G',
};

// Translate DNA sequence to protein (stop at first stop codon)
function translateDNA(seq) {
  const upper = seq.toUpperCase();
  let protein = '';
  for (let i = 0; i + 2 < upper.length; i += 3) {
    const codon = upper.substring(i, i + 3);
    const aa = CODON_TABLE[codon] || 'X';
    protein += aa;
    if (aa === '*') break;
  }
  return protein;
}

// Calculate GC percentage (0-100)
function calcGC(seq) {
  const upper = seq.toUpperCase();
  const gc = (upper.match(/[GC]/g) || []).length;
  const pct = upper.length > 0 ? ((gc / upper.length) * 100).toFixed(1) : '0.0';
  return pct;
}

// Sequence display block with wrapping and position numbers
function SequenceBlock({ sequence, type = 'DNA' }) {
  const wrapped = [];
  const charsPerLine = 60;
  for (let i = 0; i < sequence.length; i += charsPerLine) {
    const start = i + 1;
    const chunk = sequence.substring(i, i + charsPerLine);
    wrapped.push({ start, chunk });
  }

  return (
    <div style={{
      border: `1px solid ${UI.border}`,
      borderRadius: 4,
      overflow: 'auto',
      maxHeight: 160,
      padding: '8px 12px',
      fontFamily: FONT_MONO,
      fontSize: 11,
      lineHeight: 1.6,
      background: UI.surface,
    }}>
      {wrapped.map((line, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 12 }}>
          <span style={{
            userSelect: 'none',
            color: UI.muted,
            minWidth: 40,
            textAlign: 'right',
            flexShrink: 0,
          }}>
            {line.start}
          </span>
          <span style={{ color: UI.ink, wordBreak: 'break-all' }}>
            {line.chunk}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// VCF variant detail view
// ============================================================
function VCFDetail({ variant }) {
  const [copied, setCopied] = React.useState(false);
  const VCF_COLORS = { SNP: '#5B8AA6', INS: '#7FA876', DEL: '#B67777', SV: '#8878A8' };
  const color = VCF_COLORS[variant.varType] || '#999';

  // Detect gene overlaps
  const overlappingGenes = (window.FEATURES || []).filter(f =>
    f.start <= variant.pos && f.end >= variant.pos && (f.type === 'CDS' || f.type === 'gene')
  );

  const handleCopyVcfLine = () => {
    const vcfLine = `${variant.chrom}\t${variant.pos + 1}\t${variant.id}\t${variant.ref}\t${variant.alt}\t${variant.qual}\t${variant.filter}\t${variant.info}`;
    navigator.clipboard.writeText(vcfLine).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = vcfLine;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ padding: 18, overflow: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{
        fontSize: 10, fontFamily: FONT_MONO, color: UI.muted,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
      }}>
        Variant · <span style={{ color }}>{variant.varType}</span>
      </div>
      <div style={{
        fontSize: 20, fontFamily: FONT_MONO, fontWeight: 600, color: UI.ink, marginBottom: 4,
      }}>
        {variant.id}
      </div>
      <div style={{ fontSize: 13, fontFamily: FONT_SANS, color: UI.ink2, marginBottom: 16 }}>
        {variant.chrom}:{(variant.pos + 1).toLocaleString()}
      </div>

      {/* Position section */}
      <div style={{ borderTop: `1px solid ${UI.border}`, paddingTop: 16, marginBottom: 16 }}>
        <DefRow label="Position" value={(variant.pos + 1).toLocaleString() + ' bp'} mono />
        <DefRow label="REF" value={variant.ref} mono />
        <DefRow label="ALT" value={variant.alt} mono />
        <DefRow label="Quality" value={variant.qual} mono />
        <DefRow label="Filter" value={variant.filter} mono />
        <DefRow label="Length" value={(variant.end - variant.pos).toLocaleString() + ' bp'} mono />
      </div>

      {/* Genotypes section */}
      {Object.keys(variant.genotypes).length > 0 && (
        <div style={{ borderTop: `1px solid ${UI.border}`, paddingTop: 16, marginBottom: 16 }}>
          <div style={{
            fontSize: 10, fontFamily: FONT_MONO, color: UI.muted,
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
          }}>
            Genotypes
          </div>
          {Object.entries(variant.genotypes).map(([sampleName, gt]) => (
            <DefRow key={sampleName} label={sampleName}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 11 }}>
                {gt.gt} · DP:{gt.dp} GQ:{gt.gq}
              </span>
            </DefRow>
          ))}
        </div>
      )}

      {/* Overlapping genes section */}
      <div style={{ borderTop: `1px solid ${UI.border}`, paddingTop: 16, marginBottom: 16 }}>
        <div style={{
          fontSize: 10, fontFamily: FONT_MONO, color: UI.muted,
          textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
        }}>
          Overlapping Genes
        </div>
        {overlappingGenes.length > 0 ? (
          overlappingGenes.map(f => (
            <DefRow key={f.id} label={f.gene || f.id}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 11 }}>
                {f.start.toLocaleString()}–{f.end.toLocaleString()}
              </span>
            </DefRow>
          ))
        ) : (
          <DefRow label="—" value="None" />
        )}
      </div>

      {/* Annotation section (if VEP or SnpEff present) */}
      {(variant.vepAnnot || variant.snpeffAnnot) && (
        <div style={{ borderTop: `1px solid ${UI.border}`, paddingTop: 16, marginBottom: 16 }}>
          <div style={{
            fontSize: 10, fontFamily: FONT_MONO, color: UI.muted,
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
          }}>
            Annotation
          </div>
          {variant.vepAnnot && (
            <>
              <DefRow label="Gene" value={variant.vepAnnot.symbol} mono />
              <DefRow label="Effect" value={variant.vepAnnot.consequence} mono />
              <DefRow label="Impact" value={variant.vepAnnot.impact} mono />
              <DefRow label="HGVSp" value={variant.vepAnnot.hgvsp} mono />
            </>
          )}
          {variant.snpeffAnnot && !variant.vepAnnot && (
            <>
              <DefRow label="Gene" value={variant.snpeffAnnot.geneName} mono />
              <DefRow label="Annotation" value={variant.snpeffAnnot.annotation} mono />
              <DefRow label="Impact" value={variant.snpeffAnnot.impact} mono />
            </>
          )}
        </div>
      )}

      {/* Copy button */}
      <div style={{ borderTop: `1px solid ${UI.border}`, paddingTop: 16 }}>
        <button onClick={handleCopyVcfLine} style={{
          width: '100%', padding: '8px 12px',
          fontSize: 12, fontFamily: FONT_SANS, fontWeight: 500,
          color: copied ? '#28a745' : UI.ink, background: copied ? '#f0f0f0' : UI.panelAlt,
          border: `1px solid ${UI.border}`, borderRadius: 3, cursor: 'pointer',
          transition: 'all 0.2s',
        }}>
          {copied ? '✓ Copied' : 'Copy as VCF line'}
        </button>
      </div>
    </div>
  );
}

function FeatureDetail({ feature }) {
  const cat = FEATURE_CATEGORIES[feature.category] || FEATURE_CATEGORIES['Poorly characterized'] || { color: '#9C9C9C', label: 'Unknown' };
  const [seqTab, setSeqTab] = React.useState('DNA');
  const [copied, setCopied] = React.useState(false);

  const locusTag = feature.locus_tag || feature.locusTag || '—';
  const hasSequence = feature.sequence && feature.sequence.length > 0;

  let dnaSeq = '';
  let proteinSeq = '';
  let gc = '0.0';
  let aaLen = 0;

  if (hasSequence) {
    dnaSeq = feature.sequence;
    gc = calcGC(dnaSeq);
    if (feature.type === 'CDS') {
      proteinSeq = translateDNA(dnaSeq);
      aaLen = proteinSeq.replace(/\*/g, '').length;
    }
  }

  const activeSeq = seqTab === 'Protein' ? proteinSeq : dnaSeq;

  const handleCopyFasta = () => {
    try {
      let text = '';
      if (seqTab === 'Protein' && proteinSeq) {
        text = `>${feature.id} ${feature.product}\n${proteinSeq}`;
      } else if (dnaSeq) {
        text = `>${feature.id} ${feature.product}\n${dnaSeq}`;
      } else {
        // Fallback: generate random sequence
        const seqLen = feature.end - feature.start;
        let seq = '';
        const bases = ['A', 'T', 'G', 'C'];
        for (let i = 0; i < seqLen; i++) {
          seq += bases[Math.floor(Math.random() * 4)];
        }
        text = `>${feature.id} ${feature.product}\n${seq}`;
      }

      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  return (
    <div style={{ padding: 18, overflow: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{
        fontSize: 10, fontFamily: FONT_MONO, color: UI.muted,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
      }}>
        Feature · {feature.type || 'CDS'}
      </div>
      <div style={{
        fontSize: 20, fontFamily: FONT_MONO, fontWeight: 600, color: UI.ink, marginBottom: 4,
      }}>
        {feature.id}
      </div>
      <div style={{ fontSize: 13, fontFamily: FONT_SANS, color: UI.ink2, lineHeight: 1.45, marginBottom: 16 }}>
        {feature.product}
      </div>

      {/* Metadata section */}
      <div style={{ borderTop: `1px solid ${UI.border}`, paddingTop: 16, marginBottom: 16 }}>
        <DefRow label="Locus tag" value={locusTag} mono />
        <DefRow label="Start"     value={feature.start.toLocaleString() + ' bp'} mono />
        <DefRow label="End"       value={feature.end.toLocaleString() + ' bp'} mono />
        <DefRow label="Length"    value={(feature.end - feature.start).toLocaleString() + ' bp'} mono />
        <DefRow label="Strand"    value={feature.strand > 0 ? 'forward (+)' : 'reverse (−)'} />
        <DefRow label="Category">
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontFamily: FONT_SANS,
          }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: cat.color }} />
            {feature.category}
          </span>
        </DefRow>
      </div>

      {/* Sequence section */}
      <div style={{ marginTop: 16, borderTop: `1px solid ${UI.border}`, paddingTop: 12 }}>
        <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: UI.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Sequence
        </div>

        {hasSequence ? (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
              <button
                onClick={() => setSeqTab('DNA')}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  background: seqTab === 'DNA' ? UI.ink : UI.surface,
                  color: seqTab === 'DNA' ? '#FFF' : UI.ink,
                  border: `1px solid ${UI.border}`,
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                DNA
              </button>
              {feature.type === 'CDS' && (
                <button
                  onClick={() => setSeqTab('Protein')}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    fontFamily: FONT_MONO,
                    background: seqTab === 'Protein' ? UI.ink : UI.surface,
                    color: seqTab === 'Protein' ? '#FFF' : UI.ink,
                    border: `1px solid ${UI.border}`,
                    borderRadius: 3,
                    cursor: 'pointer',
                  }}
                >
                  Protein
                </button>
              )}
            </div>

            {/* Sequence display */}
            <SequenceBlock sequence={activeSeq} type={seqTab} />

            {/* Stats bar */}
            <div style={{
              marginTop: 10,
              fontSize: 11,
              fontFamily: FONT_MONO,
              color: UI.muted,
              borderTop: `1px solid ${UI.border}`,
              paddingTop: 8,
            }}>
              {dnaSeq.length} bp · GC {gc}%
              {feature.type === 'CDS' && ` · ${aaLen} aa`}
            </div>

            {/* Copy button */}
            <div style={{ marginTop: 12 }}>
              <button onClick={handleCopyFasta} style={primaryBtn}>
                {copied ? 'Copied!' : 'Copy as FASTA'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: UI.muted, fontStyle: 'italic', marginBottom: 12 }}>
              Load a GenBank file to view sequence.
            </div>
            <button onClick={handleCopyFasta} style={primaryBtn}>
              {copied ? 'Copied!' : 'Copy placeholder FASTA'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DefRow({ label, value, children, mono }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '5px 0',
    }}>
      <span style={{ fontSize: 11, fontFamily: FONT_MONO, color: UI.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </span>
      <span style={{
        fontSize: 12.5, fontFamily: mono ? FONT_MONO : FONT_SANS, color: UI.ink,
      }}>
        {value || children}
      </span>
    </div>
  );
}

function FieldGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block', fontSize: 11, fontFamily: FONT_MONO,
        color: UI.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
      }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '7px 10px',
  fontFamily: FONT_SANS, fontSize: 12.5, color: UI.ink,
  background: UI.panelAlt, border: `1px solid ${UI.divider}`,
  borderRadius: 3, outline: 'none', boxSizing: 'border-box',
};

const sliderStyle = { width: '100%', accentColor: UI.accent };

const primaryBtn = {
  padding: '8px 14px', fontFamily: FONT_SANS, fontSize: 12.5, fontWeight: 500,
  background: UI.ink, color: UI.bg, border: 'none', borderRadius: 3, cursor: 'pointer',
};

const ghostBtn = {
  padding: '8px 14px', fontFamily: FONT_SANS, fontSize: 12.5, fontWeight: 400,
  background: 'transparent', color: UI.ink, border: `1px solid ${UI.divider}`,
  borderRadius: 3, cursor: 'pointer',
};

// ============================================================
// Color swatch picker
// ============================================================
const SCIENTIFIC_SWATCHES = [
  '#1A1A1A','#3A3A3A','#6A6A6A','#9C9C9C','#C8C3B4',
  '#2B5F6B','#5B8AA6','#7FA876','#C4976A','#B67777',
  '#8878A8','#D4A84A','#BCB7A8','#4A6F82','#A89078',
];

function ColorSwatchPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {SCIENTIFIC_SWATCHES.map(c => (
        <button key={c} onClick={() => onChange(c)}
          style={{
            width: 22, height: 22, padding: 0, borderRadius: 3,
            background: c, cursor: 'pointer',
            border: value === c ? `2px solid ${UI.ink}` : `1px solid ${UI.divider}`,
            boxShadow: value === c ? `0 0 0 1px ${UI.bg} inset` : 'none',
          }} />
      ))}
    </div>
  );
}

// ============================================================
// Colors tab — edit feature-category palette
// ============================================================
function ColorsEditor({ paletteTick, onPaletteChange }) {
  const [editingKey, setEditingKey] = React.useState(null);

  const setColor = (key, color) => {
    FEATURE_CATEGORIES[key] = { ...FEATURE_CATEGORIES[key], color };
    onPaletteChange();
  };
  const randomize = () => {
    const pool = [...SCIENTIFIC_SWATCHES];
    Object.keys(FEATURE_CATEGORIES).forEach((k, i) => {
      const c = pool[(i * 3 + Math.floor(Math.random() * pool.length)) % pool.length];
      FEATURE_CATEGORIES[k] = { ...FEATURE_CATEGORIES[k], color: c };
    });
    onPaletteChange();
  };
  const allGray = () => {
    const tones = ['#3A3A3A','#5A5A5A','#7A7A7A','#9A9A9A','#B8B3A4','#C8C3B4','#A8A398','#888378'];
    Object.keys(FEATURE_CATEGORIES).forEach((k, i) => {
      FEATURE_CATEGORIES[k] = { ...FEATURE_CATEGORIES[k], color: tones[i % tones.length] };
    });
    onPaletteChange();
  };

  return (
    <div style={{ padding: 18 }}>
      <div style={{ fontSize: 11.5, fontFamily: FONT_SANS, color: UI.muted, marginBottom: 12, lineHeight: 1.5 }}>
        CDS color comes from functional category. Click a row to pick a new swatch.
      </div>
      {Object.entries(FEATURE_CATEGORIES).map(([key, cat]) => (
        <div key={key} style={{
          padding: '8px 0', borderBottom: `1px solid ${UI.border}`,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          }} onClick={() => setEditingKey(editingKey === key ? null : key)}>
            <div style={{ width: 16, height: 16, borderRadius: 3, background: cat.color, flexShrink: 0,
                          border: `1px solid ${UI.divider}` }} />
            <div style={{ flex: 1, fontSize: 12, fontFamily: FONT_SANS, color: UI.ink }}>
              {cat.label}
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: UI.muted }}>
              {cat.color}
            </div>
          </div>
          {editingKey === key && (
            <div style={{ marginTop: 10, paddingLeft: 26 }}>
              <ColorSwatchPicker value={cat.color} onChange={(c) => setColor(key, c)} />
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontFamily: FONT_MONO, color: UI.muted }}>HEX</span>
                <input type="text" value={cat.color}
                       onChange={(e) => setColor(key, e.target.value)}
                       style={{ ...inputStyle, width: 90, fontFamily: FONT_MONO, fontSize: 11 }} />
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ marginTop: 16, display: 'flex', gap: 6 }}>
        <button style={ghostBtn} onClick={randomize}>Randomize</button>
        <button style={ghostBtn} onClick={allGray}>All gray</button>
      </div>
    </div>
  );
}

// ============================================================
// Labels editor
// ============================================================
function LabelsEditor({ labels, onAddLabel, onRemoveLabel, onClearLabels, genomeLen, availableLabels = [] }) {
  const [search, setSearch] = React.useState('');
  const [showCustom, setShowCustom] = React.useState(false);
  const [pos, setPos] = React.useState('');
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState('#1A1A1A');
  const [expandedLabelIdx, setExpandedLabelIdx] = React.useState(null);

  const posNum = parseInt(pos, 10);
  const posValid = !isNaN(posNum) && posNum >= 0 && posNum <= genomeLen;

  // Filter available labels by search
  const searchLower = search.toLowerCase();
  const filtered = availableLabels.filter(lbl =>
    lbl.name.toLowerCase().includes(searchLower)
  );

  // Track which labels are already added
  const addedNames = new Set(labels.map(l => l.name));
  const searchResults = filtered.filter(lbl => !addedNames.has(lbl.name)).slice(0, 20);

  return (
    <div style={{ padding: 18 }}>
      <div style={{ fontSize: 11.5, fontFamily: FONT_SANS, color: UI.muted, marginBottom: 14, lineHeight: 1.5 }}>
        Search and add gene labels from your GenBank file, or create custom ones.
      </div>

      {/* Presets */}
      <FieldGroup label="Quick presets">
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => {
              const evenly = availableLabels.length > 0
                ? availableLabels.filter((_, i) => i % Math.max(1, Math.floor(availableLabels.length / 10)) === 0).slice(0, 10)
                : [];
              evenly.forEach(lbl => {
                if (!labels.find(l => l.name === lbl.name)) {
                  onAddLabel({ position: lbl.position, name: lbl.name, color: '#1A1A1A' });
                }
              });
            }}
            style={{ ...primaryBtn, flex: 1, padding: '6px 8px', fontSize: 11 }}
          >
            10 spread
          </button>
          <button
            onClick={() => {
              const sample = availableLabels.length > 0
                ? availableLabels.filter((_, i) => i % Math.max(1, Math.floor(availableLabels.length / 20)) === 0).slice(0, 20)
                : [];
              sample.forEach(lbl => {
                if (!labels.find(l => l.name === lbl.name)) {
                  onAddLabel({ position: lbl.position, name: lbl.name, color: '#1A1A1A' });
                }
              });
            }}
            style={{ ...primaryBtn, flex: 1, padding: '6px 8px', fontSize: 11 }}
          >
            20 spread
          </button>
          <button
            onClick={() => onClearLabels && onClearLabels()}
            style={{ ...ghostBtn, flex: 1, padding: '6px 8px', fontSize: 11 }}
          >
            Clear all
          </button>
        </div>
      </FieldGroup>

      {/* Search bar */}
      <FieldGroup label="Search genes">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. dnaA, katG, rpoB"
          style={inputStyle}
        />
      </FieldGroup>

      {/* Search results */}
      {search.trim() && searchResults.length > 0 && (
        <div style={{ marginBottom: 16, padding: '8px 0', borderTop: `1px solid ${UI.border}`, borderBottom: `1px solid ${UI.border}` }}>
          <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: UI.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
            Found {searchResults.length}
          </div>
          {searchResults.map((lbl, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '6px 0', borderBottom: `1px solid ${UI.border}`,
            }}>
              <span style={{ fontSize: 13, fontFamily: FONT_SANS, fontStyle: 'italic', fontWeight: 500, color: UI.ink, flex: 1 }}>
                {lbl.name}
              </span>
              <span style={{ fontSize: 10.5, fontFamily: FONT_MONO, color: UI.muted }}>
                {(lbl.position / 1000).toFixed(0)}k
              </span>
              <button
                onClick={() => {
                  onAddLabel({ position: lbl.position, name: lbl.name, color: '#1A1A1A' });
                  setSearch('');
                }}
                style={{ ...primaryBtn, padding: '4px 10px', fontSize: 11, minWidth: 'auto' }}
              >
                Add
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Current labels */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: UI.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
          {labels.length} labels selected
        </div>
        <div style={{ maxHeight: 250, overflowY: 'auto' }}>
          {labels.length === 0 ? (
            <div style={{ fontSize: 11, fontFamily: FONT_SANS, color: UI.muted, fontStyle: 'italic', padding: '8px 0' }}>
              Search and add labels above, or create a custom one
            </div>
          ) : (
            labels.map((lbl, i) => (
              <div key={i} style={{ marginBottom: 2 }}>
                <div
                  onClick={() => setExpandedLabelIdx(expandedLabelIdx === i ? null : i)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '8px 6px', borderBottom: `1px solid ${UI.border}`,
                    cursor: 'pointer', background: expandedLabelIdx === i ? UI.bg : 'transparent',
                    borderRadius: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: 2,
                      background: lbl.color || '#1A1A1A', border: `1px solid ${UI.border}`,
                    }} />
                    <span style={{ fontSize: 13, fontFamily: FONT_SANS, fontStyle: 'italic', fontWeight: 500, color: UI.ink, flex: 1 }}>
                      {lbl.name}
                    </span>
                  </div>
                  <button onClick={(e) => {
                    e.stopPropagation();
                    onRemoveLabel(i);
                  }} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: UI.muted, fontSize: 16, padding: 0, lineHeight: 1,
                  }}>×</button>
                </div>
                {expandedLabelIdx === i && (
                  <div style={{ padding: '10px 6px', background: UI.bg, borderRadius: 4, marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Label name */}
                    <div>
                      <label style={{ fontSize: 10, fontFamily: FONT_MONO, color: UI.muted, textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 4 }}>Name</label>
                      <input
                        type="text"
                        value={lbl.name}
                        onChange={(e) => {
                          onRemoveLabel(i);
                          onAddLabel({ ...lbl, name: e.target.value });
                        }}
                        style={{ ...inputStyle, fontSize: 12 }}
                      />
                    </div>

                    {/* Color picker */}
                    <div>
                      <label style={{ fontSize: 10, fontFamily: FONT_MONO, color: UI.muted, textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 4 }}>Color</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <ColorSwatchPicker
                          value={lbl.color || '#1A1A1A'}
                          onChange={(newColor) => {
                            onRemoveLabel(i);
                            onAddLabel({ ...lbl, color: newColor });
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          value={lbl.color || '#1A1A1A'}
                          onChange={(e) => {
                            const newColor = e.target.value;
                            if (/^#[0-9A-F]{6}$/i.test(newColor)) {
                              onRemoveLabel(i);
                              onAddLabel({ ...lbl, color: newColor });
                            }
                          }}
                          placeholder="#1A1A1A"
                          style={{ ...inputStyle, fontSize: 11, fontFamily: FONT_MONO, flex: 1 }}
                        />
                      </div>
                    </div>

                    {/* Bold & Italic */}
                    <div>
                      <label style={{ fontSize: 10, fontFamily: FONT_MONO, color: UI.muted, textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 6 }}>Style</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => {
                            onRemoveLabel(i);
                            onAddLabel({ ...lbl, bold: !lbl.bold });
                          }}
                          style={{
                            ...ghostBtn,
                            flex: 1,
                            background: lbl.bold ? '#D4A84A' : 'transparent',
                            color: lbl.bold ? '#1A1A1A' : UI.muted,
                            fontWeight: 'bold',
                            fontSize: 12,
                          }}
                          title="Bold"
                        >
                          B
                        </button>
                        <button
                          onClick={() => {
                            onRemoveLabel(i);
                            onAddLabel({ ...lbl, italic: !lbl.italic });
                          }}
                          style={{
                            ...ghostBtn,
                            flex: 1,
                            background: lbl.italic ? '#D4A84A' : 'transparent',
                            color: lbl.italic ? '#1A1A1A' : UI.muted,
                            fontStyle: 'italic',
                            fontSize: 12,
                          }}
                          title="Italic"
                        >
                          I
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Custom label button (collapsed) */}
      <button
        onClick={() => setShowCustom(!showCustom)}
        style={{ ...ghostBtn, width: '100%', marginBottom: 12, marginTop: 8 }}
      >
        {showCustom ? '▼ Add custom label' : '▶ Add custom label'}
      </button>

      {/* Custom label form (expanded) */}
      {showCustom && (
        <div style={{ padding: '12px 0', borderTop: `1px solid ${UI.border}`, borderBottom: `1px solid ${UI.border}`, marginBottom: 12 }}>
          <FieldGroup label={`Position (bp) · 0 – ${genomeLen.toLocaleString()}`}>
            <input
              type="number"
              value={pos}
              onChange={(e) => setPos(e.target.value)}
              placeholder="e.g. 1471846"
              style={{
                ...inputStyle,
                borderColor: pos && !posValid ? '#B67777' : UI.border,
              }}
            />
          </FieldGroup>
          <FieldGroup label="Label text">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my gene"
              style={inputStyle}
            />
          </FieldGroup>
          <FieldGroup label="Color">
            <ColorSwatchPicker value={color} onChange={setColor} />
          </FieldGroup>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button
              style={{ ...primaryBtn, opacity: (posValid && name) ? 1 : 0.4, cursor: (posValid && name) ? 'pointer' : 'not-allowed' }}
              disabled={!(posValid && name)}
              onClick={() => {
                onAddLabel({ position: posNum, name, color });
                setPos('');
                setName('');
              }}
            >
              Add custom
            </button>
            <button style={ghostBtn} onClick={() => { setPos(''); setName(''); setShowCustom(false); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Highlights editor
// ============================================================
function HighlightsEditor({ highlights, onAddHighlight, onRemoveHighlight, genomeLen }) {
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [color, setColor] = React.useState('#D4A84A');
  const [opacity, setOpacity] = React.useState(0.18);

  const s = parseInt(start, 10);
  const e = parseInt(end, 10);
  const valid = !isNaN(s) && !isNaN(e) && s >= 0 && e <= genomeLen && s < e && label.trim().length > 0;

  return (
    <div style={{ padding: 18 }}>
      <div style={{ fontSize: 11.5, fontFamily: FONT_SANS, color: UI.muted, marginBottom: 16, lineHeight: 1.5 }}>
        Translucent wedges behind all tracks. Useful for marking pathogenicity islands, prophages, or regions of interest.
      </div>

      <FieldGroup label="Region name">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
               placeholder="e.g. RD1 / ESX-1 locus" style={inputStyle} />
      </FieldGroup>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <FieldGroup label="Start (bp)">
            <input type="number" value={start} onChange={(e) => setStart(e.target.value)}
                   placeholder="0" style={inputStyle} />
          </FieldGroup>
        </div>
        <div style={{ flex: 1 }}>
          <FieldGroup label="End (bp)">
            <input type="number" value={end} onChange={(e) => setEnd(e.target.value)}
                   placeholder={genomeLen.toString()} style={inputStyle} />
          </FieldGroup>
        </div>
      </div>

      <FieldGroup label="Color">
        <ColorSwatchPicker value={color} onChange={setColor} />
      </FieldGroup>

      <FieldGroup label={`Opacity · ${Math.round(opacity * 100)}%`}>
        <input type="range" min={0.05} max={0.5} step={0.01} value={opacity}
               onChange={(e) => setOpacity(parseFloat(e.target.value))}
               style={sliderStyle} />
      </FieldGroup>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, marginBottom: 8 }}>
        <button
          style={{ ...primaryBtn, opacity: valid ? 1 : 0.4, cursor: valid ? 'pointer' : 'not-allowed' }}
          disabled={!valid}
          onClick={() => {
            onAddHighlight({ start: s, end: e, color, opacity, label: label.trim() });
            setStart(''); setEnd(''); setLabel('');
          }}>+ Add highlight region</button>
      </div>
      {!valid && (start || end || label) && (
        <div style={{ fontSize: 10.5, fontFamily: FONT_MONO, color: '#B67777', marginBottom: 10 }}>
          {label.trim().length === 0 ? 'Name required · ' : ''}
          {isNaN(s) || isNaN(e) ? 'Numeric positions required · ' : ''}
          {!isNaN(s) && !isNaN(e) && s >= e ? 'Start must be < End · ' : ''}
          {!isNaN(e) && e > genomeLen ? `End exceeds ${genomeLen.toLocaleString()} · ` : ''}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: UI.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
          {highlights.length} region{highlights.length === 1 ? '' : 's'}
        </div>
        {highlights.map((h, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 0', borderBottom: `1px solid ${UI.border}`,
          }}>
            <div style={{ width: 16, height: 16, borderRadius: 3, background: h.color, opacity: 0.6 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontFamily: FONT_SANS, color: UI.ink }}>{h.label}</div>
              <div style={{ fontSize: 10.5, fontFamily: FONT_MONO, color: UI.muted }}>
                {h.start.toLocaleString()} – {h.end.toLocaleString()}
              </div>
            </div>
            <button onClick={() => onRemoveHighlight(i)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: UI.muted, fontSize: 16, padding: 0,
            }}>×</button>
          </div>
        ))}
        {highlights.length === 0 && (
          <div style={{ fontSize: 12, color: UI.mutedLite, fontStyle: 'italic', marginTop: 8 }}>
            No highlights yet.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Export panel
// ============================================================
function ExportPanel({ onExport, resolution, onResolution, viewMode }) {
  const [format, setFormat] = React.useState('SVG');
  const [figureTarget, setFigureTarget] = React.useState('all3'); // 'current' | 'circular' | 'linear' | 'synteny' | 'all3'
  const [includes, setIncludes] = React.useState({
    Legend: true, 'Title block': true, 'Scale bar': true, 'GC statistics': false,
  });

  const run = () => {
    if (typeof onExport === 'function') {
      onExport({ format, figureTarget, resolution, includes });
    }
  };

  return (
    <div style={{ padding: 18 }}>
      <div style={{ fontSize: 11.5, fontFamily: FONT_SANS, color: UI.muted, marginBottom: 16, lineHeight: 1.5 }}>
        Vector SVG is recommended for publication — crisp at any size.
      </div>

      <FieldGroup label="Figure">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { id: 'current', label: 'Current view' },
            { id: 'all3',    label: 'All 3 views' },
            { id: 'circular', label: 'Circular' },
            { id: 'linear',   label: 'Linear' },
            { id: 'synteny',  label: 'Synteny' },
          ].map(o => (
            <button key={o.id} onClick={() => setFigureTarget(o.id)}
              style={{
                ...ghostBtn, padding: '8px 6px', fontSize: 11,
                background: figureTarget === o.id ? UI.ink : 'transparent',
                color: figureTarget === o.id ? UI.bg : UI.ink,
                borderColor: figureTarget === o.id ? UI.ink : UI.divider,
              }}>{o.label}</button>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label={`Resolution · ${resolution} DPI`}>
        <input type="range" min="72" max="900" step="12"
               value={resolution} onChange={(e) => onResolution(parseInt(e.target.value, 10))}
               style={sliderStyle} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT_MONO, fontSize: 10, color: UI.muted, marginTop: 2 }}>
          <span>screen</span><span>print</span><span>journal</span>
        </div>
      </FieldGroup>

      <FieldGroup label="Format">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {['SVG','PNG','PDF','TIFF'].map(f => (
            <button key={f} onClick={() => setFormat(f)}
              style={{
                ...ghostBtn, padding: '10px',
                fontFamily: FONT_MONO, fontSize: 11,
                background: format === f ? UI.accent : 'transparent',
                color: format === f ? UI.bg : UI.ink,
                borderColor: format === f ? UI.accent : UI.divider,
              }}>{f}</button>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label="Include">
        {['Legend', 'Title block', 'Scale bar', 'GC statistics'].map(opt => (
          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, fontFamily: FONT_SANS, color: UI.ink, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!includes[opt]}
                   onChange={(e) => setIncludes(x => ({ ...x, [opt]: e.target.checked }))}
                   style={{ accentColor: UI.accent }} />
            {opt}
          </label>
        ))}
      </FieldGroup>

      <button style={{ ...primaryBtn, width: '100%', padding: '12px' }} onClick={run}>
        Render figure · {format}
      </button>
      <div style={{ fontSize: 10.5, fontFamily: FONT_MONO, color: UI.muted, textAlign: 'center', marginTop: 8 }}>
        {figureTarget === 'current' ? (viewMode + ' (current)') :
         figureTarget === 'all3' ? 'all 3 views' : figureTarget}
         {' · '}{resolution} DPI
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{
      padding: '40px 24px', textAlign: 'center',
      fontSize: 12.5, fontFamily: FONT_SANS, color: UI.muted,
      lineHeight: 1.5,
    }}>
      {text}
    </div>
  );
}

Object.assign(window, {
  PropertiesPanel, TrackEditor, FeatureDetail, ColorsEditor,
  LabelsEditor, HighlightsEditor, ExportPanel, SyntenyEditor,
  primaryBtn, ghostBtn, inputStyle, sliderStyle,
});

// ============================================================
// Synteny editor — colors, midline, rename genomes, per-genome labels + highlights
// ============================================================
function SyntenyEditor({
  config, onConfigChange,
  genomes, selectedGenomeId, onSelectGenome, onRenameGenome,
  syntenyLabels, onAddSyntenyLabel, onRemoveSyntenyLabel,
  syntenyHighlights, onAddSyntenyHighlight, onRemoveSyntenyHighlight,
  genomeLen,
}) {
  const gid = selectedGenomeId || (genomes[0] && genomes[0].id);
  const g = genomes.find(x => x.id === gid);
  const [section, setSection] = React.useState('Ribbons');
  const labels = syntenyLabels[gid] || [];
  const highlights = syntenyHighlights[gid] || [];

  return (
    <div style={{ padding: 0 }}>
      {/* Sub-tab strip */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${UI.border}` }}>
        {['Ribbons','Midline','Genomes','Labels','Highlights'].map(s => (
          <button key={s} onClick={() => setSection(s)}
            style={{
              flex: 1, padding: '8px 2px',
              fontSize: 10.5, fontFamily: FONT_MONO,
              background: section === s ? UI.bg : 'transparent',
              border: 'none',
              borderBottom: section === s ? `2px solid ${UI.ink}` : '2px solid transparent',
              color: section === s ? UI.ink : UI.muted,
              cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: 0.3,
            }}>{s}</button>
        ))}
      </div>

      <div style={{ padding: 18 }}>
        {section === 'Ribbons' && <RibbonColorsEditor config={config} onChange={onConfigChange} />}
        {section === 'Midline' && <MidlineEditor config={config} onChange={onConfigChange} />}
        {section === 'Genomes' && (
          <GenomesRenameEditor genomes={genomes} onRename={onRenameGenome} />
        )}
        {section === 'Labels' && (
          <PerGenomeLabelsEditor
            genomes={genomes} gid={gid} onSelectGenome={onSelectGenome}
            labels={labels} onAdd={(lbl) => onAddSyntenyLabel(gid, lbl)}
            onRemove={(idx) => onRemoveSyntenyLabel(gid, idx)}
            genomeLen={genomeLen}
          />
        )}
        {section === 'Highlights' && (
          <PerGenomeHighlightsEditor
            genomes={genomes} gid={gid} onSelectGenome={onSelectGenome}
            highlights={highlights} onAdd={(h) => onAddSyntenyHighlight(gid, h)}
            onRemove={(idx) => onRemoveSyntenyHighlight(gid, idx)}
            genomeLen={genomeLen}
          />
        )}
      </div>
    </div>
  );
}

function RibbonColorsEditor({ config, onChange }) {
  const ribbonStyle = config.ribbonStyle || 'curvy';
  return (
    <div>
      <div style={{ fontSize: 11.5, fontFamily: FONT_SANS, color: UI.muted, marginBottom: 12, lineHeight: 1.5 }}>
        Ribbons between genome strips show homologous regions. Color indicates orientation.
      </div>
      <FieldGroup label="Ribbon style">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[
            { id: 'curvy', label: 'Curvy', icon: '⟿' },
            { id: 'straight', label: 'Straight', icon: '⬌' },
          ].map(opt => (
            <button key={opt.id} onClick={() => onChange({ ribbonStyle: opt.id })}
              style={{
                flex: 1, padding: '8px 12px',
                fontSize: 11, fontFamily: FONT_SANS,
                background: ribbonStyle === opt.id ? UI.ink : UI.panel,
                color: ribbonStyle === opt.id ? UI.bg : UI.ink,
                border: `1px solid ${ribbonStyle === opt.id ? UI.ink : UI.border}`,
                borderRadius: 3, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
              <span style={{ fontFamily: FONT_MONO }}>{opt.icon}</span>{opt.label}
            </button>
          ))}
        </div>
      </FieldGroup>
      <FieldGroup label="Same-strand (forward) color">
        <ColorSwatchPicker value={config.forwardColor}
                           onChange={(c) => onChange({ forwardColor: c })} />
        <input type="text" value={config.forwardColor}
               onChange={(e) => onChange({ forwardColor: e.target.value })}
               style={{ ...inputStyle, width: 110, marginTop: 6, fontFamily: FONT_MONO, fontSize: 11 }} />
      </FieldGroup>
      <FieldGroup label="Inverted (reverse-strand) color">
        <ColorSwatchPicker value={config.invertedColor}
                           onChange={(c) => onChange({ invertedColor: c })} />
        <input type="text" value={config.invertedColor}
               onChange={(e) => onChange({ invertedColor: e.target.value })}
               style={{ ...inputStyle, width: 110, marginTop: 6, fontFamily: FONT_MONO, fontSize: 11 }} />
      </FieldGroup>
      <FieldGroup label={`Ribbon opacity range · ${Math.round(config.ribbonOpacityMin*100)}–${Math.round(config.ribbonOpacityMax*100)}%`}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="range" min={0.05} max={0.5} step={0.01}
                 value={config.ribbonOpacityMin}
                 onChange={(e) => onChange({ ribbonOpacityMin: parseFloat(e.target.value) })}
                 style={{ ...sliderStyle, flex: 1 }} />
          <input type="range" min={0.1} max={1} step={0.01}
                 value={config.ribbonOpacityMax}
                 onChange={(e) => onChange({ ribbonOpacityMax: parseFloat(e.target.value) })}
                 style={{ ...sliderStyle, flex: 1 }} />
        </div>
      </FieldGroup>
      <FieldGroup label={`Distance from midline · ${Math.round(config.ribbonInset || 0)} px`}>
        <input type="range" min={0} max={40} step={1}
               value={config.ribbonInset || 0}
               onChange={(e) => onChange({ ribbonInset: parseFloat(e.target.value) })}
               style={sliderStyle} />
        <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: UI.muted, marginTop: 4 }}>
          0 px — ribbons meet the arrow edges.  Increase to pull them inward from each strip.
        </div>
      </FieldGroup>
    </div>
  );
}

function MidlineEditor({ config, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontFamily: FONT_SANS, color: UI.muted, marginBottom: 12, lineHeight: 1.5 }}>
        The midline sits between the forward and reverse CDS strands of each genome strip.
      </div>
      <FieldGroup label="Midline color">
        <ColorSwatchPicker value={config.midlineColor}
                           onChange={(c) => onChange({ midlineColor: c })} />
        <input type="text" value={config.midlineColor}
               onChange={(e) => onChange({ midlineColor: e.target.value })}
               style={{ ...inputStyle, width: 110, marginTop: 6, fontFamily: FONT_MONO, fontSize: 11 }} />
      </FieldGroup>
      <FieldGroup label={`Midline thickness · ${config.midlineThickness.toFixed(1)}px`}>
        <input type="range" min={0} max={4} step={0.1}
               value={config.midlineThickness}
               onChange={(e) => onChange({ midlineThickness: parseFloat(e.target.value) })}
               style={sliderStyle} />
      </FieldGroup>
    </div>
  );
}

function GenomesRenameEditor({ genomes, onRename }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontFamily: FONT_SANS, color: UI.muted, marginBottom: 12, lineHeight: 1.5 }}>
        Rename the title (bold, italic) and subtitle (strain) shown next to each genome strip.
      </div>
      {genomes.map(g => (
        <div key={g.id} style={{
          padding: '12px 0', borderBottom: `1px solid ${UI.border}`,
        }}>
          <div style={{ fontSize: 10, fontFamily: FONT_MONO, color: UI.muted,
                        textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
            {g.id}
          </div>
          <input type="text" value={g.name}
                 onChange={(e) => onRename(g.id, { name: e.target.value })}
                 placeholder="Title"
                 style={{ ...inputStyle, width: '100%', fontFamily: FONT_SANS, fontStyle: 'italic',
                           fontWeight: 600, fontSize: 14, marginBottom: 6 }} />
          <input type="text" value={g.strain}
                 onChange={(e) => onRename(g.id, { strain: e.target.value })}
                 placeholder="Subtitle / strain"
                 style={{ ...inputStyle, width: '100%', fontFamily: FONT_MONO, fontSize: 11 }} />
        </div>
      ))}
    </div>
  );
}

function GenomePicker({ genomes, gid, onSelect }) {
  return (
    <FieldGroup label="Genome">
      <select value={gid} onChange={(e) => onSelect(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}>
        {genomes.map(g => (
          <option key={g.id} value={g.id}>{g.name} — {g.strain}</option>
        ))}
      </select>
    </FieldGroup>
  );
}

function PerGenomeLabelsEditor({ genomes, gid, onSelectGenome, labels, onAdd, onRemove, genomeLen }) {
  const [pos, setPos] = React.useState('');
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState('#1A1A1A');
  const posNum = parseInt(pos, 10);
  const valid = !isNaN(posNum) && posNum >= 0 && posNum <= genomeLen && name.trim().length > 0;

  return (
    <div>
      <GenomePicker genomes={genomes} gid={gid} onSelect={onSelectGenome} />
      <FieldGroup label={`Position (bp) · 0 – ${genomeLen.toLocaleString()}`}>
        <input type="number" value={pos} onChange={(e) => setPos(e.target.value)}
               placeholder="e.g. 1471846" style={inputStyle} />
      </FieldGroup>
      <FieldGroup label="Label text">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
               placeholder="katG" style={inputStyle} />
      </FieldGroup>
      <FieldGroup label="Color">
        <ColorSwatchPicker value={color} onChange={setColor} />
      </FieldGroup>
      <button style={{ ...primaryBtn, marginTop: 8, opacity: valid ? 1 : 0.4,
                        cursor: valid ? 'pointer' : 'not-allowed' }}
              disabled={!valid}
              onClick={() => {
                onAdd({ position: posNum, name: name.trim(), color });
                setPos(''); setName('');
              }}>Add label</button>

      <div style={{ marginTop: 16, fontSize: 10, fontFamily: FONT_MONO, color: UI.muted,
                     textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        {labels.length} label{labels.length === 1 ? '' : 's'} on this genome
      </div>
      {labels.map((lbl, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 0', borderBottom: `1px solid ${UI.border}`,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: lbl.color || '#1A1A1A' }} />
          <span style={{ fontSize: 13, fontFamily: FONT_SANS, fontStyle: 'italic', fontWeight: 500, color: UI.ink, minWidth: 60 }}>
            {lbl.name}
          </span>
          <span style={{ fontSize: 10.5, fontFamily: FONT_MONO, color: UI.muted, flex: 1 }}>
            {lbl.position.toLocaleString()}
          </span>
          <button onClick={() => onRemove(i)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: UI.muted, fontSize: 16, padding: 0, lineHeight: 1,
          }}>×</button>
        </div>
      ))}
    </div>
  );
}

function PerGenomeHighlightsEditor({ genomes, gid, onSelectGenome, highlights, onAdd, onRemove, genomeLen }) {
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [color, setColor] = React.useState('#D4A84A');
  const [opacity, setOpacity] = React.useState(0.22);
  const s = parseInt(start, 10);
  const e = parseInt(end, 10);
  const valid = !isNaN(s) && !isNaN(e) && s >= 0 && e <= genomeLen && s < e && label.trim().length > 0;

  return (
    <div>
      <GenomePicker genomes={genomes} gid={gid} onSelect={onSelectGenome} />
      <FieldGroup label="Region name">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
               placeholder="e.g. RD1 locus" style={inputStyle} />
      </FieldGroup>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <FieldGroup label="Start (bp)">
            <input type="number" value={start} onChange={(e) => setStart(e.target.value)}
                   placeholder="0" style={inputStyle} />
          </FieldGroup>
        </div>
        <div style={{ flex: 1 }}>
          <FieldGroup label="End (bp)">
            <input type="number" value={end} onChange={(e) => setEnd(e.target.value)}
                   placeholder={genomeLen.toString()} style={inputStyle} />
          </FieldGroup>
        </div>
      </div>
      <FieldGroup label="Color">
        <ColorSwatchPicker value={color} onChange={setColor} />
      </FieldGroup>
      <FieldGroup label={`Opacity · ${Math.round(opacity * 100)}%`}>
        <input type="range" min={0.05} max={0.5} step={0.01} value={opacity}
               onChange={(e) => setOpacity(parseFloat(e.target.value))}
               style={sliderStyle} />
      </FieldGroup>
      <button style={{ ...primaryBtn, marginTop: 8, opacity: valid ? 1 : 0.4,
                        cursor: valid ? 'pointer' : 'not-allowed' }}
              disabled={!valid}
              onClick={() => {
                onAdd({ start: s, end: e, color, opacity, label: label.trim() });
                setStart(''); setEnd(''); setLabel('');
              }}>+ Add highlight region</button>

      <div style={{ marginTop: 16, fontSize: 10, fontFamily: FONT_MONO, color: UI.muted,
                     textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        {highlights.length} region{highlights.length === 1 ? '' : 's'} on this genome
      </div>
      {highlights.map((h, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 0', borderBottom: `1px solid ${UI.border}`,
        }}>
          <div style={{ width: 16, height: 16, borderRadius: 3, background: h.color, opacity: 0.6 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontFamily: FONT_SANS, color: UI.ink }}>{h.label}</div>
            <div style={{ fontSize: 10.5, fontFamily: FONT_MONO, color: UI.muted }}>
              {h.start.toLocaleString()} – {h.end.toLocaleString()}
            </div>
          </div>
          <button onClick={() => onRemove(i)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: UI.muted, fontSize: 16, padding: 0,
          }}>×</button>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  SyntenyEditor, RibbonColorsEditor, MidlineEditor,
  GenomesRenameEditor, PerGenomeLabelsEditor, PerGenomeHighlightsEditor, GenomePicker,
});
