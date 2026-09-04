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
        // Authentication screens must always come from the active deployment.
        // Public CDN caching can leave a different device on an older login UI
        // even though the authentication API has already been updated.
        source: "/login",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/login/:path*",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/admin-verify",
        headers: privateNoStoreHeaders,
      },
      {
        source: "/admin-shell",
        headers: privateNoStoreHeaders,
      },
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
        // The classroom hands off to the desktop Zoom app via a new-tab link,
        // so the page itself loads no Zoom scripts and needs only a self CSP.
        source: "/portal/meeting/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "frame-ancestors 'self'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "script-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

const privateNoStoreHeaders = [
  {
    key: "Cache-Control",
    value: "private, no-store, max-age=0, must-revalidate",
  },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

export default nextConfig;
