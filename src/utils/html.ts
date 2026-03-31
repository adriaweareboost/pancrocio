// HTML escaping and sanitization utilities

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] || ch);
}

export function escapeJsString(str: string): string {
  return JSON.stringify(str).slice(1, -1);
}

export function sanitizeMockupHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\bon\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:');
}
