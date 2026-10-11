import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMarkdownRenderer } from 'vitepress';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.vitepress') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

async function exists(file) {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

function headingIds(html) {
  return new Set([...html.matchAll(/<(?:h[1-6]|a)\b[^>]*\bid=["']([^"']+)["']/gi)].map(([, id]) => id));
}

function stripCode(markdown) {
  return markdown.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1.*$/gm, '');
}

function parseTargets(markdown) {
  const clean = stripCode(markdown);
  const targets = [];
  for (const match of clean.matchAll(/!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g)) {
    targets.push({ type: 'image', alt: match[1], href: match[2] ?? match[3] });
  }
  for (const match of clean.matchAll(/(?<!!)\[([^\]]+)\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g)) {
    targets.push({ type: 'link', alt: match[1], href: match[2] ?? match[3] });
  }
  for (const match of clean.matchAll(/<img\b([^>]+)>/gi)) {
    const src = match[1].match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const alt = match[1].match(/\balt=["']([^"']*)["']/i)?.[1];
    if (src) targets.push({ type: 'image', alt: alt ?? '', href: src });
  }
  for (const match of clean.matchAll(/<(video|source)\b([^>]+)>/gi)) {
    const element = match[1].toLowerCase();
    const attributes = match[2];
    const src = attributes.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = src?.[1] ?? src?.[2] ?? src?.[3];
    if (href) targets.push({ type: 'video', href });
    if (element === 'video') {
      const poster = attributes.match(/\bposter\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const posterHref = poster?.[1] ?? poster?.[2] ?? poster?.[3];
      if (posterHref) targets.push({ type: 'poster', href: posterHref });
    }
  }
  return targets;
}

function localReference(href) {
  return !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href);
}

function resolvePage(root, fromFile, pathname) {
  let target = pathname.startsWith('/') ? path.join(root, pathname) : path.resolve(path.dirname(fromFile), pathname);
  if (path.extname(target)) return target;
  return target;
}

