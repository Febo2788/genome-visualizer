const fs = require('fs');
const path = require('path');

// Read all JSX files in order
const jsxFiles = [
  'data.jsx',
  'track-panel.jsx',
  'circular-genome.jsx',
  'linear-genome.jsx',
  'synteny-view.jsx',
  'properties-panel.jsx',
  'genbank-parser.jsx',
  'track-importers.jsx',
  'vcf-parser.jsx',
  'export-all.jsx',
  'app.jsx',
];

let combinedCode = '';
for (const file of jsxFiles) {
  const content = fs.readFileSync(path.join(__dirname, file), 'utf-8');
  combinedCode += '\n\n// ============================================================\n';
  combinedCode += `// ${file}\n`;
  combinedCode += '// ============================================================\n\n';
  combinedCode += content;
}

// Check if vendor files exist (for Electron packaging)
const vendorDir = path.join(__dirname, 'vendor');
const hasVendorFiles = fs.existsSync(vendorDir) &&
  fs.existsSync(path.join(vendorDir, 'react.development.js')) &&
  fs.existsSync(path.join(vendorDir, 'react-dom.development.js')) &&
  fs.existsSync(path.join(vendorDir, 'babel.min.js'));

let scriptSrcs;
let fontLink;

if (hasVendorFiles) {
  console.log('📦 Using local vendor files...');
  scriptSrcs = `
<script src="/vendor/react.development.js"><\/script>
<script src="/vendor/react-dom.development.js"><\/script>
<script src="/vendor/babel.min.js"><\/script>`;
  fontLink = fs.existsSync(path.join(vendorDir, 'fonts.css')) ?
    `<link rel="stylesheet" href="/vendor/fonts.css" />` :
    `<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400;1,500&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />`;
} else {
  console.log('🌐 Using CDN for vendor files (run "npm run fetch-vendor" for offline support)');
  scriptSrcs = `
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"><\/script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"><\/script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"><\/script>`;
  fontLink = `<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400;1,500&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />`;
}

// Create the HTML
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Gyre — Genome Viewer</title>
${hasVendorFiles ? '' : '<link rel="preconnect" href="https://fonts.googleapis.com" />\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />'}
${fontLink}
<style>
  html, body, #root { margin: 0; padding: 0; height: 100%; }
  body {
    background: #FAF8F2;
    color: #1A1A1A;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overscroll-behavior: none;
  }
  * { box-sizing: border-box; }
  button { font-family: inherit; }
  input[type="range"] { accent-color: #2B5F6B; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #D9D4C7; border-radius: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
</style>
${scriptSrcs}
</head>
<body>
<div id="root"></div>

<script type="text/babel">
${combinedCode}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
<\/script>

</body>
</html>`;

// Write output
fs.writeFileSync(
  path.join(__dirname, 'Gyre - Genome Viewer.html'),
  html,
  'utf-8'
);

console.log('✅ Built: Gyre - Genome Viewer.html');
