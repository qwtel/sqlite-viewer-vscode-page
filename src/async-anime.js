const controlProperties = new Set(['delay', 'duration', 'easing', 'fill', 'targets']);
const transformProperties = new Set([
  'perspective',
  'rotate', 'rotateX', 'rotateY', 'rotateZ',
  'scale', 'scaleX', 'scaleY', 'scaleZ',
  'skew', 'skewX', 'skewY',
  'translateX', 'translateY', 'translateZ',
]);
const angleProperties = /^(?:rotate|skew)/;
const lengthProperties = /^(?:perspective|translate)/;

function sampledEasing(easing, steps = 60) {
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    points.push(`${Number(easing(progress).toFixed(6))} ${Number((progress * 100).toFixed(4))}%`);
  }
  return `linear(${points.join(', ')})`;
}

// Anime.js 3's easeInOutExpo and default easeOutElastic(1, .5).
const easeInExpo = (progress) => progress === 0 ? 0 : 2 ** (10 * progress - 10);
const expoEasing = sampledEasing((progress) => progress < 0.5
  ? easeInExpo(progress * 2) / 2
  : 1 - easeInExpo((1 - progress) * 2) / 2);
const elasticIn = (progress) => progress === 0 || progress === 1
  ? progress
  : -(2 ** (10 * (progress - 1))) * Math.sin((progress - 1.125) * 4 * Math.PI);
const elasticEasing = sampledEasing((progress) => 1 - elasticIn(1 - progress));

function cssEasing(easing = 'easeOutElastic(1, .5)') {
  if (easing === 'easeInOutExpo') return expoEasing;
  if (easing === 'easeOutElastic(1, .5)') return elasticEasing;
  return easing;
}

function formatTransformValue(property, value) {
  if (typeof value !== 'number') return String(value);
  if (angleProperties.test(property)) return `${value}deg`;
  if (lengthProperties.test(property)) return `${value}px`;
  return String(value);
}

function initialValue(property, end) {
  if (/^scale/.test(property)) return 1;
  if (angleProperties.test(property)) return formatTransformValue(property, 0);
  // Perspective is normally a constant context rather than an animation from 0px.
  if (property === 'perspective') return end;
  if (property === 'opacity') return 1;
  return end;
}

async function resolvedValue(value, target, index) {
  return await (typeof value === 'function' ? value(target, index) : value);
}

function snapshot(state, time, easing) {
  const frame = { ...state.styles, time };
  if (state.transforms.size) {
    frame.transform = [...state.transforms]
      .map(([property, value]) => `${property}(${value})`)
      .join(' ');
  }
  if (easing) frame.easing = cssEasing(easing);
  return frame;
}

function appendFrame(frames, state, time, easing) {
  const frame = snapshot(state, time, easing);
  if (frames.at(-1)?.time === time) frames[frames.length - 1] = frame;
  else frames.push(frame);
}

async function compileKeyframes(target, index, stages) {
  const state = { styles: Object.create(null), transforms: new Map() };
  const frames = [];
  let time = 0;

  for (const stage of stages) {
    const changes = await Promise.all(Object.entries(stage)
      .filter(([property]) => !controlProperties.has(property))
      .map(async ([property, value]) => {
        const current = transformProperties.has(property)
          ? state.transforms.get(property)
          : state.styles[property];
        const range = Array.isArray(value) ? value : [current, value];
        let [start, end] = await Promise.all(range.map((item) => resolvedValue(item, target, index)));
        if (transformProperties.has(property)) {
          end = formatTransformValue(property, end);
          start = start == null ? initialValue(property, end) : formatTransformValue(property, start);
        } else {
          start ??= initialValue(property, end);
        }
        return { end, property, start, transform: transformProperties.has(property) };
      }));

    for (const change of changes) {
      if (change.transform) state.transforms.set(change.property, change.start);
      else state.styles[change.property] = change.start;
    }
    appendFrame(frames, state, time);

    const delay = Math.max(0, Number(await resolvedValue(stage.delay ?? 0, target, index)) || 0);
    time += delay;
    appendFrame(frames, state, time, stage.easing ?? 'easeOutElastic(1, .5)');

    for (const change of changes) {
      if (change.transform) state.transforms.set(change.property, change.end);
      else state.styles[change.property] = change.end;
    }
    time += Math.max(0, Number(await resolvedValue(stage.duration ?? 1_000, target, index)) || 0);
    appendFrame(frames, state, time);
  }

  const duration = Math.max(1, time);
  return {
    duration,
    keyframes: frames.map(({ time: frameTime, ...frame }) => ({
      ...frame,
      offset: frameTime / duration,
    })),
  };
}

/** A deliberately small Anime-like authoring layer backed by async Element.animate(). */
export function createAsyncAnime(document) {
  async function run(defaults, stages) {
    const targets = Array.from(await document.querySelectorAll(defaults.targets));
    const animations = await Promise.all(targets.map(async (target, index) => {
      const compiled = await compileKeyframes(target, index, stages.map((stage) => ({ ...defaults, ...stage })));
      return target.animate(compiled.keyframes, {
        duration: compiled.duration,
        fill: stages.at(-1)?.fill ?? defaults.fill ?? 'both',
      });
    }));
    const activeAnimations = await Promise.all(animations);
    await Promise.all(activeAnimations.map(async (animation) => animation.ready));
    return activeAnimations;
  }

  const anime = (options) => ({ ready: run(options, [options]) });
  anime.random = (minimum, maximum) => (
    Math.floor(Math.random() * (maximum - minimum + 1)) + minimum
  );
  anime.timeline = (defaults) => {
    const stages = [];
    let ready;
    const timeline = {
      add(stage) {
        if (ready) throw new TypeError('Cannot add a stage after an async animation has started');
        stages.push(stage);
        return timeline;
      },
      get ready() {
        return ready ??= run(defaults, stages);
      },
    };
    return timeline;
  };
  return anime;
}
