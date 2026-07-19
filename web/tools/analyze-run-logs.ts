import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { analyzeRunLogText } from '../src/logging/analysis';
import { analysesToCsv, analysesToMarkdown } from '../src/logging/analysis/report';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outputDirectory = resolve(outIndex >= 0 ? args[outIndex + 1] ?? '' : './run-report');
const inputs = args.filter((argument, index) => argument !== '--out' && index !== outIndex + 1);

if (inputs.length === 0) {
  console.error('사용법: npm run logs:analyze -- <events.jsonl...> --out <directory>');
  process.exit(2);
}

const analyses = inputs.map((input) => {
  const path = resolve(input);
  return analyzeRunLogText(readFileSync(path, 'utf8'), basename(path));
});

for (const analysis of analyses) {
  for (const entry of analysis.issues) {
    const location = entry.line ? `:${entry.line}` : entry.seq ? ` seq=${entry.seq}` : '';
    console.error(`${entry.severity.toUpperCase()} ${analysis.sourceName}${location} [${entry.code}] ${entry.message}`);
  }
}

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, 'runs.csv'), analysesToCsv(analyses));
writeFileSync(resolve(outputDirectory, 'runs.md'), analysesToMarkdown(analyses));
console.log(`${analyses.length}개 런 → ${outputDirectory}`);

if (analyses.some((analysis) => !analysis.valid)) process.exitCode = 1;
