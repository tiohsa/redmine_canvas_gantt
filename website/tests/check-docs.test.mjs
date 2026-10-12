import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LEGACY_README_HEADINGS, validateSite } from '../scripts/check-docs.mjs';
import test from 'node:test';

test('documentation checker catches broken pages, anchors, images, locale parity, and navigation', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'canvas-gantt-docs-check-'));
  try {
    await mkdir(path.join(fixture, '.vitepress'), { recursive: true });
    await mkdir(path.join(fixture, 'ja', 'guide'), { recursive: true });
    await mkdir(path.join(fixture, 'en', 'guide'), { recursive: true });
    await writeFile(path.join(fixture, 'package.json'), '{}');
    await writeFile(path.join(fixture, 'package-lock.json'), '{}');
    await writeFile(path.join(fixture, '.vitepress', 'config.ts'), [
      "export default { base: '/redmine_canvas_gantt/', themeConfig: { nav: [{ link: '/en/missing' }] } }",
    ].join('\n'));
    await writeFile(path.join(fixture, 'index.md'), '# Manual');
    await writeFile(path.join(fixture, 'ja', 'index.md'), '# 日本語');
    await writeFile(path.join(fixture, 'en', 'index.md'), '# English');
    await writeFile(path.join(fixture, 'ja', 'guide', 'entry.md'), [
      '# Entry',
      '[Missing page](./missing)',
      '[Missing anchor](./entry#no-such-anchor)',
      '![Missing image](/images/missing.svg)',
      '<video poster="/images/missing-poster.svg"><source src="/redmine_canvas_gantt/videos/missing.mp4" type="video/mp4"></video>',
      '[English counterpart](/en/guide/extra)',
    ].join('\n'));
    await writeFile(path.join(fixture, 'en', 'guide', 'entry.md'), '# Entry');
    await writeFile(path.join(fixture, 'ja', 'guide', 'extra.md'), '# Extra');

    const { errors } = await validateSite(fixture);
    const output = errors.join('\n');
    assert.match(output, /target does not exist: \.\/missing/);
    assert.match(output, /heading anchor does not exist: \.\/entry#no-such-anchor/);
    assert.match(output, /image target does not exist: \/images\/missing\.svg/);
    assert.match(output, /video target does not exist: \/redmine_canvas_gantt\/videos\/missing\.mp4/);
    assert.match(output, /poster target does not exist: \/images\/missing-poster\.svg/);
    assert.match(output, /Locale page missing: en\/guide\/extra/);
    assert.match(output, /Navigation target does not exist: \/en\/missing/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('documentation checker accepts VitePress heading IDs and existing public images', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'canvas-gantt-docs-valid-'));
  try {
    await mkdir(path.join(fixture, '.vitepress'), { recursive: true });
    await mkdir(path.join(fixture, 'ja', 'guide'), { recursive: true });
    await mkdir(path.join(fixture, 'en', 'guide'), { recursive: true });
    await mkdir(path.join(fixture, 'public', 'images'), { recursive: true });
    await mkdir(path.join(fixture, 'public', 'videos'), { recursive: true });
    await writeFile(path.join(fixture, 'package.json'), JSON.stringify({
      engines: { node: '>=22' },
      scripts: { 'docs:build': 'vitepress build', check: 'node check', 'test:smoke': 'playwright test' },
    }));
    await writeFile(path.join(fixture, 'package-lock.json'), '{}');
    await writeFile(path.join(fixture, '.vitepress', 'config.ts'), [
      "export default { base: '/redmine_canvas_gantt/', search: { provider: 'local' }, locales: { ja: {}, en: {} },",
      "themeConfig: { nav: [{ link: '/ja/' }, { link: '/en/' }] } }",
    ].join('\n'));
    await writeFile(path.join(fixture, 'index.md'), '# Manual');
    await writeFile(path.join(fixture, 'ja', 'index.md'), '# 日本語');
    await writeFile(path.join(fixture, 'en', 'index.md'), '# English');
    await writeFile(path.join(fixture, 'ja', 'guide', 'entry.md'), [
      '# Entry',
      '[Punctuation](./headings#date-only)',
      '[Explicit ID](./headings#custom)',
      '[HTML anchor](./headings#legacy-anchor)',
      '![Existing image](/images/check.svg)',
      '<video controls preload="metadata" poster="/images/poster.svg"><source src="/redmine_canvas_gantt/videos/check.mp4" type="video/mp4"></video>',
    ].join('\n'));
    await writeFile(path.join(fixture, 'en', 'guide', 'entry.md'), '# Entry');
    await writeFile(path.join(fixture, 'ja', 'guide', 'headings.md'), [
      '# Date-only',
      '## Custom title {#custom}',
      '<a id="legacy-anchor"></a>',
    ].join('\n'));
    await writeFile(path.join(fixture, 'en', 'guide', 'headings.md'), '# Date-only');
    await writeFile(path.join(fixture, 'public', 'images', 'check.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(path.join(fixture, 'public', 'images', 'poster.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(path.join(fixture, 'public', 'videos', 'check.mp4'), 'fixture video');

    const { errors } = await validateSite(fixture);
    assert.deepEqual(errors, []);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('documentation checker validates root README links, locale manuals, public base, and legacy GitHub anchors', async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), 'canvas-gantt-readme-check-'));
  const site = path.join(repository, 'website');
  const englishReadme = [
    '> Manual: [English](https://tiohsa.github.io/redmine_canvas_gantt/en/) | [日本語](https://tiohsa.github.io/redmine_canvas_gantt/ja/)',
    '[Source manual](website/en/index.md)',
    '[GitHub source manual](https://github.com/tiohsa/redmine_canvas_gantt/blob/main/website/en/index.md)',
    '[Japanese source manual](website/ja/index.md)',
    '[Japanese published manual](https://tiohsa.github.io/redmine_canvas_gantt/ja/index.html)',
    '[Legacy Japanese heading](README_ja.md#docker-クイックスタート)',
    '[Published legacy heading](https://github.com/tiohsa/redmine_canvas_gantt/blob/main/README.md#installation)',
    '[Duplicate heading](README.md#duplicate-1)',
    '[Underscore heading](README.md#foo_bar)',
    '[Explicit HTML id](README.md#custom-section)',
    '![Architecture](website/public/images/architecture.svg)',
    '[GitHub architecture asset](https://github.com/tiohsa/redmine_canvas_gantt/blob/main/website/public/images/architecture.svg)',
    '[Demo video](https://tiohsa.github.io/redmine_canvas_gantt/videos/demo.mp4)',
    '## Development',
    '## Duplicate',
    '## Duplicate',
    '<a id="custom-section"></a>',
    '## foo_bar',
  ].join('\n');
  const japaneseReadme = [
    '> マニュアル: [日本語](https://tiohsa.github.io/redmine_canvas_gantt/ja/) | [English](https://tiohsa.github.io/redmine_canvas_gantt/en/)',
    '[原稿](website/ja/index.md)',
    '[English source manual](website/en/index.md)',
    '[English README](README.md#development)',
    '## Docker クイックスタート',
  ].join('\n');
  const fullEnglishReadme = `${englishReadme}\n${LEGACY_README_HEADINGS['README.md'].map((heading, index) => `${index === 0 ? '#' : '##'} ${heading}`).join('\n')}`;
  const fullJapaneseReadme = `${japaneseReadme}\n${LEGACY_README_HEADINGS['README_ja.md'].map((heading, index) => `${index === 0 ? '#' : '##'} ${heading}`).join('\n')}`;
  try {
    await mkdir(path.join(site, '.vitepress'), { recursive: true });
    await mkdir(path.join(site, 'ja', 'features'), { recursive: true });
    await mkdir(path.join(site, 'en', 'features'), { recursive: true });
    await mkdir(path.join(site, 'public', 'images'), { recursive: true });
    await mkdir(path.join(site, 'public', 'videos'), { recursive: true });
    await writeFile(path.join(site, 'package.json'), JSON.stringify({
      engines: { node: '>=22' },
      scripts: { 'docs:build': 'vitepress build', check: 'node check', 'test:smoke': 'playwright test' },
    }));
    await writeFile(path.join(site, 'package-lock.json'), '{}');
    await writeFile(path.join(site, '.vitepress', 'config.ts'), [
      "export default { base: '/redmine_canvas_gantt/', search: { provider: 'local' }, locales: { ja: {}, en: {} } }",
    ].join('\n'));
    await writeFile(path.join(site, 'index.md'), '# Manual');
    await writeFile(path.join(site, 'ja', 'index.md'), '# 日本語');
    await writeFile(path.join(site, 'en', 'index.md'), '# English');
    await writeFile(path.join(site, 'ja', 'features', 'hierarchy.md'), '# 階層');
    await writeFile(path.join(site, 'en', 'features', 'hierarchy.md'), '# Hierarchy\n## Custom ID {#custom}');
    await writeFile(path.join(site, 'public', 'images', 'architecture.svg'), '<svg/>');
    await writeFile(path.join(site, 'public', 'videos', 'demo.mp4'), 'fixture video');
    await writeFile(path.join(repository, 'README.md'), fullEnglishReadme);
    await writeFile(path.join(repository, 'README_ja.md'), fullJapaneseReadme);

    assert.deepEqual((await validateSite(site, { repositoryRoot: repository })).errors, []);

    const publishedOnlyEnglish = fullEnglishReadme
      .replace('[Source manual](website/en/index.md)\n', '')
      .replace('[GitHub source manual](https://github.com/tiohsa/redmine_canvas_gantt/blob/main/website/en/index.md)\n', '')
      .replace('[Japanese source manual](website/ja/index.md)\n', '');
    await writeFile(path.join(repository, 'README.md'), publishedOnlyEnglish);
    assert.deepEqual((await validateSite(site, { repositoryRoot: repository })).errors, []);
    await writeFile(path.join(repository, 'README.md'), fullEnglishReadme);

    const withoutInstallation = fullEnglishReadme.replace('## Installation\n', '');
    await writeFile(path.join(repository, 'README.md'), withoutInstallation);
    let errors = (await validateSite(site, { repositoryRoot: repository })).errors.join('\n');
    assert.match(errors, /legacy GitHub heading anchor is missing: #installation/);
    await writeFile(path.join(repository, 'README.md'), fullEnglishReadme);

    await rm(path.join(site, 'en', 'features', 'hierarchy.md'));
    errors = (await validateSite(site, { repositoryRoot: repository, checkLegacyAnchors: false })).errors.join('\n');
    assert.match(errors, /Locale page missing: en\/features\/hierarchy\.md/);
    await writeFile(path.join(site, 'en', 'features', 'hierarchy.md'), '# Hierarchy\n## Custom ID {#custom}');

    await writeFile(path.join(repository, 'README.md'), `${fullEnglishReadme}\n[Broken relative link](./missing.md)`);
    errors = (await validateSite(site, { repositoryRoot: repository, checkLegacyAnchors: false })).errors.join('\n');
    assert.match(errors, /target does not exist: \.\/missing\.md/);

    await writeFile(path.join(repository, 'README.md'), `${fullEnglishReadme}\n![Missing image](website/public/images/missing.svg)`);
    errors = (await validateSite(site, { repositoryRoot: repository, checkLegacyAnchors: false })).errors.join('\n');
    assert.match(errors, /image target does not exist: website\/public\/images\/missing\.svg/);

    await writeFile(path.join(repository, 'README.md'), fullEnglishReadme.replace('/redmine_canvas_gantt/en/', '/wrong-base/en/'));
    errors = (await validateSite(site, { repositoryRoot: repository, checkLegacyAnchors: false })).errors.join('\n');
    assert.match(errors, /public manual URL must use the configured base/);

    await writeFile(path.join(repository, 'README.md'), fullEnglishReadme.replace('README_ja.md#docker-クイックスタート', 'README_ja.md#missing-heading'));
    errors = (await validateSite(site, { repositoryRoot: repository, checkLegacyAnchors: false })).errors.join('\n');
    assert.match(errors, /heading anchor does not exist: README_ja\.md#missing-heading/);

    for (const [readmeName, content, deepLink, forbiddenMessage] of [
      ['README.md', fullEnglishReadme, '[Deep source link](website/en/features/hierarchy.md)', /source manual links must target a locale homepage/],
      ['README.md', fullEnglishReadme, '[GitHub deep source link](https://github.com/tiohsa/redmine_canvas_gantt/blob/main/website/en/features/hierarchy.md)', /GitHub source manual links must target a locale homepage/],
      ['README.md', fullEnglishReadme, '[Deep published link](https://tiohsa.github.io/redmine_canvas_gantt/en/features/hierarchy)', /public manual links must target a locale homepage/],
      ['README_ja.md', fullJapaneseReadme, '[深い原稿リンク](website/ja/features/hierarchy.md)', /source manual links must target a locale homepage/],
      ['README_ja.md', fullJapaneseReadme, '[GitHub deep source link](https://github.com/tiohsa/redmine_canvas_gantt/blob/main/website/ja/features/hierarchy.md)', /GitHub source manual links must target a locale homepage/],
      ['README_ja.md', fullJapaneseReadme, '[深い公開リンク](https://tiohsa.github.io/redmine_canvas_gantt/ja/features/hierarchy)', /public manual links must target a locale homepage/],
      ['README.md', fullEnglishReadme, '[Top fragment](website/en/index.md#manual)', /source manual links must target a locale homepage without a fragment/],
      ['README.md', fullEnglishReadme, '[Published fragment](https://tiohsa.github.io/redmine_canvas_gantt/en/#manual)', /public manual links must target a locale homepage without a fragment/],
    ]) {
      await writeFile(path.join(repository, readmeName), `${content}\n${deepLink}`);
      errors = (await validateSite(site, { repositoryRoot: repository, checkLegacyAnchors: false })).errors.join('\n');
      assert.match(errors, forbiddenMessage);
    }

    const noJapaneseSwitch = fullEnglishReadme
      .replace(' | [日本語](https://tiohsa.github.io/redmine_canvas_gantt/ja/)', '')
      .replace('[Japanese published manual](https://tiohsa.github.io/redmine_canvas_gantt/ja/index.html)\n', '')
      .replace('[Japanese source manual](website/ja/index.md)\n', '');
    await writeFile(path.join(repository, 'README.md'), noJapaneseSwitch);
    errors = (await validateSite(site, { repositoryRoot: repository, checkLegacyAnchors: false })).errors.join('\n');
    assert.match(errors, /missing manual language switch to/);

    await writeFile(path.join(repository, 'README.md'), fullEnglishReadme.replace('[Legacy Japanese heading](README_ja.md#docker-クイックスタート)\n', ''));
    errors = (await validateSite(site, { repositoryRoot: repository })).errors.join('\n');
    assert.match(errors, /missing README language switch to README_ja\.md/);
    await writeFile(path.join(repository, 'README.md'), fullEnglishReadme);

    await rm(path.join(repository, 'README_ja.md'));
    errors = (await validateSite(site, { repositoryRoot: repository })).errors.join('\n');
    assert.match(errors, /Missing required root README: README_ja\.md/);
    await writeFile(path.join(repository, 'README_ja.md'), fullJapaneseReadme);

    await rm(path.join(site, 'en', 'index.md'));
    errors = (await validateSite(site, { repositoryRoot: repository, checkLegacyAnchors: false })).errors.join('\n');
    assert.match(errors, /Missing required website file: en\/index\.md/);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});
