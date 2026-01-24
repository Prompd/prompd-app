import pngToIco from 'png-to-ico';
import { writeFileSync } from 'fs';

// Try with the almost-square logo (433x436 is close enough for icon purposes)
pngToIco('public/icon.png')
  .then(buf => {
    writeFileSync('public/icon.ico', buf);
    console.log('✓ Created public/icon.ico');
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
