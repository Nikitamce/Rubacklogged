const https = require('https');
const fs = require('fs');

https.get('https://backloggd.com/changelog/', { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    // Extract every changelog item text:
    // In backloggd, each item is in <p> next to Changed / Fixed / New badge
    const items = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = pRegex.exec(data)) !== null) {
      let t = match[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (t.length > 3 && !t.startsWith('v1.') && !t.startsWith('1.') && !t.startsWith('0.')) {
        if (!['New', 'Changed', 'Fixed', '????'].includes(t)) {
          if (!t.includes('Cookies allow us') && !t.includes('Our Cookie Policy') && !t.includes('Backloggd LLC')) {
            items.push(t);
          }
        }
      }
    }

    const unique = Array.from(new Set(items));
    console.log('Total unique changelog entry items:', unique.length);
    fs.writeFileSync('all_changelog_entries.json', JSON.stringify(unique, null, 2), 'utf-8');
    console.log('Saved to all_changelog_entries.json');
  });
});
