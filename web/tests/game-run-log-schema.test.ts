import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SCHEMA_PATH = path.join(ROOT, 'schemas/game-run-log/v1.schema.json');
const EXAMPLE_PATH = path.join(ROOT, 'schemas/game-run-log/examples/minimal-run-v1.jsonl');

describe('game run log schema v1', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')) as object;
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

  it('대표 JSONL의 모든 이벤트를 검증한다', () => {
    const events = fs
      .readFileSync(EXAMPLE_PATH, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as unknown);

    for (const event of events) {
      expect(validate(event), JSON.stringify(validate.errors, null, 2)).toBe(true);
    }
  });

  it('알 수 없는 이벤트와 payload 누락을 거부한다', () => {
    const invalid = {
      v: 1,
      runId: 'bad',
      seq: 1,
      elapsedSeconds: 0,
      round: 0,
      roundTime: 0,
      score: 0,
      type: 'unknown_event',
      data: {},
    };

    expect(validate(invalid)).toBe(false);
  });
});
