import {
  fetchAugmentedSteamPrice,
  fetchSteamChartsData,
  getLocalPriceHistory,
  recordLocalPriceSnapshot,
} from '../api/steam-charts.js';
import { FAVICON_URL, STEAMDB_APP_URL } from '../constants.js';
import { settings, t } from '../state.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';
import { gameStatsMountAnchor } from './steamdb-ui.js';

function favicon(domain) {
  return FAVICON_URL.replace('{domain}', encodeURIComponent(domain));
}

const CHARTS_ATTR = 'data-blp-charts';
let currentTab = 'online'; // 'online' | 'price'
let cachedOnlinePoints = [];
let cachedPricePoints = [];
let cachedAppId = null;
let cachedCurrentPlayers = null;
let cachedPriceOverview = null;
let cachedItadPrice = null;

export function chartsMountAnchor() {
  const unifiedRow = document.querySelector('.blp-unified-rating-row');
  if (unifiedRow) return unifiedRow;
  return gameStatsMountAnchor();
}

export function removeSteamChartsWidget() {
  document.querySelectorAll(`[${CHARTS_ATTR}]`).forEach((el) => el.remove());
}

export function ensureSteamChartsMount(token = '') {
  if (settings.showSteamCharts === false) {
    removeSteamChartsWidget();
    return null;
  }

  let row = document.querySelector(`.blp-charts-row[${CHARTS_ATTR}]`);
  const anchor = chartsMountAnchor();
  if (!anchor) return null;

  if (row) {
    if (token) row.setAttribute('data-blp-token', token);
    return row;
  }

  row = document.createElement('div');
  row.className = 'row blp-charts-row';
  row.setAttribute(CHARTS_ATTR, '1');
  if (token) row.setAttribute('data-blp-token', token);

  row.innerHTML = `
    <div class="col">
      <div class="backloggd-container center-container blp-charts-card">
        <div class="blp-charts-header">
          <div class="blp-charts-title-wrap">
            <img class="blp-charts-icon" src="${favicon('steamdb.info')}" alt="" />
            <h3 class="blp-charts-title">${escapeHtml(t.steamChartsTitle)}</h3>
          </div>
          <div class="blp-charts-tabs">
            <button type="button" class="blp-charts-tab ${currentTab === 'online' ? 'is-active' : ''}" data-blp-tab="online">
              ${escapeHtml(t.steamChartsTabOnline)}
            </button>
            <button type="button" class="blp-charts-tab ${currentTab === 'price' ? 'is-active' : ''}" data-blp-tab="price">
              ${escapeHtml(t.steamChartsTabPrice)}
            </button>
          </div>
        </div>

        <div class="blp-charts-metrics" data-blp-metrics>
          <!-- Injected via renderMetrics() -->
        </div>

        <div class="blp-charts-graph-box" data-blp-graph-box>
          <div class="blp-charts-empty">
            <span class="blp-skeleton" style="width: 80%; height: 12px; border-radius: 4px;"></span>
          </div>
          <div class="blp-charts-tooltip" data-blp-tooltip></div>
        </div>

        <div class="blp-charts-footer">
          <span data-blp-footer-note>${escapeHtml(t.steamChartsOnline6m)}</span>
          <a class="blp-charts-btn-steamdb" data-blp-steamdb-link href="${STEAMDB_APP_URL}/" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(t.steamChartsOpenSteamDb)} ↗
          </a>
        </div>
      </div>
    </div>
  `;

  // Insert right below unified rating (or before game-stats)
  anchor.insertAdjacentElement('afterend', row);

  // Tab switching events
  row.querySelectorAll('.blp-charts-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const tab = tabBtn.getAttribute('data-blp-tab');
      if (tab === currentTab) return;
      currentTab = tab;
      row.querySelectorAll('.blp-charts-tab').forEach((btn) => {
        btn.classList.toggle('is-active', btn.getAttribute('data-blp-tab') === currentTab);
      });
      renderCurrentTab(row);
    });
  });

  return row;
}

