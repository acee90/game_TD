import { eventDescription, type RunAnalysis } from './index';

const cell = (value: string | number | boolean | null): string => {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function analysesToCsv(analyses: readonly RunAnalysis[]): string {
  const header = [
    'runId', 'source', 'target', 'gitSha', 'seed', 'complete', 'finishReason', 'score', 'round',
    'elapsedSeconds', 'kills', 'bossCleared', 'bossesKilled', 'heroLevel', 'heroXpPurchases',
    'unitsSpawned', 'merges', 'towersSold', 'godRerolls', 'errors', 'warnings',
  ];
  const rows = analyses.map(({ projection: run, issues, sourceName }) => [
    run.runId,
    sourceName,
    run.build?.target ?? '',
    run.build?.gitSha ?? '',
    run.seed,
    run.complete,
    run.finishReason,
    run.score,
    run.round,
    run.elapsedSeconds.toFixed(3),
    run.kills,
    run.bossCleared,
    run.bossesKilled,
    run.heroLevel,
    run.heroXpPurchases,
    run.unitsSpawned,
    run.merges,
    run.towersSold,
    run.godRerolls,
    issues.filter((entry) => entry.severity === 'error').length,
    issues.filter((entry) => entry.severity === 'warning').length,
  ]);
  return [header, ...rows].map((row) => row.map((value) => cell(value)).join(',')).join('\n') + '\n';
}

const time = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function analysesToMarkdown(analyses: readonly RunAnalysis[]): string {
  const lines = [
    '# 게임 런 분석',
    '',
    '| run | target/build | seed | 결과 | 점수 | 라운드 | 시간 | 품질 |',
    '|---|---|---:|---|---:|---:|---:|---|',
  ];
  for (const analysis of analyses) {
    const run = analysis.projection;
    const errors = analysis.issues.filter((entry) => entry.severity === 'error').length;
    const warnings = analysis.issues.filter((entry) => entry.severity === 'warning').length;
    lines.push(`| ${run.runId} | ${run.build?.target ?? '?'} / ${(run.build?.gitSha ?? '?').slice(0, 8)} | ${run.seed ?? ''} | ${run.finishReason} | ${run.score} | ${run.round} | ${time(run.elapsedSeconds)} | E${errors} W${warnings} |`);
  }
  for (const analysis of analyses) {
    const run = analysis.projection;
    lines.push('', `## ${run.runId}`, '');
    lines.push(`- 파일: \`${analysis.sourceName}\``);
    lines.push(`- 영웅 Lv${run.heroLevel}, 보스 Lv${run.bossCleared}, XP 구매 ${run.heroXpPurchases}회`);
    lines.push(`- 타워: ${run.towers.length ? run.towers.map(({ tower, count }) => `${tower.name} T${tower.tier} ×${count}`).join(', ') : '없음/미확인'}`);
    lines.push(`- 증강: ${run.augments.length ? run.augments.map(({ augment, round }) => `${augment.name}(R${round})`).join(', ') : '없음/미확인'}`);
    lines.push(`- 보스 교전: ${analysis.bossEncounters.length ? analysis.bossEncounters.map((encounter) => `Lv${encounter.level} ${encounter.durationSeconds === null ? '진행/미처치' : `${encounter.durationSeconds.toFixed(1)}초`}`).join(', ') : '없음'}`);
    const decisions = analysis.events.filter((event) => [
      'boss_summoned', 'boss_killed', 'augment_chosen', 'hero_xp_bought', 'hero_leveled', 'race_upgraded',
    ].includes(event.type));
    if (decisions.length) {
      lines.push('', '| 시간 | 라운드 | 이벤트 |', '|---:|---:|---|');
      for (const event of decisions) lines.push(`| ${time(event.elapsedSeconds)} | ${event.round} | ${eventDescription(event)} |`);
    }
    if (analysis.issues.length) {
      lines.push('', ...analysis.issues.map((entry) => `- ${entry.severity.toUpperCase()} \`${entry.code}\`: ${entry.message}`));
    }
  }
  return lines.join('\n') + '\n';
}
