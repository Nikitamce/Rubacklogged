import {
  fetchAugmentedSteamPrice,
  fetchItadPriceHistory,
  fetchSteamChartsData,
  getLocalPriceHistory,
  recordLocalPriceSnapshot,
} from '../api/steam-charts.js';
import { getFxRate, formatMoneyMajor, CURRENCY_SYMBOLS } from '../api/fx.js';
import { STEAMDB_APP_URL } from '../constants.js';
import { settings, t } from '../state.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';
import { fmt } from '../i18n/index.js';

// State caches
let cachedOnlinePoints = [];
let cachedOnlinePeak = 0;
let cachedPricePoints = [];
let cachedAppId = null;
let cachedCurrentPlayers = null;
let cachedPriceOverview = null;
let cachedItadPrice = null;
let cachedConvertedLowest = null;

let isOnlineExpanded = false;
let isPriceExpanded = false;

export function removeSteamChartsWidget() {
  document.querySelectorAll('.blp-chart-dropdown-row').forEach((el) => el.remove());
}

export function formatNumber(num) {
  if (num == null || isNaN(num)) return '—';
  return Number(num).toLocaleString('ru-RU');
}

export function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function renderSvgChart(boxEl, points, isPrice = false) {
  if (!points || points.length < 2) {
    boxEl.innerHTML = `<div class="blp-charts-empty">${escapeHtml(t.steamChartsNoData || 'Нет данных для отображения графика')}</div>`;
    return;
  }

  const width = boxEl.clientWidth || 600;
  const height = boxEl.clientHeight || 200;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 26;

  const chartW = Math.max(10, width - padLeft - padRight);
  const chartH = Math.max(10, height - padTop - padBottom);

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
    const range = maxY - minY;
    minY = Math.max(0, Math.floor(minY - range * 0.05));
    maxY = Math.ceil(maxY + range * 0.08);
  }

  const getX = (time) => padLeft + ((time - minX) / (maxX - minX || 1)) * chartW;
  const getY = (val) => padTop + chartH - ((val - minY) / (maxY - minY || 1)) * chartH;

  // Build SVG path
  let pathD = `M ${getX(points[0][0])},${getY(points[0][1])}`;
  for (let i = 1; i < points.length; i++) {
    const prevY = getY(points[i - 1][1]);
    const curX = getX(points[i][0]);
    const curY = getY(points[i][1]);

    if (isPrice) {
      pathD += ` L ${curX},${prevY} L ${curX},${curY}`;
    } else {
      pathD += ` L ${curX},${curY}`;
    }
  }

  const areaD = `${pathD} L ${getX(points[points.length - 1][0])},${padTop + chartH} L ${getX(points[0][0])},${padTop + chartH} Z`;

  // Grid lines (4 lines)
  const gridLines = [];
  for (let i = 0; i <= 3; i++) {
    const val = Math.round(minY + ((maxY - minY) * i) / 3);
    const y = getY(val);
    gridLines.push(`
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" class="blp-charts-grid-line" />
      <text x="${padLeft - 8}" y="${y + 3}" text-anchor="end" class="blp-charts-axis-text">${formatNumber(val)}</text>
    `);
  }

  // Date labels
  const dateLabels = [
    { t: minX, x: padLeft, anchor: 'start' },
    { t: (minX + maxX) / 2, x: padLeft + chartW / 2, anchor: 'middle' },
    { t: maxX, x: width - padRight, anchor: 'end' },
  ].map((d) => `<text x="${d.x}" y="${height - 6}" text-anchor="${d.anchor}" class="blp-charts-axis-text">${formatDate(d.t)}</text>`);

  const areaClass = isPrice ? 'blp-charts-area blp-charts-area--price' : 'blp-charts-area';
  const lineClass = isPrice ? 'blp-charts-line blp-charts-line--price' : 'blp-charts-line';
  const strokeColor = isPrice ? '#66c0f4' : 'var(--blp-accent, #3db89a)';

  boxEl.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="blp-chart-gradient-online" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.45" />
          <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0" />
        </linearGradient>
        <linearGradient id="blp-chart-gradient-price" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#66c0f4" stop-opacity="0.45" />
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

  // Interaction
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

    const unit = isPrice
      ? (cachedPriceOverview?.currency ? ` ${CURRENCY_SYMBOLS[cachedPriceOverview.currency] || cachedPriceOverview.currency}` : '')
      : ` ${t.players || 'игроков'}`;
    tooltip.innerHTML = `<strong>${formatNumber(tooltipVal)}${unit}</strong><br><span style="opacity:0.75">${formatDate(tooltipDate)}</span>`;
  };

  boxEl.addEventListener('pointermove', handlePointer);
  boxEl.addEventListener('pointerleave', () => {
    cursorLine.style.display = 'none';
    cursorDot.style.display = 'none';
    tooltip.style.display = 'none';
  });
}

