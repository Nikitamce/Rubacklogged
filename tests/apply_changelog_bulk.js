/**
 * Changelog translation dictionary generator for Backloggd.
 * Translates release notes, bug fixes, and feature additions across all versions.
 */
const fs = require('fs');
const path = require('path');

const changelogDictionary = {
  // 1.18.x
  "Browse a game's media directly from the game page": "Просматривайте медиафайлы игры прямо со страницы игры",
  "Updated styling to various selectpickers such as the edition field for more clarity on what's currently selected": "Обновлено оформление выпадающих списков (например, поля издания) для лучшей наглядности выбранного варианта",
  "Notifications page now preloads the first set of notifications with infinite loading for the rest": "Страница уведомлений теперь предварительно загружает первый список с бесконечной прокруткой для остальных",
  "Follow activities were grouping but not displaying as a group in the activity feed": "События подписок группировались, но не отображались группой в ленте активности",
  "User profile pics were oversized when viewing a group of expanded activities": "Аватары пользователей отображались увеличенными при просмотре группы раскрытых событий",
  "Notification bell wouldn't clear when opening the notifications page until after the page refreshed": "Значок колокольчика уведомлений не сбрасывался при открытии страницы уведомлений до её обновления",
  "Library entries with an edition wouldn't show the edition cover": "Записи библиотеки с указанным изданием не показывали обложку издания",
  "Library entries with an edition wouldn't allow selecting platforms specific to that edition": "Записи библиотеки с изданием не позволяли выбрать платформы, специфичные для этого издания",
  "Shuffle sort would show duplicate entries on following pages": "Случайная сортировка (Shuffle) показывала дублирующиеся записи на последующих страницах",
  "Preparing systems for ████████": "Подготовка систем к ████████",
  "Add new library entries from the library page": "Добавление новых записей библиотеки со страницы библиотеки",
  "Edit or remove existing library entries when in 'list' view mode": "Редактирование или удаление существующих записей библиотеки в режиме «список»",
  "Default settings added for library sorting and grouping": "Добавлены настройки по умолчанию для сортировки и группировки библиотеки",
  "Covers are now smaller in the library 'list' view for a more condensed look": "Обложки уменьшены в режиме «список» библиотеки для более компактного вида",
  "The 'Lost logs' section has been replaced with 'Orphaned logs'": "Раздел «Потерянные записи» заменён на «Изолированные записи»",
  "Library entries in grid view were squished on mobile, changed 4->3 games per row": "Записи библиотеки в виде сетки сжимались на смартфонах: изменено с 4 до 3 игр в ряд",
  "Library entries in grid view were squished on mobile, changed 4-&gt;3 games per row": "Записи библиотеки в виде сетки сжимались на смартфонах: изменено с 4 до 3 игр в ряд",
  "Your games have new browsing options": "Новые возможности просмотра ваших игр",
  "Library entries have a dedicated page": "Записи библиотеки получили отдельную страницу",
  "Search for games by name in your collection": "Поиск игр по названию в вашей коллекции",
  "Notifications now support grouping": "Уведомления теперь поддерживают группировку",
  "Added new 'Library' sorting options": "Добавлены новые варианты сортировки «Библиотеки»",
  "Added option to filter games by ownership type": "Добавлена возможность фильтрации игр по типу владения",
  "Fixed an issue with journal play dates resetting": "Исправлена ошибка со сбросом дат игры в журнале",
  "Performance optimizations for large game lists": "Оптимизация производительности при открытии больших списков игр",
  "Dark mode contrast improvements across menus": "Улучшен контраст тёмной темы в меню сайта",
  "Fixed a visual glitch on mobile game covers": "Исправлен графический баг отображения обложек на мобильных",
  "Support for multi-disc editions": "Поддержка многодисковых изданий",
  "Enhanced search relevance algorithm": "Улучшен алгоритм релевантности поиска",
  "Profile layout updates for better readability": "Обновлена разметка профиля для лучшей читаемости",

  // 1.17.x & Common feature milestones
  "Journal 3.0 Revamp": "Обновление «Журнал 3.0»",
  "Play session notes now support the same markdown formatting used in reviews, comments, etc..": "Заметки игровых сессий теперь поддерживают разметку Markdown (как в обзорах и комментариях)",
  "Play sessions can now have up to 8 custom tags": "Игровые сессии теперь могут иметь до 8 пользовательских тегов",
  "Library Entries": "Записи библиотеки",
  "You can now save your log from the unsaved warning dialog, along with discard your changes, and return to editing": "Теперь можно сохранить запись прямо из диалога несохранённых данных, сбросить изменения или вернуться к редактированию",
  "You can now add a game to multiple lists at once": "Теперь можно добавлять игру сразу в несколько списков",
  "Friends profile section now displays when someone started following someone else": "В разделе друзей профиля теперь отображается, когда один пользователь подписался на другого",
  "Edit / delete log shortcuts added to the user logs page": "Быстрые кнопки редактирования и удаления добавлены на страницу записей пользователя",
  "Change the played status of any game from the quick access bar": "Смена статуса прохождения любой игры из панели быстрого доступа",
  "Easily access your logs page for any game under the new quick access 'View Logs' option": "Быстрый переход к записям любой игры через пункт «Все записи» в панели быстрого доступа",
  "Custom list folder support": "Поддержка папок для пользовательских списков",
  "Drag and drop reordering for list items": "Перетаскивание (drag-and-drop) для изменения порядка элементов в списках",
  "Advanced review search filters": "Расширенные фильтры поиска рецензий",
  "Added spoiler blur for sensitive review text": "Добавлено размытие спойлеров для скрытия сюжетных подробностей в обзорах",
  "Expanded stats page with yearly comparisons": "Расширенная страница статистики со сравнением по годам",
  "Game series progress tracking": "Отслеживание прогресса по игровым сериям",
  "Activity feed filter by friends only": "Фильтр ленты активности «Только друзья»",
  "Compact view option for user game libraries": "Компактный режим отображения для библиотек пользователей",
  "Added new badges for anniversary events": "Добавлены новые значки за участие в праздничных событиях",
  "Enhanced notification settings by category": "Детальные настройки уведомлений по отдельным категориям",

  // 1.0 - 1.16 Milestones & Historic Highlights
  "This changelog section! See exactly what changed in each update": "Этот раздел списка изменений! Смотрите, что именно изменилось в каждом обновлении",
  "Users can now vote for future features through the roadmap": "Пользователи теперь могут голосовать за будущие функции в дорожной карте",
  "There is now a new section on a user's profile for badges! These will be little tokens for participating on the site": "В профиле появился раздел значков — памятных наград за активность на сайте",
  "The navigation bar has received a makeover with a new gradient look. Game pages also have been enhanced for this new style": "Панель навигации получила обновлённый градиентный дизайн. Страницы игр также обновлены в этом стиле",
  "The roadmap has been redone for post-release content": "Дорожная карта переработана для пострелизных обновлений",
  "The roadmap link in the nav has been moved to the footer": "Ссылка на дорожную карту в меню перенесена в подвал сайта",
  "Initial launch of Backloggd!": "Первый публичный запуск Backloggd!",
  "Full IGDB sync integration": "Полная интеграция синхронизации с базой IGDB",
  "Customizable rating scale (5 stars vs 10 stars)": "Настраиваемая шкала оценок (5 звёзд или 10 звёзд)",
  "Journal calendar tracking system": "Календарная система ведения игрового журнала",
  "User followers and friends activity feed": "Подписки на пользователей и лента активности друзей",
  "Patreon backer perks integration": "Интеграция привилегий бэкеров Patreon",
  "Custom user bio markdown support": "Поддержка Markdown в описании профиля пользователя",
  "Game release radar and wishlist notifications": "Радар релизов и уведомления об играх из списка желаемого"
};

const ruPath = path.join(__dirname, '../locales/ru.js');
let ru = fs.readFileSync(ruPath, 'utf-8');

const marker = "  const strings = {\n";
let newCount = 0;
let additions = "";

for (const [en, ruTranslation] of Object.entries(changelogDictionary)) {
  const escEn = en.replace(/'/g, "\\'");
  const escRu = ruTranslation.replace(/'/g, "\\'");
  if (!ru.includes(`'${escEn}':`)) {
    additions += `    '${escEn}': '${escRu}',\n`;
    newCount++;
  }
}

if (newCount > 0) {
  ru = ru.replace(marker, marker + additions);
  fs.writeFileSync(ruPath, ru, 'utf-8');
  console.log(`Added ${newCount} changelog translations into locales/ru.js!`);
} else {
  console.log("All changelog items already exist.");
}
