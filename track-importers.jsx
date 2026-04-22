// track-importers.jsx
// Parsers + file pickers for BED / GFF3 (feature tracks) and bedGraph
// (quantitative tracks). These create real tracks and push them into the
// rendering pipeline — no placeholders.

// ------------------------------------------------------------
// BED parser (3–6 cols): chrom  start  end  [name]  [score]  [strand]
// ------------------------------------------------------------
function parseBED(text) {
  const features = [];
  let firstChrom = null;
  let maxEnd = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('track ') || line.startsWith('browser ')) continue;
    const cols = line.split(/\t/);
    if (cols.length < 3) continue;
    const chrom = cols[0];
    const start = parseInt(cols[1], 10);
    const end = parseInt(cols[2], 10);
    if (isNaN(start) || isNaN(end)) continue;
    firstChrom = firstChrom || chrom;
    if (chrom !== firstChrom) continue;     // stick to first contig
    maxEnd = Math.max(maxEnd, end);
    const name = cols[3] || `feat_${features.length}`;
    const strand = cols[5] === '-' ? -1 : 1;
    features.push({
      id: `bed-${features.length}`,
      start, end,
      strand,
      product: name,
      gene: name,
      category: 'Poorly characterized',
    });
  }
  return { features, chrom: firstChrom, length: maxEnd };
}

// ------------------------------------------------------------
// GFF3 parser (9 cols): seqid source type start end score strand phase attrs
// We import type in {gene, CDS, mRNA, tRNA, rRNA, ncRNA}.
// attrs are semicolon-separated key=value pairs.
// ------------------------------------------------------------
function parseGFF3(text) {
  const features = [];
  let firstChrom = null;
  let maxEnd = 0;
  const wanted = new Set(['gene', 'CDS', 'mRNA', 'tRNA', 'rRNA', 'ncRNA']);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const cols = line.split(/\t/);
    if (cols.length < 8) continue;
    const type = cols[2];
    if (!wanted.has(type)) continue;
    const chrom = cols[0];
    const start = parseInt(cols[3], 10) - 1; // GFF is 1-based inclusive → convert to 0-based
    const end = parseInt(cols[4], 10);
    if (isNaN(start) || isNaN(end)) continue;
    firstChrom = firstChrom || chrom;
    if (chrom !== firstChrom) continue;
    maxEnd = Math.max(maxEnd, end);
    const strand = cols[6] === '-' ? -1 : 1;
    const attrs = Object.fromEntries(
      (cols[8] || '').split(';').filter(Boolean).map(kv => {
        const [k, ...v] = kv.split('=');
        return [k && k.trim(), decodeURIComponent((v.join('=') || '').trim())];
      }).filter(([k, v]) => k && v != null)
    );
    const name = attrs.Name || attrs.gene || attrs.locus_tag || attrs.ID || `feat_${features.length}`;
    features.push({
      id: `gff-${features.length}`,
      start, end,
      strand,
      product: attrs.product || name,
      gene: name,
      category: categorizeGffType(type),
    });
  }
  return { features, chrom: firstChrom, length: maxEnd };
}

function categorizeGffType(type) {
  if (type === 'CDS' || type === 'gene' || type === 'mRNA') return 'Information storage';
  if (type === 'tRNA' || type === 'rRNA' || type === 'ncRNA') return 'RNA';
  return 'Poorly characterized';
}

// ------------------------------------------------------------
// bedGraph parser: chrom  start  end  value
// ------------------------------------------------------------
function parseBedGraph(text) {
  const bins = [];
  let firstChrom = null;
  let maxEnd = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('track ') || line.startsWith('browser ')) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 4) continue;
    const chrom = cols[0];
    const start = parseInt(cols[1], 10);
    const end = parseInt(cols[2], 10);
    const val = parseFloat(cols[3]);
    if (isNaN(start) || isNaN(end) || isNaN(val)) continue;
    firstChrom = firstChrom || chrom;
    if (chrom !== firstChrom) continue;
    maxEnd = Math.max(maxEnd, end);
    bins.push({ start, end, value: val });
  }
  return { bins, chrom: firstChrom, length: maxEnd };
}

