# 🤖 AI Developer & Translation Guide for Backloggd i18n + Plus

> **Памятка для AI-ассистентов:** полное руководство по архитектуре, быстрому поиску нужных файлов, правилам перевода, исправлению верстки, сборке и тестированию без лишних поисков с нуля.

---

## 1. Архитектура проекта

Проект объединяет два взаимосвязанных компонента в единую ветку `mixed`:
1. **Движок локализации на русский язык (i18n):**
   - Chrome Extension (Manifest V3) + Userscript (Violentmonkey / Tampermonkey).
   - Быстрый DOM-обходчик с защитой от перезаписи игр, никнеймов и пользовательских рецензий.
2. **Backloggd Plus (модуль улучшений):**
   - Интеграции: Steam (цены, скидки, онлайн, теги, Steam Deck), OpenCritic, Metacritic, HLTB, ProtonDB, PCGamingWiki.
   - Графики цен ITAD/SteamDB, мини-профили игр и пользователей, экспорт списков.

---

## 2. Карта файлов: где что искать

| Задача / Что нужно изменить | Основной файл | Дополнительный файл |
| :--- | :--- | :--- |
| **Добавить перевод статического текста** (кнопка, лейбл, меню, бейдж) | `locales/ru.js` (объект `strings`) | `plus/src/i18n/site/ru.json` |
| **Динамический текст с переменными** (числа, даты, `Liked 25+ games`, плюрализация) | `locales/ru.js` (массив `patterns`) | `plus/src/features/site-locale.js` (`dynamicTranslations`) |
| **Контекстно-зависимый перевод** (например, «On» = «Вкл.» только в настройках, но «на» в платформе) | `locales/ru.js` (массив `contexts`) | — |
| **Стили переключателя языков и текстовых псевдоэлементов (`::after`)** | `content.css` | `plus/src/styles/main.css` |
| **Стили и верстка виджетов Plus** (карточки, графики, бейджи) | `plus/src/styles/` (`main.css`, `steam-charts.css`, ...) | `content.css` |
| **OpenCritic API и оценки** | `plus/src/api/opencritic.js` | — |
| **Steam / ITAD / Цены / Графики** | `plus/src/features/steam-charts-ui.js`, `plus/src/api/steam.js` | — |
| **CORS и разрешения фоновых сетевых запросов** | `manifest.json` (`host_permissions`) | `background.js`, `lib/gm-polyfill.js` |
| **Тесты** | `tests/engine.test.js`, `tests/dictionary.test.js` | `tests/content.test.js`, `tests/locale-detection.test.js` |
| **Сборка бандла Plus** | `plus/` (Vite) | Бандл копируется в `lib/plus-bundle.js` |

---

## 3. Правила перевода: 3 сценария

### Сценарий А. Обычная фиксированная строка
Если текст статичен (например, `'Log In'`, `'Backlog'`, `'Top Shelf'`):
1. Открыть `locales/ru.js`, добавить ключ в объект `strings`:
   ```javascript
   'Top Shelf': 'Верхняя полка',
   ```
2. Продублировать в `plus/src/i18n/site/ru.json`:
   ```json
   "Top Shelf": "Верхняя полка",
   ```

### Сценарий Б. Строка с динамическими параметрами
Если в строке есть числа, даты, имена (например, `Liked 25+ games`, `in addition to 5 extras`):
1. В `locales/ru.js` в массив `patterns` добавить правило:
   ```javascript
   {
     // "Liked 25+ games"
     re: /^Liked\s+(\d+)\+?\s+games$/i,
     replace: (match, n) => `Понравилось ${n}+ игр`,
   },
   ```
   *Для форм склонений используйте встроенную функцию: `plural(count, ['форма1', 'форма2', 'форма5'])`.*
2. В `plus/src/features/site-locale.js` добавить проверку в функцию `dynamicTranslations(text, raw)`:
   ```javascript
   const liked = text.match(/^Liked\s+(\d+)\+?\s+games$/i);
   if (liked) return preserveEdges(raw, `Понравилось ${liked[1]}+ игр`);
   ```

### Сценарий В. Контекстный перевод (одно слово — разные переводы)
Если слово в зависимости от страницы/блока переводится по-разному:
1. В `locales/ru.js` в массив `contexts` добавить селектор:
   ```javascript
   {
     // В настройках On/Off -> Вкл./Выкл.
     selector: '#settings-body, .settings-page, .form-check, .custom-switch',
     map: {
       'On': 'Вкл.',
       'Off': 'Выкл.',
     },
   },
   {
     // В деталях рецензии: "Completed on PC" -> "на"
     selector: '.review-details, .filler-text',
     map: {
       'On': 'на',
       'on': 'на',
     },
   }
   ```
> [!IMPORTANT]
> Никогда не добавляйте слишком общие слова типа `'On': 'Вкл.'` в глобальный `strings`! Это сломает фразы «Played on PlayStation» -> «Сыграно Вкл. PlayStation». Используйте только `contexts` или цельные шаблоны.

---

## 4. Что СТРОГО ЗАПРЕЩЕНО переводить (Черный список)

