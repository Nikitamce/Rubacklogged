import {
  fetchAugmentedSteamPrice,
  fetchItadPriceHistory,
  fetchSteamChartsData,
  getLocalPriceHistory,
  recordLocalPriceSnapshot,
} from '../api/steam-charts.js';
import { getFxRate, formatMoneyMajor, CURRENCY_SYMBOLS } from '../api/fx.js';
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
let cachedConvertedLowest = null;

let isGraphExpanded = false; // Collapsed by default (only header & 3 metric blocks visible)

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
      <div class="backloggd-container center-container blp-charts-card ${isGraphExpanded ? '' : 'is-collapsed'}">
        <div class="blp-charts-header">
          <div class="blp-charts-title-wrap">
            <img class="blp-charts-icon" src="${favicon('steamdb.info')}" alt="" />
            <h3 class="blp-charts-title">${escapeHtml(t.steamChartsTitle)}</h3>
          </div>
          <div class="blp-charts-header-right">
            <div class="blp-charts-tabs">
              <button type="button" class="blp-charts-tab ${currentTab === 'online' ? 'is-active' : ''}" data-blp-tab="online">
                ${escapeHtml(t.steamChartsTabOnline)}
              </button>
              <button type="button" class="blp-charts-tab ${currentTab === 'price' ? 'is-active' : ''}" data-blp-tab="price">
                ${escapeHtml(t.steamChartsTabPrice)}
              </button>
            </div>
            <button type="button" class="blp-charts-toggle-btn" data-blp-toggle-btn title="${escapeHtml(isGraphExpanded ? t.steamChartsCollapse : t.steamChartsExpand)}">
              <span data-blp-toggle-text>${escapeHtml(isGraphExpanded ? t.steamChartsCollapse : t.steamChartsExpand)}</span>
              <svg class="blp-charts-toggle-icon" viewBox="0 0 24 24">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="blp-charts-metrics" data-blp-metrics>
          <!-- Injected via renderMetrics() -->
        </div>

        <div class="blp-charts-collapsible" data-blp-collapsible>
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
    </div>
  `;

  // Insert right below unified rating (or before game-stats)
  anchor.insertAdjacentElement('afterend', row);

  // Toggle button event
  const card = row.querySelector('.blp-charts-card');
  const toggleBtn = row.querySelector('[data-blp-toggle-btn]');
  const toggleText = row.querySelector('[data-blp-toggle-text]');

  if (toggleBtn && card) {
    toggleBtn.addEventListener('click', () => {
      isGraphExpanded = !isGraphExpanded;
      card.classList.toggle('is-collapsed', !isGraphExpanded);
      if (toggleText) {
        toggleText.textContent = isGraphExpanded ? t.steamChartsCollapse : t.steamChartsExpand;
      }
      toggleBtn.title = isGraphExpanded ? t.steamChartsCollapse : t.steamChartsExpand;

      if (isGraphExpanded) {
        renderCurrentTab(row);
      }
    });
  }

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
    
    let lowest = '—';
    if (cachedItadPrice?.lowest?.price?.amount != null) {
      const amt = cachedItadPrice.lowest.price.amount;
      const cur = cachedItadPrice.lowest.price.currency;
      if (cachedConvertedLowest) {
        lowest = `${cachedConvertedLowest} <span style="font-size: 0.75rem; opacity: 0.7; font-weight: normal">(${amt} ${cur})</span>`;
      } else {
        lowest = `${amt} ${cur}`;
      }
    }

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
        <span class="blp-charts-metric-val">${lowest}</span>
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
    const prevX = getX(points[i - 1][0]);
    const prevY = getY(points[i - 1][1]);
    const curX = getX(points[i][0]);
    const curY = getY(points[i][1]);

    if (isPrice) {
      // Stepped horizontal line from prevX to curX, then vertical drop/jump to curY
      pathD += ` L ${curX},${prevY} L ${curX},${curY}`;
    } else {
      pathD += ` L ${curX},${curY}`;
    }
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

    let cx = 0;
    let cy = 0;
    let tooltipVal = 0;
    let tooltipDate = 0;

    if (isPrice) {
      // In a stepped chart, the value at targetT is the value of the latest segment before or at targetT
      let activePoint = points[0];
      for (let i = 0; i < points.length; i++) {
        if (points[i][0] <= targetT) {
          activePoint = points[i];
        } else {
          break;
        }
      }
      cx = mouseX;
      cy = getY(activePoint[1]);
      tooltipVal = activePoint[1];
      tooltipDate = targetT;
    } else {
      let closest = points[0];
      let minDiff = Math.abs(points[0][0] - targetT);
      for (let i = 1; i < points.length; i++) {
        const diff = Math.abs(points[i][0] - targetT);
        if (diff < minDiff) {
          minDiff = diff;
          closest = points[i];
        }
      }
      cx = getX(closest[0]);
      cy = getY(closest[1]);
      tooltipVal = closest[1];
      tooltipDate = closest[0];
    }

    cursorLine.setAttribute('x1', cx);
    cursorLine.setAttribute('x2', cx);
    cursorLine.style.display = 'block';

    cursorDot.setAttribute('cx', cx);
    cursorDot.setAttribute('cy', cy);
    cursorDot.style.display = 'block';

    tooltip.style.left = `${cx}px`;
    tooltip.style.top = `${cy}px`;
    tooltip.style.display = 'block';

    const unit = isPrice ? (cachedPriceOverview?.currency ? ` ${CURRENCY_SYMBOLS[cachedPriceOverview.currency] || cachedPriceOverview.currency}` : '') : ` ${t.players || 'игроков'}`;
    tooltip.innerHTML = `<strong>${formatNumber(tooltipVal)}${unit}</strong><br><span style="opacity:0.75">${formatDate(tooltipDate)}</span>`;
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

  // Fetch online data from SteamCharts and prices from ITAD
  const onlinePromise = fetchSteamChartsData(appId);
  const itadPromise = fetchAugmentedSteamPrice(appId, settings.steamCountry);
  const itadHistoryPromise = fetchItadPriceHistory(appId, settings.steamCountry);

  const [onlineRes, itadRes, itadHistRes] = await Promise.all([onlinePromise, itadPromise, itadHistoryPromise]);

  // onlinePromise returns Array directly (decorated with _cache property by asCacheMiss)
  cachedOnlinePoints = Array.isArray(onlineRes) ? onlineRes : (onlineRes?.data || []);
  cachedItadPrice = itadRes?.lowest ? itadRes : (itadRes?.data || null);
  const itadRawHistory = Array.isArray(itadHistRes) ? itadHistRes : (itadHistRes?.data || []);

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
  const currentFinal = cachedPriceOverview?.final != null ? (cachedPriceOverview.final / 100) : null;
  const currentInitial = cachedPriceOverview?.initial != null ? (cachedPriceOverview.initial / 100) : currentFinal;
  const isCurrentlyDiscounted = Boolean(
    cachedPriceOverview?.discount_percent &&
    cachedPriceOverview.discount_percent > 0 &&
    currentFinal != null &&
    currentInitial != null &&
    currentInitial > currentFinal
  );

  const now = Date.now();

  // If ITAD lowest is in different currency, convert it to local currency for display and chart
  let itadLowestConverted = null;
  let itadLowestTs = null;

  if (cachedItadPrice?.lowest?.price?.amount != null && currentCurrency) {
    const itadCur = cachedItadPrice.lowest.price.currency;
    const itadAmt = cachedItadPrice.lowest.price.amount;
    if (itadCur === currentCurrency) {
      itadLowestConverted = itadAmt;
      cachedConvertedLowest = `${itadAmt} ${CURRENCY_SYMBOLS[currentCurrency] || currentCurrency}`;
    } else {
      try {
        const rate = await getFxRate(itadCur, currentCurrency);
        if (rate && Number.isFinite(rate)) {
          itadLowestConverted = Math.round(itadAmt * rate);
          cachedConvertedLowest = `~ ${formatMoneyMajor(itadLowestConverted, currentCurrency, { maxFrac: 0 })}`;
        }
      } catch (_) {}
    }

    if (cachedItadPrice.lowest.timestamp) {
      const ts = new Date(cachedItadPrice.lowest.timestamp).getTime();
      if (!isNaN(ts)) itadLowestTs = ts;
    }
  }

  // Base regular price in current regional currency
  const basePrice = currentInitial || currentFinal || 0;

  // Process ITAD full historical price change events
  // Prioritize Steam store (shop 61) events, or fallback to general authorized storefront events
  if (itadRawHistory.length && basePrice > 0) {
    const steamEvents = itadRawHistory.filter(h => h.shop?.id === 61 || h.shop?.name === 'Steam');
    const effectiveEvents = steamEvents.length >= 3 ? steamEvents : itadRawHistory;

    // Filter to events within the last 2 years, sorted ascending by timestamp
    const sortedEvents = effectiveEvents
      .filter(h => h.timestamp && h.deal)
      .map(h => ({
        t: new Date(h.timestamp).getTime(),
        cut: Number(h.deal.cut) || 0,
        dealPrice: Number(h.deal.price?.amount),
        regPrice: Number(h.deal.regular?.amount)
      }))
      .filter(h => !isNaN(h.t) && h.t > now - 730 * 24 * 3600 * 1000)
      .sort((a, b) => a.t - b.t);

    if (sortedEvents.length) {
      // First point: baseline regular price before first event
      const firstT = sortedEvents[0].t;
      pricePoints.push([firstT - 24 * 3600 * 1000, basePrice]);

      for (const ev of sortedEvents) {
        let stepPrice = basePrice;
        if (ev.cut > 0) {
          stepPrice = Math.round(basePrice * (1 - ev.cut / 100));
        } else if (ev.dealPrice && ev.regPrice && ev.regPrice > ev.dealPrice) {
          stepPrice = Math.round(basePrice * (ev.dealPrice / ev.regPrice));
        }
        pricePoints.push([ev.t, stepPrice]);
      }
    }
  }

  // If no ITAD history was loaded, fallback to synthetic baseline with ITAD lowest and active discounts
  if (pricePoints.length === 0 && basePrice > 0) {
    const oldestTs = itadLowestTs && itadLowestTs < now - 180 * 24 * 3600 * 1000
      ? itadLowestTs - 14 * 24 * 3600 * 1000
      : now - 180 * 24 * 3600 * 1000;

    pricePoints.push([oldestTs, basePrice]);

    if (itadLowestConverted != null && itadLowestTs && itadLowestTs < now) {
      const saleStart = itadLowestTs;
      const saleEnd = saleStart + 7 * 24 * 3600 * 1000;

      pricePoints.push([saleStart - 3600 * 1000, basePrice]);
      pricePoints.push([saleStart, itadLowestConverted]);
      if (saleEnd < now - 24 * 3600 * 1000) {
        pricePoints.push([saleEnd, itadLowestConverted]);
        pricePoints.push([saleEnd + 3600 * 1000, basePrice]);
      }
    }
  }

  // Ensure active discount and current price are reflected right now
  if (currentFinal != null) {
    if (isCurrentlyDiscounted) {
      const lastPt = pricePoints[pricePoints.length - 1];
      if (lastPt && Math.abs(lastPt[1] - basePrice) < 0.01) {
        const discountStart = now - 3 * 24 * 3600 * 1000;
        pricePoints.push([discountStart, currentFinal]);
      }
    }
    pricePoints.push([now, currentFinal]);
  }

  // Deduplicate points with identical timestamp
  const uniquePoints = [];
  pricePoints.sort((a, b) => a[0] - b[0]);
  for (const pt of pricePoints) {
    const last = uniquePoints[uniquePoints.length - 1];
    if (!last || Math.abs(last[0] - pt[0]) > 60000) {
      uniquePoints.push(pt);
    } else {
      uniquePoints[uniquePoints.length - 1] = pt; // update to latest value
    }
  }

  if (uniquePoints.length === 1) {
    uniquePoints.unshift([uniquePoints[0][0] - 30 * 24 * 3600 * 1000, uniquePoints[0][1]]);
  }

  cachedPricePoints = uniquePoints;

  renderCurrentTab(row);
}
}
