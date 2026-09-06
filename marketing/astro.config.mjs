import { defineConfig } from 'astro/config';

// Seonbae marketing site. Static, content-driven, no server runtime needed.
export default defineConfig({
  site: 'https://www.seonbaetutor.com',
  i18n: {
    locales: ['ko', 'en'],
    defaultLocale: 'ko',
    routing: { prefixDefaultLocale: false },
  },
  devToolbar: { enabled: false },
  // Dev and preview only. Honours PORT when the environment assigns one,
  // otherwise keeps Astro's usual 4321.
  server: { port: Number(process.env.PORT) || 4321 },
});
