/// <reference types="bun-types" />

// @ts-ignore
import translations from './translations.jsonc' with { type: 'json' };

import * as fs from 'fs/promises';
import { marked } from 'marked';

import URL from 'url';
import path from 'path'

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolve = (...args: string[]) => path.resolve(__dirname, ...args);

const dashToCamelCase = (x: string) => x.replace(/-(\w)/g, (_, c) => c.toUpperCase());

const ikon = html`<img class="img inline-block" width="18" height="18" src="/dist/images/favicon-pro.png" />`

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
          let html = marked.parseInline('' + value, { gfm: true, breaks: true }) as string;
          html = html.replaceAll('()', `(${ikon})`);
          el.setInnerContent(html, { html: true });
        }
        el.removeAttribute('data-i18n-key');
      }
    })

  const htmlStr = Bun.file(resolve(inFile))
  const newHtmlStr = rewriter.transform(new Response(htmlStr));
  const outFileDir = path.dirname(resolve(outFile));
  const exists = await fs.exists(resolve(outFileDir)).catch(() => null);
  exists && await Bun.write(resolve(outFile), newHtmlStr);
}

await Promise.all(
  Object.keys(translations).map(lang => 
    translateHtml('./index.html', lang, `./${lang}/index.html`)
  ),
);

// function extractNumbers(str: string) {
//   return (str.match(/\d*\.?\d+/g) || []).map(Number);
// }

// function replacePlaceholders(str: string, numbers: number[]) {
//   return str.replace(/\\(\d+)/g, (match, index) => numbers[index - 1] !== undefined 
//     ? '' + numbers[index - 1] 
//     : match);
// }

function html(strings: TemplateStringsArray, ...values: any[]) {
  let str = '';
  strings.forEach((string, i) => {
    str += string + (values[i] ?? '');
  });
  return str;
}
