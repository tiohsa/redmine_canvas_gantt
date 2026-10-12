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

// These anchors were published by the root READMEs before they became short
// entry points to the website. Keep them available for links people already
// have, even if the README wording is later tightened.
export const LEGACY_README_HEADINGS = Object.freeze({
  'README.md': Object.freeze([
    'Redmine Canvas Gantt', 'Why this plugin?', 'Key benefits', 'Overview', 'Highlights', 'Demo',
    'Requirements', 'Supported browsers', 'Security and impact', 'Installation', 'Upgrade', 'Uninstall',
    'Usage', 'Work Timer', 'Baseline snapshots', 'Workload, display settings, and export',
    'Shared views, filters, and query parameters', 'Configuration', 'Data payload safety limits',
    'Business calendars', 'Detailed calendars with YAML', 'One global holiday list with CSV',
    'Generate YAML holiday files', 'Reload behavior', 'Compatibility note', 'Docker Quick Start',
    'Start the stack', 'Load initial data', 'Enable Canvas Gantt in a project', 'Stop the stack', 'Development',
  ]),
  'README_ja.md': Object.freeze([
    'Redmine Canvas Gantt', 'このプラグインを選ぶ理由', '主なメリット', '概要', '主な特徴', 'デモ',
    '必要環境', '対応ブラウザ', 'セキュリティと影響', 'インストール', 'アップグレード', 'アンインストール',
    '使い方', '作業タイマー', 'ベースライン snapshot', 'ワークロード、表示設定、出力',
    '共有ビュー、フィルタ、クエリパラメータ', '設定', 'データ payload の安全上限', '業務カレンダー',
    'YAMLで詳細なカレンダーを設定する', 'CSVで全プロジェクト共通の休日一覧を設定する',
    'YAML形式で休日ファイルを生成する', '再読込', '互換性メモ', 'Docker クイックスタート',
    'スタックを起動', '初期データを投入', 'プロジェクトで Canvas Gantt を有効化', 'スタックを停止', '開発',
  ]),
});

