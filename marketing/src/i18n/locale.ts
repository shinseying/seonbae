export type SiteLocale = 'ko' | 'en';

export const DEFAULT_LOCALE: SiteLocale = 'ko';
export const SUPPORTED_LOCALES: SiteLocale[] = ['ko', 'en'];

export function localeFromPath(pathname: string): SiteLocale {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'ko';
}

export function pick<T>(locale: SiteLocale, en: T, ko: T): T {
  return locale === 'en' ? en : ko;
}

export function stripLocale(pathname: string): string {
  const plain = pathname === '/en'
    ? '/'
    : pathname.startsWith('/en/')
      ? pathname.slice(3) || '/'
      : pathname;
  return plain.length > 1 ? plain.replace(/\/+$/, '') : '/';
}

const marketingRoots = new Set([
  '/', '/about', '/become-a-tutor', '/contact', '/get-matched',
  '/how-it-works', '/mock-exams', '/pricing', '/resources', '/subjects',
  '/tutors', '/verification', '/privacy', '/terms',
]);

/** Keep portal/account/API links unprefixed while localising marketing URLs. */
export function localePath(href: string, locale: SiteLocale): string {
  if (locale !== 'en' || !href.startsWith('/') || href.startsWith('//')) return href;

  const [pathAndQuery, hash = ''] = href.split('#', 2);
  const [pathname, query = ''] = pathAndQuery.split('?', 2);
  if (pathname === '/en' || pathname.startsWith('/en/')) return href;

  const root = pathname === '/' ? '/' : `/${pathname.split('/').filter(Boolean)[0] ?? ''}`;
  if (!marketingRoots.has(root)) return href;

  const localised = pathname === '/' ? '/en/' : `/en${pathname}`;
  return `${localised}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
}

export function counterpartPath(pathname: string, locale: SiteLocale): string {
  return pathForLocale(pathname, locale === 'en' ? 'ko' : 'en');
}

export function pathForLocale(pathname: string, target: SiteLocale): string {
  const plain = stripLocale(pathname);
  if (target === 'ko') return plain;
  return plain === '/' ? '/en/' : `/en${plain}`;
}