function formatNumber(num) {
  if (num == null || isNaN(num)) return '—';
  return Number(num).toLocaleString('ru-RU');
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderMetrics(row) {
  const container = row.querySelector('[data-blp-metrics]');
  if (!container) return;

  if (currentTab === 'online') {
    const points = cachedOnlinePoints;
    let peak = 0;
    let sum = 0;
    for (const pt of points) {
      if (pt[1] > peak) peak = pt[1];
      sum += pt[1];
    }
    const avg = points.length ? Math.round(sum / points.length) : 0;
    const current = cachedCurrentPlayers != null ? cachedCurrentPlayers : (points.length ? points[points.length - 1][1] : 0);

    container.innerHTML = `
      <div class="blp-charts-metric-tile">
        <span class="blp-charts-metric-label">${escapeHtml(t.steamChartsCurrentPlayers)}</span>
        <span class="blp-charts-metric-val blp-charts-metric-val--accent">${formatNumber(current)}</span>
      </div>
      <div class="blp-charts-metric-tile">
        <span class="blp-charts-metric-label">${escapeHtml(t.steamChartsPeak6m)}</span>
        <span class="blp-charts-metric-val">${formatNumber(peak)}</span>
      </div>
      <div class="blp-charts-metric-tile">
        <span class="blp-charts-metric-label">${escapeHtml(t.steamChartsAvg6m)}</span>
        <span class="blp-charts-metric-val">${formatNumber(avg)}</span>
      </div>
    `;
  } else {
    // Price Tab
    const currentPrice = cachedPriceOverview?.final_formatted || (cachedPriceOverview?.final ? `${(cachedPriceOverview.final / 100).toFixed(2)} ${cachedPriceOverview.currency || ''}` : '—');
    const discount = cachedPriceOverview?.discount_percent ? `-${cachedPriceOverview.discount_percent}%` : '0%';
    const lowest = cachedItadPrice?.lowest?.price?.amount != null
      ? `${cachedItadPrice.lowest.price.amount} ${cachedItadPrice.lowest.price.currency}`
      : '—';

    container.innerHTML = `
      <div class="blp-charts-metric-tile">
        <span class="blp-charts-metric-label">${escapeHtml(t.steamChartsCurrentPrice)}</span>
        <span class="blp-charts-metric-val blp-charts-metric-val--blue">${escapeHtml(currentPrice)}</span>
      </div>
      <div class="blp-charts-metric-tile">
        <span class="blp-charts-metric-label">${escapeHtml(t.steamChartsDiscount)}</span>
        <span class="blp-charts-metric-val">${escapeHtml(discount)}</span>
      </div>
      <div class="blp-charts-metric-tile">
        <span class="blp-charts-metric-label">${escapeHtml(t.steamChartsLowestPrice)}</span>
        <span class="blp-charts-metric-val">${escapeHtml(lowest)}</span>
      </div>
    `;
  }
}

function renderSvgChart(boxEl, points, isPrice = false) {
  if (!points || points.length < 2) {
    boxEl.innerHTML = `<div class="blp-charts-empty">${escapeHtml(t.steamChartsNoData)}</div>`;
    return;
  }

  const width = boxEl.clientWidth || 600;
  const height = boxEl.clientHeight || 220;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 28;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  let minX = points[0][0];
  let maxX = points[points.length - 1][0];
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
  }

  if (minY === maxY) {
    minY = Math.max(0, minY - 10);
    maxY = maxY + 10;
  } else {
    // Add small headroom
    const range = maxY - minY;
    minY = Math.max(0, Math.floor(minY - range * 0.05));
    maxY = Math.ceil(maxY + range * 0.08);
  }

  const getX = (t) => padLeft + ((t - minX) / (maxX - minX)) * chartW;
  const getY = (v) => padTop + chartH - ((v - minY) / (maxY - minY)) * chartH;

  // Build SVG path
  let pathD = `M ${getX(points[0][0])},${getY(points[0][1])}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${getX(points[i][0])},${getY(points[i][1])}`;
  }

  const areaD = `${pathD} L ${getX(points[points.length - 1][0])},${padTop + chartH} L ${getX(points[0][0])},${padTop + chartH} Z`;

  // Generate 4 horizontal grid lines
  const gridLines = [];
  for (let i = 0; i <= 3; i++) {
    const val = Math.round(minY + ((maxY - minY) * i) / 3);
    const y = getY(val);
    gridLines.push(`
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" class="blp-charts-grid-line" />
      <text x="${padLeft - 8}" y="${y + 3}" text-anchor="end" class="blp-charts-axis-text">${formatNumber(val)}</text>
    `);
  }

  // Generate 3 date labels
  const dateLabels = [
    { t: minX, x: padLeft, anchor: 'start' },
    { t: (minX + maxX) / 2, x: padLeft + chartW / 2, anchor: 'middle' },
    { t: maxX, x: width - padRight, anchor: 'end' },
  ].map((d) => `<text x="${d.x}" y="${height - 8}" text-anchor="${d.anchor}" class="blp-charts-axis-text">${formatDate(d.t)}</text>`);

  const gradientId = isPrice ? 'blp-chart-gradient-price' : 'blp-chart-gradient-online';
  const strokeColor = isPrice ? '#66c0f4' : 'var(--blp-accent, #3db89a)';
  const areaClass = isPrice ? 'blp-charts-area blp-charts-area--price' : 'blp-charts-area';
  const lineClass = isPrice ? 'blp-charts-line blp-charts-line--price' : 'blp-charts-line';

  boxEl.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="blp-chart-gradient-online" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.5" />
          <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0" />
        </linearGradient>
        <linearGradient id="blp-chart-gradient-price" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#66c0f4" stop-opacity="0.5" />
          <stop offset="100%" stop-color="#66c0f4" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      ${gridLines.join('')}
      ${dateLabels.join('')}
      <path d="${areaD}" class="${areaClass}" />
      <path d="${pathD}" class="${lineClass}" />
      <line class="blp-charts-cursor-line" x1="0" y1="${padTop}" x2="0" y2="${padTop + chartH}" />
      <circle class="blp-charts-cursor-dot" cx="0" cy="0" />
    </svg>
    <div class="blp-charts-tooltip" data-blp-tooltip></div>
  `;

  // Attach hover interaction
  const svg = boxEl.querySelector('svg');
  const cursorLine = boxEl.querySelector('.blp-charts-cursor-line');
  const cursorDot = boxEl.querySelector('.blp-charts-cursor-dot');
  const tooltip = boxEl.querySelector('[data-blp-tooltip]');

  const handlePointer = (e) => {
    const rect = boxEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    if (mouseX < padLeft || mouseX > width - padRight) {
      cursorLine.style.display = 'none';
      cursorDot.style.display = 'none';
      tooltip.style.display = 'none';
      return;
    }

    const ratio = (mouseX - padLeft) / chartW;
    const targetT = minX + ratio * (maxX - minX);

    // Find closest point by binary search or find
    let closest = points[0];
    let minDiff = Math.abs(points[0][0] - targetT);
    for (let i = 1; i < points.length; i++) {
      const diff = Math.abs(points[i][0] - targetT);
      if (diff < minDiff) {
        minDiff = diff;
        closest = points[i];
      }
    }

    const cx = getX(closest[0]);
    const cy = getY(closest[1]);

    cursorLine.setAttribute('x1', cx);
    cursorLine.setAttribute('x2', cx);
    cursorLine.style.display = 'block';

    cursorDot.setAttribute('cx', cx);
    cursorDot.setAttribute('cy', cy);
    cursorDot.style.display = 'block';

    tooltip.style.left = `${cx}px`;
    tooltip.style.top = `${cy}px`;
    tooltip.style.display = 'block';

    const unit = isPrice ? '' : ` ${t.players || 'игроков'}`;
    tooltip.innerHTML = `<strong>${formatNumber(closest[1])}${unit}</strong><br><span style="opacity:0.75">${formatDate(closest[0])}</span>`;
  };

  boxEl.addEventListener('pointermove', handlePointer);
  boxEl.addEventListener('pointerleave', () => {
    cursorLine.style.display = 'none';
    cursorDot.style.display = 'none';
    tooltip.style.display = 'none';
  });
}

function renderCurrentTab(row) {
  renderMetrics(row);
  const graphBox = row.querySelector('[data-blp-graph-box]');
  const footerNote = row.querySelector('[data-blp-footer-note]');
  if (!graphBox) return;

  if (currentTab === 'online') {
    if (footerNote) footerNote.textContent = t.steamChartsOnline6m;
    renderSvgChart(graphBox, cachedOnlinePoints, false);
  } else {
    if (footerNote) footerNote.textContent = t.steamChartsPriceHistoryNotice;
    renderSvgChart(graphBox, cachedPricePoints, true);
  }
}

export async function applySteamChartsData(appId, steamData, token = '', livePlayers = null) {
  if (settings.showSteamCharts === false) {
    removeSteamChartsWidget();
    return;
  }

  const row = ensureSteamChartsMount(token);
  if (!row) return;

  cachedAppId = appId;
  cachedPriceOverview = steamData?.price || null;
  cachedCurrentPlayers = livePlayers != null ? livePlayers : (steamData?.players != null ? steamData.players : null);

  // Set SteamDB Link
  const sdbLink = row.querySelector('[data-blp-steamdb-link]');
  if (sdbLink) {
    sdbLink.href = `${STEAMDB_APP_URL}/${appId}/graphs/`;
  }

  // Record current price into local history
  if (cachedPriceOverview) {
    recordLocalPriceSnapshot(appId, settings.steamCountry, cachedPriceOverview);
  }

  // Initial render with current players / price overview while async data loads
  renderMetrics(row);

  // Fetch online data from SteamCharts
  const onlinePromise = fetchSteamChartsData(appId);
  const itadPromise = fetchAugmentedSteamPrice(appId, settings.steamCountry);

  const [onlineRes, itadRes] = await Promise.all([onlinePromise, itadPromise]);

  // onlinePromise returns Array directly (decorated with _cache property by asCacheMiss)
  cachedOnlinePoints = Array.isArray(onlineRes) ? onlineRes : (onlineRes?.data || []);
  cachedItadPrice = itadRes?.lowest ? itadRes : (itadRes?.data || null);

  // Build price points from local history
  const localHistory = getLocalPriceHistory(appId, settings.steamCountry);
  const pricePoints = [];

  // If local history exists, convert to [timestamp, price] (matching the target currency)
  const currentCurrency = cachedPriceOverview?.currency || '';
  if (localHistory.length) {
    for (const h of localHistory) {
      if (!currentCurrency || !h.cur || h.cur === currentCurrency) {
        pricePoints.push([h.t, h.p]);
      }
    }
  }

  // Ensure current price point is present
  if (cachedPriceOverview?.final != null) {
    const curP = cachedPriceOverview.final / 100;
    if (!pricePoints.some(pt => Math.abs(pt[1] - curP) < 0.01)) {
      pricePoints.push([Date.now(), curP]);
    }
  }

  // Only include ITAD lowest in the curve if its currency matches our region's currency
  if (
    cachedItadPrice?.lowest?.timestamp &&
    cachedItadPrice?.lowest?.price?.amount != null &&
    cachedItadPrice?.lowest?.price?.currency === currentCurrency
  ) {
    const lowTs = new Date(cachedItadPrice.lowest.timestamp).getTime();
    if (lowTs && !isNaN(lowTs)) {
      pricePoints.unshift([lowTs, cachedItadPrice.lowest.price.amount]);
    }
  }

  // If only 1 point, duplicate with slight offset for flat line rendering
  if (pricePoints.length === 1) {
    pricePoints.unshift([pricePoints[0][0] - 30 * 24 * 3600 * 1000, pricePoints[0][1]]);
  }

  // Sort by timestamp
  pricePoints.sort((a, b) => a[0] - b[0]);
  cachedPricePoints = pricePoints;

  renderCurrentTab(row);
}
