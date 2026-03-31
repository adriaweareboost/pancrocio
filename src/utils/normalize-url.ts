export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove tracking params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];
    trackingParams.forEach((p) => parsed.searchParams.delete(p));
    // Remove trailing slash
    let normalized = parsed.origin + parsed.pathname.replace(/\/+$/, '') + parsed.search;
    return normalized.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/+$/, '');
  }
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
