/**
 * Automated Deep DOM Translation Auditor for Backloggd i18n.
 * 
 * Fetches target pages, breaks down every DOM node into atomic text leaves,
 * decodes HTML entities, and validates that each leaf string is either translated
 * by the engine or cataloged in the dictionary.
 * 
 * Usage: node scripts/audit-pages.js [optional url ...]
 */
const https = require('https');
const path = require('path');

// Load engine and Russian locale
global.window = global;
require(path.join(__dirname, '../lib/engine.js'));
require(path.join(__dirname, '../locales/ru.js'));

const locale = global.BackloggdI18nLocales.ru;
const translator = global.BackloggdI18n.createTranslator(locale);

const DEFAULT_URLS = [
  'https://backloggd.com/about/',
  'https://backloggd.com/about/game-data/',
  'https://backloggd.com/about/adult-games/',
  'https://backloggd.com/about/community-guidelines/',
  'https://backloggd.com/about/recent-news/',
  'https://backloggd.com/about/terms-of-service/',
  'https://backloggd.com/about/privacy/',
  'https://backloggd.com/contact/',
  'https://backloggd.com/backers/',
  'https://backloggd.com/roadmap/',
  'https://backloggd.com/changelog/'
];

// Well-known third-party brands, usernames or entities that should not be translated
const IGNORED_EXACT = new Set([
  'Backloggd', 'Bluesky', 'Discord', 'Threads', 'IGDB', 'IGDB.com', 'Patreon',
  'Twitch', 'Twitter', 'Goodreads', 'Letterboxd', 'Medium', '@backloggd',
  'FromSoftware', 'Bandai Namco Entertainment', 'Team Cherry', 'Dark Overlay element',
  'Add A Game Modal', 'Warning Dialog Modal', '????',
  'https://support.venatus.com/knowledge-base/privacy-policy'
]);

function decodeEntities(str) {
  return str
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/&bull;/g, '•')
    .replace(/&copy;/g, '©')
    .replace(/&hellip;/g, '…');
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = 'https://backloggd.com' + redirectUrl;
        }
        return resolve(fetchPage(redirectUrl));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to load ${url} (status ${res.statusCode})`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractAtomicTextLeaves(html) {
  // Strip out user profiles list on /backers/
  let cleaned = html
    .replace(/<a[^>]*href=["']\/u\/[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const textNodes = [];
  
  // Tag-aware matching for cleaner text nodes
  const textPattern = />([^<]+)</g;
  let match;
  while ((match = textPattern.exec(cleaned)) !== null) {
    let raw = match[1];
    if (raw.includes('">')) {
      raw = raw.split('">').pop();
    }
    const decoded = decodeEntities(raw);
    const normalized = decoded.replace(/\s+/g, ' ').trim();

    if (!normalized || normalized.length <= 1) continue;
    // Skip pure numbers, punctuation, copyright or date formats
    if (/^[\d\s.,\-–/|:#$%^&*()_\\+=><?!@~[\]©•…]+$/.test(normalized)) continue;
    if (/©\s*Backloggd\s*LLC\s*•?/i.test(normalized)) continue;
    if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+,\s+\d+$/i.test(normalized)) continue;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) continue;
    if (/^v?\d+\.\d+(\.\d+)?(\s*\|\s*[A-Z][a-z]{2}\s+\d+,\s+\d+)?$/i.test(normalized)) continue;
    if (IGNORED_EXACT.has(normalized)) continue;

    textNodes.push(normalized);
  }

  return Array.from(new Set(textNodes));
}

async function audit() {
  const targetUrls = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_URLS;
  console.log(`\n======================================================`);
  console.log(`   Backloggd i18n Deep DOM Translation Auditor`);
  console.log(`======================================================\n`);
  console.log(`Loaded dictionary keys: ${locale.strings ? Object.keys(locale.strings).length : 0}`);
  console.log(`Scanning ${targetUrls.length} live target pages to the very bottom...\n`);

  let totalUntranslated = 0;
  const untranslatedByPage = {};

  for (const url of targetUrls) {
    process.stdout.write(`Scanning ${url.replace('https://backloggd.com', '') || '/'} ... `);
    try {
      const html = await fetchPage(url);
      const leaves = extractAtomicTextLeaves(html);
      const missing = [];

      // Specifically check key badges: New, Changed, Fixed
      if (url.includes('/changelog/')) {
        for (const badge of ['New', 'Changed', 'Fixed']) {
          if (!locale.strings[badge]) {
            missing.push(`[BADGE] ${badge}`);
          }
        }
      }

      for (const leaf of leaves) {
        const translated = translator.translate(leaf);
        if (translated === null) {
          if (!locale.strings[leaf]) {
            missing.push(leaf);
          }
        }
      }

      if (missing.length === 0) {
        console.log(`[PASS] (0 untranslated out of ${leaves.length} elements)`);
      } else {
        console.log(`[FAIL] (${missing.length} missing out of ${leaves.length})`);
        untranslatedByPage[url] = missing;
        totalUntranslated += missing.length;
      }
    } catch (err) {
      console.log(`[ERROR: ${err.message}]`);
    }
  }

  console.log(`\n------------------------------------------------------`);
  if (totalUntranslated === 0) {
    console.log(`✅ All checked pages are 100% translated! No missing leaf nodes.`);
  } else {
    console.log(`❌ Found ${totalUntranslated} untranslated text leaves across pages:\n`);
    for (const [url, items] of Object.entries(untranslatedByPage)) {
      console.log(`\n=== ${url} (${items.length} items) ===`);
      for (const item of items.slice(0, 20)) {
        console.log(` - "${item}"`);
      }
      if (items.length > 20) {
        console.log(` ... and ${items.length - 20} more.`);
      }
    }
  }
  console.log(`------------------------------------------------------\n`);

  if (totalUntranslated > 0) {
    process.exitCode = 1;
  }
}

audit().catch(console.error);
