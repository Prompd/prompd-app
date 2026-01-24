import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFileSync } from 'fs';

// First make the image square, then convert to ICO
sharp('public/logo.png')
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()
  .then(buffer => {
    // Save square PNG
    writeFileSync('public/icon.png', buffer);
    console.log('✓ Created public/icon.png (512x512)');

    // Convert to ICO
    return pngToIco(buffer);
  })
  .then(ico => {
    writeFileSync('public/icon.ico', ico);
    console.log('✓ Created public/icon.ico');
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
