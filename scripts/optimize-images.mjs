// ---------------------------------------------------------------------------
// Image optimisation for the built marketing site.
//
// Runs on marketing/dist after `astro build`, never on the sources. Whatever a
// camera or an export produced stays in marketing/public at full quality and in
// git; only the copies that ship get resized and re-encoded. That also keeps
// marketing/public/logo.png intact as the source generate-brand-assets.mjs
// reads.
//
// Run: node scripts/optimize-images.mjs   (wired into `pnpm build:marketing`)
// ---------------------------------------------------------------------------
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'marketing', 'dist');

// generate-brand-assets.mjs already emits these at exact sizes, and chat apps
// and search engines expect the format they were built as. Leave them alone.
const GENERATED_ICONS = new Set([
  'favicon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'og-image.png',
]);

// Referenced from the Next app as well as the marketing build, so the name that
// ships has to keep its extension. They are still resized and recompressed.
const KEEP_EXTENSION = new Set([
  'ian-bae-placeholder.png',
  'logo.png',
  'logo-light.png',
]);

// A header mark does not need 1344px, and a hero does not need 3577px.
const MAX_WIDTH = [
  [/^logo(-light)?\.png$/, 600],
  [/^hero\.\w+$/, 2000],
];
const DEFAULT_MAX_WIDTH = 1600;

// Below this a re-encode is not worth the quality loss it can cost.
const MIN_BYTES = 20 * 1024;

const maxWidthFor = (name) => MAX_WIDTH.find(([pattern]) => pattern.test(name))?.[1] ?? DEFAULT_MAX_WIDTH;

async function collect(dir, matches, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path, matches, out);
    else if (matches.test(entry.name)) out.push(path);
  }
  return out;
}

const kb = (bytes) => `${Math.round(bytes / 1024)}KB`;

const renames = new Map();
let before = 0;
let after = 0;

for (const path of await collect(dist, /\.(jpe?g|png)$/i)) {
  const name = path.split(sep).pop();
  if (GENERATED_ICONS.has(name)) continue;

  const source = await readFile(path);
  const original = source.length;
  if (original < MIN_BYTES) continue;

  // Read into a buffer first: sharp keeps the input file open, and on Windows
  // that blocks writing the result back over the same path.
  const image = sharp(source);
  const { width, hasAlpha } = await image.metadata();
  const max = maxWidthFor(name);
  const resized = image.resize({ width: Math.min(width ?? max, max), withoutEnlargement: true });

  // A photograph with no transparency has no reason to be a PNG. Transparency
  // has to stay lossless-ish, so those keep the palette PNG encoder.
  const toJpeg = !hasAlpha && !KEEP_EXTENSION.has(name);
  const target = toJpeg ? path.replace(/\.png$/i, '.jpg') : path;

  const buffer = await (toJpeg || /\.jpe?g$/i.test(path)
    ? resized.jpeg({ quality: 78, mozjpeg: true })
    : resized.png({ compressionLevel: 9, effort: 10, palette: true, quality: 82 })
  ).toBuffer();

  // Never let an "optimisation" make a file bigger.
  if (buffer.length >= original && target === path) continue;

  await writeFile(target, buffer);
  if (target !== path) {
    await unlink(path);
    renames.set(`/${relative(dist, path).split(sep).join('/')}`, `/${relative(dist, target).split(sep).join('/')}`);
  }

  before += original;
  after += buffer.length;
  console.log(`${kb(original).padStart(8)} -> ${kb(buffer.length).padStart(8)}  ${relative(dist, target)}`);
}

// Renaming a file is only safe if everything pointing at it moves too. The
// names here are distinctive enough that a plain string swap is unambiguous.
if (renames.size) {
  for (const path of await collect(dist, /\.(html|css|js|json|xml|txt)$/i)) {
    const source = await readFile(path, 'utf8');
    let updated = source;
    for (const [from, to] of renames) updated = updated.split(from).join(to);
    if (updated !== source) await writeFile(path, updated);
  }
}

console.log(
  before
    ? `images: ${kb(before)} -> ${kb(after)} (${Math.round((1 - after / before) * 100)}% smaller)`
    : 'images: nothing to optimise',
);
