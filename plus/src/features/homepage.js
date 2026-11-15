import { settings } from '../state.js';

const HIDE_ATTR = 'data-blp-hide-homepage-fuse';
const HOME_ATTR = 'data-blp-home';
const HOME_HIDDEN_ATTR = 'data-blp-home-hidden';

/** Home page blocks that can be hidden from Settings → Home page. */
export const HOME_BLOCK_SETTINGS = [
  { key: 'showHomeWidgets', token: 'widgets' },
  { key: 'showHomePopularFriends', token: 'popular-friends' },
  { key: 'showHomeFriendsActivity', token: 'friends-activity' },
  { key: 'showHomeTrending', token: 'trending' },
  { key: 'showHomeNews', token: 'news' },
  { key: 'showHomeFriendReviews', token: 'friend-reviews' },
  { key: 'showHomePopularReviews', token: 'popular-reviews' },
  { key: 'showHomeFriendLists', token: 'friend-lists' },
  { key: 'showHomePopularLists', token: 'popular-lists' },
  { key: 'showHomeComingSoon', token: 'coming-soon' },
  { key: 'showHomeRecentlyAnticipated', token: 'anticipated' },
  { key: 'showHomeSleeperHits', token: 'sleeper' },
  { key: 'showHomePromoBanner', token: 'promo' },
  { key: 'showHomeHero', token: 'hero' },
  { key: 'showHomeCoverMarquee', token: 'marquee' },
  { key: 'showHomeAbout', token: 'about' },
  { key: 'showHomeShowcase', token: 'showcase' },
];

export function isHomePage() {
  return location.pathname === '/';
}

export function applyHomepageFuseVisibility() {
  if (settings.hideHomepageFuse !== false) {
    document.documentElement.setAttribute(HIDE_ATTR, '1');
  } else {
    document.documentElement.removeAttribute(HIDE_ATTR);
  }
}

/** Hide the home page blocks the user switched off, following Turbo navigation. */
export function applyHomepageBlockVisibility() {
  const root = document.documentElement;
  const home = isHomePage();
  if (home) root.setAttribute(HOME_ATTR, '1');
  else root.removeAttribute(HOME_ATTR);

  const hidden = HOME_BLOCK_SETTINGS.filter(({ key }) => settings[key] === false).map(
    ({ token }) => token
  );
  if (home && hidden.length) root.setAttribute(HOME_HIDDEN_ATTR, hidden.join(' '));
  else root.removeAttribute(HOME_HIDDEN_ATTR);
}
