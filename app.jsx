// Main app shell — toolbar, view area, legend, tooltip
// Orchestrates circular/linear/synteny views

function Toolbar({ viewMode, onViewMode, onOpenFile, onExport, onTogglePreview, exportPreviewOn, genomeName, zoom, onZoom, viewStart, viewEnd, genomeLen, onViewWindow, onEraseOptionalTracks, onShowBlastSetup }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      height: 52, flexShrink: 0,
      background: UI.bg, borderBottom: `1px solid ${UI.border}`,
      padding: '0 16px',
    }}>
      <div style={{
        fontSize: 13, fontFamily: FONT_SANS, fontWeight: 600, color: UI.ink,
        letterSpacing: -0.1, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <svg width="18" height="18" viewBox="0 0 20 20" style={{ display: 'block' }}>
          <circle cx="10" cy="10" r="8" fill="none" stroke={UI.ink} strokeWidth="1.4" />
          <circle cx="10" cy="10" r="4.5" fill="none" stroke={UI.ink} strokeWidth="1.4" />
          <line x1="10" y1="2" x2="10" y2="5.5" stroke={UI.ink} strokeWidth="1.4" />
          <line x1="10" y1="14.5" x2="10" y2="18" stroke={UI.ink} strokeWidth="1.4" />
        </svg>
        Gyre
        <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: UI.muted, fontWeight: 400, marginLeft: 2 }}>
          /genome viewer
        </span>
      </div>

      <div style={{ width: 1, height: 24, background: UI.border, margin: '0 18px' }} />

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onEraseOptionalTracks} style={{
          ...ghostBtn, padding: '6px 12px', fontSize: 12,
        }} title="Reset to new empty workspace">
          New
        </button>
        <button onClick={onOpenFile} style={{
          ...ghostBtn, padding: '6px 12px', fontSize: 12,
        }}>
          Open GenBank…
        </button>
        <button onClick={onShowBlastSetup} style={{
          ...ghostBtn, padding: '6px 12px', fontSize: 12,
        }}>
          Compare genomes…
        </button>
        <InfoIcon
          title="GenBank flat file · .gb / .gbk"
          body={'Gyre parses the NCBI GenBank flat-file format. It extracts LOCUS length, ACCESSION, DEFINITION, and the FEATURES block — specifically gene and CDS entries with /gene, /product, or /locus_tag qualifiers. Strand is inferred from complement(). Used for BLAST ring comparisons against the reference.'}
          example={'LOCUS       NC_000962   4411532 bp    DNA\nDEFINITION  Mycobacterium tuberculosis H37Rv\nFEATURES             Location/Qualifiers\n     gene            1..1524\n                     /gene="dnaA"\n                     /locus_tag="Rv0001"\n     CDS             complement(2052..3260)\n                     /product="DNA gyrase subunit B"'}
          position="below"
        />
      </div>

      <div style={{ marginLeft: 14, fontSize: 12, fontFamily: FONT_SANS, color: UI.ink }}>
        <span style={{ fontStyle: 'italic' }}>{genomeName}</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* View mode segmented control */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: UI.panel, border: `1px solid ${UI.border}`, borderRadius: 4,
        padding: 2,
      }}>
        {[
          { id: 'circular', label: 'Circular', icon: '◯' },
          { id: 'linear',   label: 'Linear',   icon: '▭' },
          { id: 'synteny',  label: 'Synteny',  icon: '⇅' },
        ].map(m => (
          <button key={m.id} onClick={() => onViewMode(m.id)}
            style={{
              padding: '6px 14px', fontFamily: FONT_SANS, fontSize: 12,
              border: 'none', borderRadius: 3, cursor: 'pointer',
              color: viewMode === m.id ? UI.bg : UI.ink,
              background: viewMode === m.id ? UI.ink : 'transparent',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <span style={{ fontFamily: FONT_MONO }}>{m.icon}</span>{m.label}
          </button>
        ))}
      </div>

      {viewMode === 'linear' && (
        <div style={{ marginLeft: 14, display: 'flex', alignItems: 'center', gap: 6,
                      fontFamily: FONT_MONO, fontSize: 11, color: UI.muted }}>
          <span>{formatBp(viewStart)}</span>
          <span>→</span>
          <span>{formatBp(viewEnd)}</span>
          <button onClick={() => onViewWindow(0, genomeLen)}
            style={{ ...ghostBtn, padding: '3px 8px', fontSize: 10.5, marginLeft: 4 }}>
            Fit
          </button>
        </div>
      )}

      <div style={{ width: 1, height: 24, background: UI.border, margin: '0 14px' }} />

      <button onClick={onTogglePreview} style={{
        ...ghostBtn, padding: '6px 12px', fontSize: 12,
        background: exportPreviewOn ? UI.ink : 'transparent',
        color: exportPreviewOn ? UI.bg : UI.ink,
      }} title="Show view at export dimensions">
        {exportPreviewOn ? '◼ Preview ON' : '◻ PNG preview'}
      </button>

      <button onClick={onExport} style={{ ...ghostBtn, padding: '6px 12px', fontSize: 12, marginLeft: 8 }}>
        Export…
      </button>
    </div>
  );
}

// ============================================================
// Floating tooltip for hovered feature
// ============================================================
function FeatureTooltip({ feature, x, y }) {
  if (!feature) return null;
  try {
    const cat = FEATURE_CATEGORIES[feature.category];
    const catColor = cat ? cat.color : '#888';
    const strand = feature.strand > 0 ? '+' : '−';
    const length = feature.end && feature.start ? (feature.end - feature.start).toLocaleString() : '?';

    return (
      <div style={{
        position: 'absolute', left: x + 14, top: y + 14, pointerEvents: 'none',
        background: UI.ink, color: UI.bg,
        padding: '8px 11px', borderRadius: 4,
        fontFamily: FONT_SANS, fontSize: 11.5,
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
        maxWidth: 260, zIndex: 100,
      }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, opacity: 0.7, marginBottom: 2 }}>
          {feature.id || '?'} · {strand} · {length} bp
        </div>
        <div style={{ fontWeight: 500 }}>{feature.product || 'Unknown'}</div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.85 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: catColor }} />
          <span style={{ fontSize: 10.5 }}>{feature.category || 'Uncategorized'}</span>
        </div>
      </div>
    );
  } catch (err) {
    console.warn('[Gyre] Tooltip error:', err);
    return (
      <div style={{
        position: 'absolute', left: x + 14, top: y + 14, pointerEvents: 'none',
        background: UI.warn, color: UI.bg,
        padding: '6px 10px', borderRadius: 4,
        fontFamily: FONT_MONO, fontSize: 10,
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
        zIndex: 100,
      }}>
        Feature info unavailable
      </div>
    );
  }
}

