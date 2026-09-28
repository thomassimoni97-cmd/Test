// Builds the single-file Claude-artifact edition → artifact/dist/retail-control-center.html
// Same pages and components as the Next.js app; routing in memory, data in the artifact's private store.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'artifact', 'dist');
mkdirSync(out, { recursive: true });

execSync(`npx tailwindcss -i src/app/globals.css -o artifact/dist/app.css --minify`, { cwd: root, stdio: 'inherit' });

const aliases = {
  'next/link': 'src/artifact/shims/link.tsx',
  'next/navigation': 'src/artifact/shims/navigation.ts',
  '@/lib/client/api': 'src/artifact/api-browser.ts',
  exceljs: 'src/artifact/shims/exceljs.ts',
};
const aliasPlugin = {
  name: 'aliases',
  setup(b) {
    b.onResolve({ filter: /^(next\/link|next\/navigation|@\/lib\/client\/api|exceljs)$/ }, (args) => {
      if (args.path === 'exceljs' && args.importer.includes('shims/exceljs')) return undefined;
      return { path: path.join(root, aliases[args.path]) };
    });
    b.onResolve({ filter: /^\.\/api$/ }, (args) => (args.importer.includes(path.join('src', 'lib', 'client')) ? { path: path.join(root, aliases['@/lib/client/api']) } : undefined));
    b.onResolve({ filter: /^exceljs\/dist\/exceljs\.min\.js$/ }, () => ({ path: path.join(root, 'node_modules/exceljs/dist/exceljs.min.js') }));
  },
};

const res = await build({
  entryPoints: [path.join(root, 'src/artifact/main.tsx')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: ['es2020'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  tsconfig: path.join(root, 'tsconfig.json'),
  plugins: [aliasPlugin],
  logLevel: 'error',
  logOverride: { 'unsupported-dynamic-import': 'silent' },
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(path.join(out, 'app.css'), 'utf8').replace(/<\/style/gi, '<\\/style');

const html = `<title>Retail Opening Control Center</title>
<meta name="description" content="Golden Goose Retail Opening Program — SAL control center">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600;700&display=swap">
<style>
/* Deliberate single light theme (Golden Goose ivory); every surface paints its own colour. */
html,body{height:100%;background:#FAF8F4;color:#231D19;color-scheme:light}
${css}
</style>
<div id="root"></div>
<script>${js}</script>
`;
const file = path.join(out, 'retail-control-center.html');
writeFileSync(file, html);
console.log(`${path.relative(root, file)}  ${(html.length / 1024 / 1024).toFixed(2)} MB`);