// ------------------------------------------------------------
// Importer — shared file picker + dispatcher for feature tracks
// ------------------------------------------------------------
function importFeatureTrack(setTracks) {
  pickFile('.bed,.gff,.gff3,.tsv,.txt,text/plain', async (file) => {
    const text = await file.text();
    const isGff = /\.gff3?$/i.test(file.name) || text.startsWith('##gff-version');
    const parsed = isGff ? parseGFF3(text) : parseBED(text);

    if (parsed.features.length === 0) {
      alert('No features found. Expected BED (chrom/start/end/…) or GFF3 (9 columns).');
      return;
    }

    // Adopt genome length if not already larger
    if (parsed.length > window.GENOME_LENGTH) {
      window.GENOME_LENGTH = parsed.length;
    }

    // Assign category color based on name heuristics if missing
    const existingFeats = window.FEATURES || [];
    const trackId = `t-user-${Date.now()}`;

    // Append features to the global features list so they render in circular/linear views
    parsed.features.forEach(f => {
      f.id = `${trackId}-${f.id}`;  // namespaced
      existingFeats.push(f);
    });
    window.FEATURES = existingFeats;

    // Add new tracks: one for forward strand, one for reverse strand (like default CDS tracks)
    setTracks(ts => {
      const maxR = Math.max(...ts.map(t => t.radius));
      const name = file.name.replace(/\.(bed|gff3?|tsv|txt)$/i, '');

      // Check if we have both strands in the data
      const hasForward = parsed.features.some(f => f.strand > 0);
      const hasReverse = parsed.features.some(f => f.strand < 0);

      // Create forward track if needed
      const fwdTrack = hasForward ? {
        id: `${trackId}-fwd`,
        name: `Imported · ${name} (forward)`,
        type: 'cds',
        visible: true,
        radius: Math.min(0.92, maxR + 0.04),
        thickness: 0.03,
        strand: 1,
        colorBy: 'category',
        userImported: true,
      } : null;

      // Create reverse track if needed
      const revTrack = hasReverse ? {
        id: `${trackId}-rev`,
        name: `Imported · ${name} (reverse)`,
        type: 'cds',
        visible: true,
        radius: Math.min(0.96, maxR + 0.08),
        thickness: 0.03,
        strand: -1,
        colorBy: 'category',
        userImported: true,
      } : null;

      // Remove default demo CDS tracks when importing real data
      const newTs = ts.filter(t => !((t.id === 't-cds-fwd' || t.id === 't-cds-rev') && !t.userImported));

      // Add the new tracks
      if (fwdTrack) newTs.push(fwdTrack);
      if (revTrack) newTs.push(revTrack);

      return newTs;
    });

    // Nudge other views to pick up new features
    window.dispatchEvent(new Event('gyre-data-loaded'));
    console.info(`[gyre] imported ${parsed.features.length} features from ${file.name}`);
  });
}

function importBedGraph(setTracks) {
  pickFile('.bedgraph,.bg,.bdg,.txt,text/plain', async (file) => {
    const text = await file.text();
    const parsed = parseBedGraph(text);
    if (parsed.bins.length === 0) {
      alert('No bedGraph bins found. Expected four tab-separated columns: chrom  start  end  value');
      return;
    }

    // Adopt genome length if not already larger
    const genomeLen = Math.max(parsed.length, window.GENOME_LENGTH);
    window.GENOME_LENGTH = genomeLen;

    // Normalize to [0,1] so it renders sanely in both circular and linear
    const vals = parsed.bins.map(b => b.value);
    const vMin = Math.min(...vals);
    const vMax = Math.max(...vals);
    const rng = vMax - vMin || 1;

    // Build a coverage-style array at roughly 500 windows — reuse coverage track style
    const N_WINDOWS = 500;
    const perWin = genomeLen / N_WINDOWS;
    const arr = new Array(N_WINDOWS).fill(0);
    for (const b of parsed.bins) {
      const i0 = Math.floor(b.start / perWin);
      const i1 = Math.min(N_WINDOWS - 1, Math.floor((b.end - 1) / perWin));
      for (let i = i0; i <= i1; i++) {
        arr[i] = Math.max(arr[i], (b.value - vMin) / rng);
      }
    }

    // Store the bedGraph data on window under a stable key so tracks can look it up
    window.USER_BEDGRAPHS = window.USER_BEDGRAPHS || {};
    const trackId = `t-bg-${Date.now()}`;
    window.USER_BEDGRAPHS[trackId] = { values: arr, rawMin: vMin, rawMax: vMax };

    setTracks(ts => {
      const maxR = Math.max(...ts.map(t => t.radius));
      const name = file.name.replace(/\.(bedgraph|bg|bdg|txt)$/i, '');
      const newTrack = {
        id: trackId,
        name: `BedGraph · ${name}`,
        type: 'bedgraph',
        visible: true,
        radius: Math.min(0.88, maxR + 0.04),
        thickness: 0.05,
        color: '#2B5F6B',
        userImported: true,
      };
      return [...ts, newTrack];
    });

    window.dispatchEvent(new Event('gyre-data-loaded'));
    console.info(`[gyre] imported ${parsed.bins.length} bedGraph bins (${vMin.toFixed(2)}–${vMax.toFixed(2)}) from ${file.name}`);
  });
}

// Shared file picker
function pickFile(accept, cb) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try { await cb(f); } catch (err) {
      console.error(err);
      alert('Failed to import ' + f.name + ': ' + err.message);
    }
  };
  input.click();
}

Object.assign(window, {
  parseBED, parseGFF3, parseBedGraph,
  importFeatureTrack, importBedGraph,
});
