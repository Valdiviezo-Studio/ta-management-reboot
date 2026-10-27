import { cp, mkdir, readdir, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// The static homepage previously published its repository root. Keep server sources,
// secrets, documentation and integration manifests outside the new publish directory.
const root = resolve(process.cwd());
const target = join(root, 'dist');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
const folders = ['images', 'jobAd', 'karriere', 'candidate-portal'];
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && (/\.(html|ico|webmanifest)$/.test(entry.name) || ['_redirects', '_headers', 'robots.txt', 'sitemap.xml'].includes(entry.name))) await cp(join(root, entry.name), join(target, entry.name));
}
for (const folder of folders) {
  const source = join(root, folder);
  try { if (!(await stat(source)).isDirectory()) continue; } catch { continue; }
  await cp(source, join(target, folder), { recursive: true, filter: path => {
    const name = path.split('/').pop();
    return !name.startsWith('.') && !['node_modules', 'server', 'integration', 'functions', 'README.md'].includes(name) && !/\.(mjs|cjs|ts|sql|toml|md)$/.test(name);
  } });
}
// Do not index the newly generated, not-yet-approved job pages.
const previous = await readFile(join(target, '_headers'), 'utf8').catch(() => '');
await writeFile(join(target, '_headers'), `${previous}\n${await readFile(join(root, 'jarvis-integration', 'landingpages-headers.txt'), 'utf8')}`);
