const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow;
let expressServer;

// Import Express and other dependencies
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const { execSync } = require('child_process');

// Find a free port
async function findFreePort(startPort = 3000) {
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}`, { timeout: 100 }, resolve);
        req.on('error', reject);
        req.setTimeout(100);
      });
    } catch (err) {
      return port;
    }
  }
  return startPort;
}

// Wait for server to be ready
async function waitForServer(port, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await new Promise((resolve, reject) => {
        http.get(`http://localhost:${port}/api/health`, (res) => {
          resolve(res.statusCode === 200);
        }).on('error', reject);
      });
      if (response) return true;
    } catch (err) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

// Get platform-specific BLAST directory
function getBlastDir() {
  let platform;
  if (process.platform === 'win32') {
    platform = 'win';
  } else if (process.platform === 'darwin') {
    platform = 'mac';
  } else {
    platform = 'linux';
  }

  // In production, use resourcesPath; in dev, use __dirname
  const resourcesPath = process.resourcesPath || path.join(__dirname);
  return path.join(resourcesPath, 'blast-bin', platform);
}

// Extract BLAST sequence from GenBank file (from server.js)
function extractSequence(gbFile) {
  const content = fs.readFileSync(gbFile, 'utf-8');
  const lines = content.split(/\r?\n/);
  let seq = '';
  let inSequence = false;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.startsWith('ORIGIN')) {
      inSequence = true;
      continue;
    }
    if (!inSequence) continue;
    if (ln.startsWith('//')) break;
    const s = ln.replace(/^\s*\d+\s+/, '').replace(/\s+/g, '');
    if (s.length > 0) seq += s;
  }

  return seq.toLowerCase();
}

// Merge overlapping BLAST segments
function mergeSegments(segments) {
  if (segments.length === 0) return segments;
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.start <= current.end + 100) {
      current.end = Math.max(current.end, next.end);
      current.identity = Math.max(current.identity, next.identity);
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}

// Run BLAST (from server.js)
function runBlast(refFile, queryFile, refLength, queryName, blastDir) {
  const tempDir = path.join(process.env.TEMP || '/tmp', 'gyre-blast');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const blastDb = path.join(tempDir, 'ref_db');
  const refSeqFile = path.join(tempDir, 'ref.fasta');
  const querySeqFile = path.join(tempDir, 'query.fasta');
  const outFile = path.join(tempDir, 'blast_out.txt');

  try {
    const refSeq = extractSequence(refFile);
    const querySeq = extractSequence(queryFile);

    if (!refSeq || !querySeq) {
      return [];
    }

    fs.writeFileSync(refSeqFile, `>reference\n${refSeq}\n`);
    fs.writeFileSync(querySeqFile, `>${queryName}\n${querySeq}\n`);

    // Determine BLAST binary paths
    const isWin = process.platform === 'win32';
    const makeblastdb = blastDir ? path.join(blastDir, isWin ? 'makeblastdb.exe' : 'makeblastdb') : 'makeblastdb';
    const blastn = blastDir ? path.join(blastDir, isWin ? 'blastn.exe' : 'blastn') : 'blastn';

    // Create BLAST database
    try {
      execSync(`"${makeblastdb}" -in "${refSeqFile}" -dbtype nucl -out "${blastDb}"`, {
        stdio: 'pipe'
      });
    } catch (e) {
      console.warn('[BLAST] makeblastdb failed:', e.message);
      return [];
    }

    // Run BLASTN
    try {
      const blastCmd = `"${blastn}" -query "${querySeqFile}" -db "${blastDb}" -out "${outFile}" -outfmt "6 qstart qend sstart send nident length" -evalue 1e-5`;
      execSync(blastCmd, { stdio: 'pipe' });
    } catch (e) {
      console.warn('[BLAST] blastn failed:', e.message);
      return [];
    }

    // Parse results
    if (!fs.existsSync(outFile)) {
      return [];
    }

    const blastOutput = fs.readFileSync(outFile, 'utf-8');
    const segments = [];
    const lines = blastOutput.trim().split('\n').filter(l => l.trim());

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length < 6) continue;

      const qstart = parseInt(parts[0]);
      const qend = parseInt(parts[1]);
      const sstart = parseInt(parts[2]);
      const send = parseInt(parts[3]);
      const nident = parseInt(parts[4]);
      const length = parseInt(parts[5]);

      const start = Math.min(sstart, send);
      const end = Math.max(sstart, send);
      const qStart = Math.min(qstart, qend);
      const qEnd = Math.max(qstart, qend);
      const identity = length > 0 ? nident / length : 0;

      segments.push({
        start: Math.max(0, start - 1),
        end: Math.min(refLength, end),
        qstart: Math.max(0, qStart - 1),
        qend: qEnd,
        identity: identity
      });
    }

    const merged = mergeSegments(segments);
    return merged;
  } catch (err) {
    console.error('BLAST processing error:', err);
    return [];
  } finally {
    // Cleanup
    try {
      const isWin = process.platform === 'win32';
      const filesToDelete = isWin ?
        [refSeqFile, querySeqFile, outFile, blastDb + '.nhr', blastDb + '.nin', blastDb + '.nsq'] :
        [refSeqFile, querySeqFile, outFile];
      filesToDelete.forEach(f => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      });
    } catch (e) { }
  }
}

