import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateSite } from '../scripts/check-docs.mjs';
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
