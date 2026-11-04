# Разметка Backloggd, на которой основано расширение

Дата исследования: 2026-11-03. Публичные страницы отдавались сервером (Rails + Turbo), профиль `/u/...` был закрыт Anubis, поэтому закрытые разделы изучены только по строкам в JS-бандле.

Проверенные URL:

- `https://backloggd.com/` — главная
- `https://backloggd.com/games/lib/popular/` — каталог с фильтрами
- `https://backloggd.com/games/castlevania-belmonts-curse/` — страница игры
- `https://backloggd.com/games/castlevania-belmonts-curse/reviews/` — рецензии (лента подгружается отдельно)
- `https://backloggd.com/reviews/fetch/recent.turbo_stream?game_id=389434` — turbo-stream с карточками рецензий
- `https://backloggd.com/register/`, `https://backloggd.com/login/` — формы
- `https://backloggd.com/assets/application-4149b496.js` — бандл (1,7 МБ)

## Turbo Drive

В HTML есть `data-turbo-track="reload"`, `data-turbo-frame`, а в бандле — `Turbo.visit(...)`, `turbo:load`, `turbo:before-cache`. Turbo заменяет `<body>` при переходах, поэтому наблюдатель должен висеть на `document.documentElement`, а не на `body`.

Перед `turbo:before-cache` нужно вернуть английский текст: иначе снимок страницы закэшируется с русскими строками, и после «назад» переключение на EN не восстановит оригинал.

## Навигация

```html
<nav class="navbar ..." id="primary-nav">
  <div class="container">
    <a class="navbar-brand" href="/">Backloggd</a>
    <ul class="navbar-nav ml-auto">…мобильное меню…</ul>
    <div class="collapse navbar-collapse" id="navbarSupportedContent">
      <ul class="navbar-nav ml-auto">…Log In, Register, Games…</ul>
      <form data-turbo="false" action="/search">…<input id="nav-bar-search" placeholder="Search" aria-label="Search">…</form>
      <div class="row"><div class="col"></div></div>
    </div>
  </div>
</nav>
```

Переключатель вставляется в `#primary-nav .container` последним элементом: он остаётся видимым и на мобильных, где `.navbar-collapse` скрыт. Если навигации нет, используется fixed-фолбэк в правом верхнем углу.

## Игры и карточки

Карточка:

```html
<div class="card mx-auto game-cover quick-access" game_id="389434">
  <a href="/games/castlevania-belmonts-curse/" class="cover-link"></a>
  <img alt="Castlevania: Belmont's Curse">
  <div class="game-text-centered">Castlevania: Belmont's Curse</div>
</div>
```

Страница игры:

```html
<div class="row ... game-title-section">
  <h1 class="mb-0">Castlevania: Belmont's Curse</h1>
</div>
```

Поэтому защита: `.game-text-centered` и `.game-title-section h1`. Контейнеры `[game_id]` и `.game-cover` **не** защищаются целиком: в тот же блок может попадать панель действий («Log or review», статусы, «Manage lists»), и широкая защита оставляла её английской. `alt` не переводится вообще.

## Статистика главной

```html
<p class="d-inline-block mb-0 stat-label">Played</p><p>72.8M</p>
<p class="d-inline-block mb-0 stat-label">Games</p><p>381K</p>
<p class="d-inline-block mb-0 stat-label">Ratings</p><p>43.8M</p>
<p class="d-inline-block mb-0 stat-label">Reviews</p><p>5.03M</p>
<p class="d-inline-block mb-0 stat-label">Lists</p><p>866K</p>
```

Метка и число — отдельные узлы. Отсюда контекст `.stat-label`: `Games` → «Игр», `Ratings` → «Оценок», `Reviews` → «Рецензий», `Lists` → «Списков». Числа с `K`/`M` форматируются отдельным шаблоном (`72,8 млн`, `381 тыс.`).

## Страница игры

```html
<p class="game-details-header">Genres</p>
<p class="game-details-header">Platforms</p>
<p class="game-details-header mb-0">Released</p>
```

`Released` — заголовок даты на странице игры, но фильтр «Released» в каталоге. Отсюда контекст `.game-details-header` → «Дата выхода».

Счётчики:

```html
<p class="log-counter-label"><i class="..."></i> Plays</p>
<p class="log-counter-stat">3.9K</p>
...
<p class="log-counter-label"><i class="..."></i> Playing</p>
<p class="log-counter-stat">1.3K</p>
...
Backlogs / Wishlists / Ratings
```

`Playing` в счётчике — «Играют», в статусе — «Играю». Контекст `.log-counter-label`.

Рейтинг:

```html
<div class="col game-rating"><p>Avg Rating</p><h1 class="text-center">3.8</h1></div>
```

Число локализуется в `3,8` (запятая), но только в `.game-rating`, чтобы не портить версии вроде `1.18`.

Подпись разработчика:

```html
<div class="game-title-section">…<h1>…</h1>…<span class="filler-text">by</span>…<a>Evil Empire</a>…</div>
```

