'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { createEnvironment, element, text } = require('./dom-stub');

function runScript(file, sandbox) {
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: file });
}

function buildInitialBody(document) {
  const nav = element(
    'nav',
    { id: 'primary-nav' },
    element(
      'div',
      { className: 'container' },
      element('a', { className: 'navbar-brand' }, text('Backloggd')),
      element(
        'ul',
        { className: 'navbar-nav ml-auto' },
        element('li', {}, element('a', { className: 'nav-link' }, text('Games')))
      ),
      element(
        'div',
        { id: 'navbarSupportedContent' },
        element('input', { attrs: { placeholder: 'Search', 'aria-label': 'Search' } }),
        element('button', { attrs: { 'aria-label': 'Toggle navigation' } })
      )
    )
  );

  const main = element(
    'main',
    {},
    element(
      'div',
      { className: 'game-cover', attrs: { game_id: '1' } },
      element('div', { className: 'game-text-centered' }, text('Port Royale 4')),
      element('div', { className: 'game-text-centered' }, text('Expand'))
    ),
    element(
      'div',
      { className: 'review-body', attrs: { review_id: '1' } },
      element('div', { className: 'card-text' }, text('Music to play to'))
    ),
    element(
      'div',
      { className: 'review-details' },
      element(
        'p',
        { className: 'review-game-link' },
        text('reviewed '),
        element('span', { className: 'review-game-name' }, text('Port Royale 4'))
      ),
      element('div', { className: 'filler-text' }, element('p', {}, text('on'))),
      element('div', { className: 'game-status' }, element('p', { className: 'play-type completed' }, text('Completed'))),
      element('time', {}, text('Nov 01, 2026')),
      element('a', { className: 'like-counter' }, text('1 Like'))
    ),
    element(
      'div',
      { className: 'game-title-section' },
      element('h1', {}, text('Port Royale 4')),
      element('span', { className: 'filler-text' }, text('by')),
      element('a', {}, text('Evil Empire'))
    ),
    element(
      'div',
      { id: 'interaction-sidebar', className: 'interaction-sidebar', attrs: { game_id: '1' } },
      element('button', { className: 'log-review' }, text('Log or review')),
      element('button', { className: 'log-review-split' }, text('Log '), element('span', {}, text('or review'))),
      element('button', { className: 'status-played' }, text('Played')),
      element('button', { className: 'status-playing' }, text('Playing')),
      element('button', { className: 'status-backlog' }, text('Backlog')),
      element('button', { className: 'status-wishlist' }, text('Wishlist')),
      element('button', { className: 'manage-lists' }, text('Manage lists'))
    ),
    element(
      'div',
      { className: 'expand-review-col', attrs: { review_id: '1' } },
      element('a', { className: 'review-more' }, text('EXPAND'))
    ),
    element(
      'div',
      { className: 'bio' },
      text('Private bio text'),
      element('a', { className: 'readmore-closed' }, text('Expand'))
    ),
    element(
      'div',
      { className: 'bio' },
      text('Another private bio'),
      element('button', { className: 'expand-description' }, text('EXPAND'))
    ),
    element(
      'div',
      { className: 'journal-entry' },
      element('a', { className: 'journal-entry-link' }, text('journal entry'))
    ),
    element(
      'button',
      { className: 'split-log' },
      text('Log '),
      element('span', {}, text('or review'))
    ),
    element('span', { className: 'reviews-filter' }, text('Everyone')),
    element('span', { className: 'dismiss' }, text('Dismiss')),
    element(
      'p',
      { className: 'empty-reviews' },
      text('There are no reviews for this game. Consider reviewing it yourself in a '),
      element('a', { className: 'pink-link' }, text('journal')),
      text(' entry!')
    ),
    element('p', { className: 'plain' }, text('Music to play to')),
    element('div', { className: 'game-rating' }, element('h1', {}, text('3.8'))),
    element('p', { className: 'stat-label' }, text('Games')),
    element('p', {}, text('381K')),
    element('a', { className: 'nav-link' }, text('Log In'))
  );

  const body = element('body', {}, nav, main);
  document.documentElement.appendChild(body);
  document._body = body;
  document.title = 'Games | Backloggd';
}