/**
 * Ensure dropdown chart container row exists below a target anchor element.
 */
function ensureDropdownRow(anchorEl, kind) {
  const rowAttr = `data-blp-chart-row="${kind}"`;
  let dropdown = document.querySelector(`[${rowAttr}]`);
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = kind === 'price' ? 'blp-chart-dropdown-row' : 'row blp-chart-dropdown-row';
    dropdown.setAttribute('data-blp-chart-row', kind);
    dropdown.hidden = true;
    const cardHtml = `
      <div class="blp-chart-dropdown-card">
        <div class="blp-chart-dropdown-graph" data-blp-graph-box>
          <div class="blp-charts-empty">
            <span class="blp-skeleton" style="width: 80%; height: 12px; border-radius: 4px;"></span>
          </div>
          <div class="blp-charts-tooltip" data-blp-tooltip></div>
        </div>
        <div class="blp-chart-dropdown-footer">
          <span class="blp-chart-dropdown-notice" data-blp-footer-note></span>
          <a class="blp-charts-btn-steamdb" data-blp-steamdb-link href="${STEAMDB_APP_URL}/" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(t.steamChartsOpenSteamDb || 'Открыть на SteamDB')} ↗
          </a>
        </div>
      </div>
    `;
    dropdown.innerHTML = kind === 'price' ? cardHtml : `<div class="col-12">${cardHtml}</div>`;
  }

  if (dropdown.previousElementSibling !== anchorEl) {
    anchorEl.insertAdjacentElement('afterend', dropdown);
  }
  return dropdown;
}

/**
 * Update the Players row (ИГРОКИ): add all-time peak & "Показать график" button.
 */
export function updatePlayersRowUi() {
  const row = document.querySelector('[data-blp-enrich="players"]');
  if (!row) return;

  const valuesSlot = row.querySelector('[data-blp-values]');
  if (!valuesSlot) return;

  let wrap = valuesSlot.querySelector('.blp-players-row-controls');
  if (!wrap) {
    wrap = document.createElement('span');
    wrap.className = 'blp-players-row-controls';
    valuesSlot.appendChild(wrap);
  }

  const peakText = cachedOnlinePeak > 0
    ? fmt(t.steamChartsAllTimePeak || 'пик: {n}', { n: formatNumber(cachedOnlinePeak) })
    : '';

  const btnText = isOnlineExpanded
    ? (t.steamChartsHideChart || 'Скрыть график')
    : (t.steamChartsShowChart || 'Показать график');

  wrap.innerHTML = `
    ${peakText ? `<span class="blp-players-peak" title="${escapeHtml(t.steamChartsPeak6m || 'Пик за всё время')}">${escapeHtml(peakText)}</span>` : ''}
    <button type="button" class="blp-inline-chart-btn" data-blp-toggle-online-chart title="${escapeHtml(btnText)}">
      <svg class="blp-inline-chart-btn__icon" viewBox="0 0 24 24"><path fill="currentColor" d="M3.5 18.5l6-6 4 4 7-7.5-1.4-1.4-5.6 6-4-4-7.4 7.4z"/></svg>
      <span>${escapeHtml(btnText)}</span>
      <svg class="blp-inline-chart-btn__arrow ${isOnlineExpanded ? 'is-expanded' : ''}" viewBox="0 0 24 24"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>
    </button>
  `;

  const btn = wrap.querySelector('[data-blp-toggle-online-chart]');
  if (btn) {
    btn.onclick = () => {
      isOnlineExpanded = !isOnlineExpanded;
      const dropdown = ensureDropdownRow(row, 'online');
      dropdown.hidden = !isOnlineExpanded;
      updatePlayersRowUi();
      if (isOnlineExpanded) {
        const graphBox = dropdown.querySelector('[data-blp-graph-box]');
        const footerNote = dropdown.querySelector('[data-blp-footer-note]');
        const sdbLink = dropdown.querySelector('[data-blp-steamdb-link]');
        if (footerNote) footerNote.textContent = t.steamChartsOnline6m || 'Онлайн за 6 месяцев';
        if (sdbLink && cachedAppId) sdbLink.href = `${STEAMDB_APP_URL}/${cachedAppId}/graphs/`;
        if (graphBox) renderSvgChart(graphBox, cachedOnlinePoints, false);
      }
    };
  }

  // If already open, re-render chart points
  if (isOnlineExpanded) {
    const dropdown = ensureDropdownRow(row, 'online');
    dropdown.hidden = false;
    const graphBox = dropdown.querySelector('[data-blp-graph-box]');
    if (graphBox) renderSvgChart(graphBox, cachedOnlinePoints, false);
  }
}

