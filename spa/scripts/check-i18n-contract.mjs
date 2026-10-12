import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? sourceFiles(join(directory, entry.name))
        : /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [join(directory, entry.name)] : []);

// Check the boundary between SPA calls, the Rails payload, and both locale files.
describe('frontend translation contract', () => {
    it('publishes every literal translation key used by production SPA code', () => {
        const controller = readFileSync(join(root, 'app/controllers/canvas_gantts_controller.rb'), 'utf8');
        const labels = controller.split('I18N_LABELS = {')[1].split('}.freeze')[0];
        const mappings = new Map([...labels.matchAll(/^\s*(\w+):\s*:(\w+)/gm)]
            .map(match => [match[1], match[2]]));
        const missing = [];
        for (const file of sourceFiles(join(root, 'spa/src'))) {
            const source = readFileSync(file, 'utf8');
            for (const match of source.matchAll(/(?:i18n\.t|\btr)\(['"]([^'"]+)/g)) {
                if (!mappings.has(match[1])) missing.push(`${file}: ${match[1]}`);
            }
        }
        assert.deepEqual(missing, []);
        for (const locale of ['ja', 'en']) {
            const source = readFileSync(join(root, `config/locales/${locale}.yml`), 'utf8');
            const keys = new Set([...source.matchAll(/^    (\w+):\s*\S/gm)].map(match => match[1]));
            assert.deepEqual([...mappings.values()].filter(key => !keys.has(key)), [], locale);
        }
    });
});
