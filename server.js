const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Setup multer for file uploads
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const upload = multer({ dest: UPLOADS_DIR });
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// ============================================================
// Health check
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Gyre BLAST backend running' });
});

// ============================================================
// Run BLAST comparison
// Input: reference genome (GB file) + query genomes
// Output: BLAST results formatted for Gyre
// ============================================================
app.post('/api/blast/compare', upload.fields([
  { name: 'reference', maxCount: 1 },
  { name: 'queries', maxCount: 10 }
]), (req, res) => {
  try {
    if (!req.files.reference || !req.files.queries) {
      return res.status(400).json({ error: 'Missing reference or query files' });
    }

    const refFile = req.files.reference[0];
    const queryFiles = req.files.queries;
    const { refLength } = req.body;

    if (!refLength || isNaN(refLength)) {
      return res.status(400).json({ error: 'Reference genome length required' });
    }

    const results = {};

    // For each query genome, extract sequence and run BLAST against reference
    for (const qFile of queryFiles) {
      const qSeq = fs.readFileSync(qFile.path, 'utf-8');
      const qName = qFile.originalname.replace(/\.(gb|gbk|genbank|txt)$/i, '');

      try {
        const blastResults = runBlast(
          refFile.path,
          qFile.path,
          refLength,
          qName
        );
        results[qName] = blastResults;
      } catch (err) {
        console.error(`BLAST failed for ${qName}:`, err.message);
        results[qName] = [];
      }

      // Cleanup temp file
      try { fs.unlinkSync(qFile.path); } catch (e) {}
    }

    // Cleanup reference temp file
    try { fs.unlinkSync(refFile.path); } catch (e) {}

    res.json({ success: true, results, refLength: parseInt(refLength) });
  } catch (err) {
    console.error('BLAST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Pairwise BLAST comparison (for synteny between any two genomes)
// Input: genome1, genome2 files + their lengths
// Output: segments for genome2 matched against genome1
// ============================================================
app.post('/api/blast/pairwise', upload.fields([
  { name: 'genome1', maxCount: 1 },
  { name: 'genome2', maxCount: 1 }
]), (req, res) => {
  try {
    if (!req.files.genome1 || !req.files.genome2) {
      return res.status(400).json({ error: 'Missing genome files' });
    }

    const g1File = req.files.genome1[0];
    const g2File = req.files.genome2[0];
    const { len1, len2 } = req.body;

    if (!len1 || !len2 || isNaN(len1) || isNaN(len2)) {
      return res.status(400).json({ error: 'Genome lengths required' });
    }

    const name1 = g1File.originalname.replace(/\.(gb|gbk|genbank|txt)$/i, '');
    const name2 = g2File.originalname.replace(/\.(gb|gbk|genbank|txt)$/i, '');

    try {
      // BLAST genome2 against genome1
      const seg1 = runBlast(g1File.path, g2File.path, parseInt(len1), name2);

      // Also BLAST genome1 against genome2 to get query positions
      const seg2 = runBlast(g2File.path, g1File.path, parseInt(len2), name1);

      // Cleanup
      try { fs.unlinkSync(g1File.path); } catch (e) {}
      try { fs.unlinkSync(g2File.path); } catch (e) {}

      // Merge the results: segment pairs with both genome coordinates
      // seg1 = genome2 vs genome1: has subject positions in genome1 + query positions in genome2
      // seg2 = genome1 vs genome2: has subject positions in genome2 + query positions in genome1
      const pairs = [];
      console.log(`[PAIRWISE] seg1: ${seg1.length} segments, seg2: ${seg2.length} segments`);

      for (const s1 of seg1) {
        // s1.start/end are in genome1 (reference)
        // s1.qstart/qend are in genome2 (query)

        for (const s2 of seg2) {
          // s2.start/end are in genome2 (reference)
          // s2.qstart/qend are in genome1 (query)

          // Check if these segments refer to the same alignment
          // by seeing if the query coords in s1 overlap with subject coords in s2
          const overlap_q1_s2 = Math.max(0, Math.min(s1.qend, s2.end) - Math.max(s1.qstart, s2.start));

          if (overlap_q1_s2 > 100) { // At least 100bp overlap
            const pair = {
              a: [s1.start, s1.end],
              b: [s1.qstart, s1.qend],
              identity: s1.identity,
            };
            pairs.push(pair);
            console.log(`[PAIRWISE] Pair: a[${pair.a[0]},${pair.a[1]}] b[${pair.b[0]},${pair.b[1]}] id=${pair.identity.toFixed(3)}`);
            break;
          }
        }
      }

      console.log(`[PAIRWISE] Created ${pairs.length} pairs`);

      res.json({
        success: true,
        name1: name1,
        name2: name2,
        len1: parseInt(len1),
        len2: parseInt(len2),
        pairs: pairs
      });
    } catch (err) {
      console.error('Pairwise BLAST failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  } catch (err) {
    console.error('Pairwise BLAST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Merge overlapping/adjacent BLAST segments
// ============================================================
function mergeSegments(segments) {
  if (segments.length === 0) return segments;

  // Sort by start position
  const sorted = [...segments].sort((a, b) => a.start - b.start);

  const merged = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // If segments overlap or are adjacent (within 100bp), merge them
    if (next.start <= current.end + 100) {
      // Expand current segment to cover both
      current.end = Math.max(current.end, next.end);
      // Use the higher identity of the two segments
      current.identity = Math.max(current.identity, next.identity);
    } else {
      // No overlap, save current and start a new one
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  return merged;
}

// ============================================================
// Extract sequence from GenBank file
// ============================================================
function extractSequence(gbFile) {
  const content = fs.readFileSync(gbFile, 'utf-8');
  const lines = content.split(/\r?\n/);
  console.log(`[EXTRACT] File has ${lines.length} lines`);

  let seq = '';
  let inSequence = false;
  let foundOrigin = false;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];

    if (ln.startsWith('ORIGIN')) {
      console.log(`[EXTRACT] Found ORIGIN at line ${i}`);
      foundOrigin = true;
      inSequence = true;
      continue;
    }

    if (!inSequence) continue;

    if (ln.startsWith('//')) {
      console.log(`[EXTRACT] Found end marker at line ${i}, stopping`);
      break;
    }

    // Remove line numbers and whitespace
    const s = ln.replace(/^\s*\d+\s+/, '').replace(/\s+/g, '');
    if (s.length > 0) {
      seq += s;
    }
  }

  console.log(`[EXTRACT] Found ORIGIN: ${foundOrigin}, Final sequence length: ${seq.length}`);
  return seq.toLowerCase();
}

// ============================================================
// Run BLAST using command-line tool
// Returns array of segments: { start, end, identity }
// ============================================================
function runBlast(refFile, queryFile, refLength, queryName) {
  // Use system temp directory to avoid path spaces issues
  const tempDir = path.join(process.env.TEMP || '/tmp', 'gyre-blast');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const blastDb = path.join(tempDir, 'ref_db');
  const refSeqFile = path.join(tempDir, 'ref.fasta');
  const querySeqFile = path.join(tempDir, 'query.fasta');
  const outFile = path.join(tempDir, 'blast_out.txt');

  try {
    // Extract sequences
    const refSeq = extractSequence(refFile);
    const querySeq = extractSequence(queryFile);

    console.log(`[BLAST] Reference sequence length: ${refSeq.length} bp`);
    console.log(`[BLAST] Query (${queryName}) sequence length: ${querySeq.length} bp`);

    if (!refSeq || !querySeq) {
      console.log(`[BLAST] ERROR: Empty sequence! ref=${refSeq.length}, query=${querySeq.length}`);
      return [];
    }

    // Write FASTA files
    fs.writeFileSync(refSeqFile, `>reference\n${refSeq}\n`);
    fs.writeFileSync(querySeqFile, `>${queryName}\n${querySeq}\n`);

    // Create BLAST database
    try {
      console.log(`[BLAST] Creating database from reference (${refSeq.length} bp)`);
      const blastDir = process.env.BLAST_DIR || '';
      const makeblastdbCmd = blastDir ? `"${path.join(blastDir, process.platform === 'win32' ? 'makeblastdb.exe' : 'makeblastdb')}" -in "${refSeqFile}" -dbtype nucl -out "${blastDb}"` : `makeblastdb -in "${refSeqFile}" -dbtype nucl -out "${blastDb}"`;
      execSync(makeblastdbCmd, {
        stdio: 'pipe'
      });
      console.log(`[BLAST] Database created`);
    } catch (e) {
      console.warn('[BLAST] makeblastdb failed:', e.message);
      console.warn('[BLAST] stderr:', e.stderr ? e.stderr.toString() : 'none');
      return [];
    }

    // Run BLASTN
    try {
      console.log(`[BLAST] Running blastn: query=${queryName} (${querySeq.length} bp) vs reference`);
      const blastDir = process.env.BLAST_DIR || '';
      const blastnBin = blastDir ? `"${path.join(blastDir, process.platform === 'win32' ? 'blastn.exe' : 'blastn')}"` : 'blastn';
      const blastCmd = `${blastnBin} -query "${querySeqFile}" -db "${blastDb}" -out "${outFile}" -outfmt "6 qstart qend sstart send nident length" -evalue 1e-5`;
      console.log(`[BLAST] Command: ${blastCmd}`);
      execSync(blastCmd, { stdio: 'pipe' });
      console.log(`[BLAST] blastn completed`);
    } catch (e) {
      console.warn('[BLAST] blastn failed:', e.message);
      console.warn('[BLAST] stderr:', e.stderr ? e.stderr.toString() : 'none');
      return [];
    }

    // Parse BLAST results
    if (!fs.existsSync(outFile)) {
      console.log(`[BLAST] No output file found: ${outFile}`);
      return [];
    }

    const blastOutput = fs.readFileSync(outFile, 'utf-8');
    console.log(`[BLAST] Output for ${queryName}:\n${blastOutput}`);

    const segments = [];
    const lines = blastOutput.trim().split('\n').filter(l => l.trim());

    console.log(`[BLAST] Parsed ${lines.length} lines`);

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      console.log(`[BLAST] Line parts: ${parts.join(' | ')}`);
      if (parts.length < 6) {
        console.log(`[BLAST] Skipping line (only ${parts.length} columns): ${line.substring(0, 50)}`);
        continue;
      }

      const qstart = parseInt(parts[0]);
      const qend = parseInt(parts[1]);
      const sstart = parseInt(parts[2]);
      const send = parseInt(parts[3]);
      const nident = parseInt(parts[4]);
      const length = parseInt(parts[5]);

      console.log(`[BLAST] Match: ref ${sstart}-${send}, identity ${nident}/${length}`);

      const start = Math.min(sstart, send);
      const end = Math.max(sstart, send);
      const qStart = Math.min(qstart, qend);
      const qEnd = Math.max(qstart, qend);
      const identity = length > 0 ? nident / length : 0;

      // Include all BLAST matches with both query and subject positions
      segments.push({
        start: Math.max(0, start - 1),
        end: Math.min(refLength, end),
        qstart: Math.max(0, qStart - 1),
        qend: qEnd,
        identity: identity
      });
    }

    console.log(`[BLAST] Total segments before merging: ${segments.length}`);

    // Merge adjacent/overlapping segments
    const merged = mergeSegments(segments);
    console.log(`[BLAST] Total segments after merging: ${merged.length}`);
    return merged;
  } catch (err) {
    console.error('BLAST processing error:', err);
    return [];
  } finally {
    // Cleanup
    try {
      [refSeqFile, querySeqFile, outFile, blastDb + '.nhr', blastDb + '.nin', blastDb + '.nsq'].forEach(f => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      });
    } catch (e) {}
  }
}

app.listen(PORT, () => {
  console.log(`🧬 Gyre BLAST backend running on http://localhost:${PORT}`);
  console.log(`Open the HTML file and use "Compare genomes" → "Run BLAST comparison"`);
});
