const fs = require('fs');
const path = require('path');

function createICO() {
  // Create a simple valid ICO file
  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type (1 = ICO)
  header.writeUInt16LE(1, 4); // number of images
  
  // Create a simple 32x32 icon with beige color
  const size = 32;
  
  // Image directory entry: 16 bytes
  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(size, 0); // width
  dirEntry.writeUInt8(size, 1); // height
  dirEntry.writeUInt8(0, 2); // colors
  dirEntry.writeUInt8(0, 3); // reserved
  dirEntry.writeUInt16LE(1, 4); // color planes
  dirEntry.writeUInt16LE(32, 6); // bits per pixel
  
  // Create simple BMP data (beige color #FAF8F2)
  const bmpHeader = Buffer.alloc(40);
  bmpHeader.writeUInt32LE(40, 0); // header size
  bmpHeader.writeInt32LE(size, 4);
  bmpHeader.writeInt32LE(size * 2, 8); // height doubled for icon
  bmpHeader.writeUInt16LE(1, 12); // planes
  bmpHeader.writeUInt16LE(32, 14); // bits per pixel
  bmpHeader.writeUInt32LE(0, 16); // no compression
  
  // Pixel data: 32x32 = 1024 pixels, 32-bit = 4096 bytes
  const pixelData = Buffer.alloc(size * size * 4);
  // Gyre beige: RGB(250, 248, 242) = BGRA(242, 248, 250, 255)
  for (let i = 0; i < pixelData.length; i += 4) {
    pixelData[i] = 242;     // B
    pixelData[i + 1] = 248; // G
    pixelData[i + 2] = 250; // R
    pixelData[i + 3] = 255; // A
  }
  
  const bmpSize = 40 + (size * size * 4);
  dirEntry.writeUInt32LE(bmpSize, 8); // image data size
  dirEntry.writeUInt32LE(22, 12); // offset to image data
  
  const bmpData = Buffer.concat([bmpHeader, pixelData]);
  
  return Buffer.concat([header, dirEntry, bmpData]);
}

try {
  const iconDir = path.join(__dirname, '..');
  const ico = createICO();
  fs.writeFileSync(path.join(iconDir, 'icon.ico'), ico);
  console.log('✅ Created: icon.ico (32x32 beige)');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
