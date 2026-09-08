const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'dist');
const envPath = path.join(root, '.env');
let envApi = '';
if (fs.existsSync(envPath)) {
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find(x => x.startsWith('VITE_API_BASE_URL='));
  envApi = line ? line.slice('VITE_API_BASE_URL='.length).trim() : '';
}
const apiBase = (process.env.VITE_API_BASE_URL || envApi || 'http://localhost:4000/api').replace(/\/$/, '');

fs.rmSync(out, { recursive: true, force: true });
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'build.js' || entry.name === '.env' || entry.name === '.env.sample') continue;
    const from = path.join(src, entry.name), to = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(from, to) : fs.copyFileSync(from, to);
  }
}
copyDir(root, out);
const appPath = path.join(out, 'app.js');
fs.writeFileSync(appPath, fs.readFileSync(appPath, 'utf8').replace('__API_BASE_URL__', apiBase));
console.log(`Frontend built with API: ${apiBase}`);
