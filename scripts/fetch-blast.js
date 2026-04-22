const { execSync } = require('child_process');

console.log(`
🧬 BLAST+ Setup for Gyre Genome Viewer
=====================================

Gyre needs BLAST+ to run genome comparisons.

${process.platform === 'win32' ? `
WINDOWS - Install one of:
  • choco install ncbi-blast
  • winget install ncbi-blast
  • Download from: https://www.ncbi.nlm.nih.gov/blast/Blast.cgi?PAGE_TYPE=BlastDocs&DOC_TYPE=Download
` : process.platform === 'darwin' ? `
macOS - Install with:
  • brew install blast

` : `
LINUX - Install with:
  • sudo apt-get install ncbi-blast+
  • Or: sudo yum install ncbi-blast-plus
`}

After installing, verify with:
  $ blastn -version
  $ makeblastdb -version

Then run: npm run electron

---

For Electron app packaging (optional):
If you want BLAST bundled inside the app instead of requiring users to install it:
1. After installing BLAST globally
2. Copy the binaries to: blast-bin/${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'}/
3. Files needed: blastn${process.platform === 'win32' ? '.exe' : ''} and makeblastdb${process.platform === 'win32' ? '.exe' : ''}
4. Then run: npm run dist:win (or dist:mac)

`);

// Try to detect BLAST
try {
  const version = execSync('blastn -version 2>&1', {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  console.log('✅ BLAST+ found! Version info:\n' + version);
} catch (err) {
  console.log('⚠️  BLAST+ not detected in system PATH');
  console.log('Please install it using one of the commands above\n');
}
