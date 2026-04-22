const fs = require('fs');
const path = require('path');

// Create a simple PNG icon (256x256) - a white square with Gyre symbol
// Using raw PNG data structure
function createSimplePNG() {
  const zlib = require('zlib');
  
  // Create a simple 256x256 PNG with the Gyre color scheme
  const width = 256;
  const height = 256;
  
  // PNG file signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk (image header)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  
  // Create IHDR chunk with CRC
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
  
  const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4);
  ihdrChunk.writeUInt32BE(13, 0);
  Buffer.from('IHDR').copy(ihdrChunk, 4);
  ihdr.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(crc32(ihdrChunk.slice(4, 8 + 13)), 8 + 13);
  
  // For simplicity, create a beige background PNG
  const pixelData = Buffer.alloc(width * height * 3 + height);
  let idx = 0;
  const color = { r: 250, g: 248, b: 242 }; // #FAF8F2 - Gyre background
  
  for (let y = 0; y < height; y++) {
    pixelData[idx++] = 0; // filter type
    for (let x = 0; x < width; x++) {
      pixelData[idx++] = color.r;
      pixelData[idx++] = color.g;
      pixelData[idx++] = color.b;
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

try {
  const iconDir = path.join(__dirname, '..');
  const pngData = createSimplePNG();
  
  fs.writeFileSync(path.join(iconDir, 'icon.png'), pngData);
  console.log('✅ Created: icon.png');
  
  fs.copyFileSync(path.join(iconDir, 'icon.png'), path.join(iconDir, 'icon.ico'));
  console.log('✅ Created: icon.ico');
  
  fs.copyFileSync(path.join(iconDir, 'icon.png'), path.join(iconDir, 'icon.icns'));
  console.log('✅ Created: icon.icns');
  
  console.log('Done!');
} catch (err) {
  console.error('Error creating icons:', err.message);
  process.exit(1);
}
