const https = require('https');
https.get('https://backloggd.com/changelog/', { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Changelog total bytes:', data.length);
    const pTags = data.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
    console.log('Total p tags in raw HTML:', pTags.length);
  });
});
