const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Create a 512x512 transparent PNG with a black circle (Gyre symbol)
 * This is a minimal icon - black circle on transparent background
 */
function createTransparentPNG() {
  const width = 512;
  const height = 512;

  // PNG file signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk (image header) - RGBA with transparency
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA with alpha)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // CRC32 function
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

  // Create IHDR chunk with CRC
  const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4);
  ihdrChunk.writeUInt32BE(13, 0);
  Buffer.from('IHDR').copy(ihdrChunk, 4);
  ihdr.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(crc32(ihdrChunk.slice(4, 8 + 13)), 8 + 13);

  // Create pixel data (RGBA: 4 bytes per pixel)
  // We'll create a black circle on transparent background
  const pixelData = Buffer.alloc(width * height * 4 + height); // +height for filter bytes
  let idx = 0;

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = width / 3; // Circle radius

  for (let y = 0; y < height; y++) {
    pixelData[idx++] = 0; // filter type (none)
    for (let x = 0; x < width; x++) {
      // Calculate distance from center
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= radius) {
        // Inside circle: black opaque
        pixelData[idx++] = 0;     // R: black
        pixelData[idx++] = 0;     // G: black
        pixelData[idx++] = 0;     // B: black
        pixelData[idx++] = 255;   // A: opaque
      } else {
        // Outside circle: transparent
        pixelData[idx++] = 0;     // R
        pixelData[idx++] = 0;     // G
        pixelData[idx++] = 0;     // B
        pixelData[idx++] = 0;     // A: transparent
      }
    }
  }

  // Compress data
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
 * Convert PNG to ICO format (Windows icon)
 * Simple approach: embed PNG data in ICO format
 */
function convertPNGtoICO(pngData) {
  // ICO header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // Reserved
  header.writeUInt16LE(1, 2);      // Icon file format
  header.writeUInt16LE(1, 4);      // Number of images

  // Image directory entry for 512x512
  const dirEntry = Buffer.alloc(16);
  dirEntry[0] = 0;     // Width (0 = 256+)
  dirEntry[1] = 0;     // Height (0 = 256+)
  dirEntry[2] = 0;     // Colors in palette
  dirEntry[3] = 0;     // Reserved
  dirEntry.writeUInt16LE(1, 4);   // Color planes
  dirEntry.writeUInt16LE(32, 6);  // Bits per pixel
  dirEntry.writeUInt32LE(pngData.length, 8);  // Size of image data
  dirEntry.writeUInt32LE(22, 12); // Offset to image data (after header + dir)

  return Buffer.concat([header, dirEntry, pngData]);
}

try {
  const iconDir = path.join(__dirname, '..');
  const pngData = createTransparentPNG();

  const pngPath = path.join(iconDir, 'icon.png');
  const icoPath = path.join(iconDir, 'icon.ico');

  fs.writeFileSync(pngPath, pngData);
  console.log('✅ Created: icon.png (512x512, transparent background, black circle)');

  const icoData = convertPNGtoICO(pngData);
  fs.writeFileSync(icoPath, icoData);
  console.log('✅ Created: icon.ico');

  console.log('\nIcon files ready for electron-builder!');
  console.log('Make sure package.json has: "icon": "./icon.png"');
} catch (err) {
  console.error('Error creating icon:', err.message);
  process.exit(1);
}
