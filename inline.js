/// <reference types="bun-types" />

import * as fs from 'fs/promises';

import URL from 'url';
import path from 'path'

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolve = (...args) => path.resolve(__dirname, ...args);

async function inlineStuff() {
  const html = Bun.file(resolve("src/index.html"))
  const newHtml = new HTMLRewriter()
    .on('link[rel="stylesheet"][href^="dist"]:not([data-no-inline])', {
      async element(el) {
        const href = el.getAttribute('href') ?? '';
        let style = href && await Bun.file(href).text();
        style = style.replace(/\/\*[\s\S]*?\*\//g, '')
        el.replace(`<style>${style}</style>`, { html: true }); 
      },
    })
    .on('script[src^="dist"]:not([data-no-inline])', {
      async element(el) {
        const src = el.getAttribute('src') ?? '';
        const type = el.getAttribute('type') ?? '';
        const script = src && await Bun.file(src).text();
        el.replace(`<script${type === "module" ? ' type="module"' : ""}>${script}</script>`, { html: true });
      },
    })
    .on('img[src^="dist"]:not([data-no-inline])', {
      async element(el) {
        const src = el.getAttribute('src') ?? '';
        const stat = await fs.stat(src).catch(() => null);
        const file = stat && stat.size < 50 * 1024 && Bun.file(src);
        if (file) {
          const enc = file.type !== 'image/svg+xml' ? 'base64' : 'utf8';
          let data = Buffer.from(await file.arrayBuffer()).toString(enc);
          if (enc === 'utf8') data = encodeURIComponent(data);
          el.setAttribute('src', `data:${file.type};${enc},${data}`);
        }
      },
    })
    .on('[data-no-inline]', {
      element(el) { el.removeAttribute('data-no-inline'); }
    })
    .transform(new Response(html));

  await Bun.write(resolve('index.html'), newHtml);
}

await inlineStuff();