/**
 * Update the Steam Price row (STEAM): add All-time low pill & "График цен" button.
 */
export function updateSteamPriceRowUi() {
  const row = document.querySelector('[data-blp-enrich="steam"]');
  if (!row) return;

  const valuesSlot = row.querySelector('[data-blp-values]');
  if (!valuesSlot) return;

  const firstLine = valuesSlot.querySelector('.blp-steam-line');
  if (!firstLine) return;

  let wrap = firstLine.querySelector('.blp-price-row-controls');
  if (!wrap) {
    wrap = document.createElement('span');
    wrap.className = 'blp-price-row-controls';
    firstLine.appendChild(wrap);
  }

  // Format Lowest price
  let lowestHtml = '';
  if (cachedItadPrice?.lowest?.price) {
    const rawLowest = `${cachedItadPrice.lowest.price.amount} ${cachedItadPrice.lowest.price.currency}`;
    const displayLowest = cachedConvertedLowest || rawLowest;
    lowestHtml = `
      <span class="blp-lowest-price-badge" title="${escapeHtml(t.steamChartsLowestPrice || 'Исторический минимум')}: ${escapeHtml(rawLowest)}">
        <span class="blp-lowest-price-badge__label">${escapeHtml(t.steamChartsLowestPrice || 'Исторический минимум')}:</span>
        <span class="blp-lowest-price-badge__val">${displayLowest}</span>
      </span>
    `;
  }

  const btnText = isPriceExpanded
    ? (t.steamChartsHideChart || 'Скрыть график')
    : (t.steamChartsPriceChart || 'График цен');

  wrap.innerHTML = `
    ${lowestHtml}
    <button type="button" class="blp-inline-chart-btn" data-blp-toggle-price-chart title="${escapeHtml(btnText)}">
      <svg class="blp-inline-chart-btn__icon" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>
      <span>${escapeHtml(btnText)}</span>
      <svg class="blp-inline-chart-btn__arrow ${isPriceExpanded ? 'is-expanded' : ''}" viewBox="0 0 24 24"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>
    </button>
  `;

  const btn = wrap.querySelector('[data-blp-toggle-price-chart]');
  if (btn) {
    btn.onclick = () => {
      isPriceExpanded = !isPriceExpanded;
      const dropdown = ensureDropdownRow(firstLine, 'price');
      dropdown.hidden = !isPriceExpanded;
      updateSteamPriceRowUi();
      if (isPriceExpanded) {
        const graphBox = dropdown.querySelector('[data-blp-graph-box]');
        const footerNote = dropdown.querySelector('[data-blp-footer-note]');
        const sdbLink = dropdown.querySelector('[data-blp-steamdb-link]');
        if (footerNote) footerNote.textContent = t.steamChartsPriceHistoryNotice || 'История цен через ITAD и посещения';
        if (sdbLink && cachedAppId) sdbLink.href = `${STEAMDB_APP_URL}/${cachedAppId}/`;
        if (graphBox) renderSvgChart(graphBox, cachedPricePoints, true);
      }
    };
  }

  // If already open, re-render chart points
  if (isPriceExpanded) {
    const dropdown = ensureDropdownRow(firstLine, 'price');
    dropdown.hidden = false;
    const graphBox = dropdown.querySelector('[data-blp-graph-box]');
    if (graphBox) renderSvgChart(graphBox, cachedPricePoints, true);
  }
}

