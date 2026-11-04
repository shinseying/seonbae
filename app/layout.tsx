import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { cookies, headers } from "next/headers";
import CookieConsent from "./CookieConsent";
import ServerLocaleProvider from "../utils/i18n/ServerLocale";
import { LOCALE_COOKIE, pairedPage, parseLocale } from "../utils/i18n/locale-routing";
import "./globals.css";

const TITLE = "검증된 튜터를 찾는 가장 확실한 방법 | 선배";
const DESCRIPTION =
  "서울대·고려대·연세대 재외국민 네트워크에서 직접 검증한 IB, AP, SAT, A-Level, IGCSE 튜터를 만나보세요.";

// Portal/auth routes render through Next while the public pages are rewritten to
// the Astro build, so the icon and share card have to be declared in both places
// or a link shared from /login previews differently from one shared from /.
export const metadata: Metadata = {
  metadataBase: new URL("https://www.seonbaetutor.com"),
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
    url: "https://www.seonbaetutor.com",
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = (await headers()).get("x-seonbae-pathname") || "/";
  // The cookie is the site-wide choice, so it outranks the URL. A portal page
  // has one URL in both languages, so without the cookie the server had no way
  // to know it was rendering for an English reader and always chose Korean.
  const cookieLocale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const locale = cookieLocale ?? pairedPage(pathname)?.locale ?? "ko";
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/cookie-consent.css" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var p=location.pathname,s=null;try{s=localStorage}catch(e){}var q=new URLSearchParams(location.search).get('lang');var requested=q==='en'||q==='ko'?q:'';var m=document.cookie.match(/(?:^|; )seonbae-lang=(ko|en)(?:;|$)/);var cookie=m?m[1]:'';var stored=s?s.getItem('seonbae-lang'):'';stored=stored==='en'||stored==='ko'?stored:'';var urlLang=p==='/en'||p.indexOf('/en/')===0?'en':p==='/privacy'||p==='/terms'?'ko':'';var chosen=requested||cookie||stored||urlLang;var pref=chosen||'ko';if(chosen&&chosen!==cookie)document.cookie='seonbae-lang='+chosen+'; path=/; max-age=31536000; samesite=lax'+(location.protocol==='https:'?'; secure':'');if(s&&chosen&&chosen!==stored)s.setItem('seonbae-lang',chosen);if(urlLang&&urlLang!==pref)location.replace((pref==='en'?'/en'+p:p.slice(3)||'/')+location.hash);var l=urlLang||pref;document.documentElement.dataset.lang=l;document.documentElement.lang=l;document.documentElement.dataset.theme=s&&s.getItem('seonbae-theme')==='dark'?'dark':'light'}catch(e){}",
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ServerLocaleProvider locale={locale}>
          {children}
          <CookieConsent />
        </ServerLocaleProvider>
        <Script src="/cookie-consent.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