Движок перевода защищает контент от порчи:
- ❌ **Названия игр** (`.game-title-section h1`, `[game_id]`, `.review-game-name`, карточки каталога).
- ❌ **Никнеймы и ссылки пользователей** (`.user-link`, `@username`).
- ❌ **Текст пользовательских рецензий и дневников** (`.review-body`, `.journal-content`).
- ❌ **Markdown-разметка пользователя**.

---

## 5. Вёрстка и CSS: Главные правила и грабли

> [!CAUTION]
> **НЕ ЛОМАЙТЕ СЕТКУ BOOTSTRAP НА СТРАНИЦЕ ИГРЫ!**
> 1. **Запрещено** принудительно задавать ширину `#interaction-sidebar` или `.col-game-sidebar` через `flex: 0 0 285px !important;` или `width: 285px !important;`. Вёрстка Backloggd адаптивная (23% на ПК, 100% на мобильных). Принудительные пиксели ломают соседние колонки.
> 2. **Запрещено** писать селекторы вида `#interaction-sidebar .row:has(#add-to-list) { flex-wrap: nowrap !important; }`. 
>    Псевдокласс `:has()` сработает на всех родителей, включая верхнеуровневый `.row.sticky-sidebar`, из-за чего обложка и блок записи встанут в одну горизонтальную линию и перекроют контент!
> 3. Если нужно подогнать кнопку (например, «Управлять списками» `#add-to-list`):
>    - Меняйте только размер шрифта и отступы у самой кнопки:
>      ```css
>      html.backloggd-i18n-active #interaction-sidebar #add-to-list {
>        font-size: 0.82rem !important;
>        padding-left: 0.35rem !important;
>        padding-right: 0.35rem !important;
>        white-space: nowrap !important;
>      }
>      ```

---

## 6. OpenCritic API & Внешние сервисы

1. **OpenCritic:**
   - Не используйте DuckDuckGo-парсинг (он блокируется капчей ботов).
   - Используется официальный клиентский ключ OpenCritic:
     `Authorization: Bearer R2tBRkdvUU9WSHpoUXpaSXVYa2g5cGU5NEFsWUgyeXQ=`
   - Запросы:
     - Поиск: `https://api.opencritic.com/api/game/search?criteria={query}`
     - Детали: `https://api.opencritic.com/api/game/{id}`
2. **CORS и разрешения (Manifest V3):**
   - Любой домен, к которому обращается Service Worker через `fetch()`, обязан быть указан в `manifest.json` в `host_permissions` (например, `*://*.opencritic.com/*`, `*://*.metacritic.com/*`).

---

## 7. Как быстро протестировать перевод

### Быстрый тест одной строки через Node.js (CLI):
```powershell
node -e "const vm = require('vm'), fs = require('fs'), win = {}; vm.runInNewContext(fs.readFileSync('lib/engine.js','utf8'), { window: win, Intl, console }); vm.runInNewContext(fs.readFileSync('locales/ru.js','utf8'), { window: win, Intl, console }); const t = win.BackloggdI18n.createTranslator(win.BackloggdI18nLocales.ru); console.log(t.translate('Liked 25+ games'));"
```

### Запуск тестов проекта:
```powershell
npm test
```
*(Запускает тесты движка, словаря, DOM-логики и автоопределения языка).*

---

## 8. Сборка Backloggd Plus (Обход бага Vite на Windows)

На Windows `vite build` часто падает с ошибкой `Access is denied` при попытке очистить временную системную папку `esbuild`.
**Всегда собирайте через изолированный скрипт:**
```powershell
$tmpDir = Join-Path (Get-Location) "plus\.temp"; New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null; $env:TMP = $tmpDir; $env:TEMP = $tmpDir; try { npm --prefix plus run build; Copy-Item -Path "plus\dist\backloggd-plus.user.js" -Destination "lib\plus-bundle.js" -Force } finally { Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue }
```

---

## 9. Правила Git & Zero-Prompt Push

### Авторы:
- `Nikitamce` (`187407575+Nikitamce@users.noreply.github.com`)
- `MaksVolkov7863` (`MaksVolkov7863@users.noreply.github.com`)

### Пуш без интерактивных окон / зависаний:
Используйте скрипт, достающий токен из `git credential-manager`:
```javascript
const { spawn, execSync } = require('child_process');

function getGitHubToken(username) {
  return new Promise((resolve) => {
    const p = spawn('git', ['credential-manager', 'get'], { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', d => out += d);
    p.on('close', () => {
      let pass = '';
      out.split('\n').forEach(l => { if (l.startsWith('password=')) pass = l.slice(9).trim(); });
      resolve(pass);
    });
    p.stdin.write(`protocol=https\nhost=github.com\nusername=${username}\n\n`);
    p.stdin.end();
  });
}

async function pushDirect(repoUrl, branch, username) {
  const token = await getGitHubToken(username);
  if (!token) throw new Error(`No token for ${username}`);
  const authedUrl = `https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@github.com/Nikitamce/Rubacklogged.git`;
  execSync(`git push "${authedUrl}" ${branch}`, { stdio: 'inherit' });
}

pushDirect('https://github.com/Nikitamce/Rubacklogged.git', 'mixed', 'Nikitamce');
```
