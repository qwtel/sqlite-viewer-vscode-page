/// <reference types="bun-types" />

import * as fs from 'fs/promises';
import URL from 'url';
import path from 'path'

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolve = (...args: string[]) => path.resolve(__dirname, '..', ...args);

const IMG_CUTOFF_KB = 25;

const makeRelative = (url: string) => url.startsWith('/') ? '.' + url : url;
const getAttribute = (el: HTMLRewriterTypes.Element, name: string) => makeRelative(el.getAttribute(name) ?? '');

type Awaitable<T> = T | Promise<T>;
async function asyncReplace(str: string, regex: RegExp, asyncFn: (x: RegExpMatchArray) => Awaitable<string|null|undefined>) {
  const matches = [...str.matchAll(regex)];

  const replacements = await Promise.all(
    matches.map(async match => {
      const replacement = await asyncFn(match);
      return { match, replacement };
    })
  );

  let result = str;
  replacements.reverse().forEach(({ match, replacement }) => {
    result = result.slice(0, match.index) + (replacement ?? match[0]) + result.slice(match.index + match[0].length);
  });

  return result;
}

async function inlineHtml(inFile: string, outFile: string) {
  let inPicture = false;

  const rewriter = new HTMLRewriter()
    .on('*', { comments(comment) { comment.remove() } })
    .on('link[rel="stylesheet"][href]:not([href^="http"]):not([data-no-inline])', {
      async element(el) {
        const href = getAttribute(el, 'href') ?? '';
        let style = href && await Bun.file(href).text();
        style = style.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        style = await asyncReplace(style, /url\(\s*['"]?([^'")]+)(['"]?)\s*\)/g, async ([, src]) => {
          if (src.startsWith('data:')) return null;
          const dataUrl = await inlineImage(makeRelative(src))
          return dataUrl && `url('${dataUrl}')`;
        });
        el.replace(`<style>${style}</style>`, { html: true }); 
      },
    })
    .on('script[src]:not([src^="http"]):not([defer]):not([data-no-inline])', {
      async element(el) {
        const src = getAttribute(el, 'src') ?? '';
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
    .on('img[src]:not([src^="http"]):not([src^="data"]):not([data-no-inline])', {
      async element(el) {
        if (inPicture) return; // skip images inside <picture> because there's usually multiple <source> tags
        const src = getAttribute(el, 'src') ?? '';
        const dataUrl = await inlineImage(src);
        dataUrl && el.setAttribute('src', dataUrl);
      },
    })
    .on('[data-no-inline]', {
      element(el) { el.removeAttribute('data-no-inline'); }
    })

  const html = Bun.file(resolve(inFile))
  const newHtml = rewriter.transform(new Response(html));
  const outFileDir = path.dirname(resolve(outFile));
  const exists = await fs.exists(resolve(outFileDir)).catch(() => null);
  exists && await Bun.write(resolve(outFile), newHtml);
}

async function inlineImage(src: string) {
  const stat = await fs.stat(src).catch(() => null);
  if (!stat || stat.size > IMG_CUTOFF_KB * 1024) return null;
  const file = Bun.file(src);
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

await Promise.all([
  inlineHtml("src/index.html", "index.html"),
  inlineHtml("src/app.html", "../sqlite-viewer-core/web/index.html"),
]);

