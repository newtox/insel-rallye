import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const out = 'dist/web';
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const common = { entryPoints: ['client/src/main.js'], bundle: true, minify: true, target: ['es2020'], legalComments: 'none', logLevel: 'warning' };

await build({ ...common, format: 'esm', outfile: path.join(out, 'app.js') });
fs.copyFileSync('client/index.html', path.join(out, 'index.html'));
fs.copyFileSync('client/style.css', path.join(out, 'style.css'));

const iife = await build({ ...common, format: 'iife', write: false });
const js = iife.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('client/style.css', 'utf8');
const html = fs.readFileSync('client/index.html', 'utf8')
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="app.js"></script>', () => `<script>${js}</script>`);
fs.writeFileSync(path.join(out, 'offline.html'), html);
fs.writeFileSync('dist/insel-rallye-offline.html', html);
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log('web:', kb(path.join(out, 'app.js')), ' offline:', kb('dist/insel-rallye-offline.html'));