// Create and start Express server
function startServer(port, uploadsDir, blastDir) {
  return new Promise((resolve) => {
    const expressApp = express();

    // CORS middleware
    expressApp.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Multer setup
    const upload = multer({ dest: uploadsDir });
    expressApp.use(express.json({ limit: '50mb' }));
    expressApp.use(express.static(__dirname));

    // Health check
    expressApp.get('/api/health', (req, res) => {
      res.json({ status: 'ok', message: 'Gyre BLAST backend running' });
    });

    // BLAST compare endpoint
    expressApp.post('/api/blast/compare', upload.fields([
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

        for (const qFile of queryFiles) {
          const qName = qFile.originalname.replace(/\.(gb|gbk|genbank|txt)$/i, '');

          try {
            const blastResults = runBlast(
              refFile.path,
              qFile.path,
              refLength,
              qName,
              blastDir
            );
            results[qName] = blastResults;
          } catch (err) {
            console.error(`BLAST failed for ${qName}:`, err.message);
            results[qName] = [];
          }

          try { fs.unlinkSync(qFile.path); } catch (e) { }
        }

        try { fs.unlinkSync(refFile.path); } catch (e) { }

        res.json({ success: true, results, refLength: parseInt(refLength) });
      } catch (err) {
        console.error('BLAST error:', err);
        res.status(500).json({ error: err.message });
      }
    });

    // BLAST pairwise endpoint
    expressApp.post('/api/blast/pairwise', upload.fields([
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
          const seg1 = runBlast(g1File.path, g2File.path, parseInt(len1), name2, blastDir);
          const seg2 = runBlast(g2File.path, g1File.path, parseInt(len2), name1, blastDir);

          try { fs.unlinkSync(g1File.path); } catch (e) { }
          try { fs.unlinkSync(g2File.path); } catch (e) { }

          const pairs = [];
          for (const s1 of seg1) {
            for (const s2 of seg2) {
              const overlap_q1_s2 = Math.max(0, Math.min(s1.qend, s2.end) - Math.max(s1.qstart, s2.start));
              if (overlap_q1_s2 > 100) {
                const pair = {
                  a: [s1.start, s1.end],
                  b: [s1.qstart, s1.qend],
                  identity: s1.identity,
                };
                pairs.push(pair);
                break;
              }
            }
          }

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

    expressServer = expressApp.listen(port, () => {
      console.log(`🧬 Gyre BLAST backend running on http://localhost:${port}`);
      resolve();
    });
  });
}

async function createWindow() {
  const port = await findFreePort(3000);
  const uploadsDir = path.join(app.getPath('userData'), 'uploads');
  const blastDir = getBlastDir();

  console.log(`[Electron] Using port: ${port}`);
  console.log(`[Electron] Uploads dir: ${uploadsDir}`);
  console.log(`[Electron] BLAST dir: ${blastDir}`);

  // Create uploads directory if it doesn't exist
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Start the Express server
  try {
    await startServer(port, uploadsDir, blastDir);
  } catch (err) {
    console.error('[Electron] Failed to start server:', err);
    app.quit();
    return;
  }

  // Wait for server to be ready
  const ready = await waitForServer(port);
  if (!ready) {
    console.error('[Electron] Server failed to start within timeout');
    if (expressServer) expressServer.close();
    app.quit();
    return;
  }

  // Create the window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}/Gyre%20-%20Genome%20Viewer.html`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (expressServer) expressServer.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Menu
function createMenu() {
  const template = [
    {
      label: 'Gyre',
      submenu: [
        { label: 'About Gyre', role: 'about' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => {
          if (expressServer) expressServer.close();
          app.quit();
        }}
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => {
          if (mainWindow) mainWindow.reload();
        }},
        { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => {
          if (mainWindow) mainWindow.webContents.toggleDevTools();
        }},
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('ready', createMenu);
