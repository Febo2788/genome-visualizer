const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Create Gyre logo icon (512x512)
 * Two concentric circles with vertical lines at top and bottom
 * Transparent background, black foreground
 */
function createGyreIcon() {
  const width = 512;
  const height = 512;
  const centerX = 256;
  const centerY = 256;

  // PNG file signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk - RGBA with transparency
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // CRC32
  const crc32 = (buf) => {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crc ^ buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  // Create IHDR chunk
  const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4);
  ihdrChunk.writeUInt32BE(13, 0);
  Buffer.from('IHDR').copy(ihdrChunk, 4);
  ihdr.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(crc32(ihdrChunk.slice(4, 8 + 13)), 8 + 13);

  // Create pixel data
  const pixelData = Buffer.alloc(width * height * 4 + height);
  let idx = 0;

  // Circle radii (scaled for 512x512) - FILL THE CANVAS
  const radius1 = 230; // outer circle - MUCH BIGGER, fills canvas
  const radius2 = 135; // inner circle - scaled proportionally
  const lineWidth = 14;  // thickness of circles and lines
  // Lines from edge to inner circle (no overlap)
  const lineTopStart = 26;    // top of outer circle
  const lineTopEnd = 121;     // stops at top of inner circle (256 - 135)
  const lineBottomStart = 391;  // starts at bottom of inner circle (256 + 135)
  const lineBottomEnd = 486;    // bottom of outer circle

  for (let y = 0; y < height; y++) {
    pixelData[idx++] = 0; // filter type
    for (let x = 0; x < width; x++) {
      let isPixelBlack = false;

      // Distance from center
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Check if pixel is on circles (using antialiasing for smoother edges)
      const distFromRadius1 = Math.abs(distance - radius1);
      const distFromRadius2 = Math.abs(distance - radius2);

      if (distFromRadius1 < lineWidth / 2 || distFromRadius2 < lineWidth / 2) {
        isPixelBlack = true;
      }

      // Check if pixel is on top line (vertical at center x)
      if (Math.abs(x - centerX) < lineWidth / 2 && y >= lineTopStart && y <= lineTopEnd) {
        isPixelBlack = true;
      }

      // Check if pixel is on bottom line (vertical at center x)
      if (Math.abs(x - centerX) < lineWidth / 2 && y >= lineBottomStart && y <= lineBottomEnd) {
        isPixelBlack = true;
      }

      if (isPixelBlack) {
        pixelData[idx++] = 0;     // R
        pixelData[idx++] = 0;     // G
        pixelData[idx++] = 0;     // B
        pixelData[idx++] = 255;   // A (opaque)
      } else {
        pixelData[idx++] = 0;     // R
        pixelData[idx++] = 0;     // G
        pixelData[idx++] = 0;     // B
        pixelData[idx++] = 0;     // A (transparent)
      }
    }
  }

  // Compress
  const compressed = zlib.deflateSync(pixelData);

  // IDAT chunk
  const idatChunk = Buffer.alloc(4 + 4 + compressed.length + 4);
  idatChunk.writeUInt32BE(compressed.length, 0);
  Buffer.from('IDAT').copy(idatChunk, 4);
  compressed.copy(idatChunk, 8);
  idatChunk.writeUInt32BE(crc32(idatChunk.slice(4, 8 + compressed.length)), 8 + compressed.length);

  // IEND chunk
  const iendChunk = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Convert PNG to ICO
 */
function convertPNGtoICO(pngData) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const dirEntry = Buffer.alloc(16);
  dirEntry[0] = 0;
  dirEntry[1] = 0;
  dirEntry[2] = 0;
  dirEntry[3] = 0;
  dirEntry.writeUInt16LE(1, 4);
  dirEntry.writeUInt16LE(32, 6);
  dirEntry.writeUInt32LE(pngData.length, 8);
  dirEntry.writeUInt32LE(22, 12);

  return Buffer.concat([header, dirEntry, pngData]);
}

try {
  const iconDir = path.join(__dirname, '..');
  const pngData = createGyreIcon();

  const pngPath = path.join(iconDir, 'icon.png');
  const icoPath = path.join(iconDir, 'icon.ico');

  fs.writeFileSync(pngPath, pngData);
  console.log('✅ Created: icon.png (Gyre logo - circles + lines)');

  const icoData = convertPNGtoICO(pngData);
  fs.writeFileSync(icoPath, icoData);
  console.log('✅ Created: icon.ico');

  console.log('\n✨ Icon ready! Two concentric circles with vertical lines at top/bottom');
} catch (err) {
  console.error('Error creating icon:', err.message);
  process.exit(1);
}
