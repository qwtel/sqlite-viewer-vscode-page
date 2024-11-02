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
  sandbox: 'https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_6UZUT7AMFnMuxYbwQFGA4shpYnByJYNrbUGlysKk5IM/redirect',
  legacy: 'https://qwtel.gumroad.com/l/smzwr/z8acasd',
};

const BusinessEditionHrefs = {
  live: 'https://buy.polar.sh/polar_cl_mHZpusLjhIoitewRz4bjc2NC1AMyixkH46RimwVqa-Q',
  sandbox: 'https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_ydGFTF7KnKS0U5UP23Yi2GhRxUlr-OqSBNBvng40kYE/redirect',
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
            newHref = unsupportedCountry ? PROEditionHrefs.legacy : dev ? PROEditionHrefs.sandbox : PROEditionHrefs.live;
            break;
          case '#purchase-be':
            newHref = unsupportedCountry ? BusinessEditionHrefs.legacy : dev ? BusinessEditionHrefs.sandbox : BusinessEditionHrefs.live;
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
            el.append(`<script defer src="https://cdn.jsdelivr.net/npm/@polar-sh/checkout@0.1/dist/embed.global.js" data-auto-init></script>`, { html: true });
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
