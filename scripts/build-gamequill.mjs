import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'plus', 'package.json'));

let esbuild = null;
try {
  esbuild = require('esbuild');
} catch {
  esbuild = null;
}

// Resolve and read workspace modules via Node fs so esbuild never walks parent
// directories above the repo root (which fails on restricted Windows profiles).
const localFsPlugin = {
  name: 'local-fs',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => ({
      path: path.resolve(args.resolveDir || ROOT, args.path),
      namespace: 'local-fs',
    }));
    build.onLoad({ filter: /.*/, namespace: 'local-fs' }, (args) => ({
      contents: fs.readFileSync(args.path, 'utf8'),
      loader: args.path.endsWith('.css') ? 'text' : 'js',
      resolveDir: path.dirname(args.path),
    }));
  },
};

async function buildTarget(entryRel, outRel) {
  const entryAbs = path.join(ROOT, entryRel);
  const outAbs = path.join(ROOT, outRel);
  if (esbuild) {
    return esbuild.build({
      stdin: {
        contents: fs.readFileSync(entryAbs, 'utf8'),
        resolveDir: path.dirname(entryAbs),
        loader: 'js',
        sourcefile: entryAbs,
      },
      bundle: true,
      format: 'iife',
      target: 'chrome102',
      outfile: outAbs,
      plugins: [localFsPlugin],
      logLevel: 'info',
    });
  }
  const { build: viteBuild } = require('vite');
  return viteBuild({
    configFile: false,
    logLevel: 'info',
    plugins: [
      {
        name: 'raw-css-text',
        enforce: 'pre',
        load(id) {
          if (id.endsWith('.css')) {
            return `export default ${JSON.stringify(fs.readFileSync(id, 'utf8'))};`;
          }
        },
      },
    ],
    build: {
      outDir: path.dirname(outAbs),
      emptyOutDir: false,
      minify: false,
      lib: {
        entry: entryAbs,
        formats: ['iife'],
        name: 'GameQuillBundle',
        fileName: () => path.basename(outRel),
      },
    },
  });
}

await Promise.all([
  buildTarget('src/gamequill-content/index.js', 'lib/gamequill-content.js'),
  buildTarget('src/gamequill/bridge.js', 'gamequill/bridge.js'),
]);
