# Changelog

## 2.0.9 — 2026-11-04

- Страница настроек: переведены подписи сайдбара (`Customize your avatar and profile`, `Set your defaults across the site`, `Customize how you're notified`, `Connect your Patreon account`, `Manage your Backloggd data`, `Update your email / password`, `Hook into external sites / apps`, `Cleanup lost game logs`, `Manage blocked users`, `View your account's status`, `Infractions`).
- Вкладка Profile: `Help shape the site! … 2026 Backloggd Census`, `You may change your username once every 30 days`, `Change`, `Biography`, `Write a bio`, `Social links`, `Choose a social link`, `Favorite games`, `Reorder your favorites…`, `Features`.
- Сортировки: `Recently Updated`, `Creation Date`, `List Name`, `Last Updated`, `Date Added`, `Alphabetical`, `Custom`, `Manual`.
- Остальные вкладки: поля Defaults, Notifications, Backer, Data, Account, Integrations, Archive, Blocked Users, Infractions; privacy-опции, импорт/экспорт, API/токены, ограничения аккаунта.

## 2.0.8 — 2026-11-04

- `Recently Updated` → «Недавно обновлённые» (сортировка библиотеки).
- `View Folders` / `Hide Folders` → «Показать папки» / «Скрыть папки»; `Folder(s)`.
- Фрагмент статистики `s over` теперь переводится и когда число `4` лежит отдельным текстовым узлом.

## 2.0.7 — 2026-11-04

- Добавлен словарь для страницы `/settings/`: Account, Profile, Notifications, Defaults, Removed Content, Archive, Blocked Users, Privacy/Security, Backer, Danger Zone.
- Поля и действия: email/password/username, avatar/banner/bio/social links, notification preferences, profile visibility, default sorting, game ownership, default game status, comment/journal privacy, export/import, deactivate/delete account, connected Patreon.
- Названия разделов сверены с публичным FAQ и changelog Backloggd (`Settings → Account`, `Profile Settings`, `Defaults`, `Removed Content`, `Archive`, `Blocked Users`, `Permanently Delete Account`).
- Сама страница настроек требует логин, поэтому точный DOM не проверялся; при расхождениях нужен скриншот/HTML конкретного блока.

## 2.0.6 — 2026-11-04

Закрыты строки с профиля, фильтров и статистики:

- `Showing 10 games` → «Показано 10 игр» (шаблон с плюрализацией).
- `February, 2025` → «Февраль 2025» (месяц + запятая + год).
- `Nikitamce has no lists` → «У Nikitamce нет списков»; также games/reviews/friends/badges/followers.
- `4 games liked by Nikitamce` → «4 игры понравились Nikitamce»; `46 reviews liked by …` — «46 рецензий понравились …», с согласованием глагола для 1/2/5.
- `Types`, `Follows`, `Inbound`, `You`, `Create Folder`, `Recent`, `Fade played`, `UNSELECT ALL`, `SELECT ALL`.
- `Finished` → «Пройдено», `Started` → «Начато», `No date` → «Без даты».
- `No recent activity`, «Want to see more?», блок «Upgrade to 60 days of activity by becoming a Backer».
- Фрагмент `s over 4` в статистике лайков → «лайка на 4».

## 2.0.5 — 2026-11-04

- Пустое состояние рецензий: ссылка в реальном DOM содержит `journal`, а не `journal entry`. Добавлены `journal` → «запись», `entry` → «в журнале», `entry!` → «в журнале!»; итог — «Напишите свою или оставьте запись в журнале!».
- Исключение для `journal`-ссылки внутри защищённого журнала.

## 2.0.4 — 2026-11-04

- Узкая панель игры: CTA «Log or review» теперь «Запись / рецензия» вместо длинного «Записать или рецензировать»; добавлены контекстные варианты для разбитых узлов.
- Статус `Backlog` в панели → «Бэклог» (короче на 3 символа), чтобы не наезжать на «Желаемое».
- Добавлены CSS-ограничения для `#interaction-sidebar`: размер шрифта CTA, `nowrap` и уменьшенный шрифт подписей статусов.

## 2.0.3 — 2026-11-04

- `EXPAND`/`COLLAPSE` в карточке рецензии и описании игры рисуются не текстом, а CSS `:after { content: ... }`. Добавлены переопределения в `content.css`, включая `Show More` / `Show Less` для `#summary-expand-btn` и `Browse` для file input.
- Переопределения включаются только при активном переводе через класс `html.backloggd-i18n-active`; в EN-режиме возвращается оригинальный CSS сайта.

## 2.0.2 — 2026-11-03

- Кнопка лога разбита на узлы «Log» + «or review»; добавлен ключ `or review`, теперь «Записать или рецензировать» без смешанного текста.
- `EXPAND`/`COLLAPSE` внутри защищённых описаний и рецензий теперь распознаются как элементы управления (по тегу, `role`, `data-toggle`, aria-controls и классам `expand`/`readmore`), а не как пользовательский текст.
- Ссылка `journal entry` внутри защищённого журнала/карточки получает исключение и переводится.
- Добавлен `review` как нижний регистр для разбитых кнопок.

