import { getCached, setCached, asCacheHit } from '../cache.js';
import { gmRequest } from '../gm.js';
import { inflight } from '../state.js';
import { metacriticGameUrl } from '../utils/slug.js';

const MC_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchMetacriticScore(title, slug) {
  const url = metacriticGameUrl(title, slug);
  if (!url) return null;

  const cacheKey = `metacritic:${slug}`;
  const cached = getCached(cacheKey);
  if (cached && (cached.score != null || cached.missing)) {
    return asCacheHit(cached);
  }
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const promise = (async () => {
    try {
      const res = await gmRequest({
        url,
        anonymous: true,
        responseType: 'text',
      });
      const html = typeof res === 'string' ? res : res?.responseText || '';
      if (!html) {
        setCached(cacheKey, { missing: true }, { ttlMs: MC_TTL_MS });
        return null;
      }

      const match =
        html.match(/c-siteReviewScore[^\>]*\><span>(\d+)/i) ||
        html.match(/"metascore":\s*(\d+)/i);
      const score = match ? Number(match[1]) : null;

      const payload = {
        score: Number.isFinite(score) && score >= 0 && score <= 100 ? score : null,
        url,
      };

      setCached(cacheKey, payload, { ttlMs: MC_TTL_MS });
      return payload;
    } catch (_) {
      return null;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, promise);
  return promise;
}
