import {
  asCacheHit,
  asCacheMiss,
  getCached,
  setCached,
} from '../cache.js';
import { gmRequest } from '../gm.js';
import { inflight } from '../state.js';

const GTX_URL = 'https://translate.googleapis.com/translate_a/single';

function hashText(s) {
  const str = String(s);
  // Two independent 32-bit hashes plus the length make accidental cache-key
  // collisions across long user reviews practically negligible.
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < str.length; i++) {
    h1 = ((h1 << 5) + h1) ^ str.charCodeAt(i);
    h2 = (Math.imul(h2, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return `${str.length.toString(36)}:${(h1 >>> 0).toString(36)}:${h2.toString(36)}`;
}

const FAILURE_BACKOFF_MS = 30_000;
const recentFailures = new Map();

function failureBackoffKey(text, targetLang) {
  return `${targetLang}:${hashText(text)}`;
}

function joinSegments(data) {
  if (!Array.isArray(data?.[0])) return '';
  return data[0]
    .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
    .join('');
}

function detectedLang(data) {
  const raw = data?.[2];
  if (typeof raw === 'string' && raw) return raw.toLowerCase().slice(0, 2);
  const nested = data?.[8]?.[0]?.[0];
  if (typeof nested === 'string' && nested) return nested.toLowerCase().slice(0, 2);
  return '';
}

/**
 * @param {string} text
 * @param {string} targetLang short locale code (en, ru, zh, …)
 * @returns {Promise<{ text: string, detectedSourceLang: string } | null>}
 */
export async function translateText(text, targetLang) {
  const plain = String(text || '').trim();
  const tl = String(targetLang || '')
    .trim()
    .toLowerCase()
    .slice(0, 2);
  if (!plain || !tl) return null;

  const cacheKey = `gtx:${tl}:${hashText(plain)}`;
  const cached = getCached(cacheKey);
  if (cached && typeof cached.text === 'string') return asCacheHit(cached);
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const failureKey = failureBackoffKey(plain, tl);
  const failedAt = recentFailures.get(failureKey) || 0;
  if (Date.now() - failedAt < FAILURE_BACKOFF_MS) return null;

  const task = (async () => {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl,
      dt: 't',
      q: plain,
    });
    const query =
      `client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(plain)}`;
    const longBody = plain.length > 1800;
    const data = await gmRequest({
      url: longBody ? GTX_URL : `${GTX_URL}?${query}`,
      method: longBody ? 'POST' : 'GET',
      data: longBody ? params.toString() : undefined,
      // Cookies can trigger Google consent/anti-abuse responses. Translation
      // must be anonymous, unlike Steam Owned/Wishlist session requests.
      anonymous: true,
      responseType: 'json',
      headers: longBody
        ? { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
        : { Accept: 'application/json' },
      timeout: 12000,
    });
    const translated = joinSegments(data).trim();
    if (!translated) {
      recentFailures.set(failureKey, Date.now());
      return null;
    }
    recentFailures.delete(failureKey);
    const payload = {
      text: translated,
      detectedSourceLang: detectedLang(data),
    };
    setCached(cacheKey, payload);
    return asCacheMiss(payload);
  })().catch(() => {
    recentFailures.set(failureKey, Date.now());
    return null;
  });

  inflight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inflight.delete(cacheKey);
  }
}
