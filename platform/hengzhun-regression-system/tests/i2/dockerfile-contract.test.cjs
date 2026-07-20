'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const productRoot = path.resolve(__dirname, '..', '..');
const dockerfile = fs.readFileSync(path.join(productRoot, 'harness', 'Dockerfile'), 'utf8');

test('Harness image installs dependencies once and fails closed before compilation', () => {
  assert.equal((dockerfile.match(/\bnpm ci\b/g) || []).length, 1);
  assert.match(dockerfile, /npm ci --include=dev --ignore-scripts --no-audit --no-fund/);
  assert.match(dockerfile, /--maxsockets=1/);
  assert.match(dockerfile, /--fetch-retries=5/);
  assert.match(dockerfile, /test -f node_modules\/typescript\/bin\/tsc/);
  assert.match(dockerfile, /test -f dist\/harness\/src\/index\.js/);
});

test('Harness image validates the SQLite native binding before copying production dependencies', () => {
  assert.match(dockerfile, /npm prune --omit=dev --ignore-scripts/);
  assert.match(dockerfile, /npm rebuild better-sqlite3 --foreground-scripts/);
  assert.match(dockerfile, /new Database\(':memory:'\)/);
  assert.match(dockerfile, /COPY --from=build \/app\/node_modules \.\/node_modules/);

  const runtimeStage = dockerfile.split(/ AS runtime\s*/u)[1];
  assert.ok(runtimeStage, 'runtime stage must exist');
  assert.doesNotMatch(runtimeStage, /\bRUN npm ci\b/);
});
