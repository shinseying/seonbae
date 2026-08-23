/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep production builds from overwriting assets used by a running dev server.
  // Vercel's Next.js runtime expects the conventional `.next` directory.
  distDir: process.env.VERCEL
    ? ".next"
    : process.env.NODE_ENV === "production"
      ? ".next-build"
      : ".next",
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          destination: "/marketing/index.html",
        },
        {
          source: "/about",
          destination: "/marketing/about/index.html",
        },
        {
          source: "/become-a-tutor",
          destination: "/marketing/become-a-tutor/index.html",
        },
        {
          source: "/become-a-tutor/thank-you",
          destination: "/marketing/become-a-tutor/thank-you/index.html",
        },
        {
          source: "/contact",
          destination: "/marketing/contact/index.html",
        },
        {
          source: "/get-matched",
          destination: "/marketing/get-matched/index.html",
        },
        {
          source: "/how-it-works",
          destination: "/marketing/how-it-works/index.html",
        },
        {
          source: "/mock-exams",
          destination: "/marketing/mock-exams/index.html",
        },
        {
          source: "/pricing",
          destination: "/marketing/pricing/index.html",
        },
        {
          source: "/resources",
          destination: "/marketing/resources/index.html",
        },
        {
          source: "/resources/:slug",
          destination: "/marketing/resources/:slug/index.html",
        },
        {
          source: "/subjects",
          destination: "/marketing/subjects/index.html",
        },
        {
          source: "/subjects/:slug",
          destination: "/marketing/subjects/:slug/index.html",
        },
        {
          source: "/tutors",
          destination: "/marketing/tutors/index.html",
        },
        {
          source: "/404",
          destination: "/marketing/404/index.html",
        },
        {
          source: "/verification",
          destination: "/marketing/verification/index.html",
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/portal/tutor/contract",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/api/tutor-contract",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/portal/meeting/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "frame-ancestors 'self'",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://source.zoom.us",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://source.zoom.us https://*.zoom.us blob:",
              "connect-src 'self' https://zoom.us https://*.zoom.us wss://*.zoom.us",
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com https://source.zoom.us",
              "frame-src 'self' https://*.zoom.us",
            ].join("; "),
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), display-capture=(self)",
          },
        ],
      },
    ];
  },
  webpack(config) {
    // Zoom 6.2 references its private download manager in the UMD bundle even
    // though that module is not published to npm. The classroom does not use
    // Zoom's file-download feature, so keep that optional branch disabled.
    config.resolve.alias["@zoom/download-manager"] = false;
    return config;
  },
};

export default nextConfig;
