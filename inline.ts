/// <reference types="bun-types" />

import * as fs from 'fs/promises';

import URL from 'url';
import path from 'path'

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolve = (...args: string[]) => path.resolve(__dirname, ...args);

const IMG_CUTOFF_KB = 25;

async function asyncReplace(str: string, regex: RegExp, asyncFn: (x: RegExpMatchArray) => string|Promise<string>) {
  const matches = [...str.matchAll(regex)];

  const replacements = await Promise.all(
    matches.map(async match => {
      const replacement = await asyncFn(match);
      return { match, replacement };
    })
  );

  let result = str;
  replacements.reverse().forEach(({ match, replacement }) => {
    result = result.slice(0, match.index) + replacement + result.slice(match.index + match[0].length);
  });

  return result;
}

async function inlineStuff() {
  let inPicture = false;

  const rewriter = new HTMLRewriter()
    .on('link[rel="stylesheet"][href]:not([href^="http"]):not([data-no-inline])', {
      async element(el) {
        const href = el.getAttribute('href') ?? '';
        let style = href && await Bun.file(href).text();
        style = style.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        style = await asyncReplace(style, /url\(\s*['"]?([^'")]+)(['"]?)\s*\)/g, async match => {
          const src = match[1];
          if (src.startsWith('data:')) return match[0];
          const fileSrc = path.resolve(path.dirname(path.resolve(__dirname, href)), src)
          const dataUrl = await inlineImage(fileSrc)
          if (dataUrl) {
            return `url('${dataUrl}')`;
          } else {
            const q = match[2];
            return `url(${q}${fileSrc}${q})`;
          }
        });
        el.replace(`<style>${style}</style>`, { html: true }); 
      },
    })
    .on('script[href]:not([href^="http"]):not([defer]):not([data-no-inline])', {
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
    .on('img[href]:not([href^="http"]):not([href^="data"]):not([data-no-inline])', {
      async element(el) {
        if (inPicture) return; // skip images inside <picture> because there's usually multiple <source> tags
        const src = el.getAttribute('src') ?? '';
        const stat = await fs.stat(src).catch(() => null);
        const file = stat && stat.size < 25 * 1024 && Bun.file(src);
        if (file) {
          const dataUrl = await inlineImage(src);
          dataUrl && el.setAttribute('src', dataUrl);
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

async function inlineImage(src: string) {
  const stat = await fs.stat(src).catch(() => null);
  const file = stat && stat.size < IMG_CUTOFF_KB * 1024 && Bun.file(src);
  if (file) {
    if (file.type === 'image/svg+xml') {
      const dataBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      const dataUriEnc = encodeURIComponent(await file.text());
      const [enc, data] = dataUriEnc.length < dataBase64.length ? ['utf8', dataUriEnc] : ['base64', dataBase64];
      return `data:image/svg+xml;${enc},${data}`;
    } else {
      const data = Buffer.from(await file.arrayBuffer()).toString('base64');
      return `data:${file.type};base64,${data}`;
    }
  }
  return null;
}

await inlineStuff();
