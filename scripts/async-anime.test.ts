import { describe, expect, it } from 'bun:test';

import { createAsyncAnime } from '../src/async-anime.js';

function target(attributes: Record<string, string> = {}) {
  const calls: Array<{ keyframes: Keyframe[]; options: KeyframeAnimationOptions }> = [];
  return {
    calls,
    getAttribute(name: string) { return Promise.resolve(attributes[name] ?? null); },
    animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ keyframes, options });
      return { ready: Promise.resolve() };
    },
  };
}

describe('async Anime-style authoring', () => {
  it('compiles chained timeline stages into one WAAPI animation', async () => {
    const panel = target();
    // Native querySelectorAll returns an array-like NodeList; the remote
    // provider returns a materialized tuple. The authoring layer accepts both.
    const anime = createAsyncAnime({ querySelectorAll: () => ({ 0: panel, length: 1 }) });
    const timeline = anime.timeline({ targets: '.panel' }).add({
      delay: 100,
      duration: 400,
      easing: 'easeInOutExpo',
      scaleX: [0.05, 0.05],
      scaleY: [0, 1],
      perspective: 500,
    }).add({
      duration: 400,
      easing: 'easeInOutExpo',
      scaleX: 1,
    }).add({
      duration: 800,
      rotateY: -15,
      rotateX: 8,
      rotateZ: -1,
    });

    await timeline.ready;

    expect(panel.calls).toHaveLength(1);
    const [{ keyframes, options }] = panel.calls;
    expect(options).toEqual({ duration: 1_700, fill: 'both' });
    expect(keyframes.map((frame) => frame.offset)).toEqual([
      0,
      100 / 1_700,
      500 / 1_700,
      900 / 1_700,
      1,
    ]);
    expect(keyframes[0].transform).toBe('scaleX(0.05) scaleY(0) perspective(500px)');
    expect(keyframes[2].transform).toBe('scaleX(0.05) scaleY(1) perspective(500px)');
    expect(keyframes[4].transform).toBe(
      'scaleX(1) scaleY(1) perspective(500px) rotateY(-15deg) rotateX(8deg) rotateZ(-1deg)',
    );
    expect(keyframes[1].easing).toStartWith('linear(');
    expect(keyframes[3].easing).toStartWith('linear(');
    expect(keyframes[1].easing).not.toBe(keyframes[3].easing);
  });

  it('resolves per-target async values in standalone animations', async () => {
    const first = target({ 'data-rotation': '45deg' });
    const second = target({ 'data-rotation': '-22deg' });
    const anime = createAsyncAnime({ querySelectorAll: () => [first, second] });

    await anime({
      targets: '.accent',
      delay: 100,
      duration: 600,
      easing: 'easeInOutExpo',
      rotate: [-90, (element: typeof first) => element.getAttribute('data-rotation')],
      scale: [0.7, 1],
      opacity: [0, 1],
    }).ready;

    expect(first.calls[0].options).toEqual({ duration: 700, fill: 'both' });
    expect(first.calls[0].keyframes[0]).toMatchObject({
      opacity: 0,
      transform: 'rotate(-90deg) scale(0.7)',
    });
    expect(first.calls[0].keyframes.at(-1)).toMatchObject({
      opacity: 1,
      transform: 'rotate(45deg) scale(1)',
    });
    expect(second.calls[0].keyframes.at(-1)?.transform).toBe('rotate(-22deg) scale(1)');
  });
});
