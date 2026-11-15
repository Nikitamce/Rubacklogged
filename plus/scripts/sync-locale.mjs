import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const plusRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = join(plusRoot, '..');
const window = {};
vm.runInNewContext(readFileSync(join(projectRoot, 'locales/ru.js'), 'utf8'), {
  window,
  Intl,
  console,
});
const strings = window.BackloggdI18nLocales?.ru?.strings;
if (!strings) throw new Error('Cannot load the canonical Russian dictionary');
const target = join(plusRoot, 'src/i18n/site/ru.json');
writeFileSync(target, `${JSON.stringify(strings, null, 2)}\n`);
console.log(`Synced ${Object.keys(strings).length} Russian strings`);
