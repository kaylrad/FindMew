import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
const source = await readFile('frontend/public/icon.svg');
await mkdir('frontend/public/icons', { recursive: true });
for (const size of [192, 512])
  await sharp(source).resize(size).png().toFile(`frontend/public/icons/icon-${size}.png`);
await sharp(source).resize(180).png().toFile('frontend/public/icons/apple-touch-icon.png');
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#df7a52' } })
  .composite([{ input: await sharp(source).resize(320).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile('frontend/public/icons/maskable-512.png');
console.log('Generated 192, 512, maskable and Apple icons.');
