const FALLBACK_DESTINATION = "/portal";

/**
 * Accept only an origin-relative HTTP path. Backslashes and control characters
 * are rejected because browsers can normalize them into cross-origin URLs.
 */
export function safeInternalDestination(
  value: unknown,
  fallback = FALLBACK_DESTINATION,
) {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  if (value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;

  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    const base = new URL("https://seonbae.invalid");
    const destination = new URL(value, base);
    if (destination.origin !== base.origin) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}
