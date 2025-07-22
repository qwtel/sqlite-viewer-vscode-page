/// <reference types="bun-types" />

import * as fs from 'fs/promises';
import URL from 'url';
import path from 'path'

import { asyncReplace } from './_utils';

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolve = (...args: string[]) => path.resolve(__dirname, '..', ...args);

const IMG_CUTOFF_KB = 25;

// Build step - equivalent to the build:build script from package.json
async function buildHtmlFiles() {
  console.log('Building HTML files...');
  
  const result = await Bun.build({
    entrypoints: ['./src/index.html', './src/app.html'],
    outdir: '.',
    naming: {
      asset: 'dist/[dir]/[name].[ext]',
      chunk: 'dist/[name].[ext]',
    },
    minify: true,
  });

  if (!result.success) {
    console.error('Build failed:', result.logs);
    process.exit(1);
  }

  console.log('Build completed successfully');
  return result.outputs;
}

async function inlineHtmlFromBuild(buildOutputs: any[], htmlFileName: string, outFile: string) {
  let inPicture = false;

  // Find the HTML file in build outputs
  const htmlOutput = buildOutputs.find(x => x.path.endsWith(htmlFileName));
  if (!htmlOutput) {
    console.error(`Could not find ${htmlFileName} in build outputs`);
    return;
  }

  const rewriter = new HTMLRewriter()
    .on('*', { comments(comment) { comment.remove() } })
    .on('link[rel="stylesheet"][href]:not([href^="http"]):not([data-no-inline])', {
      async element(el) {
        const href = el.getAttribute('href') ?? '';
        if (!href) return;
        
        // Read CSS file from filesystem
        const cssPath = resolve(href);
        let style = await Bun.file(cssPath).text();
        style = style.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        style = await asyncReplace(style, /url\(\s*['"]?([^'")]+)(['"]?)\s*\)/g, async ([, src]) => {
          if (src.startsWith('data:')) return null;
          const dataUrl = await inlineImage(resolve(src))
          return dataUrl && `url('${dataUrl}')`;
        });
        el.replace(`<style>${style}</style>`, { html: true }); 
      },
    })
    .on('script[src]:not([src^="http"]):not([defer]):not([data-no-inline])', {
      async element(el) {
        const src = el.getAttribute('src') ?? '';
        if (!src) return;
        
        // Read JS file from filesystem
        const jsPath = resolve(src);
        const type = el.getAttribute('type') ?? '';
        let script = await Bun.file(jsPath).text();
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
        const src = el.getAttribute('src') ?? '';
        if (!src) return;
        
        const dataUrl = await inlineImage(resolve(src));
        dataUrl && el.setAttribute('src', dataUrl);
      },
    })
    .on('[data-no-inline]', {
      element(el) { el.removeAttribute('data-no-inline'); }
    })
    .on('script[src^="http://BUN-IGNORE/"]', {
      element(el) {
        const src = el.getAttribute('src')!.replace('http://BUN-IGNORE/', './');
        el.setAttribute('src', src);
      },
    })

  const html = await htmlOutput.text();
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

// Build HTML files first and get outputs
const buildOutputs = await buildHtmlFiles();

// Then inline the built files using build outputs
await Promise.all([
  inlineHtmlFromBuild(buildOutputs, 'index.html', './index.html'),
  inlineHtmlFromBuild(buildOutputs, 'app.html', '../sqlite-viewer-core/web/index.html'),
]);