function resolveLocalTarget(root, fromFile, pathname, base) {
  const basePath = base.replace(/^\//, '').replace(/\/$/, '');
  const withoutBase = pathname.replace(new RegExp(`^/${basePath}/`), '/');
  const target = resolvePage(root, fromFile, withoutBase);
  if (pathname.startsWith('/') && !target.startsWith(path.join(root, 'public') + path.sep)) {
    const publicTarget = path.join(root, 'public', withoutBase.replace(/^\//, ''));
    return publicTarget;
  }
  return target;
}

export async function validateSite(siteRoot) {
const root = path.resolve(siteRoot);
const errors = [];
const markdownRenderer = await createMarkdownRenderer(root, {}, '/redmine_canvas_gantt/');

for (const required of ['package.json', 'package-lock.json', '.vitepress/config.ts', 'index.md', 'ja/index.md', 'en/index.md']) {
  if (!await exists(path.join(root, required))) errors.push(`Missing required website file: ${required}`);
}

let config = '';
try { config = await readFile(path.join(root, '.vitepress/config.ts'), 'utf8'); } catch {}
if (config && !/base\s*:\s*['"]\/redmine_canvas_gantt\/['"]/.test(config)) {
  errors.push('VitePress config must set base to /redmine_canvas_gantt/.');
}
if (config && !/provider\s*:\s*['"]local['"]/.test(config)) errors.push('VitePress config must enable local search.');
if (config && (!/\bja\s*:\s*\{/.test(config) || !/\ben\s*:\s*\{/.test(config))) {
  errors.push('VitePress config must define both ja and en locales.');
}

try {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (!/^>=\s*22(?:\.|$)/.test(packageJson.engines?.node ?? '')) errors.push('website/package.json must require Node.js 22 or newer.');
  for (const script of ['docs:build', 'check', 'test:smoke']) {
    if (!packageJson.scripts?.[script]) errors.push(`website/package.json must define the ${script} script.`);
  }
} catch (error) {
  errors.push(`website/package.json is not valid JSON: ${error.message}`);
}

const files = (await walk(root)).filter(file => {
  const relative = path.relative(root, file).split(path.sep).join('/');
  return file.endsWith('.md') && (relative === 'index.md' || /^(?:ja|en)\//.test(relative));
});
const pagesByLocale = { ja: new Set(), en: new Set() };
for (const file of files) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const localeMatch = relative.match(/^(ja|en)\/(.+\.md)$/);
  if (localeMatch) pagesByLocale[localeMatch[1]].add(localeMatch[2]);
  const markdown = await readFile(file, 'utf8');
  if (/(?:\b(?:TODO\s*\(?\s*(?:translate|translation)|TRANSLATION\s+(?:TODO|NEEDED)|UNTRANSLATED)\b|未翻訳|翻訳中)/i.test(markdown)) {
    errors.push(`${relative}: contains an unfinished translation marker.`);
  }
  for (const target of parseTargets(markdown)) {
    if (target.type === 'image' && !(target.alt ?? '').trim()) errors.push(`${relative}: image is missing alt text (${target.href}).`);
    if (!localReference(target.href)) continue;
    const [pathname, fragment = ''] = target.href.split('#', 2);
    const cleanPath = decodeURIComponent(pathname.split('?')[0]);
    const isPublicAsset = target.type === 'video' || target.type === 'poster'
      || (cleanPath.startsWith('/redmine_canvas_gantt/') && path.extname(cleanPath));
    let targetFile = isPublicAsset
      ? resolveLocalTarget(root, file, cleanPath, '/redmine_canvas_gantt/')
      : (cleanPath ? resolvePage(root, file, cleanPath) : file);
    if (!isPublicAsset && !await exists(targetFile) && cleanPath.startsWith('/')) {
      const publicTarget = path.join(root, 'public', cleanPath);
      if (await exists(publicTarget)) targetFile = publicTarget;
    }
    if (!path.extname(targetFile) && !await exists(targetFile)) {
      if (await exists(`${targetFile}.md`)) targetFile = `${targetFile}.md`;
      else targetFile = path.join(targetFile, 'index.md');
    }
    if (!await exists(targetFile)) {
      const description = target.type === 'poster' ? 'poster' : target.type === 'video' ? 'video' : target.type;
      errors.push(`${relative}: ${description} target does not exist: ${target.href}`);
      continue;
    }
    if (fragment && targetFile.endsWith('.md')) {
      const targetMarkdown = await readFile(targetFile, 'utf8');
      if (!headingIds(markdownRenderer.render(targetMarkdown)).has(decodeURIComponent(fragment))) {
        errors.push(`${relative}: heading anchor does not exist: ${target.href}`);
      }
    }
  }
}

for (const locale of ['ja', 'en']) {
  for (const page of pagesByLocale[locale === 'ja' ? 'en' : 'ja']) {
    if (!pagesByLocale[locale].has(page)) errors.push(`Locale page missing: ${locale}/${page}`);
  }
}

// Check literal local page references in VitePress navigation/sidebar config too.
for (const [, href] of config.matchAll(/(?:link|text)\s*:\s*['"]([^'"]+)['"]/g)) {
  if (!/^\/(?:ja|en)\//.test(href)) continue;
  const candidate = href.endsWith('/') ? path.join(root, href, 'index.md') : path.join(root, `${href}.md`);
  if (!await exists(candidate)) errors.push(`Navigation target does not exist: ${href}`);
}

return { errors, markdownFileCount: files.length };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const root = path.resolve(process.env.DOCS_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const { errors, markdownFileCount } = await validateSite(root);
  if (errors.length) {
    console.error(`Documentation checks failed (${errors.length}):\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log(`Documentation checks passed (${markdownFileCount} Markdown files; locale pages, navigation, links, anchors, images, videos, posters, and markers checked).`);
  }
}
