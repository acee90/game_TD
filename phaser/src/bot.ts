// ───────── 프리뷰 봇 — 판을 굴리는 최소 드라이버 ─────────
// 프리뷰의 목적은 그림 확인이다. 사람이 안 만져도 판이 계속 돌도록:
// 증강·스킬 선택을 자동으로 집고, 돈이 모이면 타워를 짓고, 이따금 보스를 부른다.
// (시뮬 규칙과 동일한 주의: 증강 대기는 game.paused — 놓치면 영구 정지처럼 보인다.)

import type { Game } from '@engine/game/game';
import { pathPos, PATH_LENGTH } from '@engine/core/map';

export class PreviewBot {
  private spawnTimer = 0.5;
  private bossTimer = 10;
  private heroTimer = 2;
  private pickTimer = 0;

  step(game: Game, dt: number): void {
    // 선택지가 뜨면 잠깐 보여준 뒤 집는다 (일시정지 화면도 프리뷰의 일부다)
    if (game.skillChoices.length > 0 || game.augmentChoices.length > 0) {
      this.pickTimer += dt;
      if (this.pickTimer >= 0.9) {
        this.pickTimer = 0;
        if (game.skillChoices.length > 0) game.chooseSkill(0);
        else game.chooseAugment(Math.floor(Math.random() * game.augmentChoices.length));
      }
      return; // 일시정지 중 — 다른 행동은 의미 없다
    }
    if (game.upgradeChoices.length > 0) {
      game.chooseAugmentUpgrade(0);
      return;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.35;
      if (game.mineral >= game.spawnCost + 15) game.spawnUnitAnywhere();
    }

    this.bossTimer -= dt;
    if (this.bossTimer <= 0) {
      this.bossTimer = 16;
      if (game.round >= 2) game.summonBoss();
    }

    // 만렙 전에는 남는 골드를 XP로 — 만렙 후에는 증강 강화로 (해금 순서 그대로)
    if (!game.hero.atMaxLevel && game.mineral > 500 && Math.random() < 0.03) game.buyXp();
    if (game.canOfferAugmentUpgrade && game.mineral > 900 && Math.random() < 0.01) {
      game.offerAugmentUpgrade();
    }

    // 영웅은 가장 앞서 나간 적 쪽으로 움직인다 — 전투 장면이 계속 생기도록
    this.heroTimer -= dt;
    if (this.heroTimer <= 0) {
      this.heroTimer = 2.5;
      const lead = game.enemies.reduce<{ d: number } | null>(
        (best, e) => (!best || e.distance > best.d ? { d: e.distance } : best),
        null,
      );
      const d = lead ? Math.min(lead.d, PATH_LENGTH * 0.9) : PATH_LENGTH * 0.4;
      const [x, y] = pathPos(d);
      game.moveHero(x, y);
    }
  }
}
