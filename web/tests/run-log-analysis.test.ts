import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeRunLogText, parseRunSummaryText } from '../src/logging/analysis';
import { analysesToCsv, analysesToMarkdown } from '../src/logging/analysis/report';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures/game-logs');
const load = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

describe('run log analysis', () => {
  it('Web과 Unity fixture를 같은 계약으로 분석한다', () => {
    const web = analyzeRunLogText(load('web-v1.jsonl'), 'web-v1.jsonl');
    const unity = analyzeRunLogText(load('unity-v1.jsonl'), 'unity-v1.jsonl');

    expect(web.valid).toBe(true);
    expect(unity.valid).toBe(true);
    expect(web.projection.build?.target).toBe('web');
    expect(unity.projection.build?.target).toBe('unity');
    expect(web.projection.source).toBe('recorded');
    expect(web.bossEncounters).toEqual([
      expect.objectContaining({ level: 1, killedAt: null, durationSeconds: null }),
    ]);
  });

  it('JSON 오류, 버전, runId 혼합과 seq 역행을 거부한다', () => {
    const lines = load('web-v1.jsonl').trim().split('\n');
    const second = JSON.parse(lines[1]) as Record<string, unknown>;
    second.v = 2;
    const third = JSON.parse(lines[2]) as Record<string, unknown>;
    third.runId = 'another-run';
    third.seq = 4;
    const analysis = analyzeRunLogText([lines[0], '{bad', JSON.stringify(second), JSON.stringify(third)].join('\n'));
    const codes = analysis.issues.map((entry) => entry.code);

    expect(analysis.valid).toBe(false);
    expect(codes).toContain('invalid_json');
    expect(codes).toContain('unsupported_version');
    expect(codes).toContain('mixed_run_id');
    expect(codes).toContain('seq_discontinuity');
  });

  it('미완료 런은 경고와 부분 요약으로 읽는다', () => {
    const [first, spawned] = load('web-v1.jsonl').trim().split('\n');
    const copy = JSON.parse(spawned) as { seq: number; data: { source: string } };
    copy.seq = 3;
    copy.data.source = 'copy';
    const analysis = analyzeRunLogText([first, spawned, JSON.stringify(copy)].join('\n'), 'partial.jsonl');

    expect(analysis.valid).toBe(true);
    expect(analysis.projection.complete).toBe(false);
    expect(analysis.projection.source).toBe('partial');
    expect(analysis.projection.unitsSpawned).toBe(1);
    expect(analysis.issues).toContainEqual(expect.objectContaining({ code: 'incomplete_run', severity: 'warning' }));
  });

  it('별도 summary와 run_finished의 핵심 필드 불일치를 거부한다', () => {
    const text = load('unity-v1.jsonl');
    const embedded = JSON.parse(text.trim().split('\n').at(-1)!) as {
      data: { summary: Record<string, unknown> };
    };
    const external = { ...embedded.data.summary, score: 999 };
    const parsed = parseRunSummaryText(JSON.stringify(external), 'summary.json');
    expect(parsed.summary).not.toBeNull();

    const analysis = analyzeRunLogText(text, 'unity-v1.jsonl', parsed.summary);
    expect(analysis.valid).toBe(false);
    expect(analysis.issues).toContainEqual(expect.objectContaining({ code: 'external_summary_mismatch' }));
  });

  it('CLI와 viewer가 사용할 CSV·Markdown을 같은 projection에서 만든다', () => {
    const analyses = [
      analyzeRunLogText(load('web-v1.jsonl'), 'web-v1.jsonl'),
      analyzeRunLogText(load('unity-v1.jsonl'), 'unity-v1.jsonl'),
    ];
    const csv = analysesToCsv(analyses);
    const markdown = analysesToMarkdown(analyses);

    expect(csv).toContain('fixture-web-v1');
    expect(csv).toContain('fixture-unity-v1');
    expect(markdown).toContain('# 게임 런 분석');
    expect(markdown).toContain('unity-fi');
  });
});
