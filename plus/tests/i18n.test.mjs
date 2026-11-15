import assert from 'node:assert/strict';
import test from 'node:test';

const locales = ['en', 'ru', 'zh', 'es', 'pt', 'de', 'fr', 'ja', 'ko', 'pl'];
const HOME_KEYS = [
  'sectionHome',
  'homeGroupPersonal',
  'homeGroupLanding',
  'showHomeWidgets',
  'showHomePopularFriends',
  'showHomeFriendsActivity',
  'showHomeTrending',
  'showHomeNews',
  'showHomeFriendReviews',
  'showHomePopularReviews',
  'showHomeFriendLists',
  'showHomePopularLists',
  'showHomeComingSoon',
  'showHomeRecentlyAnticipated',
  'showHomeSleeperHits',
  'showHomePromoBanner',
  'showHomeHero',
  'showHomeCoverMarquee',
  'showHomeAbout',
  'showHomeShowcase',
];

test('home page strings exist in every UI locale', async () => {
  for (const code of locales) {
    const module = await import(`../src/i18n/locales/${code}.js`);
    const strings = module.default;
    for (const key of HOME_KEYS) {
      assert.equal(typeof strings[key], 'string', `${code}.${key}`);
      assert.ok(strings[key].trim().length > 0, `${code}.${key}`);
    }
  }
});