// ============================================================
// Legend (bottom strip)
// ============================================================
function Legend({ overrides = {}, onChange = () => {}, onReset = () => {}, editable = true }) {
  const [editingKey, setEditingKey] = React.useState(null);
  const [pickerKey, setPickerKey] = React.useState(null);

  const getLabel = (k, defLabel) => (overrides[k]?.label ?? defLabel);
  const getColor = (k, defColor) => (overrides[k]?.color ?? defColor);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      padding: '10px 18px', flexShrink: 0,
      background: UI.bg, borderTop: `1px solid ${UI.border}`,
      fontFamily: FONT_SANS, fontSize: 11, color: UI.ink2,
      position: 'relative',
    }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: UI.muted,
                     textTransform: 'uppercase', letterSpacing: 0.5 }}>Legend</span>
      {Object.entries(FEATURE_CATEGORIES).map(([key, cat]) => {
        const label = getLabel(key, cat.label);
        const color = getColor(key, cat.color);
        const isEditing = editingKey === key;
        return (
          <span key={key} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            position: 'relative',
            padding: editable ? '2px 6px' : 0,
            borderRadius: 3,
            background: editable && editingKey === key ? UI.panel : 'transparent',
            border: editable ? `1px solid ${editingKey === key ? UI.divider : 'transparent'}` : 'none',
            cursor: editable ? 'pointer' : 'default',
          }}>
            <span
              onClick={(e) => { if (!editable) return; e.stopPropagation(); setPickerKey(pickerKey === key ? null : key); }}
              title={editable ? 'Change color' : undefined}
              style={{
                width: 10, height: 10, borderRadius: 2, background: color,
                cursor: editable ? 'pointer' : 'default',
                outline: editable && pickerKey === key ? `1.5px solid ${UI.ink}` : 'none',
                outlineOffset: 1,
              }} />
            {isEditing ? (
              <input
                autoFocus
                defaultValue={label}
                onBlur={(e) => { onChange(key, { label: e.target.value.trim() || cat.label }); setEditingKey(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setEditingKey(null);
                }}
                style={{
                  font: 'inherit', color: UI.ink,
                  border: `1px solid ${UI.divider}`, background: UI.bg,
                  padding: '2px 4px', minWidth: 180,
                }} />
            ) : (
              <span
                onClick={() => editable && setEditingKey(key)}
                title={editable ? 'Click to rename' : undefined}>
                {label}
              </span>
            )}
            {pickerKey === key && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
                  background: UI.panel, border: `1px solid ${UI.divider}`,
                  padding: 8, borderRadius: 4, zIndex: 20,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
                  display: 'grid', gridTemplateColumns: 'repeat(6, 16px)', gap: 4,
                  minWidth: 150,
                }}>
                {['#5B8AA6','#7FA876','#C4976A','#9C9C9C','#B67777','#8D79B0','#2B5F6B','#D4B66E','#75A897','#A87B6C','#6C87B0','#4F5F4A'].map(hex => (
                  <button key={hex}
                    onClick={() => { onChange(key, { color: hex }); setPickerKey(null); }}
                    style={{
                      width: 16, height: 16, background: hex,
                      border: hex === color ? `2px solid ${UI.ink}` : `1px solid ${UI.divider}`,
                      borderRadius: 2, cursor: 'pointer', padding: 0,
                    }}/>
                ))}
                <input type="color" defaultValue={color}
                  onChange={(e) => onChange(key, { color: e.target.value })}
                  style={{ gridColumn: '1 / -1', width: '100%', height: 22, marginTop: 4, border: 'none', background: 'transparent', cursor: 'pointer' }} />
              </div>
            )}
          </span>
        );
      })}
      {editable && Object.keys(overrides).length > 0 && (
        <button
          onClick={onReset}
          title="Reset legend labels and colors"
          style={{
            marginLeft: 'auto', fontFamily: FONT_MONO, fontSize: 10,
            color: UI.muted, background: 'transparent',
            border: `1px solid ${UI.divider}`, padding: '3px 8px',
            borderRadius: 3, cursor: 'pointer',
          }}>Reset</button>
      )}
    </div>
  );
}