`by` → «от».

## Карточка рецензии

```html
<div class="row pt-2 pb-1 review-card">
  <div class="row top-bar mb-1 review-details">
    <a href="/u/noah_k/review/5508714/" class="review-game-link">reviewed <span class="review-game-name">Grand Theft Auto: San Andreas</span></a>
    <p class="play-type completed">Completed</p>
    <div class="filler-text"><p>on</p></div>
    <a class="review-platform">Xbox</a>
    <div class="filler-text"><p>again <i class="..."></i></p></div>
    <time data-format="%b %d, %Y">Nov 01, 2026</time>
  </div>
  <div class="row mt-2 mb-3 review-body" review_id="5508714">
    <div class="mb-0 card-text" id="collapseReview5508714">…текст рецензии…</div>
  </div>
  <div class="row review-bottom-bar">
    <p class="like-counter"><a>1 Like</a></p>
    <a class="open-review-link">Open review</a>
  </div>
</div>
```

Защита: `.review-body`, `.card-text`, `[id^="collapseReview"]`, `.review-game-name`, `.review-title`. Атрибут `[review_id]` **не** защищается: он висит и на теле рецензии, и на кнопке `EXPAND`, из-за чего кнопка оставалась английской.

Контекст `.review-details .filler-text` нужен только для `on` → «на»; глобального ключа `on` нет, иначе он снова начал бы переводить предлоги в пользовательских предложениях.

## Рецензии на странице игры

Сервер отдаёт пустой контейнер и turbo-frame:

```html
<div class="col" id="reviews-results"></div>
<turbo-frame id="pagination" src="/reviews/fetch/recent.turbo_stream?game_id=389434"></turbo-frame>
```

Карточки приходят turbo-stream'ом и вставляются в DOM. Их обрабатывает MutationObserver; тела рецензий защищены.

## Фильтры каталога

```html
<h3 class="my-auto filter-title">Filters</h3>
<label class="fill-in-slim">Games</label>
<label class="fill-in-slim">Extras</label>
<summary>Choose categories</summary>
<label>Main Game</label> … Bundle, Remake, Remaster, Port, Fork, Mod, DLC, Expansion, Episode, Season, Update, Pack / Addon
<p>Release Year</p><label>Upcoming</label><label>Released</label>
<p>Genre</p><select>…жанры…</select>
<p>Platform Released On</p><select>…платформы…</select>
<p>Game Rating</p><p>Obscurity</p><p>Popular</p><p>Niche</p>
<button id="filters-submit">Update Filters</button>
<span>Apply Filters</span>
<p class="sort-heading">Sort by</p><button id="user-games-sort">Popularity</button>
<a>Game Title</a><a>Trending</a><a>Release Date</a><a>Top Rated</a><a>Avg. Play Time</a><a>Avg. Finish Time</a>
<div class="subtitle-text">326,452 Games</div>
```

Жанры и платформы — `<option>`, поэтому переводятся текстовые узлы опций, а не `textContent` у `<select>`.

## Регистрация и вход

```html
<h2 id="title">Create your new account</h2>
<label>Username</label><small>A-Z, 0-9, and underscores only.</small>
<label>Password</label><small>Minimum of 6 characters</small>
<label>Email</label><label>First Name</label>
<label>I agree to the <a>Terms of Service</a></label>
<label>I'm at least 13 years old and agree to the <a>Privacy Policy</a></label>
<button id="register-new-user-btn">Register</button>
<a>Already have an account? Log in</a>
```

Это две отдельные фразы, а не одна. Поэтому:

- `I agree to the` → «Я принимаю»;
- `Terms of Service` → «Условия использования»;
- `I'm at least 13 years old and agree to the` → «Мне исполнилось 13 лет, и я принимаю»;
- `Privacy Policy` → «Политику конфиденциальности» (винительный падеж для этой фразы).

Кнопка `Register` и ссылка `Register` в навигации — разные части речи: контекст `button` даёт «Зарегистрироваться», ссылка — «Регистрация».

## Правки по результатам проверки интерфейса

После ручной проверки на сайте были найдены и исправлены следующие случаи:

