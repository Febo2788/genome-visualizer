const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG256() {
  // Create a 256x256 PNG with Gyre beige color
  const width = 256;
  const height = 256;
  
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  
  // CRC32
  function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = buf[i];
      for (let k = 0; k < 8; k++) {
        crc = ((crc ^ c) & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
        c >>>= 1;
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  
  // IHDR chunk with CRC
  const ihdrChunk = Buffer.alloc(25);
  ihdrChunk.writeUInt32BE(13, 0);
  Buffer.from('IHDR').copy(ihdrChunk, 4);
  ihdr.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(crc32(ihdrChunk.slice(4, 21)), 21);
  
  // Create image data: Gyre beige RGB(250, 248, 242)
  const scanlines = Buffer.alloc(height * (1 + width * 3));
  let idx = 0;
  for (let y = 0; y < height; y++) {
    scanlines[idx++] = 0; // filter type none
    for (let x = 0; x < width; x++) {
      scanlines[idx++] = 250; // R
      scanlines[idx++] = 248; // G
      scanlines[idx++] = 242; // B
    }
  }
  
  // Compress and create IDAT chunk
  const compressed = zlib.deflateSync(scanlines);
  const idatChunk = Buffer.alloc(12 + compressed.length);
  idatChunk.writeUInt32BE(compressed.length, 0);
  Buffer.from('IDAT').copy(idatChunk, 4);
  compressed.copy(idatChunk, 8);
  idatChunk.writeUInt32BE(crc32(idatChunk.slice(4, 8 + compressed.length)), 8 + compressed.length);
  
  // IEND chunk
  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  
  return Buffer.concat([sig, ihdrChunk, idatChunk, iend]);
}

try {
  const iconDir = path.join(__dirname, '..');
  const png = createPNG256();
  fs.writeFileSync(path.join(iconDir, 'icon.png'), png);
  console.log('✅ Created: icon.png (256x256)');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
