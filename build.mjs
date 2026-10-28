import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const buildId = new Date().toISOString().slice(0, 16).replace('T', ' ');
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);

const out = 'dist/web';
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const common = { entryPoints: ['client/src/main.js'], bundle: true, minify: true, target: ['es2020'], legalComments: 'none', logLevel: 'warning', define: { __BUILD_ID__: JSON.stringify(buildId) } };

const esm = await build({ ...common, format: 'esm', write: false });
const appJs = esm.outputFiles[0].text;
const styleCss = fs.readFileSync('client/style.css', 'utf8');
const appName = `app.${hash(appJs)}.js`;
const cssName = `style.${hash(styleCss)}.css`;
fs.writeFileSync(path.join(out, appName), appJs);
fs.writeFileSync(path.join(out, cssName), styleCss);
fs.writeFileSync(
  path.join(out, 'index.html'),
  fs.readFileSync('client/index.html', 'utf8').replace('href="style.css"', `href="${cssName}"`).replace('src="app.js"', `src="${appName}"`)
);

const iife = await build({ ...common, format: 'iife', write: false });
const js = iife.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('client/style.css', 'utf8');
const html = fs.readFileSync('client/index.html', 'utf8')
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="app.js"></script>', () => `<script>${js}</script>`);
fs.writeFileSync(path.join(out, 'offline.html'), html);
fs.writeFileSync('dist/insel-rallye-offline.html', html);
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log('build', buildId, appName, kb(path.join(out, appName)), ' offline:', kb('dist/insel-rallye-offline.html'));
