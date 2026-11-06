'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadScript(file, window) {
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(code, { window, Intl, console });
}

const windowObject = {};
loadScript('lib/engine.js', windowObject);
loadScript('locales/ru.js', windowObject);

const { createTranslator } = windowObject.BackloggdI18n;
const locale = windowObject.BackloggdI18nLocales.ru;
const translator = createTranslator(locale);

function withContext(selector) {
  return { closest: (value) => (value === selector ? {} : null) };
}

test('translates complete UI strings', () => {
  assert.equal(translator.translate('Log In'), 'Войти');
  assert.equal(translator.translate('Games'), 'Игры');
  assert.equal(translator.translate('EXPAND'), 'Развернуть');
  assert.equal(translator.translate('Search games'), 'Поиск игр');
  assert.equal(translator.translate('Add to Wishlist'), 'Добавить в желаемое');
  assert.equal(translator.translate('All Editions'), 'Все издания');
  assert.equal(translator.translate('Coming soon'), 'Скоро');
  assert.equal(translator.translate('Types'), 'Типы');
  assert.equal(translator.translate('Follows'), 'Подписки');
  assert.equal(translator.translate('Create Folder'), 'Создать папку');
  assert.equal(translator.translate('View Folders'), 'Показать папки');
  assert.equal(translator.translate('Recently Updated'), 'Недавно обновлённые');
  assert.equal(translator.translate('UNSELECT ALL'), 'СНЯТЬ ВСЁ');
  assert.equal(translator.translate('No recent activity'), 'Нет недавней активности');
  assert.equal(translator.translate('Finished'), 'Пройдено');
  assert.equal(translator.translate('Started'), 'Начато');
  assert.equal(translator.translate('Backlogged'), null);
});

test('preserves surrounding whitespace', () => {
  assert.equal(translator.translate('  Log In  '), '  Войти  ');
  assert.equal(translator.translate('\nGames\t'), '\nИгры\t');
});

test('never partially rewrites game titles or sentences', () => {
  const untouched = [
    'PlayStation All-Stars Battle Royale',
    'Port Royale 4',
    'Grand Theft Auto V',
    'My Top 10 Games of All Time',
    'Music to play to',
    'Everything or Nothing',
    'Based on your ratings',
    'Season 2 Battle Pass',
    'Indie World',
    'Update 1.5 is live',
  ];
  for (const value of untouched) {
    assert.equal(translator.translate(value), null, value);
  }
});

test('is prototype-safe', () => {
  for (const value of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    assert.equal(translator.translate(value), null, value);
  }
});

test('applies context-specific wording', () => {
  assert.equal(translator.translate('Games'), 'Игры');
  assert.equal(translator.translate('Games', { element: withContext('.stat-label') }), 'Игр');
  assert.equal(translator.translate('Playing', { element: withContext('.log-counter-label') }), 'Играют');
  assert.equal(translator.translate('Register', { element: withContext('button') }), 'Зарегистрироваться');
  assert.equal(translator.translate('Register'), 'Регистрация');
  assert.equal(translator.translate('on', { element: withContext('.review-details .filler-text') }), 'на');
  assert.equal(translator.translate('on'), null);
});

test('pluralizes counts', () => {
  assert.equal(translator.translate('1 Like'), '1 лайк');
  assert.equal(translator.translate('2 Likes'), '2 лайка');
  assert.equal(translator.translate('5 Likes'), '5 лайков');
  assert.equal(translator.translate('11 Likes'), '11 лайков');
  assert.equal(translator.translate('21 Likes'), '21 лайк');
  assert.equal(translator.translate('27 Likes'), '27 лайков');
  assert.equal(translator.translate('1 Game'), '1 игра');
  assert.equal(translator.translate('326,452 Games'), '326 452 игры');
  assert.equal(translator.translate('Showing 10 games'), 'Показано 10 игр');
  assert.equal(translator.translate('Showing 1 game'), 'Показано 1 игра');
});

