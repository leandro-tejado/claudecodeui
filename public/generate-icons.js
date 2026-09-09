import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Icon sizes needed for the PWA manifest
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// "LT" badge — same look as the in-app sidebar logo (SkinSidebar.tsx)
function createIconSVG(size) {
  const cornerRadius = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.42);

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="hsl(240 5.9% 10%)"/>
  <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central"
        font-family="Encode Sans, -apple-system, Helvetica, Arial, sans-serif"
        font-size="${fontSize}" font-weight="700" fill="#ffffff">LT</text>
</svg>`;
}

async function main() {
  const iconsDir = path.join(__dirname, 'icons');

  for (const size of sizes) {
    const svgContent = createIconSVG(size);
    const svgPath = path.join(iconsDir, `icon-${size}x${size}.svg`);
    fs.writeFileSync(svgPath, svgContent);

    const pngPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    await sharp(Buffer.from(svgContent)).png().toFile(pngPath);
    console.log(`Created icon-${size}x${size}.svg + .png`);
  }

  // 32x32 favicon.png used by index.html alongside favicon.svg
  const faviconSvg = fs.readFileSync(path.join(__dirname, 'favicon.svg'));
  await sharp(faviconSvg).resize(32, 32).png().toFile(path.join(__dirname, 'favicon.png'));
  console.log('Created favicon.png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
