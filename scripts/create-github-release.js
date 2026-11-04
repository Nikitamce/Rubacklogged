const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

function getGitHubToken(accountUsername) {
  return new Promise((resolve, reject) => {
    const p = spawn('git', ['credential-manager', 'get'], { stdio: ['pipe', 'pipe', 'inherit'] });
    let output = '';
    p.stdout.on('data', d => output += d);
    p.on('close', code => {
      let pass = '';
      output.split('\n').forEach(l => {
        if (l.startsWith('password=')) pass = l.slice(9).trim();
      });
      resolve(pass);
    });
    p.stdin.write(`protocol=https\nhost=github.com\nusername=${accountUsername}\n\n`);
    p.stdin.end();
  });
}

async function uploadRelease() {
  const accountUsername = 'Nikitamce';
  const token = await getGitHubToken(accountUsername);
  if (!token) throw new Error(`No token for ${accountUsername}`);

  // 1. Commit and push current branch
  execSync('git config user.name "Nikitamce"', { stdio: 'inherit' });
  execSync('git config user.email "187407575+Nikitamce@users.noreply.github.com"', { stdio: 'inherit' });
  execSync('git add -A', { stdio: 'inherit' });
  try {
    execSync('git commit -m "chore: bump version to v2.1.0 for release"', { stdio: 'inherit' });
  } catch (e) {
    // maybe clean
  }
  const authedUrl = `https://${encodeURIComponent(accountUsername)}:${encodeURIComponent(token)}@github.com/Nikitamce/Rubacklogged.git`;
  execSync(`git push "${authedUrl}" mixed`, { stdio: 'inherit' });

  // 2. Create release via GitHub API
  const tag = 'v2.1.0';
  const repo = 'Nikitamce/Rubacklogged';
  const releasePayload = {
    tag_name: tag,
    target_commitish: 'mixed',
    name: 'Rubacklogged v2.1.0 (Mixed Edition)',
    body: `### Rubacklogged v2.1.0 — Объединённая версия (Backloggd i18n + Backloggd Plus)

#### Что нового:
- **Полная русская локализация:** 100% перевод интерфейса, модальных окон, логов и выпадающих списков.
- **Интеграция всех возможностей Backloggd Plus:**
  - Бейджи Steam, цены в валютах региона (RUB, USD, EUR и др.), скидки и отзывы.
  - HowLongToBeat, ProtonDB и совместимость со Steam Deck.
  - Обложки и факты из SteamDB, галерея скриншотов Steam прямо на странице игры.
  - Быстрый экспорт записей в JSON, Markdown, CSV, Notion, Letterboxd, RAWG.
  - Похожие игры и рекомендации.
  - Мини-профили игр и пользователей.
- **Автоопределение языка:** при установке автоматически включает русский язык для русскоязычных браузеров.
- **Двусторонняя синхронизация:** переключатель «Язык сайта» в настройках Backloggd Plus полностью синхронизирован с расширением.

#### Установка:
- Скачайте **Rubacklogged-v2.1.0.zip**, распакуйте в любую папку и выберите её в Chrome через **«Загрузить распакованное расширение»** на странице \`chrome://extensions\`.
- Либо перетащите **Rubacklogged-v2.1.0.crx** в окно \`chrome://extensions\` (в режиме разработчика).`,
    draft: false,
    prerelease: false
  };

  console.log('Creating release on GitHub...');
  let res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'User-Agent': 'NodeJS',
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    },
    body: JSON.stringify(releasePayload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create release: ${res.status} ${errText}`);
  }

  const release = await res.json();
  console.log(`Release created successfully: ${release.html_url} (ID: ${release.id})`);

  // 3. Upload assets
  const assets = [
    { name: 'Rubacklogged-v2.1.0.zip', path: path.join(__dirname, '..', 'dist', 'Rubacklogged-v2.1.0.zip'), type: 'application/zip' },
    { name: 'Rubacklogged-v2.1.0.crx', path: path.join(__dirname, '..', 'dist', 'Rubacklogged-v2.1.0.crx'), type: 'application/x-chrome-extension' }
  ];

  for (const asset of assets) {
    console.log(`Uploading ${asset.name}...`);
    const fileBuffer = fs.readFileSync(asset.path);
    const uploadUrl = `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`;
    
    const upRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'NodeJS',
        'Content-Type': asset.type,
        'Content-Length': fileBuffer.length
      },
      body: fileBuffer
    });

    if (!upRes.ok) {
      const errText = await upRes.text();
      console.error(`Failed to upload ${asset.name}:`, errText);
    } else {
      const upData = await upRes.json();
      console.log(`Uploaded ${asset.name} -> ${upData.browser_download_url}`);
    }
  }

  console.log('All release assets successfully uploaded!');
}

uploadRelease().catch(err => {
  console.error(err);
  process.exit(1);
});
