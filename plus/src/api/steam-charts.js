import { asCacheHit, asCacheMiss, getCached, setCached } from '../cache.js';
import { gmRequest } from '../gm.js';
import { inflight } from '../state.js';

const STEAMCHARTS_DATA_URL = 'https://steamcharts.com/app';
const STEAMCHARTS_TTL_MS = 6 * 3600 * 1000; // 6 hours

export function steamChartsCacheKey(appId) {
  return `steamcharts:data:${Number(appId)}`;
}

export function localPriceHistoryCacheKey(appId, country) {
  return `pricehistory:${Number(appId)}:${String(country || 'US').toUpperCase()}`;
}

/**
 * Fetch player online history from SteamCharts
 * Returns points sorted by timestamp ASC
 */
export async function fetchSteamChartsData(appId) {
  const id = Number(appId);
  if (!Number.isFinite(id) || id <= 0) return asCacheMiss([]);

  const cacheKey = steamChartsCacheKey(id);
  const cached = getCached(cacheKey);
  if (cached) {
    if (Array.isArray(cached) && cached.length) {
      let maxPeak = 0;
      for (const p of cached) if (p[1] > maxPeak) maxPeak = p[1];
      return asCacheHit({ points: cached, allTimePeak: maxPeak });
    }
    if (cached.points) {
      return asCacheHit(cached);
    }
  }

  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const url = `${STEAMCHARTS_DATA_URL}/${id}/chart-data.json`;
  const task = (async () => {
    try {
      const response = await gmRequest({
        url,
        method: 'GET',
        responseType: 'text',
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
        },
        timeout: 15000,
        anonymous: true,
      });

      let raw = response;
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw);
        } catch (_) {
          raw = [];
        }
      }

      if (!Array.isArray(raw)) {
        return asCacheMiss([]);
      }

      // Filter last 6 months (180 days)
      const sixMonthsAgo = Date.now() - 180 * 24 * 3600 * 1000;
      let allTimePeak = 0;
      for (const pt of raw) {
        if (Array.isArray(pt) && typeof pt[1] === 'number' && pt[1] > allTimePeak) {
          allTimePeak = Math.round(pt[1]);
        }
      }

      let filtered = raw
        .filter((pt) => Array.isArray(pt) && pt.length >= 2 && pt[0] >= sixMonthsAgo && typeof pt[1] === 'number')
        .map((pt) => [pt[0], Math.round(pt[1])]);

      // If filtered is empty but raw has recent data, take last 60 points
      if (!filtered.length && raw.length) {
        filtered = raw
          .filter((pt) => Array.isArray(pt) && pt.length >= 2 && typeof pt[1] === 'number')
          .slice(-60)
          .map((pt) => [pt[0], Math.round(pt[1])]);
      }

      const result = {
        points: filtered,
        allTimePeak,
      };

      if (filtered.length || allTimePeak > 0) {
        setCached(cacheKey, result, { ttlMs: STEAMCHARTS_TTL_MS });
      }
      return asCacheMiss(result);
    } catch (err) {
      console.warn('[Backloggd Plus] Failed to fetch steamcharts:', err);
      return asCacheMiss({ points: [], allTimePeak: 0 });
    }
  })();

  inflight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inflight.delete(cacheKey);
  }
}

/**
 * Fetch augmented steam / ITAD lowest price and overview
 */
export async function fetchAugmentedSteamPrice(appId, country = 'US') {
  const id = Number(appId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const cacheKey = `itad:price:${id}:${country}`;
  const cached = getCached(cacheKey);
  if (cached) return asCacheHit(cached);

  try {
    const postData = JSON.stringify({
      country: String(country || 'US').toUpperCase(),
      apps: [id],
    });

    const response = await gmRequest({
      url: 'https://api.augmentedsteam.com/prices/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: postData,
      responseType: 'json',
      timeout: 12000,
      anonymous: true,
    });

    let data = response;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (_) {
        data = null;
      }
    }

    const item = data?.prices?.[`app/${id}`] || null;
    if (item) {
      setCached(cacheKey, item, { ttlMs: 12 * 3600 * 1000 });
      return asCacheMiss(item);
    }
    return asCacheMiss(null);
  } catch (err) {
    return asCacheMiss(null);
  }
}

