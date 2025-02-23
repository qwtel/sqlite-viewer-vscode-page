/// <reference types="bun-types" />

import * as fs from 'fs/promises';
import URL from 'url';
import path from 'path'
import { marked } from 'marked';
import * as yaml from 'yaml'
import { Glob } from "bun";

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolve = (...args: string[]) => path.resolve(__dirname, '..', ...args);

const dashToCamelCase = (x: string) => x.replace(/-(\w)/g, (_, c) => c.toUpperCase());

const translations = {} as Record<string, Record<string, string>>;

const glob = new Glob('*');
for await (const name of glob.scan(resolve('./i18n'))) {
  const [, lang] = name.match(/\.(.+)\.yaml$/) ?? [, 'en'];
  const ts = yaml.parse(await Bun.file(resolve('./i18n', name)).text());
  translations[lang] = ts;
}

const name = html`<span class="color">SQLite Viewer PRO</span>`;
const icon = html`<img class="img inline-block" width="18" height="18" src="/dist/images/favicon-pro.png" />`
const polar = html`<a href="https://polar.sh" target="_blank" style="text-decoration:none"><picture>
  <source media="(prefers-color-scheme: light)" srcset="/dist/images/polar.svg">
  <source media="(prefers-color-scheme: dark)" srcset="/dist/images/polar-dark.svg">
  <img style="display:inline-block;height:18px;padding:0 2px;margin-bottom:-3.5px" src="/dist/images/polar.svg" alt="Polar">
</picture></a>`;
const payments = html`
<img style="height:26px;margin-right:-2px" src="/dist/images/google-pay.svg" alt="Google Pay" title="Google Pay">
<img style="height:26px" src="/dist/images/apple-pay.svg" alt="Apple Pay" title="Apple Pay">
<img style="height:26px" src="/dist/images/cashapp-pay.svg" alt="CashApp Pay" title="CashApp Pay">
<img style="height:26px" src="/dist/images/visa.svg" alt="Visa" title="Visa">
<img style="height:26px" src="/dist/images/mastercard.svg" alt="Mastercard" title="Mastercard">
<!-- <img style="height:26px" src="/dist/images/amex.svg" alt="American Express" title="American Express">
<img style="height:26px" src="/dist/images/discover.svg" alt="Discover" title="Discover"> -->
`.trim();

const indexTs = `
/// <reference types="@cloudflare/workers-types/2023-07-01" />
export { onRequestGet } from "../index.ts";
`;

async function translateHtml(inFile: string, lang: string, outFile: string) {
  const rewriter = new HTMLRewriter()
    .on('html[lang]', {
      element(el) {
        el.setAttribute('lang', lang);
      }
    })
    .on('[data-i18n-key]', {
      element(el) {
        const key = el.getAttribute('data-i18n-key')!;
        const value = translations[lang][dashToCamelCase(key)];
        // console.log(key, dashToCamelCase(key))
        if (value) {
          let newHtml = marked.parseInline('' + value, { gfm: true, breaks: true }) as string;
          newHtml = newHtml
            .replaceAll('{SQLiteViewerPRO}', name)
            .replaceAll('{icon}', icon)
            .replaceAll('{polar}', polar)
            .replaceAll('{GooglePayApplePay}', payments)
            .replaceAll('{NASA}', lang === 'ja' || lang === 'ko' ? 'NASA' : '')
          el.setInnerContent(newHtml, { html: true });
        }
        el.removeAttribute('data-i18n-key');
      }
    })
    .on('[data-i18n-title]', {
      element(el) {
        const key = el.getAttribute('data-i18n-title')!;
        const value = translations[lang][dashToCamelCase(key)];
        if (value) {
          const newHtml = marked.parseInline('' + value, { gfm: true }) as string;
          el.setAttribute('title', newHtml);
        }
        el.removeAttribute('data-i18n-title');
      }
    })
    .on('[data-i18n-content]', {
      element(el) {
        const key = el.getAttribute('data-i18n-content')!;
        const value = translations[lang][dashToCamelCase(key)];
        if (value) {
          const newHtml = marked.parseInline('' + value, { gfm: true }) as string;
          el.setAttribute('content', newHtml);
        }
        el.removeAttribute('data-i18n-content');
      }
    })
    .on(`[href="/${lang}/"]`, {
      element(el) {
        el.tagName = 'span';
      }
    })

  const htmlStr = Bun.file(resolve(inFile))
  const newHtmlStr = rewriter.transform(new Response(htmlStr));
  const outFileDir = path.dirname(resolve(outFile));
  await fs.mkdir(outFileDir, { recursive: true }).catch(() => {});
  await Bun.write(resolve(outFile), newHtmlStr);
  await Bun.write(resolve('functions', lang, 'index.ts'), indexTs);
}

await Promise.all(
  Object.keys(translations).map(lang => 
    translateHtml('./index.html', lang, `./${lang}/index.html`)
  ),
);

//#region utils
function html(strings: TemplateStringsArray, ...values: any[]) {
  let str = '';
  strings.forEach((string, i) => {
    str += string + (values[i] ?? '');
  });
  return str;
}
//#endregion
