import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(process.cwd(), 'src');
const allowedMutationBoundary = new Set([
  'api/client.ts',
  'services/taskMutationService.ts',
  'stores/TaskStore.ts',
  'stores/taskStore/taskPersistence.ts'
]);
const allowedReadBoundaries = new Set([
  'api/client.ts',
  'components/IssueIframeDialog.tsx',
  'stores/EditMetaStore.ts',
  'stores/TaskStore.ts'
]);
const mutationPattern = /apiClient\.(updateTask|updateTaskFields|createRelation|updateRelation|deleteRelation|deleteTask|bulkCreateSubtasks|saveBaseline)\s*\(/;
const readPattern = /apiClient\.(fetchData|fetchQueries|fetchEditMeta|getSubtaskTrackers)\s*\(/;

const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
};

const violations = [];
for (const file of await filesUnder(root)) {
  const relative = file.slice(`${root}/`.length);
  const source = await readFile(file, 'utf8');
  if (mutationPattern.test(source) && !allowedMutationBoundary.has(relative)) {
    violations.push(`mutation bypass: ${relative}`);
  }
  if (readPattern.test(source) && !allowedReadBoundaries.has(relative)) {
    violations.push(`read bypass: ${relative}`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Async state contract boundaries: passed');
}