function githubSlug(heading) {
  return heading.trim().toLowerCase()
    .replace(/[`*~]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\p{M}_-]/gu, '');
}

function githubHeadingIds(markdown) {
  const clean = stripCode(markdown);
  const headings = [...clean.matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)].map(([, text]) => text);
  const ids = new Set();
  const seen = new Map();
  for (const heading of headings) {
    const base = githubSlug(heading);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    ids.add(count ? `${base}-${count}` : base);
  }
  for (const [, id] of clean.matchAll(/<[a-z][^>]*\bid=["']([^"']+)["'][^>]*>/gi)) ids.add(id);
  return ids;
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

export async function validateSite(siteRoot, options = {}) {
const root = path.resolve(siteRoot);
const repositoryRoot = path.resolve(options.repositoryRoot ?? (path.basename(root) === 'website' ? path.dirname(root) : root));
const checkRootReadmes = options.repositoryRoot !== undefined || path.basename(root) === 'website';
const checkLegacyAnchors = options.checkLegacyAnchors ?? (path.basename(root) === 'website');
const errors = [];
const markdownRenderer = await createMarkdownRenderer(root, {}, '/redmine_canvas_gantt/');

for (const required of ['package.json', 'package-lock.json', '.vitepress/config.ts', 'index.md', 'ja/index.md', 'en/index.md']) {
  if (!await exists(path.join(root, required))) errors.push(`Missing required website file: ${required}`);
}

let config = '';
try { config = await readFile(path.join(root, '.vitepress/config.ts'), 'utf8'); } catch {}
const configuredBase = config.match(/\bbase\s*:\s*['"]([^'"]+)['"]/i)?.[1];
if (config && configuredBase !== '/redmine_canvas_gantt/') {
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
    let cleanPath;
    try { cleanPath = decodeURIComponent(pathname.split('?')[0]); } catch {
      errors.push(`${relative}: target has invalid URL encoding: ${target.href}`);
      continue;
    }
    const isPublicAsset = target.type === 'video' || target.type === 'poster'
      || (configuredBase && cleanPath.startsWith(configuredBase) && path.extname(cleanPath));
    let targetFile = isPublicAsset
      ? resolveLocalTarget(root, file, cleanPath, configuredBase ?? '/')
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

const websiteBase = configuredBase ?? '/';
const websiteHost = 'tiohsa.github.io';
for (const readmeName of checkRootReadmes ? ['README.md', 'README_ja.md'] : []) {
  const readmePath = path.join(repositoryRoot, readmeName);
  if (!await exists(readmePath)) {
    errors.push(`Missing required root README: ${readmeName}`);
    continue;
  }
  const markdown = await readFile(readmePath, 'utf8');
  const locale = readmeName === 'README_ja.md' ? 'ja' : 'en';
  const readmeHeadingIds = githubHeadingIds(markdown);
  if (checkLegacyAnchors) {
    for (const heading of LEGACY_README_HEADINGS[readmeName]) {
      if (!readmeHeadingIds.has(githubSlug(heading))) {
        errors.push(`${readmeName}: legacy GitHub heading anchor is missing: #${githubSlug(heading)}`);
      }
    }
  }
  let hasSourceManual = false;
  let hasSourceLanguageSwitch = false;
  let hasPublishedManual = false;
  let hasPublishedLanguageSwitch = false;
  let hasReadmeLanguageSwitch = false;
  for (const target of parseTargets(markdown)) {
    const href = target.href;
    if (target.type === 'image' && !(target.alt ?? '').trim()) errors.push(`${readmeName}: image is missing alt text (${href}).`);

    let parsedUrl;
    try { parsedUrl = new URL(href); } catch {}
    if (parsedUrl?.hostname === websiteHost) {
      if (!parsedUrl.pathname.startsWith(websiteBase)) {
        errors.push(`${readmeName}: public manual URL must use the configured base ${websiteBase}: ${href}`);
      }
      const publicRemainder = parsedUrl.pathname.slice(websiteBase.length).replace(/^\//, '');
      if (parsedUrl.pathname.startsWith(websiteBase)) {
        const route = publicRemainder.replace(/\/$/, '');
        const localeHome = route.match(/^(ja|en)(?:\/index\.html)?$/);
        if (localeHome) {
          if (parsedUrl.hash) errors.push(`${readmeName}: public manual links must target a locale homepage without a fragment: ${href}`);
          const page = path.join(root, localeHome[1], 'index.md');
          if (!await exists(page)) errors.push(`${readmeName}: public manual page does not exist: ${href}`);
          else if (!parsedUrl.hash) {
            if (localeHome[1] === locale) hasPublishedManual = true;
            else hasPublishedLanguageSwitch = true;
          }
        } else {
          const extension = path.extname(route).toLowerCase();
          const isPublicAsset = extension && !['.html', '.htm', '.md'].includes(extension);
          if (!isPublicAsset) {
            errors.push(`${readmeName}: public manual links must target a locale homepage: ${href}`);
          } else {
            const asset = path.join(root, 'public', route);
            if (!await exists(asset)) errors.push(`${readmeName}: public asset does not exist: ${href}`);
          }
        }
      }
      continue;
    }
    if (parsedUrl?.hostname === 'github.com') {
      const readmeTargetName = parsedUrl.pathname.match(/^\/tiohsa\/redmine_canvas_gantt\/(?:blob\/[^/]+\/)?(README(?:_ja)?\.md)$/i)?.[1];
      if (readmeTargetName) {
        const githubReadme = path.join(repositoryRoot, readmeTargetName);
        if (!await exists(githubReadme)) {
          errors.push(`${readmeName}: README target does not exist: ${href}`);
        } else if (parsedUrl.hash) {
          const targetMarkdown = await readFile(githubReadme, 'utf8');
          if (!githubHeadingIds(targetMarkdown).has(decodeURIComponent(parsedUrl.hash.slice(1)))) {
            errors.push(`${readmeName}: heading anchor does not exist: ${href}`);
          }
        }
        continue;
      }
      const repositoryFile = parsedUrl.pathname.match(/^\/tiohsa\/redmine_canvas_gantt\/blob\/[^/]+\/(.+)$/i)?.[1];
      if (repositoryFile?.startsWith('website/')) {
        const localePage = repositoryFile.match(/^website\/(ja|en)\/index\.md$/);
        const isPublicAsset = repositoryFile.startsWith('website/public/');
        if (!localePage && !isPublicAsset) {
          errors.push(`${readmeName}: GitHub source manual links must target a locale homepage: ${href}`);
        } else if (localePage && parsedUrl.hash) {
          errors.push(`${readmeName}: GitHub source manual links must target a locale homepage without a fragment: ${href}`);
        }
        const target = path.join(repositoryRoot, repositoryFile);
        if (!await exists(target)) errors.push(`${readmeName}: GitHub target does not exist: ${href}`);
        if (localePage && !parsedUrl.hash) {
          if (localePage[1] === locale) hasSourceManual = true;
          else hasSourceLanguageSwitch = true;
        }
      }
      continue;
    }
    if (!localReference(href)) continue;
    const [pathname, fragment = ''] = href.split('#', 2);
    let cleanPath;
    try { cleanPath = decodeURIComponent(pathname.split('?')[0]); } catch {
      errors.push(`${readmeName}: target has invalid URL encoding: ${href}`);
      continue;
    }
    const normalizedPath = path.posix.normalize(cleanPath);
    const websiteRelative = normalizedPath.startsWith('./') ? normalizedPath.slice(2) : normalizedPath;
    const sourceLocalePage = websiteRelative.match(/^website\/(ja|en)\/index\.md$/);
    const isWebsiteAsset = websiteRelative.startsWith('website/public/');
    if (websiteRelative.startsWith('website/') && !isWebsiteAsset) {
      if (!sourceLocalePage || fragment) {
        errors.push(`${readmeName}: source manual links must target a locale homepage without a fragment: ${href}`);
      }
      if (sourceLocalePage && !fragment) {
        if (sourceLocalePage[1] === locale) hasSourceManual = true;
        else hasSourceLanguageSwitch = true;
      }
    }
    if (websiteRelative === (locale === 'ja' ? 'README.md' : 'README_ja.md')) hasReadmeLanguageSwitch = true;
    const targetPath = cleanPath ? path.resolve(repositoryRoot, cleanPath) : readmePath;
    if (!await exists(targetPath)) {
      errors.push(`${readmeName}: ${target.type} target does not exist: ${href}`);
      continue;
    }
    if (fragment && targetPath.endsWith('.md')) {
      const targetMarkdown = await readFile(targetPath, 'utf8');
      const fragmentId = decodeURIComponent(fragment);
      if (!githubHeadingIds(targetMarkdown).has(fragmentId)) errors.push(`${readmeName}: heading anchor does not exist: ${href}`);
    }
  }
  if (!hasSourceManual && !hasPublishedManual) errors.push(`${readmeName}: missing same-language manual link to ${websiteBase}${locale}/ or website/${locale}/index.md.`);
  if (!hasSourceLanguageSwitch && !hasPublishedLanguageSwitch) {
    errors.push(`${readmeName}: missing manual language switch to ${websiteBase}${locale === 'ja' ? 'en' : 'ja'}/ or website/${locale === 'ja' ? 'en' : 'ja'}/index.md.`);
  }
  if (!hasReadmeLanguageSwitch) errors.push(`${readmeName}: missing README language switch to ${locale === 'ja' ? 'README.md' : 'README_ja.md'}.`);
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
    console.log(`Documentation checks passed (${markdownFileCount} Markdown files; root READMEs, locale pages, navigation, links, anchors, images, videos, posters, and markers checked).`);
  }
}
