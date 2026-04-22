const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const VENDOR_DIR = path.join(__dirname, '..', 'vendor');

// Create vendor directory if it doesn't exist
if (!fs.existsSync(VENDOR_DIR)) {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
}

// URLs for vendor files
const files = [
  {
    name: 'react.development.js',
    url: 'https://unpkg.com/react@18.3.1/umd/react.development.js',
  },
  {
    name: 'react-dom.development.js',
    url: 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
  },
  {
    name: 'babel.min.js',
    url: 'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
  },
];

// Font files - we'll create them with CSS
const fonts = {
  'IBM Plex Sans': {
    weights: [400, 500, 600],
    styles: ['normal', 'italic'],
  },
  'IBM Plex Mono': {
    weights: [400, 500],
    styles: ['normal'],
  },
};

async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✅ Downloaded: ${path.basename(outputPath)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('📦 Downloading vendor files...\n');

  try {
    // Download JS files
    for (const file of files) {
      const outputPath = path.join(VENDOR_DIR, file.name);
      if (fs.existsSync(outputPath)) {
        console.log(`⏭️  Already exists: ${file.name}`);
      } else {
        console.log(`⬇️  Downloading: ${file.name}`);
        await downloadFile(file.url, outputPath);
      }
    }

    // Create fonts CSS file
    const fontsCssPath = path.join(VENDOR_DIR, 'fonts.css');
    let fontsCss = '';

    for (const [fontName, config] of Object.entries(fonts)) {
      for (const weight of config.weights) {
        for (const style of config.styles) {
          const urlName = fontName.replace(/\s+/g, '+');
          const italicParam = style === 'italic' ? '1' : '0';
          const url = `https://fonts.googleapis.com/css2?family=${urlName}:ital,wght@${italicParam},${weight}`;

          fontsCss += `
/* ${fontName} ${weight} ${style} */
@import url('${url}');
`;
        }
      }
    }

    fs.writeFileSync(fontsCssPath, fontsCss);
    console.log(`✅ Created: fonts.css`);

    console.log('\n✅ All vendor files ready!');
    console.log('💡 Tip: Run "npm run build" to rebuild the HTML with local vendor files.\n');
  } catch (err) {
    console.error('❌ Error downloading vendor files:', err.message);
    process.exit(1);
  }
}

main();
