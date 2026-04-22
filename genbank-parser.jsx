// Minimal GenBank parser + Open-file handler.
// Handles: LOCUS (length), ACCESSION, DEFINITION, FEATURES/gene/CDS with
// /gene, /product, /locus_tag qualifiers. Strand via complement().

function parseGenBank(text) {
  const lines = text.split(/\r?\n/);
  let genomeLen = 0;
  let accession = '';
  let definition = '';
  const features = [];
  const gLabels = [];  // candidate gene labels

  // Parse header
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const ln = lines[i];
    if (ln.startsWith('LOCUS')) {
      const m = ln.match(/(\d+)\s+bp/);
      if (m) genomeLen = parseInt(m[1], 10);
    } else if (ln.startsWith('ACCESSION')) {
      accession = ln.replace('ACCESSION', '').trim().split(/\s+/)[0];
    } else if (ln.startsWith('DEFINITION')) {
      definition = ln.replace('DEFINITION', '').trim();
    }
  }

  // Find FEATURES section
  let inFeatures = false;
  let current = null;
  const flush = () => {
    if (!current) return;
    if (current.type === 'gene' || current.type === 'CDS') {
      features.push(current);
      // Only create labels for CDS features (avoid duplicates from gene+CDS pairs)
      if (current.type === 'CDS') {
        const labelName = current.gene || current.product;
        if (labelName) {
          gLabels.push({ position: Math.floor((current.start + current.end) / 2), name: labelName });
        }
      }
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.startsWith('FEATURES')) { inFeatures = true; continue; }
    if (!inFeatures) continue;
    if (ln.startsWith('ORIGIN') || ln.startsWith('BASE COUNT') || ln.startsWith('//')) {
      flush(); break;
    }

    // Feature key lines start at col 6 with non-space
    if (/^     \S/.test(ln)) {
      flush();
      const m = ln.match(/^     (\S+)\s+(.+)$/);
      if (!m) continue;
      const type = m[1];
      let loc = m[2].trim();
      // collect continuation lines of location
      while (i + 1 < lines.length && /^ {21}(?!\/)/.test(lines[i + 1])
             && !/^     \S/.test(lines[i + 1])) {
        loc += lines[++i].trim();
      }
      const inverted = /complement/.test(loc);
      const nums = [...loc.matchAll(/(\d+)/g)].map(x => parseInt(x[1], 10));
      if (nums.length < 2) { current = null; continue; }
      const start = Math.min(...nums);
      const end = Math.max(...nums);
      current = {
        type, start, end, strand: inverted ? -1 : 1,
        id: `${type}_${start}`, gene: '', product: '', locusTag: '',
        category: 'Function unknown',
      };
      continue;
    }

    // Qualifier lines /key=value
    if (/^ {21}\//.test(ln) && current) {
      const m = ln.trim().match(/^\/(\w+)=?"?(.*)"?$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].replace(/"$/, '').replace(/^"/, '');
      // consume continuation lines
      while (i + 1 < lines.length && /^ {21}[^\/]/.test(lines[i + 1])) {
        val += ' ' + lines[++i].trim().replace(/"$/, '');
      }
      if (key === 'gene')        current.gene = val;
      else if (key === 'locus_tag') current.locusTag = val;
      else if (key === 'product') {
        current.product = val;
        // Rough category inference
        const v = val.toLowerCase();
        if (/ribosom|rna|trna|transfer/.test(v))                   current.category = 'Information storage';
        else if (/transport|permease|abc |channel|efflux/.test(v)) current.category = 'Cellular processes';
        else if (/synthase|reductase|dehydrogenase|kinase|ase$/.test(v)) current.category = 'Metabolism';
        else if (/hypothetical|unknown/.test(v))                   current.category = 'Hypothetical';
        else                                                       current.category = 'Poorly characterized';
      }
    }
  }
  flush();

  if (!genomeLen) {
    // Fall back to max end
    genomeLen = Math.max(0, ...features.map(f => f.end));
  }

  // Extract SEQUENCE section
  let fullSequence = '';
  let inSequence = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.startsWith('ORIGIN')) { inSequence = true; continue; }
    if (!inSequence) continue;
    if (ln.startsWith('//')) break;
    // Remove line numbers and whitespace from sequence lines
    const seq = ln.replace(/^\s*\d+\s+/, '').replace(/\s+/g, '');
    fullSequence += seq;
  }

  // Add sequence to each feature
  features.forEach((f, i) => {
    // Create unique ID: display name + random ID to handle duplicates
    const displayId = f.locusTag || f.gene || `F${i}`;
    const uniqueSuffix = Math.random().toString(36).substr(2, 9);
    f.uniqueId = `${displayId}-${uniqueSuffix}`;
    f.id = displayId; // Keep original for display
    // GenBank uses 1-based indexing, convert to 0-based
    const seqStart = Math.max(0, f.start - 1);
    const seqEnd = Math.min(fullSequence.length, f.end);
    if (fullSequence && seqStart < fullSequence.length) {
      let featureSeq = fullSequence.substring(seqStart, seqEnd);
      // Reverse complement if on reverse strand
      if (f.strand < 0) {
        featureSeq = reverseComplement(featureSeq);
      }
      f.sequence = featureSeq;
    }
  });

  return { genomeLen, accession, definition, features, labels: gLabels, fullSequence };
}