## 2.0.1 — 2026-11-03

Исправления после ручной проверки интерфейса.

- `EXPAND` больше не остаётся английским: атрибут `[review_id]` перестал защищать кнопку раскрытия рецензии.
- Панель игры («Log or review», «Played», «Playing», «Backlog», «Wishlist», «Manage lists») переводится: `[game_id]` и `.game-cover` больше не защищают поддерево целиком, названия игр закрыты точечными селекторами.
- Добавлены `Dismiss`, `× Dismiss`, `Everyone`, `journal entry` и пустое состояние «There are no reviews for this game…» с сохранением ссылки.
- Ссылки `.readmore-open`/`.readmore-closed` внутри био и длинных рецензий переопределяют защиту: кнопка «Expand» переводится, текст пользователя остаётся нетронутым.
- Компактнее: `Dismiss` → «Скрыть», `Everyone` → «Все»; добавлены `Expand group` / `Collapse group`.

## 2.0.0 — 2026-11-03

Переписано ядро локализации. Основная причина: v1 заменяла отдельные слова в любом текстовом узле, из-за чего ломались названия игр и пользовательский текст.

### Движок

- Перевод только целых строк: словарь + явные шаблоны, без пословной подстановки.
- Контекстные карты для слов, зависящих от места: `Games` в статистике → «Игр», `Register` на кнопке → «Зарегистрироваться».
- Поиск по словарю через `Map`, без обращений к прототипу (`toString` больше не превращается в мусор).
- Скомпилированные один раз шаблоны; нет сортировки и создания регулярок на каждый узел.
- Плюрализация через `Intl.PluralRules`, числа через `Intl.NumberFormat`, даты и месяцы в родительном падеже.

### DOM-слой

- Инкрементальная обработка `addedNodes` и `characterData` вместо полного обхода `document.body` на каждую мутацию.
- Наблюдатель на `document.documentElement` — переживает замену `<body>` в Turbo Drive.
- Защита контента: `.game-text-centered`, `.game-title-section h1`, `.review-body`, `.review__body`, `.review-game-name`, `.card-text`, `[id^="collapseReview"]`, `.username-link`, `.bio`, `[contenteditable]`, `translate="no"`, `[data-i18n-ignore]`.
- Устранён риск бесконечного цикла на `<option>`: текст опции меняется в текстовом узле, а не через `textContent`.
- Устранён баг устаревшего кэша: если сайт изменил текст, новое значение становится источником, а не затирается старым переводом.
- `turbo:before-cache` возвращает английский текст, чтобы русский не попадал в кеш Turbo; после `turbo:load` перевод применяется заново.
- Обновляются `<html lang>` и `document.title` (включая шаблон `Reviews for '…' | Backloggd`).

### Интерфейс

- Переключатель RU/EN в шапке: корректное состояние `RU` / `EN` / `OFF`, `aria-pressed`, подсказки.
- Попап переписан: системный шрифт без внешних запросов, состояние соединения со страницей, счётчик переведённых фрагментов, кнопка «Перевести заново», подсказка «обновите страницу».
- `chrome.tabs.sendMessage` теперь с обработкой `chrome.runtime.lastError`; при отсутствии content script попап не делает вид, что всё применилось.
- Синхронизация между вкладками через `chrome.storage.onChanged`.

### Словарь

- Удалены «грязные» ключи v1 (`Favorite Игры`, `Recently Оценено`, `Last Сыграно`, …), дубли по регистру и ключи с хвостовыми пробелами.
- Удалены опасные фрагменты (`on`, `reviewed`, `by` остались только там, где сайт действительно рендерит их отдельным узлом; `on` — только в контексте карточки рецензии).
- Исправлены смысловые ошибки: `Obscurity`, `Powered by`, `Resend`, `played` → «играли», `organize` → «упорядочивайте», `Submit feedback`, `Last Played`, `Top Liked`.
- Единая терминология: Reviews → «Рецензии», review → «рецензия», Backlog → «В бэклоге», List → «Список» (в прозе — «подборка»), Journal → «Журнал», Wishlist → «Желаемое».
- Добавлены строки с реальных страниц: статистика, фильтры, жанры, типы релизов, карточка рецензии, регистрация/вход, cookie-баннер, футер.
- Удалён неиспользуемый `locales/en.js`: английский режим восстанавливает оригинальные строки сайта, отдельный EN-словарь был мёртвым и рассинхронизированным.

### Инфраструктура

- `manifest.json`: `default_locale`, локализованные `name`/`description`/`action title`, `default_icon`, `minimum_chrome_version`.
- Тесты без зависимостей: движок, гигиена словаря, DOM-смоук-тест на мини-стабе.
- Документация: `README.md`, `docs/DOM-RESEARCH.md`, архивный `docs/REVIEW-v1.md`.

## 1.0.0

Первая версия: словарь на 289 ключей, пословная замена, переключатель RU/EN, попап.
