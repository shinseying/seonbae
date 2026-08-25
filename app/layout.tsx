import type { Metadata, Viewport } from "next";
import Script from "next/script";
import CookieConsent from "./CookieConsent";
import "./globals.css";

const TITLE = "선배 Seonbae — 검증된 튜터를 찾는 가장 확실한 방법";
const DESCRIPTION =
  "서울대·고려대·연세대 재외국민 네트워크에서 직접 검증한 IB, AP, SAT, A-Level, IGCSE 튜터를 만나보세요.";

// Portal/auth routes render through Next while the public pages are rewritten to
// the Astro build, so the icon and share card have to be declared in both places
// or a link shared from /login previews differently from one shared from /.
export const metadata: Metadata = {
  metadataBase: new URL("https://seonbaetutor.com"),
  title: TITLE,
  description: DESCRIPTION,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Chrome reads the manifest, not the icon list, when it builds a home-screen
  // or new-tab shortcut tile, so it has to be declared on the Next routes too.
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    siteName: "Seonbae",
    locale: "ko_KR",
    title: TITLE,
    description: DESCRIPTION,
    url: "https://seonbaetutor.com",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Seonbae", type: "image/png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#163a51",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/cookie-consent.css" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var l=localStorage.getItem('seonbae-lang')==='en'?'en':'ko';document.documentElement.dataset.lang=l;document.documentElement.lang=l;document.documentElement.dataset.theme=localStorage.getItem('seonbae-theme')==='dark'?'dark':'light'}catch(e){}",
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <CookieConsent />
        <Script src="/cookie-consent.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
