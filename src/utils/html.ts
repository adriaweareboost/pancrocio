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
    // Remove dangerous tags entirely
    .replace(/<\s*\/?\s*(script|iframe|embed|object|form|link|meta|base|applet)\b[^>]*>/gi, '')
    // Remove script content that might have been split
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove all event handler attributes (onclick, onload, onerror, etc.)
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\bon\w+\s*=\s*[^\s>]*/gi, '')
    // Block dangerous URI schemes in href/src/action
    .replace(/(?:javascript|vbscript|data)\s*:/gi, 'blocked:')
    // Remove srcdoc attributes (can embed arbitrary HTML)
    .replace(/\bsrcdoc\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\bsrcdoc\s*=\s*[^\s>]*/gi, '');
}
