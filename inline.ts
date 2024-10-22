/// <reference types="bun-types" />

import * as fs from 'fs/promises';

import URL from 'url';
import path from 'path'

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolve = (...args: string[]) => path.resolve(__dirname, ...args);

async function inlineStuff() {
  let inPicture = false;

  const rewriter = new HTMLRewriter()
    .on('link[rel="stylesheet"]:not([href^="http"]):not([data-no-inline])', {
      async element(el) {
        const href = el.getAttribute('href') ?? '';
        let style = href && await Bun.file(href).text();
        style = style.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        el.replace(`<style>${style}</style>`, { html: true }); 
      },
    })
    .on('script:not([href^="http"]):not([defer]):not([data-no-inline])', {
      async element(el) {
        const src = el.getAttribute('src') ?? '';
        const type = el.getAttribute('type') ?? '';
        let script = src && await Bun.file(src).text();
        script = script.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        el.replace(`<script${type === "module" ? ' type="module"' : ""}>${script}</script>`, { html: true });
      },
    })
    .on('picture', { 
      element(el) { 
        inPicture = true; 
        el.onEndTag(() => { inPicture = false }) 
      } 
    })
    .on('img:not([href^="http"]):not([data-no-inline])', {
      async element(el) {
        if (inPicture) return; // skip images inside <picture> because there's usually multiple <source> tags
        const src = el.getAttribute('src') ?? '';
        const stat = await fs.stat(src).catch(() => null);
        const file = stat && stat.size < 25 * 1024 && Bun.file(src);
        if (file) {
          if (file.type === 'image/svg+xml') {
            const dataBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');
            const dataUriEnc = encodeURIComponent(await file.text());
            const [enc, data] = dataUriEnc.length < dataBase64.length ? ['utf8', dataUriEnc] : ['base64', dataBase64];
            el.setAttribute('src', `data:image/svg+xml;${enc},${data}`);
          } else {
            const data = Buffer.from(await file.arrayBuffer()).toString('base64');
            el.setAttribute('src', `data:${file.type};base64,${data}`);
          }
        }
      },
    })
    .on('[data-no-inline]', {
      element(el) { el.removeAttribute('data-no-inline'); }
    })

  const html = Bun.file(resolve("src/index.html"))
  const newHtml = rewriter.transform(new Response(html));
  await Bun.write(resolve('index.html'), newHtml);
}

await inlineStuff();