// ============================================================
// BLAST Setup Modal
// ============================================================
function BlastSetupModal({ open, onClose, onBlastComplete, onAddBlastTrack, status, genomeLen }) {
  const [step, setStep] = React.useState('instructions'); // 'instructions' | 'upload' | 'running'
  const [refFile, setRefFile] = React.useState(null);
  const [queryFiles, setQueryFiles] = React.useState([]);
  const [syntenyFiles, setSyntenyFiles] = React.useState([]);
  const [running, setRunning] = React.useState(false);
  const refFileInputRef = React.useRef(null);
  const queryFileInputRef = React.useRef(null);
  const syntenyFileInputRef = React.useRef(null);

  if (!open) return null;

  const handleRefFileSelect = (e) => {
    const file = e.target.files?.[0] || null;
    setRefFile(file);
  };

  const handleQueryFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    setQueryFiles(files);
  };

  const handleSyntenyFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    setSyntenyFiles(files);
  };

  const handleRunBlast = async () => {
    if (!refFile && syntenyFiles.length === 0) {
      alert('Please select a reference genome or synteny genomes');
      return;
    }

    if (refFile && queryFiles.length === 0 && syntenyFiles.length === 0) {
      alert('Please select query genomes or synteny genomes');
      return;
    }

    setRunning(true);
    setStep('running');

    try {
      let addedCount = 0;

      // PART 1: Run BLAST for circular view (reference vs queries)
      if (refFile && queryFiles.length > 0) {
        const formData = new FormData();
        formData.append('reference', refFile);
        queryFiles.forEach(f => formData.append('queries', f));

        const refText = await refFile.text();
        const refLines = refText.split(/\r?\n/);
        let refLen = 0;
        for (let i = 0; i < Math.min(refLines.length, 30); i++) {
          const m = refLines[i].match(/(\d+)\s+bp/);
          if (m) { refLen = parseInt(m[1], 10); break; }
        }

        if (refLen > 0) {
          formData.append('refLength', refLen);
          const response = await fetch('http://localhost:3000/api/blast/compare', {
            method: 'POST',
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            window.GENOME_LENGTH = data.refLength;
            window.dispatchEvent(new Event('gyre-data-loaded'));

            if (!window.BLAST_RINGS) window.BLAST_RINGS = {};
            for (const [genomeName, segments] of Object.entries(data.results)) {
              window.BLAST_RINGS[genomeName] = segments;
              onAddBlastTrack(genomeName);
              addedCount++;
            }
          }
        }
      }

      // PART 2: Process synteny genomes (exclusive for synteny view)
      if (syntenyFiles.length > 0) {
        window.COMPARISON_GENOMES = [];
        window.MULTI_SYNTENY = [];

        // Add each synteny genome to the list
        const syntenyGenomes = [];
        window.SYNTENY_GENOME_FEATURES = {}; // Store features for each genome

        for (const f of syntenyFiles) {
          const fText = await f.text();
          const fLines = fText.split(/\r?\n/);
          const fName = f.name.replace(/\.(gb|gbk|genbank|txt)$/i, '');
          const genomeId = `syn-${fName}-${Date.now()}`;

          // Extract length from LOCUS line
          let fLen = 0;
          for (let i = 0; i < Math.min(fLines.length, 30); i++) {
            const m = fLines[i].match(/(\d+)\s+bp/);
            if (m) { fLen = parseInt(m[1]); break; }
          }

          if (fLen > 0) {
            // Parse features from GenBank file
            const parsed = parseGenBank(fText);
            window.SYNTENY_GENOME_FEATURES[genomeId] = parsed.features || [];

            syntenyGenomes.push({
              id: genomeId,
              name: fName,
              length: fLen,
              file: f,
              segments: [],
            });

            window.COMPARISON_GENOMES.push({
              id: genomeId,
              name: fName,
              strain: '',
              length: fLen,
              color: ['#2B5F6B', '#5B8AA6', '#7FA876', '#C4976A', '#8878A8'][syntenyGenomes.length % 5],
            });

            console.log(`Synteny genome: ${fName} (${fLen}bp) with ${parsed.features?.length || 0} features`);
          }
        }

        // Run pairwise BLAST between adjacent genomes
        console.log('Running pairwise BLAST for synteny between adjacent genomes...');
        for (let i = 0; i < syntenyGenomes.length - 1; i++) {
          const g1 = syntenyGenomes[i];
          const g2 = syntenyGenomes[i + 1];
          console.log(`Pairwise BLAST: ${g1.name} (${g1.length}bp) vs ${g2.name} (${g2.length}bp)`);

          try {
            const pairForm = new FormData();
            pairForm.append('genome1', g1.file);
            pairForm.append('genome2', g2.file);
            pairForm.append('len1', g1.length);
            pairForm.append('len2', g2.length);

            console.log('Sending pairwise BLAST request...');
            const pairResp = await fetch('http://localhost:3000/api/blast/pairwise', {
              method: 'POST',
              body: pairForm,
            });

            console.log(`Pairwise response status: ${pairResp.status}`);

            if (pairResp.ok) {
              const pairData = await pairResp.json();

              if (pairData.pairs && pairData.pairs.length > 0) {
                // Filter out invalid pairs with bad coordinates
                const validPairs = pairData.pairs.filter(p => {
                  const isValid = Array.isArray(p.a) && Array.isArray(p.b) &&
                    typeof p.a[0] === 'number' && typeof p.a[1] === 'number' &&
                    typeof p.b[0] === 'number' && typeof p.b[1] === 'number' &&
                    isFinite(p.a[0]) && isFinite(p.a[1]) &&
                    isFinite(p.b[0]) && isFinite(p.b[1]) &&
                    p.a[0] >= 0 && p.a[1] > 0 && p.b[0] >= 0 && p.b[1] > 0;
                  if (!isValid) {
                    console.warn('Skipping invalid pair:', p);
                  }
                  return isValid;
                });

                if (validPairs.length > 0) {
                  window.MULTI_SYNTENY.push({
                    from: i,
                    to: i + 1,
                    pairs: validPairs,
                  });
                  console.log(`Created synteny between ${g1.name} and ${g2.name}: ${validPairs.length}/${pairData.pairs.length} valid alignments`);
                } else {
                  console.warn(`No valid pairs between ${g1.name} and ${g2.name}`);
                }
              }
            } else {
              const errData = await pairResp.json();
              console.error(`Pairwise BLAST error (${pairResp.status}):`, errData);
            }
          } catch (e) {
            console.error(`Pairwise BLAST exception for ${g1.name} vs ${g2.name}:`, e.message, e);
          }
        }

        if (syntenyGenomes.length > 0) {
          addedCount += syntenyGenomes.length;
          window.dispatchEvent(new Event('gyre-data-loaded'));
        }
      }

      setStep('instructions');
      setRefFile(null);
      setQueryFiles([]);
      setRunning(false);
      if (refFileInputRef.current) refFileInputRef.current.value = '';
      if (queryFileInputRef.current) queryFileInputRef.current.value = '';

      alert(`✅ BLAST complete! Added ${addedCount} comparison ring(s)`);
      setTimeout(() => onClose(), 1000);
    } catch (err) {
      console.error('BLAST error:', err);
      setRunning(false);
      setStep('upload');
      alert(`❌ BLAST failed: ${err.message}\n\nMake sure the backend server is running (npm start)`);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div style={{
        background: UI.panel, borderRadius: 8, padding: 28, maxWidth: 600, maxHeight: '80vh',
        overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
        }}>
          <div style={{
            fontSize: 18, fontFamily: FONT_SANS, fontWeight: 600, color: UI.ink,
          }}>
            Compare Genomes with BLAST
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 24, color: UI.muted, cursor: 'pointer',
            padding: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 4, transition: 'background 0.2s',
          }} onMouseEnter={(e) => e.target.style.background = UI.bg}
             onMouseLeave={(e) => e.target.style.background = 'none'}
             title="Close">
            ✕
          </button>
        </div>

        {step === 'instructions' && (
          <div style={{ fontSize: 13, fontFamily: FONT_SANS, color: UI.ink2, lineHeight: 1.6 }}>
            <strong style={{ color: UI.ink }}>📋 One-time Setup:</strong>
            <ol style={{ marginTop: 8, paddingLeft: 20, marginBottom: 20 }}>
              <li><strong>Install BLAST+</strong>:
                <pre style={{ background: UI.bg, padding: 10, borderRadius: 4, marginTop: 6, fontSize: 11, overflow: 'auto' }}>
{`Windows: choco install ncbi-blast
Mac: brew install blast
Linux: sudo apt-get install ncbi-blast+`}
                </pre>
              </li>
              <li style={{ marginTop: 12 }}><strong>Start backend</strong>:
                <pre style={{ background: UI.bg, padding: 10, borderRadius: 4, marginTop: 6, fontSize: 11, overflow: 'auto' }}>
{`npm install --save-dev express multer
npm start`}
                </pre>
              </li>
              <li style={{ marginTop: 12 }}>Load reference genome: <strong>"Open GenBank…"</strong></li>
            </ol>
            <button onClick={() => setStep('upload')} style={{ ...primaryBtn }}>
              Next: Upload Genomes
            </button>
          </div>
        )}

        {step === 'upload' && (
          <div style={{ fontSize: 13, fontFamily: FONT_SANS, color: UI.ink2 }}>
            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: 'block', fontSize: 11, fontFamily: FONT_MONO,
                color: UI.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
              }}>🔍 Reference genome (.gb file)</label>
              <input
                ref={refFileInputRef}
                type="file"
                accept=".gb,.gbk,.genbank"
                onChange={handleRefFileSelect}
                style={{
                  width: '100%', padding: '10px', fontFamily: FONT_SANS, fontSize: 12,
                  border: `1px solid ${UI.divider}`, borderRadius: 4, boxSizing: 'border-box',
                }}
              />
              {refFile && (
                <div style={{ marginTop: 6, fontSize: 11, color: UI.ink, fontFamily: FONT_MONO }}>
                  ✓ {refFile.name}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: 'block', fontSize: 11, fontFamily: FONT_MONO,
                color: UI.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
              }}>📊 Query genomes (.gb files, multiple allowed)</label>
              <input
                ref={queryFileInputRef}
                type="file"
                multiple
                accept=".gb,.gbk,.genbank"
                onChange={handleQueryFileSelect}
                style={{
                  width: '100%', padding: '10px', fontFamily: FONT_SANS, fontSize: 12,
                  border: `1px solid ${UI.divider}`, borderRadius: 4, boxSizing: 'border-box',
                }}
              />
            </div>

            {queryFiles.length > 0 && (
              <div style={{ marginBottom: 18, fontSize: 12 }}>
                <strong>Query genomes selected:</strong>
                <ul style={{ marginTop: 6, paddingLeft: 20, color: UI.muted }}>
                  {queryFiles.map(f => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${UI.divider}` }}>
              <div style={{ fontSize: 12, color: UI.ink, marginBottom: 12, fontWeight: 600 }}>
                OR for Synteny View:
              </div>
              <label style={{
                display: 'block', fontSize: 11, fontFamily: FONT_MONO,
                color: UI.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
              }}>🔀 Synteny genomes (2+ genomes, multiple .gb files)</label>
              <div style={{ fontSize: 11, color: UI.muted, marginBottom: 10 }}>
                Upload multiple genomes to compare in synteny view. BLAST will run between adjacent genomes.
              </div>
              <input
                ref={syntenyFileInputRef}
                type="file"
                multiple
                accept=".gb,.gbk,.genbank"
                onChange={handleSyntenyFileSelect}
                style={{
                  width: '100%', padding: '10px', fontFamily: FONT_SANS, fontSize: 12,
                  border: `1px solid ${UI.divider}`, borderRadius: 4, boxSizing: 'border-box',
                }}
              />
            </div>

            {syntenyFiles.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12 }}>
                <strong>Synteny genomes selected:</strong>
                <ul style={{ marginTop: 6, paddingLeft: 20, color: UI.muted }}>
                  {syntenyFiles.map(f => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setStep('instructions')} style={{ ...ghostBtn }}>
                Back
              </button>
              <button
                onClick={handleRunBlast}
                disabled={running || (!refFile && syntenyFiles.length < 2) || (refFile && queryFiles.length === 0 && syntenyFiles.length === 0)}
                style={{
                  ...primaryBtn,
                  opacity: (running || (!refFile && syntenyFiles.length < 2) || (refFile && queryFiles.length === 0 && syntenyFiles.length === 0)) ? 0.5 : 1,
                  cursor: (running || (!refFile && syntenyFiles.length < 2) || (refFile && queryFiles.length === 0 && syntenyFiles.length === 0)) ? 'not-allowed' : 'pointer',
                }}
              >
                {running ? 'Running BLAST...' : 'Run BLAST'}
              </button>
            </div>
          </div>
        )}

        {step === 'running' && (
          <div style={{ textAlign: 'center', fontSize: 13, fontFamily: FONT_SANS, color: UI.ink2 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
            <div>Running BLAST comparison...</div>
            <div style={{ fontSize: 12, color: UI.muted, marginTop: 12 }}>
              This may take a few minutes depending on genome size.
              <br />Check the backend terminal for progress.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Main app
// ============================================================
function App() {
  const [viewMode, setViewMode] = React.useState(() => {
    return localStorage.getItem('gyre-view') || 'circular';
  });
  React.useEffect(() => { localStorage.setItem('gyre-view', viewMode); }, [viewMode]);

  // Listen for programmatic view switches (used by the 3-view exporter)
  React.useEffect(() => {
    const onSet = (e) => setViewMode(e.detail);
    window.addEventListener('gyre-set-view', onSet);
    return () => {
      window.removeEventListener('gyre-set-view', onSet);
    };
  }, []);

  const [tracks, setTracks] = React.useState(DEFAULT_TRACKS);
  const [selectedTrackId, setSelectedTrackId] = React.useState(null);
  const [selectedFeature, setSelectedFeature] = React.useState(null);
  const [hoveredId, setHoveredId] = React.useState(null);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const [tab, setTab] = React.useState('Track');

  const [viewStart, setViewStart] = React.useState(0);
  const [viewEnd, setViewEnd] = React.useState(GENOME_LENGTH);

  const [filterStart, setFilterStart] = React.useState(null);
  const [filterEnd, setFilterEnd] = React.useState(null);

  const genomeLen = window.GENOME_LENGTH || GENOME_LENGTH;

  const [labels, setLabels] = React.useState(window.DEMO_LABELS || []);
  const [availableLabels, setAvailableLabels] = React.useState(window.GENBANK_LABELS || window.DEMO_LABELS || []);
  const [highlights, setHighlights] = React.useState([
    { start: 1580000, end: 1890000, color: '#D4A84A', opacity: 0.14, label: 'RD1 / ESX-1 locus' },
  ]);

  const [resolution, setResolution] = React.useState(300);
  const defaultView = { zoom: 1, panX: 0, panY: 0 };
  const viewReducer = (state, action) => {
    try {
      const safeState = state || defaultView;
      if (typeof action === 'function') {
        const result = action(safeState);
        return result || defaultView;
      }
      return action || defaultView;
    } catch (err) {
      console.error('[viewReducer] Error:', err, { state, action });
      return state || defaultView;
    }
  };
  const [circularView, setCircularView] = React.useReducer(viewReducer, defaultView);
  const [syntenyView, setSyntenyView] = React.useReducer(viewReducer, defaultView);
  const [linearView, setLinearView] = React.useReducer(viewReducer, defaultView);
  const [exportPreview, setExportPreview] = React.useState(false);
  const [paletteTick, setPaletteTick] = React.useState(0);
  const bumpPalette = React.useCallback(() => setPaletteTick(t => t + 1), []);

  // Synteny customization
  const [syntenyConfig, setSyntenyConfig] = React.useState({
    forwardColor: '#5B8AA6',
    invertedColor: '#B67777',
    midlineColor: '#C8C3B4',
    midlineThickness: 1.2,
    ribbonOpacityMin: 0.15,
    ribbonOpacityMax: 0.55,
    ribbonInset: 0,
    ribbonStyle: 'curvy',
  });
  // Legend overrides — user-editable display labels + swatch colors per category.
  // Persisted to localStorage so users keep their renames across reloads.
  const [legendOverrides, setLegendOverrides] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('gyre-legend-overrides') || '{}'); }
    catch { return {}; }
  });
  React.useEffect(() => {
    localStorage.setItem('gyre-legend-overrides', JSON.stringify(legendOverrides));
    // Apply overrides to the global FEATURE_CATEGORIES so every view that reads
    // category colors/labels picks up the user's edits. We save the originals
    // once, then reapply from originals + current overrides on every change.
    if (!window.__FEATURE_CATEGORIES_ORIG) {
      window.__FEATURE_CATEGORIES_ORIG = JSON.parse(JSON.stringify(FEATURE_CATEGORIES));
    }
    const orig = window.__FEATURE_CATEGORIES_ORIG;
    Object.keys(FEATURE_CATEGORIES).forEach(k => {
      const base = orig[k];
      const ov = legendOverrides[k] || {};
      FEATURE_CATEGORIES[k] = {
        color: ov.color ?? base.color,
        label: ov.label ?? base.label,
      };
    });
    // Nudge all views to re-render with the new palette.
    bumpPalette();
  }, [legendOverrides]);
  const [genomeOverrides, setGenomeOverrides] = React.useState({}); // { [id]: {name?, strain?} }
  const [syntenyUpdateTick, setSyntenyUpdateTick] = React.useState(0);
  const mergedGenomes = React.useMemo(() => (window.COMPARISON_GENOMES || COMPARISON_GENOMES).map(g => ({
    ...g, ...(genomeOverrides[g.id] || {})
  })), [genomeOverrides, syntenyUpdateTick]);
  const [syntenyLabels, setSyntenyLabels] = React.useState(() => {
    const m = {};
    (window.COMPARISON_GENOMES || COMPARISON_GENOMES).forEach(g => { m[g.id] = []; });
    // Seed the reference with the curated labels so there's something to see
    if ((window.COMPARISON_GENOMES || COMPARISON_GENOMES).length > 0) {
      const refId = (window.COMPARISON_GENOMES || COMPARISON_GENOMES)[0].id;
      m[refId] = CURATED_LABELS.slice(0, 10).map(l => ({ ...l, color: '#1A1A1A' }));
    }
    return m;
  });
  const [syntenyHighlights, setSyntenyHighlights] = React.useState(() => {
    const m = {};
    (window.COMPARISON_GENOMES || COMPARISON_GENOMES).forEach(g => { m[g.id] = []; });
    return m;
  });
  const [syntenySelectedGenomeId, setSyntenySelectedGenomeId] = React.useState(() => {
    const genomes = window.COMPARISON_GENOMES || COMPARISON_GENOMES;
    return genomes.length > 0 ? genomes[0].id : null;
  });
  const [showBlastModal, setShowBlastModal] = React.useState(false);
  const [blastStatus, setBlastStatus] = React.useState(''); // status message

  // Listen for data reload events to update both tracks and synteny view
  React.useEffect(() => {
    const onReload = () => {
      setTracks(ts => [...ts]); // Force track re-render
      setSyntenyUpdateTick(t => t + 1); // Force synteny genomes update
    };
    window.addEventListener('gyre-data-loaded', onReload);
    return () => {
      window.removeEventListener('gyre-data-loaded', onReload);
    };
  }, []);

  const hoveredFeature = hoveredId ? FEATURES.find(f => f.id === hoveredId) : null;
  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  const onUpdateTrack = (id, patch) => {
    setTracks(ts => {
      const src = ts.find(t => t.id === id);
      const next = ts.map(t => t.id === id ? { ...t, ...patch } : t);
      // Sync radius to linked partner
      if (src?.linkedTo && patch.radius !== undefined) {
        const partner = ts.find(t => t.id === src.linkedTo);
        if (partner) {
          const offset = partner.linkedOffset ?? (partner.radius - src.radius);
          return next.map(t => t.id === partner.id ? { ...t, radius: patch.radius + offset } : t);
        }
      }
      return next;
    });
  };

  const onLinkTracks = (idA, idB) => {
    setTracks(ts => {
      const a = ts.find(t => t.id === idA);
      const b = ts.find(t => t.id === idB);
      if (!a || !b) return ts;
      const offset = b.radius - a.radius;
      return ts.map(t => {
        if (t.id === idA) return { ...t, linkedTo: idB, linkedOffset: offset };
        if (t.id === idB) return { ...t, linkedTo: idA, linkedOffset: -offset };
        return t;
      });
    });
  };

  const onUnlinkTrack = (id) => {
    setTracks(ts => {
      const src = ts.find(t => t.id === id);
      const partnerId = src?.linkedTo;
      return ts.map(t => {
        if (t.id === id || t.id === partnerId) {
          const { linkedTo, linkedOffset, ...rest } = t;
          return rest;
        }
        return t;
      });
    });
  };

  const onToggleVisible = (id) => {
    setTracks(ts => ts.map(t => t.id === id ? { ...t, visible: !t.visible } : t));
  };
  const onReorderTrack = (id, dir) => {
    setTracks(ts => {
      // tracks are sorted by radius (inner→outer); reorder by swapping radii with neighbor
      const sorted = [...ts].sort((a, b) => a.radius - b.radius);
      const idx = sorted.findIndex(t => t.id === id);
      const neighborIdx = dir > 0 ? idx + 1 : idx - 1;
      if (neighborIdx < 0 || neighborIdx >= sorted.length) return ts;
      const copy = [...ts];
      const a = copy.find(t => t.id === sorted[idx].id);
      const b = copy.find(t => t.id === sorted[neighborIdx].id);
      const ar = a.radius, br = b.radius;
      a.radius = br; b.radius = ar;
      return copy;
    });
  };

  const onEraseOptionalTracks = () => {
    // Full workspace reset: create a truly blank slate with no data
    // Reset genome metadata to empty state
    window.GENOME_LENGTH = 0;
    window.GENOME_ACCESSION = '';
    window.GENOME_NAME = 'No genome loaded';
    // Clear loaded features and GC data
    window.FEATURES.length = 0;
    window.GC_CONTENT = [];
    window.GC_SKEW = [];
    window.COVERAGE = [];
    // Clear synteny genomes and links completely (no reference in synteny view)
    window.COMPARISON_GENOMES = [];
    window.MULTI_SYNTENY = [];
    window.SYNTENY_GENOME_FEATURES = {};
    // Keep essential track types including GC analysis
    // Remove: bed, blast-ring, bedgraph, coverage
    const keepTypes = ['ruler', 'gc', 'gc-skew', 'cds', 'rna', 'mobile', 'labels'];
    setTracks(DEFAULT_TRACKS.filter(t => keepTypes.includes(t.type)));
    // Clear all user data
    setLabels([]);
    setHighlights([]);
    // Reset view states
    setCircularView({ zoom: 1, panX: 0, panY: 0 });
    setSyntenyView({ zoom: 1, panX: 0, panY: 0 });
    setLinearView({ zoom: 1, panX: 0, panY: 0 });
    // Reset synteny customization
    setSyntenySelectedGenomeId(null);
    setSyntenyLabels({});
    setSyntenyHighlights({});
    // Dispatch reload event to refresh all views
    window.dispatchEvent(new Event('gyre-data-loaded'));
  };

  const onAddBlastTrack = (genomeName) => {
    // Create a new BLAST ring track for the comparison genome
    const newId = `blast-ring-${Date.now()}-${Math.random()}`;
    const colors = ['#5B8AA6', '#7FA876', '#C4976A', '#B67777', '#8878A8', '#D4A84A'];
    const colorIdx = tracks.filter(t => t.type === 'blast-ring').length % colors.length;

    const newTrack = {
      id: newId,
      name: `${genomeName} (BLAST)`,
      type: 'blast-ring',
      ringId: genomeName,
      radius: 0.72 - (colorIdx * 0.05), // stack them outward
      thickness: 0.032,
      color: colors[colorIdx],
      opacity: 0.85,
      visible: true,
    };

    setTracks(ts => [...ts, newTrack]);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', width: '100vw', overflow: 'hidden',
      background: UI.bg, color: UI.ink, fontFamily: FONT_SANS,
    }}>
      <Toolbar
        viewMode={viewMode}
        onViewMode={setViewMode}
        onOpenFile={() => openGenBank(setLabels, setTracks, setAvailableLabels)}
        onExport={() => setTab('Export')}
        onTogglePreview={() => setExportPreview(v => !v)}
        exportPreviewOn={exportPreview}
        genomeName={GENOME_NAME}
        viewStart={viewStart} viewEnd={viewEnd}
        genomeLen={genomeLen}
        onViewWindow={(a, b) => { setViewStart(a); setViewEnd(b); }}
        onEraseOptionalTracks={onEraseOptionalTracks}
        onShowBlastSetup={() => setShowBlastModal(true)}
      />

      <BlastSetupModal
        open={showBlastModal}
        onClose={() => { setShowBlastModal(false); setBlastStatus(''); }}
        onBlastComplete={() => setShowBlastModal(false)}
        onAddBlastTrack={onAddBlastTrack}
        status={blastStatus}
        genomeLen={genomeLen}
      />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <TrackPanel
          tracks={[...tracks].sort((a, b) => a.radius - b.radius)}
          selectedTrackId={selectedTrackId}
          onSelect={(id) => { setSelectedTrackId(id); setSelectedFeature(null); setTab('Track'); }}
          onToggleVisible={onToggleVisible}
          onReorder={onReorderTrack}
          onAddFeatureTrack={() => importFeatureTrack(setTracks)}
          onImportBedGraph={() => importBedGraph(setTracks)}
          onImportVCF={() => openVCF(setTracks)}
        />

        <div style={{ flex: 1, minWidth: 0, position: 'relative', background: UI.bg,
                      display: 'flex', flexDirection: 'column' }}>
          <div
            data-gyre-viewarea
            style={{ flex: 1, minHeight: 0, position: 'relative' }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
          >
            <ViewArea
              viewMode={viewMode}
              exportPreview={exportPreview}
              tracks={tracks}
              features={FEATURES}
              gcContent={window.GC_CONTENT || GC_CONTENT} gcSkew={window.GC_SKEW || GC_SKEW} coverage={window.COVERAGE || COVERAGE}
              labels={labels}
              viewStart={viewStart} viewEnd={viewEnd}
              hoveredId={hoveredId} setHoveredId={setHoveredId}
              setSelectedFeature={setSelectedFeature}
              highlights={highlights}
              circularView={circularView} setCircularView={setCircularView}
              syntenyView={syntenyView} setSyntenyView={setSyntenyView}
              linearView={linearView} setLinearView={setLinearView}
              syntenyConfig={syntenyConfig}
              syntenyLabels={syntenyLabels}
              syntenyHighlights={syntenyHighlights}
              mergedGenomes={mergedGenomes}
              paletteTick={paletteTick}
              genomeLen={window.GENOME_LENGTH || GENOME_LENGTH}
              filterStart={filterStart} filterEnd={filterEnd}
              onSetFilter={(start, end) => { setFilterStart(start); setFilterEnd(end); }}
            />
            {hoveredFeature && <FeatureTooltip feature={hoveredFeature} x={mousePos.x} y={mousePos.y} />}
            <StatusOverlay
              viewMode={viewMode}
              featureCount={FEATURES.length}
              visibleTrackCount={tracks.filter(t => t.visible).length}
              totalTracks={tracks.length}
              hoveredFeature={hoveredFeature}
              selectedFeature={selectedFeature}
            />
          </div>
          <Legend
            overrides={legendOverrides}
            onChange={(key, patch) => setLegendOverrides(o => ({ ...o, [key]: { ...(o[key] || {}), ...patch } }))}
            onReset={() => setLegendOverrides({})}
          />
        </div>

        <PropertiesPanel
          selectedTrack={selectedTrack}
          onUpdateTrack={onUpdateTrack}
          selectedFeature={selectedFeature}
          tab={tab} onTabChange={setTab}
          genomeLen={genomeLen}
          paletteTick={paletteTick}
          onPaletteChange={bumpPalette}
          tracks={tracks}
          onLinkTracks={onLinkTracks}
          onUnlinkTrack={onUnlinkTrack}
          highlights={highlights}
          onAddHighlight={(h) => setHighlights(hs => [...hs, h])}
          onRemoveHighlight={(i) => setHighlights(hs => hs.filter((_, j) => j !== i))}
          labels={labels}
          onAddLabel={(lbl) => setLabels(ls => [...ls, lbl])}
          onRemoveLabel={(i) => setLabels(ls => ls.filter((_, j) => j !== i))}
          onClearLabels={() => setLabels([])}
          availableLabels={availableLabels}
          viewMode={viewMode}
          onExport={(opts) => exportAllViews({
            ...opts,
            circular: { tracks, labels, highlights },
            linear: { viewStart, viewEnd },
            synteny: { config: syntenyConfig, genomes: mergedGenomes,
                       labels: syntenyLabels, highlights: syntenyHighlights },
          })}
          resolution={resolution} onResolution={setResolution}
          // Synteny editing props
          syntenyConfig={syntenyConfig} onSyntenyConfigChange={(patch) =>
            setSyntenyConfig(c => ({ ...c, ...patch }))}
          mergedGenomes={mergedGenomes}
          syntenySelectedGenomeId={syntenySelectedGenomeId}
          onSyntenySelectedGenomeId={setSyntenySelectedGenomeId}
          onRenameGenome={(id, patch) =>
            setGenomeOverrides(o => ({ ...o, [id]: { ...(o[id] || {}), ...patch } }))}
          syntenyLabels={syntenyLabels}
          onAddSyntenyLabel={(gid, lbl) =>
            setSyntenyLabels(m => ({ ...m, [gid]: [...(m[gid] || []), lbl] }))}
          onRemoveSyntenyLabel={(gid, idx) =>
            setSyntenyLabels(m => ({ ...m, [gid]: (m[gid] || []).filter((_, j) => j !== idx) }))}
          syntenyHighlights={syntenyHighlights}
          onAddSyntenyHighlight={(gid, h) =>
            setSyntenyHighlights(m => ({ ...m, [gid]: [...(m[gid] || []), h] }))}
          onRemoveSyntenyHighlight={(gid, idx) =>
            setSyntenyHighlights(m => ({ ...m, [gid]: (m[gid] || []).filter((_, j) => j !== idx) }))}
        />
      </div>
    </div>
  );
}

function ViewArea({ viewMode, exportPreview, tracks, features, gcContent, gcSkew, coverage, labels,
                   viewStart, viewEnd, hoveredId, setHoveredId, setSelectedFeature, highlights,
                   circularView, setCircularView, paletteTick,
                   syntenyView, setSyntenyView, syntenyConfig, syntenyLabels, syntenyHighlights,
                   linearView, setLinearView,
                   mergedGenomes, genomeLen = GENOME_LENGTH,
                   filterStart, filterEnd, onSetFilter }) {
  // Export preview target dimensions — 1920x1080 content area, scaled to fit
  const previewStyle = exportPreview ? {
    width: '100%', height: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#E5DFCF', padding: 20, boxSizing: 'border-box',
  } : null;
  const previewInner = exportPreview ? {
    width: 1920, height: viewMode === 'synteny' ? 900 : 1080,
    background: UI.bg, border: `1px solid ${UI.divider}`,
    transform: 'scale(0.45)', transformOrigin: 'center',
    flexShrink: 0,
    position: 'relative',
  } : null;
  if (viewMode === 'circular') {
    if (exportPreview) {
      return (
        <div style={previewStyle}>
          <div style={{ ...previewInner, width: 1080, height: 1080 }}>
            <CircularGenome
              tracks={tracks} features={features}
              gcContent={gcContent} gcSkew={gcSkew} coverage={coverage}
              labels={labels} paletteTick={paletteTick}
              genomeLen={genomeLen} genomeName={GENOME_NAME} accession={GENOME_ACCESSION}
              hoveredId={hoveredId} setHoveredId={setHoveredId}
              setSelectedFeature={setSelectedFeature}
              highlights={highlights}
              zoom={1} panX={0} panY={0}
              onViewChange={() => {}}
            />
          </div>
        </div>
      );
    }
    return (
      <div style={{ width: '100%', height: '100%', padding: 0, boxSizing: 'border-box', position: 'relative' }}>
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <CircularGenome
            tracks={tracks}
            features={features}
            gcContent={gcContent} gcSkew={gcSkew} coverage={coverage}
            labels={labels}
            paletteTick={paletteTick}
            genomeLen={genomeLen}
            genomeName={GENOME_NAME}
            accession={GENOME_ACCESSION}
            hoveredId={hoveredId} setHoveredId={setHoveredId}
            setSelectedFeature={setSelectedFeature}
            highlights={highlights}
            zoom={circularView.zoom} panX={circularView.panX} panY={circularView.panY}
            onViewChange={setCircularView}
          />
          <ZoomControls view={circularView} setView={setCircularView} />
        </div>
      </div>
    );
  }
  if (viewMode === 'linear') {
    if (exportPreview) {
      return (
        <div style={previewStyle}>
          <div style={previewInner}>
            <LinearGenome
              features={features} gcContent={gcContent} gcSkew={gcSkew} coverage={coverage}
              labels={labels} genomeLen={genomeLen}
              genomeName={GENOME_NAME} accession={GENOME_ACCESSION}
              viewStart={viewStart} viewEnd={viewEnd}
              hoveredId={hoveredId} setHoveredId={setHoveredId}
              setSelectedFeature={setSelectedFeature}
              filterStart={filterStart} filterEnd={filterEnd} onSetFilter={onSetFilter}
            />
          </div>
        </div>
      );
    }
    return (
      <div style={{ width: '100%', height: '100%', padding: 0, boxSizing: 'border-box' }}>
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <LinearGenome
            features={features} gcContent={gcContent} gcSkew={gcSkew} coverage={coverage}
            labels={labels} genomeLen={genomeLen}
            genomeName={GENOME_NAME} accession={GENOME_ACCESSION}
            viewStart={viewStart} viewEnd={viewEnd}
            hoveredId={hoveredId} setHoveredId={setHoveredId}
            setSelectedFeature={setSelectedFeature}
            filterStart={filterStart} filterEnd={filterEnd} onSetFilter={onSetFilter}
            zoom={linearView.zoom} panX={linearView.panX} panY={linearView.panY}
            onViewChange={setLinearView}
          />
          <ZoomControls view={linearView} setView={setLinearView} />
        </div>
      </div>
    );
  }
  // synteny
  if (exportPreview) {
    return (
      <div style={previewStyle}>
        <div style={previewInner}>
          <SyntenyView
            genomeLen={genomeLen} features={features} labels={labels}
            genomes={mergedGenomes} synteny={window.MULTI_SYNTENY || MULTI_SYNTENY}
            hoveredId={hoveredId} setHoveredId={setHoveredId}
            setSelectedFeature={setSelectedFeature}
            config={syntenyConfig}
            syntenyLabels={syntenyLabels} syntenyHighlights={syntenyHighlights}
            view={{ zoom: 1, panX: 0, panY: 0 }}
            onViewChange={() => {}}
            paletteTick={paletteTick}
          />
        </div>
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height: '100%' }}>
      {console.log('SyntenyView:', { genomeCount: mergedGenomes?.length, syntenyCount: (window.MULTI_SYNTENY || MULTI_SYNTENY)?.length })}
      <SyntenyView
        genomeLen={mergedGenomes?.[0]?.length || genomeLen}
        features={features}
        labels={labels}
        genomes={mergedGenomes}
        synteny={window.MULTI_SYNTENY || MULTI_SYNTENY}
        hoveredId={hoveredId} setHoveredId={setHoveredId}
        setSelectedFeature={setSelectedFeature}
        config={syntenyConfig}
        syntenyLabels={syntenyLabels}
        syntenyHighlights={syntenyHighlights}
        view={syntenyView}
        onViewChange={setSyntenyView}
        paletteTick={paletteTick}
        featuresMap={window.SYNTENY_GENOME_FEATURES || {}}
      />
    </div>
  );
}

function StatusOverlay({ viewMode, featureCount, visibleTrackCount, totalTracks, hoveredFeature, selectedFeature }) {
  return (
    <div style={{
      position: 'absolute', top: 16, left: 16,
      display: 'flex', gap: 14,
      fontFamily: FONT_MONO, fontSize: 10.5, color: UI.muted,
      pointerEvents: 'none',
    }}>
      <StatusChip label="view" value={viewMode} />
      <StatusChip label="features" value={featureCount.toLocaleString()} />
      <StatusChip label="tracks" value={`${visibleTrackCount}/${totalTracks}`} />
    </div>
  );
}

function StatusChip({ label, value }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 5,
      padding: '4px 8px', background: UI.panel, borderRadius: 3,
      border: `1px solid ${UI.border}`,
    }}>
      <span style={{ textTransform: 'uppercase', letterSpacing: 0.4, opacity: 0.75 }}>{label}</span>
      <span style={{ color: UI.ink, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

Object.assign(window, { App, Toolbar, FeatureTooltip, Legend, StatusOverlay, BlastSetupModal });

function ZoomControls({ view, setView }) {
  const safeView = view || { zoom: 1, panX: 0, panY: 0 };
  const btn = {
    width: 30, height: 30, padding: 0,
    background: UI.panel, border: `1px solid ${UI.border}`,
    color: UI.ink, fontSize: 14, fontFamily: FONT_MONO,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  return (
    <div style={{
      position: 'absolute', right: 12, bottom: 12,
      display: 'flex', flexDirection: 'column', gap: 2,
      background: UI.bg, borderRadius: 4, padding: 4,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <button style={btn} onClick={() => setView(v => ({ ...(v || { zoom: 1, panX: 0, panY: 0 }), zoom: Math.min(8, (v?.zoom || 1) * 1.25) }))}>+</button>
      <div style={{ fontSize: 9, fontFamily: FONT_MONO, color: UI.muted,
                     textAlign: 'center', padding: '2px 0' }}>
        {Math.round((safeView.zoom || 1) * 100)}%
      </div>
      <button style={btn} onClick={() => setView(v => ({ ...(v || { zoom: 1, panX: 0, panY: 0 }), zoom: Math.max(0.5, (v?.zoom || 1) / 1.25) }))}>−</button>
      <button style={{ ...btn, fontSize: 10 }}
              onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })} title="Reset">⟲</button>
    </div>
  );
}

Object.assign(window, { ZoomControls });
