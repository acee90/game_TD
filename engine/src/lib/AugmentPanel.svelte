<script lang="ts">
  import type { Game } from '../game/game';
  import { augmentPanelHtml } from './view';

  let { game, tick }: { game: Game; tick: number } = $props();

  // 어떤 증강의 "실제 수치" 상세가 펼쳐져 있는지 — key = `${augmentId}:${rarity}`
  let openKeys = $state(new Set<string>());

  let v = $derived.by(() => {
    tick;
    return {
      title: `증강 기록 (${game.hero.augments.length})`,
      body: augmentPanelHtml(game, openKeys),
    };
  });

  function onToggle(event: MouseEvent): void {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.logrow');
    const key = row?.dataset.key;
    if (!key) return;
    const next = new Set(openKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    openKeys = next;
  }
</script>

<section id="augPanel" aria-label="증강 기록">
  <h3>{v.title}</h3>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
  <div id="augPanelBody" role="group" onclick={onToggle}>{@html v.body}</div>
</section>