// Helper function to reverse complement DNA
function reverseComplement(seq) {
  const complement = { 'a': 't', 't': 'a', 'g': 'c', 'c': 'g', 'n': 'n' };
  return seq.toLowerCase().split('').reverse().map(b => complement[b] || b).join('');
}

// Calculate GC content across genome in windows
function calculateGCContent(sequence, windowCount = 360) {
  const windowSize = Math.floor(sequence.length / windowCount);
  const values = [];
  for (let i = 0; i < windowCount; i++) {
    const start = i * windowSize;
    const end = Math.min(start + windowSize, sequence.length);
    const window = sequence.substring(start, end).toLowerCase();
    const gc = (window.match(/[gc]/g) || []).length;
    values.push(windowSize > 0 ? gc / windowSize : 0.5);
  }
  return values;
}

// Calculate GC skew (G-C)/(G+C) across genome in windows
function calculateGCSkew(sequence, windowCount = 360) {
  const windowSize = Math.floor(sequence.length / windowCount);
  const values = [];
  for (let i = 0; i < windowCount; i++) {
    const start = i * windowSize;
    const end = Math.min(start + windowSize, sequence.length);
    const window = sequence.substring(start, end).toLowerCase();
    const gCount = (window.match(/g/g) || []).length;
    const cCount = (window.match(/c/g) || []).length;
    const total = gCount + cCount;
    values.push(total > 0 ? (gCount - cCount) / total : 0);
  }
  return values;
}

