// Next/Vercel can append deployment identifiers to script URLs. Compare the
// pathname, retain query parameters, and only probe this site's static assets.
export function extractJavaScriptAssets(html, origin) {
  const site = new URL(origin);
  const assets = new Set();
  for (const match of html.matchAll(/<script\b[^>]*?\ssrc\s*=\s*(["'])(.*?)\1/gi)) {
    const source = match[2].replace(/&amp;|&#38;|&#x26;/gi, "&");
    let url;
    try { url = new URL(source, site); } catch { continue; }
    if (url.origin !== site.origin || !url.pathname.startsWith("/_next/static/") || !url.pathname.endsWith(".js")) continue;
    url.hash = "";
    assets.add(url.href);
  }
  return [...assets];
}
