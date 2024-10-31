/// <reference types="@cloudflare/workers-types/2023-07-01" />

import { Env } from "./api/#shared"

const DevCountryOverride = '';
const V2Countries = new Set([
  "US",
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "JP", "KR", "SG", "HK", "TW", "AE", "QA",
  "AU", "NZ",
]);

const PROEditionHrefs = {
  live: 'https://buy.polar.sh/polar_cl_EFqb6PkmN70VXyivEBMhO6Yh6gYF46LYvsxmHmmanJo',
  dev: 'https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_6UZUT7AMFnMuxYbwQFGA4shpYnByJYNrbUGlysKk5IM/redirect',
  legacy: 'https://qwtel.gumroad.com/l/smzwr/z8acasd',
};

const BusinessEditionHrefs = {
  live: 'https://buy.polar.sh/polar_cl_GEJ6WHF_FZ2g4735f1DVr6MnrOz2Ju7CV-BOvn1HbxE',
  dev: 'https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_TEQMFIqXaPovjSTvU4k09OYV2HU-i0qSH4IOo1-9KEI/redirect',
  legacy: 'https://qwtel.gumroad.com/l/smzwr/z8acasd?option=lFAu5YJXnIoi7WmG79HCsQ%3D%3D',
};

const lightDark = (x?: string|null) => x === 'light' ? 'light' : x === 'dark' ? 'dark' : undefined;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);

  // const request = context.request;
  const response = await context.env.ASSETS.fetch(context.request);

  const dev = context.env.DEV;
  const country = (dev && DevCountryOverride) || context.request.headers.get('cf-ipcountry') || 'US';
  const unsupportedCountry = !V2Countries.has(country);

  const searchParams = url.searchParams;
  const colorScheme = lightDark(searchParams.get('color-scheme'))
  const vscode = searchParams.has('css-vars')

  let rewriter = new HTMLRewriter()
    .on('a[href^="#purchase"]', {
      element(el) {
        const href = el.getAttribute('href')!;
        let newHref = '';
        switch (href) {
          case '#purchase':
            newHref = unsupportedCountry ? PROEditionHrefs.legacy : dev ? PROEditionHrefs.dev : PROEditionHrefs.live;
            break;
          case '#purchase-be':
            newHref = unsupportedCountry ? BusinessEditionHrefs.legacy : dev ? BusinessEditionHrefs.dev : BusinessEditionHrefs.live;
            break;
        }
        el.setAttribute('href', newHref);
      },
      text: unsupportedCountry ? (txt) => { txt.lastInTextNode && txt.replace('Buy Now') || txt.remove() } : undefined,
    });

  if (!vscode) {
    rewriter = rewriter
      .on('meta[name="color-scheme"]', { element(el) { el.setAttribute('content', colorScheme || 'dark light') } })
      .on('body', {
        element(el) {
          if (!unsupportedCountry) {
            // The polar overlay is not nice, prefer opening in a new tab instead, so we omit the script
            // el.append(`<script defer src="https://cdn.jsdelivr.net/npm/@polar-sh/checkout@0.1/dist/embed.global.js" data-auto-init></script>`, { html: true });
          } else {
            el.append('<script defer src="https://gumroad.com/js/gumroad.js"></script>', { html: true });
          }
        }
      })
  }

  // if (colorScheme) {
  //   const prefersColorScheme = new RegExp(`\\(prefers-color-scheme:\\s*${colorScheme}\\)`);
  //   rewriter = rewriter.on('source[media*="prefers-color-scheme"]', {
  //     element(source) {
  //       const media = source.getAttribute('media')!;
  //       if (!media.match(prefersColorScheme)) source.remove();
  //       else source.removeAttribute('media');
  //     }
  //   });
  // }

  let transformedResponse;
  if (dev && response.status === 200) {
    const buf = await rewriter.transform(response).arrayBuffer()
    transformedResponse = new Response(buf, { headers: response.headers, status: response.status });
  } else {
    transformedResponse = rewriter.transform(response);
  }
  if (response.status === 200)
    transformedResponse.headers.append('vary', 'cf-ipcountry');
  return transformedResponse;
}
