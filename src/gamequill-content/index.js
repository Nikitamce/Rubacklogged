import { bindSettingsUpdates, loadSettings } from './settings.js';
import { refreshViewerThemes, setViewerEnabled, startViewer } from './viewer.js';
import { refreshComposerTheme, startComposer } from './composer.js';

export async function startGameQuill() {
  const s = await loadSettings();
  startComposer();
  startViewer({ enabled: s.showGameQuill !== false });

  bindSettingsUpdates((next, changes) => {
    if (changes.showGameQuill) {
      setViewerEnabled(next.showGameQuill !== false);
    }
    if (changes.gqTheme) {
      refreshViewerThemes(next.gqTheme);
      refreshComposerTheme(next.gqTheme);
    }
  });
}

startGameQuill().catch((err) => console.warn('[Backloggd i18n] GameQuill init failed:', err));
