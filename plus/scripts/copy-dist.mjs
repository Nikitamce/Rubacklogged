import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACT_FILES } from './lib/artifacts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

for (const name of ARTIFACT_FILES) {
  const from = join(dist, name);
  if (!existsSync(from)) {
    console.error(`Missing build output: dist/${name}`);
    process.exit(1);
  }
  copyFileSync(from, join(root, name));
  console.log(`Copied dist/${name} → ${name}`);
}

copyFileSync(
  join(dist, 'backloggd-plus.user.js'),
  join(root, '..', 'lib', 'plus-bundle.js')
);
console.log('Copied dist/backloggd-plus.user.js → ../lib/plus-bundle.js');

// vite-plugin-monkey 8 emits a SystemJS registration. Userscript managers load
// the metadata @require files automatically; the Chrome extension needs the
// same loader as a local content-script file.
const systemJs = readFileSync(join(root, 'node_modules/systemjs/dist/system.min.js'), 'utf8');
const namedRegister = readFileSync(
  join(root, 'node_modules/systemjs/dist/extras/named-register.min.js'),
  'utf8'
);
const isolatedSystem = ";(typeof System!=='undefined')&&(System=new System.constructor());";
writeFileSync(
  join(root, '..', 'lib', 'systemjs-loader.js'),
  `${systemJs}\n${namedRegister}\n${isolatedSystem}\n`
);
console.log('Built ../lib/systemjs-loader.js');