- **`EXPAND` оставался английским.** В DOM это `<a class="review-more" data-toggle="collapse"><i></i></a>`, а слово «EXPAND» приходит из CSS: `.review-more.collapsed:after { content: " EXPAND" }`. Текстового узла нет, поэтому переводчик его не видел. Теперь `content.css` переопределяет `content` для `.review-more`, `.collapse-text-more` и `#summary-expand-btn` (`Show More`/`Show Less`) при активном переводе. Дополнительно `EXPAND`/`COLLAPSE` распознаются как элементы управления, если текст всё-таки есть в DOM.
- **CSS-подписи.** Правило включается только на `html.backloggd-i18n-active`; в EN-режиме класс снимается и сайт показывает исходные «EXPAND»/«COLLAPSE»/«Browse».
- **Панель игры («Log or review», «Played», «Playing», «Backlog», «Wishlist», «Manage lists») оставалась английской.** Панель может находиться в контейнере с `game_id`/`.game-cover`; эти селекторы больше не защищают поддерево целиком. Названия игр защищены точечно (`.game-text-centered`, `.game-title-section h1`, `.review-game-name`).
- **`Dismiss` в уведомлении.** Добавлены `Dismiss`, `× Dismiss`, `Dismiss all`.
- **`Expand`/`Close` внутри био и длинных рецензий.** Ссылки `.readmore-open` / `.readmore-closed` генерируются плагином внутри защищённого контента; для них сделано исключение, чтобы кнопка раскрытия переводилась, а текст био — нет.
- **Фильтр `Everyone` в рецензиях.** Добавлен `Everyone`.
- **Пустое состояние рецензий.** Реальная ссылка: `<a class="pink-link" href="/autocomplete-modal/346331">journal</a>`, а не `journal entry`. Текст разбит на `There are no reviews for this game. Consider reviewing it yourself in a` + `journal` + ` entry!`. Добавлены `journal` → «запись», `entry` → «в журнале», `entry!` → «в журнале!»; итог — «Напишите свою или оставьте запись в журнале!». Для ссылки с текстом `journal` сделано исключение из защиты `.journal-entry`.
- **Кнопка лога разбита на узлы.** В DOM это отдельные «Log» и «or review»; добавлены `or review` и `review` (нижний регистр), чтобы не получалось «Записать or review».
- **Тесная панель игры.** В `#interaction-sidebar` длинные формы не помещаются: CTA сокращён до «Запись / рецензия», `Backlog` — до «Бэклог», а `content.css` уменьшает шрифт/запрещает перенос в этом блоке.
- **Профиль и фильтры.** По скриншотам добавлены `Types`, `Follows`, `Inbound`, `You`, `Create Folder`, `Recent`, `UNSELECT ALL`, `Finished`/`Started`, `No recent activity`, `Want to see more?`, `Upgrade to 60 days…`, а также шаблоны `Showing N games`, `N games/reviews liked by USER`, `USER has no lists`, `February, 2025` и фрагмент `s over N`. Логин-страницы по-прежнему недоступны для прямой проверки.

## Покрытие словаря

На шести публичных страницах извлечено 510 уникальных текстовых строк (683 с учётом повторов). Если исключить `<option>` с названиями платформ, названия игр, списков и статьи ленты, остаётся 167 UI-строк. Все они переводятся; единственное «непереведённое» без контекста — предлог `on`, который в карточке рецензии переводится контекстным правилом `.review-details .filler-text`.

Остальные непереведённые строки — это преимущественно:

- названия платформ и ретро-железа (`3DO Interactive Multiplayer`, `PDP-11`, `ZX Spectrum`), которые разумно оставить латиницей;
- названия игр, списков и статьи ленты — пользовательский/игровой контент, его трогать нельзя.

## Настройки

`/settings/` и подстраницы требуют авторизации (неавторизованный запрос даёт 404/редирект на `/users/sign_in/`), поэтому разметку снять не удалось. Структура восстановлена по публичному FAQ, changelog и скриншоту страницы:

- сайдбар: `Profile`, `Defaults`, `Notifications`, `Backer`, `Data`, `Account`, `Integrations`, `Archive`, `Blocked Users`, `Infractions` + подписи;
- вкладка Profile: username, avatar/Change, Biography/Write a bio, Social links/Choose a social link, Favorite games, Features;
- сортировки: `Recently Updated`, `Creation Date`, `List Name`;
- из FAQ/changelog: `Permanently Delete Account`, `Deactivate account`, `Game Ownership`, `Default game status`, `Comment privacy`, `Journal note privacy`, `Removed Content`, `Archive`, `Blocked Users`.

Для остальных вкладок (Defaults, Notifications, Backer, Data, Account, Integrations, Archive, Blocked Users, Infractions) добавлены точные ключи по известным полям и терминам сайта. Если на реальной странице формулировки отличаются, нужен скриншот или HTML конкретного блока.

## Что осталось непроверенным

- Профиль, настройки, редактор лога, списки и журнал за логином: профиль закрыт Anubis, поэтому селекторы для био/комментариев/журнала взяты из общих классов и бандла (`toastr`, `#journal-game-modal`, `.played-btn-container`, `.backlog-btn-container`, `.wishlist-btn-container`).
- Локализация ошибок валидации и тостов: строки есть в бандле, но не все проверены на живой странице.
- A/B-варианты разметки.

При изменении сайта в первую очередь проверять: `#primary-nav .container`, `.game-text-centered`, `.game-title-section h1`, `.review-body .card-text`, `.expand-review-col`, `.review-details .filler-text`, `.stat-label`, `.log-counter-label`, `.game-details-header`, панель `played-btn-container` / `backlog-btn-container` / `wishlist-btn-container`.
