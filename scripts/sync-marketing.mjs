import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "marketing", "dist");
const target = resolve(root, "public", "marketing");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(dist, target, { recursive: true });

for (const entry of ["_astro", "fonts", "images"]) {
  const destination = resolve(root, "public", entry);
  await rm(destination, { recursive: true, force: true });
  await cp(resolve(dist, entry), destination, { recursive: true });
}

for (const entry of ["favicon.png", "favicon.ico", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "og-image.png", "site.webmanifest", "hero.jpg", "logo.png", "logo-light.png", "site-auth.js", "cookie-consent.js", "cookie-consent.css"]) {
  await cp(resolve(dist, entry), resolve(root, "public", entry));
}

await rm(resolve(target, "login"), { recursive: true, force: true });
