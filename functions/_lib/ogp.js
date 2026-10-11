// リンクプレビュー(OGP)用: URL検証（SSRF対策）とHTMLのメタ情報抽出
export const UA = "Mozilla/5.0 (compatible; ChatAppLinkPreview/1.0)";
const MAX_BYTES = 300 * 1024;

// 社内ネットワーク等への接続を防ぐ（SSRF対策）。IPアドレス直指定・ localhost・ドットなしホストは拒否
export const isBlockedHost = (hostname) => {
  const h = String(hostname).toLowerCase().replace(/\.$/, "");
  if (!h.includes(".")) return true;
  if (h.startsWith("[") || h.includes(":")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (/^\d+$/.test(h.split(".").pop())) return true;
  return h === "localhost" || /\.(local|localhost|internal|lan|home|corp|intranet)$/.test(h);
};

export const parseUrl = (raw) => {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || isBlockedHost(u.hostname)) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  return u;
};

const decodeEntities = (s) =>
  String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(+d); } catch { return ""; } })
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();

const attrs = (tag) => {
  const out = {};
  tag.replace(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g, (_, k, a, b, c) => { out[k.toLowerCase()] = a ?? b ?? c ?? ""; return ""; });
  return out;
};

export const parseMeta = (html, baseUrl) => {
  const meta = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property || a.name || "").toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = decodeEntities(a.content);
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  let image = meta["og:image"] || meta["og:image:url"] || meta["twitter:image"] || "";
  try { image = image ? new URL(image, baseUrl).toString() : ""; } catch { image = ""; }
  if (!image.startsWith("https://")) image = ""; // 混在コンテンツを避ける
  return {
    title: (meta["og:title"] || meta["twitter:title"] || decodeEntities(titleTag?.[1]) || "").slice(0, 150),
    description: (meta["og:description"] || meta["twitter:description"] || meta.description || "").slice(0, 200),
    image,
    siteName: (meta["og:site_name"] || new URL(baseUrl).hostname).slice(0, 60),
  };
};

export const readLimited = async (res) => {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  try { await reader.cancel(); } catch { /* 無視 */ }
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return all;
};

export const decodeHtml = (bytes, contentType) => {
  const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 2048));
  const cs = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType || "")?.[1] || /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1] || "utf-8";
  try { return new TextDecoder(cs).decode(bytes); } catch { return new TextDecoder("utf-8").decode(bytes); }
};