test('formats profile activity counters', () => {
  assert.equal(translator.translate('Nikitamce has no lists'), 'У Nikitamce нет списков');
  assert.equal(translator.translate('4 games liked by Nikitamce'), '4 игры понравились Nikitamce');
  assert.equal(translator.translate('1 game liked by Nikitamce'), '1 игра понравилась Nikitamce');
  assert.equal(translator.translate('46 reviews liked by Nikitamce'), '46 рецензий понравились Nikitamce');
  assert.equal(translator.translate('1 review liked by Nikitamce'), '1 рецензия понравилась Nikitamce');
});

test('formats compact numbers and combined counts', () => {
  assert.equal(translator.translate('72.8M'), '72,8 млн');
  assert.equal(translator.translate('381K'), '381 тыс.');
  assert.equal(translator.translate('5.03M'), '5,03 млн');
  assert.equal(translator.translate('1.2K Likes'), '1,2 тыс. лайков');
  assert.equal(translator.translate('3.9K Plays'), '3,9 тыс. прохождений');
});

test('formats dates', () => {
  assert.equal(translator.translate('Nov 01, 2026'), '1 нояб. 2026');
  assert.equal(translator.translate('Oct 15, 2026'), '15 окт. 2026');
  assert.equal(translator.translate('May 24, 2025'), '24 мая 2025');
  assert.equal(translator.translate('November 5, 2024'), '5 нояб. 2024');
  assert.equal(translator.translate('May 2025'), 'Май 2025');
  assert.equal(translator.translate('February, 2025'), 'Февраль 2025');
  assert.equal(translator.translate('Nov 01'), '1 ноября');
  assert.equal(translator.translate('Reviewed on 30 Oct 2026'), 'Рецензия от 30 окт. 2026');
  assert.equal(translator.translate('Reviewed on 30 окт 2026'), 'Рецензия от 30 окт. 2026');
  assert.equal(translator.translate('Reviewed on Nov 01, 2026'), 'Рецензия от 1 нояб. 2026');
  assert.equal(translator.translate('Reviewed on'), 'Рецензия от');
  assert.equal(translator.translate('Log history'), 'История записей');
  assert.equal(translator.translate('Avg 3.5★'), 'Ср. 3,5★');
});

test('formats status-in-year strings', () => {
  assert.equal(translator.translate('Backlogged in 2024'), 'В бэклоге с 2024 г.');
  assert.equal(translator.translate('Completed in 2025'), 'Пройдено в 2025 г.');
  assert.equal(translator.translate('Released in 2024'), 'Релиз в 2024 г.');
  assert.equal(translator.translate('in 2024'), 'в 2024 г.');
});

test('formats quarters, hours and durations', () => {
  assert.equal(translator.translate('2027 Q2'), '2 кв. 2027');
  assert.equal(translator.translate('16h'), '16 ч');
  assert.equal(translator.translate('0.5h'), '0,5 ч');
  assert.equal(translator.translate('h'), 'ч');
  assert.equal(translator.translate('30 minutes'), '30 минут');
  assert.equal(translator.translate('5 hours'), '5 часов');
});

test('formats genre/platform prefixes and review stats', () => {
  assert.equal(translator.translate('Genre: Adventure'), 'Жанр: Приключение');
  assert.equal(translator.translate('Platform: Windows PC'), 'Платформа: ПК (Windows)');
  assert.equal(translator.translate("View my 'Game' stats"), "Посмотреть мою статистику по 'Game'");
  assert.equal(translator.translate("Reviews for 'Castlevania'"), 'Рецензии на «Castlevania»');
});

test('ignores empty values and unknown languages', () => {
  assert.equal(translator.translate(''), null);
  assert.equal(translator.translate('   '), null);
  assert.equal(translator.translate(null), null);
  assert.equal(translator.translate(undefined), null);
});
