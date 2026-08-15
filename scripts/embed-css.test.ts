import { describe, expect, it } from 'bun:test';

import { createEmbeddedCss, EMBED_REM_PROPERTY, EMBED_ROOT_CLASS } from './embed-css';

describe('embedded landing-page CSS', () => {
  it('adapts document selectors and page-relative units', () => {
    const css = ':root{--a:1}html,body.dark{margin:1rem;width:100dvw}';
    expect(createEmbeddedCss(css)).toBe(
      `:host{--a:1}.${EMBED_ROOT_CLASS},.${EMBED_ROOT_CLASS}.dark{margin:calc(1 * var(${EMBED_REM_PROPERTY}));width:100cqw}`,
    );
  });

  it('uses container geometry while retaining non-geometric media features', () => {
    const css = [
      '@media (min-width: 640px){.wide{display:block}}',
      '@media (pointer: coarse) or (max-width: 960px){.touch{display:block}}',
      '@media (prefers-color-scheme: dark){.dark{display:block}}',
    ].join('');
    const embedded = createEmbeddedCss(css);

    expect(embedded).toContain('@container remote-content (min-width: 640px)');
    expect(embedded).toContain('@media (pointer: coarse)');
    expect(embedded).toContain('@container remote-content (max-width: 960px)');
    expect(embedded).toContain('@media (prefers-color-scheme: dark)');
  });

  it('does not rewrite strings or URL contents as CSS values', () => {
    const css = '.x{content:"1rem";background:url("image-100vw.png");padding:2rem}';
    const embedded = createEmbeddedCss(css);
    expect(embedded).toContain('content:"1rem"');
    expect(embedded).toContain('url("image-100vw.png")');
    expect(embedded).toContain(`padding:calc(2 * var(${EMBED_REM_PROPERTY}))`);
  });
});