/**
 * Main data application hook
 */
export async function applySteamChartsData(appId, steamData, token = '', livePlayers = null) {
  if (settings.showSteamCharts === false) {
    removeSteamChartsWidget();
    return;
  }

  cachedAppId = appId;
  cachedPriceOverview = steamData?.price || null;
  cachedCurrentPlayers = livePlayers != null ? livePlayers : (steamData?.players != null ? steamData.players : null);

  // Record current price into local history
  if (cachedPriceOverview) {
    recordLocalPriceSnapshot(appId, settings.steamCountry, cachedPriceOverview);
  }

  // Initial paint of inline buttons
  updatePlayersRowUi();
  updateSteamPriceRowUi();

  // Fetch online data from SteamCharts and prices from ITAD
  const onlinePromise = fetchSteamChartsData(appId);
  const itadPromise = fetchAugmentedSteamPrice(appId, settings.steamCountry);
  const itadHistoryPromise = fetchItadPriceHistory(appId, settings.steamCountry);

  const [onlineRes, itadRes, itadHistRes] = await Promise.all([onlinePromise, itadPromise, itadHistoryPromise]);

  const onlineData = onlineRes?.points ? onlineRes : { points: Array.isArray(onlineRes) ? onlineRes : (onlineRes?.data || []), allTimePeak: 0 };
  cachedOnlinePoints = onlineData.points || [];
  cachedOnlinePeak = onlineData.allTimePeak || 0;
  if (!cachedOnlinePeak && cachedOnlinePoints.length) {
    for (const p of cachedOnlinePoints) {
      if (p[1] > cachedOnlinePeak) cachedOnlinePeak = p[1];
    }
  }

  cachedItadPrice = itadRes?.lowest ? itadRes : (itadRes?.data || null);
  const itadRawHistory = Array.isArray(itadHistRes) ? itadHistRes : (itadHistRes?.data || []);

  // Build price points
  const localHistory = getLocalPriceHistory(appId, settings.steamCountry);
  const pricePoints = [];

  const currentCurrency = cachedPriceOverview?.currency || '';
  if (localHistory.length) {
    for (const h of localHistory) {
      if (!currentCurrency || !h.cur || h.cur === currentCurrency) {
        pricePoints.push([h.t, h.p]);
      }
    }
  }

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

  const basePrice = currentInitial || currentFinal || 0;

  // Process ITAD full historical price change events
  if (itadRawHistory.length && basePrice > 0) {
    const steamEvents = itadRawHistory.filter((h) => h.shop?.id === 61 || h.shop?.name === 'Steam');
    const effectiveEvents = steamEvents.length >= 3 ? steamEvents : itadRawHistory;

    const sortedEvents = effectiveEvents
      .filter((h) => h.timestamp && h.deal)
      .map((h) => ({
        t: new Date(h.timestamp).getTime(),
        cut: Number(h.deal.cut) || 0,
        dealPrice: Number(h.deal.price?.amount),
        regPrice: Number(h.deal.regular?.amount),
      }))
      .filter((h) => !isNaN(h.t) && h.t > now - 730 * 24 * 3600 * 1000)
      .sort((a, b) => a.t - b.t);

    if (sortedEvents.length) {
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

  // Fallback if no events
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

  // Current price
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

  // Deduplicate
  const uniquePoints = [];
  pricePoints.sort((a, b) => a[0] - b[0]);
  for (const pt of pricePoints) {
    const last = uniquePoints[uniquePoints.length - 1];
    if (!last || Math.abs(last[0] - pt[0]) > 60000) {
      uniquePoints.push(pt);
    } else {
      uniquePoints[uniquePoints.length - 1] = pt;
    }
  }

  if (uniquePoints.length === 1) {
    uniquePoints.unshift([uniquePoints[0][0] - 30 * 24 * 3600 * 1000, uniquePoints[0][1]]);
  }

  cachedPricePoints = uniquePoints;

  // Re-render UI with populated data
  updatePlayersRowUi();
  updateSteamPriceRowUi();
}
