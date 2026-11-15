import { crc32 } from "./gq-hash.js";

var PREFIX = "GQ1.";
var MAX_COMPRESSED = 48 * 1024;
var MAX_RAW = 400 * 1024;
export var GQError = class extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
};
var te = new TextEncoder();
var td = new TextDecoder("utf-8", { fatal: true });
async function streamBytes(readable, limit) {
  const reader = readable.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      try {
        await reader.cancel();
      } catch {
      }
      throw new GQError("too-large", "payload expands beyond limit");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
async function inflate(bytes, limit = MAX_RAW) {
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter();
  w.write(bytes).catch(() => {
  });
  w.close().catch(() => {
  });
  try {
    return await streamBytes(ds.readable, limit);
  } catch (e) {
    if (e instanceof GQError) throw e;
    throw new GQError("corrupt", "inflate failed");
  }
}
export function toB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new GQError("corrupt", "bad base64");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  let bin;
  try {
    bin = atob(b64);
  } catch {
    throw new GQError("corrupt", "bad base64");
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
var hex8 = (n) => (n >>> 0).toString(16).padStart(8, "0");
async function parseJsonBytes(comp) {
  const raw = await inflate(comp);
  let json;
  try {
    json = JSON.parse(td.decode(raw));
  } catch {
    throw new GQError("corrupt", "bad json");
  }
  return json;
}
async function decodeText(text) {
  if (typeof text !== "string" || !text.startsWith(PREFIX)) throw new GQError("not-gq", "no prefix");
  if (text.length > MAX_COMPRESSED * 1.4 + 32) throw new GQError("too-large", "carrier too long");
  const m = /^GQ1\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(text);
  if (!m) throw new GQError("corrupt", "bad shape");
  const comp = fromB64url(m[1]);
  if (hex8(crc32(comp)) !== m[2]) throw new GQError("checksum", "crc mismatch");
  return parseJsonBytes(comp);
}
async function decodeBytes(bytes) {
  if (!bytes || bytes.length < 8 || bytes[0] !== 71 || bytes[1] !== 81) throw new GQError("not-gq", "no magic");
  if (bytes[2] !== 1) throw new GQError("version", "unsupported version");
  if (bytes.length - 7 > MAX_COMPRESSED) throw new GQError("too-large", "carrier too long");
  const crc = (bytes[3] << 24 | bytes[4] << 16 | bytes[5] << 8 | bytes[6]) >>> 0;
  const comp = bytes.subarray(7);
  if (crc32(comp) !== crc) throw new GQError("checksum", "crc mismatch");
  return parseJsonBytes(comp);
}
var VS_RUN = /(?:[\uFE00-\uFE0F]|\uDB40[\uDD00-\uDDEF]){16,}/g;
export function vsExtract(text) {
  if (typeof text !== "string" || text.length < 16) return null;
  const runs = text.match(VS_RUN);
  if (!runs) return null;
  for (const run of runs.sort((a, b) => b.length - a.length)) {
    const out = [];
    for (const ch of run) {
      const cp = ch.codePointAt(0);
      if (cp >= 65024 && cp <= 65039) out.push(cp - 65024);
      else if (cp >= 917760 && cp <= 917999) out.push(cp - 917760 + 16);
    }
    if (out[0] === 71 && out[1] === 81) return Uint8Array.from(out);
  }
  return null;
}
export function findTextCarriers(s) {
  if (typeof s !== "string") return [];
  return s.match(/GQ1\.[A-Za-z0-9_-]{8,}\.[0-9a-f]{8}/g) || [];
}
export function carrierFromDelta(delta) {
  const ops = delta && Array.isArray(delta.ops) ? delta.ops : null;
  if (!ops) return null;
  for (let i = ops.length - 1; i >= 0; i--) {
    const a = ops[i] && ops[i].attributes;
    if (a && typeof a.gq === "string" && a.gq.startsWith(PREFIX)) return { kind: "attr", text: a.gq };
  }
  let all = "";
  for (const op of ops) if (op && typeof op.insert === "string") all += op.insert;
  const bytes = vsExtract(all);
  return bytes ? { kind: "vs", bytes } : null;
}
export async function decodeCarrier(c) {
  if (!c) throw new GQError("not-gq", "no carrier");
  if (typeof c === "string") return decodeText(c);
  if (c.kind === "attr") return decodeText(c.text);
  if (c.kind === "vs") return decodeBytes(c.bytes);
  throw new GQError("not-gq", "unknown carrier");
}

export var VS_MAX_CHARS = 12e3;
async function deflate(bytes) {
  const cs = new CompressionStream("deflate-raw");
  const w = cs.writable.getWriter();
  w.write(bytes);
  w.close();
  return streamBytes(cs.readable, Infinity);
}
export async function encodeDoc(doc) {
  const json = JSON.stringify(doc);
  const raw = te.encode(json);
  if (raw.byteLength > MAX_RAW) throw new GQError("too-large", "document too large");
  const comp = await deflate(raw);
  if (comp.byteLength > MAX_COMPRESSED) throw new GQError("too-large", "compressed document too large");
  const crc = crc32(comp);
  const text = PREFIX + toB64url(comp) + "." + hex8(crc);
  const bytes = new Uint8Array(7 + comp.byteLength);
  bytes.set([71, 81, 1, crc >>> 24 & 255, crc >>> 16 & 255, crc >>> 8 & 255, crc & 255], 0);
  bytes.set(comp, 7);
  return { text, bytes, compressedSize: comp.byteLength, rawSize: raw.byteLength };
}
export function vsEncode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    s += b < 16 ? String.fromCharCode(65024 + b) : String.fromCodePoint(917760 + (b - 16));
  }
  return s;
}