function allText(node) {
  return node.textContent;
}

test('boots, translates, protects and restores', async () => {
  const env = createEnvironment();
  const windowObject = env.windowObject;

  runScript('lib/engine.js', { window: windowObject, Intl, console });
  runScript('locales/ru.js', { window: windowObject, Intl, console });
  buildInitialBody(env.document);

  runScript('content.js', env.sandbox);

  const body = env.document.body;
  const navLink = body.querySelector('.nav-link');
  assert.equal(navLink.textContent, 'Игры');
  assert.equal(body.querySelector('.game-text-centered').textContent, 'Port Royale 4');
  assert.equal(body.querySelectorAll('.game-text-centered')[1].textContent, 'Expand');
  assert.equal(body.querySelector('.game-title-section h1').textContent, 'Port Royale 4');
  assert.equal(body.querySelector('.game-title-section .filler-text').textContent, 'от');
  assert.equal(body.querySelector('.log-review').textContent, 'Запись / рецензия');
  assert.equal(body.querySelector('.log-review-split').textContent, 'Запись / рецензия');
  assert.equal(body.querySelector('.status-played').textContent, 'Сыграно');
  assert.equal(body.querySelector('.status-playing').textContent, 'Играю');
  assert.equal(body.querySelector('.status-backlog').textContent, 'Бэклог');
  assert.equal(body.querySelector('.status-wishlist').textContent, 'Желаемое');
  assert.equal(body.querySelector('.manage-lists').textContent, 'Управлять списками');
  assert.equal(body.querySelector('.review-more').textContent, 'Развернуть');
  assert.equal(body.querySelector('.bio .readmore-closed').textContent, 'Развернуть');
  assert.ok(body.querySelector('.bio').textContent.includes('Private bio text'));
  assert.equal(body.querySelector('.expand-description').textContent, 'Развернуть');
  assert.ok(body.querySelectorAll('.bio')[1].textContent.includes('Another private bio'));
  assert.equal(body.querySelector('.journal-entry a').textContent, 'запись в журнале');
  assert.equal(body.querySelector('.empty-reviews a').textContent, 'запись');
  assert.equal(body.querySelector('.split-log').textContent, 'Записать или рецензировать');
  assert.equal(body.querySelector('.reviews-filter').textContent, 'Все');
  assert.equal(body.querySelector('.dismiss').textContent, 'Скрыть');
  assert.equal(
    body.querySelector('.empty-reviews').textContent,
    'У этой игры пока нет рецензий. Напишите свою или оставьте запись в журнале!'
  );
  assert.equal(body.querySelector('.card-text').textContent, 'Music to play to');
  assert.equal(body.querySelector('.plain').textContent, 'Music to play to');
  assert.equal(body.querySelector('.review-game-link').textContent, 'Рецензия на Port Royale 4');
  assert.equal(body.querySelector('.filler-text').textContent, 'на');
  assert.equal(body.querySelector('.play-type').textContent, 'Пройдено');
  assert.equal(body.querySelector('time').textContent, '1 нояб. 2026');
  assert.equal(body.querySelector('.like-counter').textContent, '1 лайк');
  assert.equal(body.querySelector('.stat-label').textContent, 'Игр');
  assert.equal(body.querySelector('.game-rating h1').textContent, '3,8');
  assert.ok(allText(body).includes('381 тыс.'));

  const search = body.querySelector('input');
  assert.equal(search.getAttribute('placeholder'), 'Поиск');
  assert.equal(search.getAttribute('aria-label'), 'Поиск');
  assert.equal(body.querySelector('button').getAttribute('aria-label'), 'Открыть меню');

  assert.equal(env.document.title, 'Игры | Backloggd');
  assert.equal(env.document.documentElement.getAttribute('lang'), 'ru');
  assert.ok(env.document.documentElement.classList.contains('backloggd-i18n-active'));

  const switcher = env.document.getElementById('backloggd-i18n-switcher');
  assert.ok(switcher);
  assert.equal(switcher.querySelector('.bi18n-lang').textContent, 'RU');

  let response;
  env.messageListeners[0](
    { type: 'setSettings', settings: { language: 'en', enabled: true } },
    null,
    (value) => { response = value; }
  );

  assert.equal(response.language, 'en');
  assert.equal(body.querySelector('.nav-link').textContent, 'Games');
  assert.equal(body.querySelector('.play-type').textContent, 'Completed');
  assert.equal(body.querySelector('.game-rating h1').textContent, '3.8');
  assert.equal(body.querySelector('.status-playing').textContent, 'Playing');
  assert.equal(body.querySelector('.status-backlog').textContent, 'Backlog');
  assert.equal(body.querySelector('.log-review').textContent, 'Log or review');
  assert.equal(body.querySelector('.log-review-split').textContent, 'Log or review');
  assert.equal(body.querySelector('.bio .readmore-closed').textContent, 'Expand');
  assert.equal(body.querySelector('.expand-description').textContent, 'EXPAND');
  assert.equal(body.querySelector('.journal-entry a').textContent, 'journal entry');
  assert.equal(body.querySelector('.split-log').textContent, 'Log or review');
  assert.equal(body.querySelector('.review-more').textContent, 'EXPAND');
  assert.equal(body.querySelector('.dismiss').textContent, 'Dismiss');
  assert.equal(
    body.querySelector('.empty-reviews').textContent,
    'There are no reviews for this game. Consider reviewing it yourself in a journal entry!'
  );
  assert.equal(body.querySelector('time').textContent, 'Nov 01, 2026');
  assert.equal(body.querySelector('.card-text').textContent, 'Music to play to');
  assert.equal(search.getAttribute('placeholder'), 'Search');
  assert.equal(env.document.title, 'Games | Backloggd');
  assert.equal(env.document.documentElement.getAttribute('lang'), null);
  assert.ok(!env.document.documentElement.classList.contains('backloggd-i18n-active'));
  assert.equal(switcher.querySelector('.bi18n-lang').textContent, 'EN');

  env.messageListeners[0](
    { type: 'setSettings', settings: { language: 'ru', enabled: true } },
    null,
    () => {}
  );
  assert.equal(body.querySelector('.nav-link').textContent, 'Игры');
});