const ITAD_API_KEY = '3013cdfd127f827c4ad142f55702f9e23e5dba8a';

/**
 * Fetch historical price changes and sales from IsThereAnyDeal
 */
export async function fetchItadPriceHistory(appId, country = 'US') {
  const id = Number(appId);
  if (!Number.isFinite(id) || id <= 0) return asCacheMiss([]);

  const cacheKey = `itad:history:${id}:${country}`;
  const cached = getCached(cacheKey);
  if (cached) return asCacheHit(cached);

  try {
    // 1. Lookup ITAD game UUID from steam AppID
    const lookupRes = await gmRequest({
      url: `https://api.isthereanydeal.com/games/lookup/v1?key=${ITAD_API_KEY}&appid=${id}`,
      method: 'GET',
      responseType: 'json',
      timeout: 10000,
      anonymous: true,
    });

    let lookupData = lookupRes;
    if (typeof lookupData === 'string') {
      try {
        lookupData = JSON.parse(lookupData);
      } catch (_) {
        lookupData = null;
      }
    }

    const gameId = lookupData?.game?.id;
    if (!gameId) return asCacheMiss([]);

    // 2. Fetch price change history for the last 2 years (ITAD expects ISO without milliseconds: YYYY-MM-DDTHH:mm:ssZ)
    const sinceDate = new Date(Date.now() - 730 * 24 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const historyRes = await gmRequest({
      url: `https://api.isthereanydeal.com/games/history/v2?key=${ITAD_API_KEY}&id=${encodeURIComponent(gameId)}&since=${encodeURIComponent(sinceDate)}`,
      method: 'GET',
      responseType: 'json',
      timeout: 12000,
      anonymous: true,
    });

    let historyData = historyRes;
    if (typeof historyData === 'string') {
      try {
        historyData = JSON.parse(historyData);
      } catch (_) {
        historyData = [];
      }
    }

    if (Array.isArray(historyData) && historyData.length) {
      setCached(cacheKey, historyData, { ttlMs: 12 * 3600 * 1000 });
      return asCacheMiss(historyData);
    }

    return asCacheMiss([]);
  } catch (err) {
    return asCacheMiss([]);
  }
}

/**
 * Record a historical price snapshot into local GM cache
 */
export function recordLocalPriceSnapshot(appId, country, priceData) {
  const id = Number(appId);
  if (!Number.isFinite(id) || id <= 0 || !priceData) return;

  const key = localPriceHistoryCacheKey(id, country);
  const currentList = getCached(key) || [];
  const list = Array.isArray(currentList) ? [...currentList] : [];

  const finalAmount = priceData.final != null ? (priceData.final / 100) : (priceData.amount != null ? priceData.amount : null);
  const initialAmount = priceData.initial != null ? (priceData.initial / 100) : finalAmount;
  if (finalAmount == null || !Number.isFinite(finalAmount)) return;

  const now = Date.now();
  // Don't append duplicate price on the exact same day
  const oneDayAgo = now - 24 * 3600 * 1000;
  const lastEntry = list[list.length - 1];

  if (lastEntry && lastEntry.t > oneDayAgo && Math.abs(lastEntry.p - finalAmount) < 0.01) {
    return; // Already recorded today with same price
  }

  list.push({
    t: now,
    p: finalAmount,
    base: initialAmount,
    cur: priceData.currency || '',
    cut: priceData.discount_percent || priceData.cut || 0,
    fmt: priceData.final_formatted || '',
  });

  // Keep last 100 points
  if (list.length > 100) list.splice(0, list.length - 100);

  setCached(key, list, { ttlMs: 365 * 24 * 3600 * 1000 });
}

export function getLocalPriceHistory(appId, country) {
  const id = Number(appId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const key = localPriceHistoryCacheKey(id, country);
  const history = getCached(key);
  return Array.isArray(history) ? history : [];
}

