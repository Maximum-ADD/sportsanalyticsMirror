#!/usr/bin/env node
// Re-encodes the landing page's two photographic Figma exports into the
// responsive assets in public/. The export folder is read-only.
//
//   npm run assets:build
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const FIGMA_EXPORT_DIR = "C:/Users/humai/Downloads/LandingPage_Layers";
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

// The hero PNG's alpha channel is encoder noise (98.8% of pixels are already
// opaque). Flattening lets the lossy encoders drop alpha, which is most of the
// size win: 1982 KB -> 58 KB at 1920w.
const PAGE_BACKGROUND = "#120d09";

// No 2560px or @2x tier: the source is only 1884px wide, so those would be
// bytes spent on interpolated data. A sharper hero needs a new 2x Figma export.
const HERO_WIDTHS = [1920, 1440, 960, 640];

async function buildHero() {
  const source = path.join(FIGMA_EXPORT_DIR, "Frame 4 1.png");
  if (!existsSync(source)) throw new Error(`Missing hero source: ${source}`);

  for (const width of HERO_WIDTHS) {
    const resized = sharp(source)
      .flatten({ background: PAGE_BACKGROUND })
      .resize({ width, fit: "cover", kernel: "lanczos3" });

    await resized.clone().avif({ quality: 55, effort: 6 }).toFile(`${PUBLIC_DIR}/hero-arena-${width}.avif`);
    await resized.clone().webp({ quality: 80, effort: 6 }).toFile(`${PUBLIC_DIR}/hero-arena-${width}.webp`);
  }
}

// One texture at 2x for the CTA. The design exported this material twice at
// different crops; the second export is redundant.
async function buildLeatherTexture() {
  const source = path.join(FIGMA_EXPORT_DIR, "Rectangle 6.png");
  if (!existsSync(source)) throw new Error(`Missing texture source: ${source}`);

  await sharp(source)
    .resize({ width: 790, height: 198, fit: "cover", kernel: "lanczos3" })
    .webp({ quality: 70, effort: 6 })
    .toFile(`${PUBLIC_DIR}/texture-leather-790.webp`);
}

await mkdir(PUBLIC_DIR, { recursive: true });
await buildHero();
await buildLeatherTexture();
console.log(`Wrote ${HERO_WIDTHS.length * 2 + 1} assets to ${PUBLIC_DIR}`);
