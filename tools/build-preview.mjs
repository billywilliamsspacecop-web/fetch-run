// Builds fetch-run-preview.html: the whole game as ONE file you can mail,
// AirDrop or drag into a browser with no server and no libs/ folder.
//
// This used to be produced by hand, which is why the committed copy drifted
// weeks behind the source and quietly shipped a build with none of the
// current work in it. It's a script now so it can never be stale by accident.
//
// How it works: three comes from esm.sh (the only network dependency), and
// every local module is inlined as a string, turned into a blob: URL at
// runtime, and has its relative imports rewritten to point at the blob URLs
// of its dependencies. Blob modules still resolve the bare "three" specifier
// through the document's import map, which is why that part just works.
//
// Run: npm run build:preview
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE_CDN = 'https://esm.sh/three@0.185.1';

const read = (p) => readFileSync(join(root, p), 'utf8');

// Top-level js/ only. The runtime resolver addresses modules by bare
// filename, so anything in a subdirectory (js/legacy/) is unreachable by
// design — and nothing live imports it.
const modules = {};
for (const f of readdirSync(join(root, 'js')).sort()) {
  if (f.endsWith('.js')) modules[f] = read(`js/${f}`);
}

// Matches `from './thing.js'`. Written once as raw source so the build-time
// regex and the one baked into the page can't drift apart.
const IMPORT_SRC = String.raw`from\s+(['"])(\.\/[^'"]+)\1`;
const RUNTIME_IMPORT_RE = `/${IMPORT_SRC}/g`;

// Fail loudly rather than emitting a bundle that breaks in the browser.
const IMPORT_RE = new RegExp(IMPORT_SRC, 'g');
const depsOf = (code) => [...code.matchAll(IMPORT_RE)].map((m) => m[2].replace('./', ''));

for (const [name, code] of Object.entries(modules)) {
  for (const dep of depsOf(code)) {
    if (!modules[dep]) throw new Error(`${name} imports ${dep}, which isn't in js/`);
  }
}

// The runtime resolver recurses before it caches, so an import cycle would
// hang the page instead of failing usefully. The graph is acyclic today;
// this is here so that stays true.
(function assertAcyclic() {
  const seen = new Set();
  const stack = new Set();
  const walk = (name, path) => {
    if (stack.has(name)) throw new Error(`import cycle: ${[...path, name].join(' -> ')}`);
    if (seen.has(name)) return;
    seen.add(name);
    stack.add(name);
    for (const dep of depsOf(modules[name])) walk(dep, [...path, name]);
    stack.delete(name);
  };
  for (const name of Object.keys(modules)) walk(name, []);
})();

// --- assemble the page from the real index.html, so the two can't diverge ---
let html = read('index.html');

const replaceOnce = (find, sub, what) => {
  if (!html.includes(find)) throw new Error(`index.html no longer contains ${what}`);
  html = html.replace(find, sub);
};

replaceOnce('<title>Fetch Run</title>', '<title>Fetch Run — preview</title>', 'the title');
replaceOnce(
  '<link rel="stylesheet" href="styles.css">',
  `<style>\n${read('styles.css')}\n</style>`,
  'the stylesheet link'
);
replaceOnce('"three": "./libs/three.module.js"', `"three": "${THREE_CDN}"`, 'the import map');

const loader = `<script>
  const SRC = ${JSON.stringify(modules)};
  const cache = {};
  function resolve(name) {
    if (cache[name]) return cache[name];
    let code = SRC[name];
    if (!code) throw new Error('missing module ' + name);
    code = code.replace(${RUNTIME_IMPORT_RE}, (m, q, rel) => {
      return 'from ' + q + resolve(rel.replace('./', '')) + q;
    });
    const blob = new Blob([code], { type: 'text/javascript' });
    cache[name] = URL.createObjectURL(blob);
    return cache[name];
  }
  import(resolve('main.js')).catch((err) => {
    document.body.insertAdjacentHTML('afterbegin',
      '<pre style="color:#f66;background:#000;padding:12px;white-space:pre-wrap;position:fixed;top:0;left:0;right:0;z-index:9999;font-size:11px;">' +
      (err && err.stack || err) + '</pre>');
    console.error(err);
  });
</script>`;

replaceOnce(
  '<script type="module" src="js/main.js"></script>',
  loader,
  'the module entry point'
);

writeFileSync(join(root, 'fetch-run-preview.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`fetch-run-preview.html — ${Object.keys(modules).length} modules, ${kb} KB`);