test('survives a Turbo body replacement and translates added nodes', async () => {
  const env = createEnvironment();
  const windowObject = env.windowObject;

  runScript('lib/engine.js', { window: windowObject, Intl, console });
  runScript('locales/ru.js', { window: windowObject, Intl, console });
  buildInitialBody(env.document);
  runScript('content.js', env.sandbox);

  const oldBody = env.document.body;
  const newNav = element(
    'nav',
    { id: 'primary-nav' },
    element('div', { className: 'container' }, element('a', { className: 'nav-link' }, text('Log In')))
  );
  const newBody = element('body', {}, newNav);
  env.document.documentElement.removeChild(oldBody);
  env.document.documentElement.appendChild(newBody);
  env.document._body = newBody;

  env.handlers['turbo:load']();

  assert.equal(newBody.querySelector('.nav-link').textContent, 'Войти');
  assert.ok(env.document.getElementById('backloggd-i18n-switcher'));

  const added = element('div', {}, element('a', { className: 'nav-link' }, text('Add to Wishlist')));
  newBody.appendChild(added);

  const observer = env.getObserver();
  assert.ok(observer);
  observer.callback([{ type: 'childList', addedNodes: [added] }]);

  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.equal(added.querySelector('.nav-link').textContent, 'Добавить в желаемое');
});