// File picker — opens a dialog and loads a .gb/.gbk/.genbank file.
// On success, mutates the global data so the app re-renders.
function openGenBank(setLabels, setTracks, setAvailableLabels) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.gb,.gbk,.genbank,.txt,text/plain';
  input.onchange = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseGenBank(text);
      if (!parsed.genomeLen || parsed.features.length === 0) {
        alert('Could not parse this GenBank file — no LOCUS length or features found.');
        return;
      }
      // Update the global window-scoped data so all views pick it up
      window.GENOME_LENGTH = parsed.genomeLen;
      window.GENOME_ACCESSION = parsed.accession || file.name;
      window.GENOME_NAME = parsed.definition
        ? parsed.definition.split(',')[0].slice(0, 60)
        : file.name.replace(/\.(gb|gbk|genbank|txt)$/i, '');

      // Namespace GenBank features so they don't conflict with imported tracks
      const genbankId = `t-gb-${Date.now()}`;
      const existingFeats = window.FEATURES || [];
      parsed.features.forEach(f => {
        f.id = `${genbankId}-${f.id}`;
        existingFeats.push(f);
      });
      window.FEATURES = existingFeats;

      // Set available labels from the GenBank file; clear displayed labels so user chooses
      window.GENBANK_LABELS = parsed.labels;
      setAvailableLabels(parsed.labels);
      setLabels([]);

      // Calculate GC content and skew from the loaded sequence
      if (parsed.fullSequence) {
        window.GENOME_SEQUENCE = parsed.fullSequence;
        window.GC_CONTENT = calculateGCContent(parsed.fullSequence);
        window.GC_SKEW = calculateGCSkew(parsed.fullSequence);
      }

      // Create forward/reverse tracks for GenBank features
      setTracks(ts => {
        const maxR = Math.max(...ts.map(t => t.radius));
        const gbName = file.name.replace(/\.(gb|gbk|genbank|txt)$/i, '');

        // Check if we have both strands
        const hasForward = parsed.features.some(f => f.strand > 0);
        const hasReverse = parsed.features.some(f => f.strand < 0);

        const fwdTrack = hasForward ? {
          id: `${genbankId}-fwd`,
          name: `GenBank · ${gbName} (forward)`,
          type: 'cds',
          visible: true,
          radius: Math.min(0.92, maxR + 0.04),
          thickness: 0.03,
          strand: 1,
          colorBy: 'category',
          userImported: true,
        } : null;

        const revTrack = hasReverse ? {
          id: `${genbankId}-rev`,
          name: `GenBank · ${gbName} (reverse)`,
          type: 'cds',
          visible: true,
          radius: Math.min(0.96, maxR + 0.08),
          thickness: 0.03,
          strand: -1,
          colorBy: 'category',
          userImported: true,
        } : null;

        // Delete default demo CDS tracks
        const newTs = ts.filter(t => !((t.id === 't-cds-fwd' || t.id === 't-cds-rev') && !t.userImported));

        if (fwdTrack) newTs.push(fwdTrack);
        if (revTrack) newTs.push(revTrack);

        return newTs;
      });
      // Friendly confirmation
      console.info('Loaded', parsed.features.length, 'features from', file.name);
      // Force full-app refresh by reloading the dataset reference
      window.dispatchEvent(new Event('gyre-data-loaded'));
    } catch (e) {
      console.error(e);
      alert('Failed to read GenBank file: ' + e.message);
    }
  };
  input.click();
}

// Generate synteny data from BLAST results between adjacent genomes
// Takes array of {name, length, segments} and creates synteny pairs
function generateSyntenyFromBlast(genomes) {
  if (genomes.length < 2) return [];

  const synteny = [];
  for (let i = 0; i < genomes.length - 1; i++) {
    const genomeA = genomes[i];
    const genomeB = genomes[i + 1];
    const segsA = genomeA.segments || [];
    const segsB = genomeB.segments || [];

    // Create pairs from BLAST segments
    // Simple approach: match segments by approximate position
    const pairs = [];

    for (const segA of segsA) {
      // Find overlapping segment in B (rough match by position ratio)
      const ratioA = (segA.start + segA.end) / 2 / Math.max(1, genomeA.length);
      for (const segB of segsB) {
        const ratioB = (segB.start + segB.end) / 2 / Math.max(1, genomeB.length);
        // If positions are similar (within 20%), create a pair
        if (Math.abs(ratioA - ratioB) < 0.2) {
          pairs.push({
            a: [segA.start, segA.end],
            b: [segB.start, segB.end],
            identity: Math.min(segA.identity, segB.identity),
            inverted: false, // TODO: detect inversions from strand info
          });
          break;
        }
      }
    }

    if (pairs.length > 0) {
      synteny.push({
        from: i,
        to: i + 1,
        pairs,
      });
    }
  }

  return synteny;
}

Object.assign(window, { parseGenBank, openGenBank, generateSyntenyFromBlast, reverseComplement });
