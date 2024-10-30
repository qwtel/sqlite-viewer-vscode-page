/// <reference types="@cloudflare/workers-types/2023-07-01" />

import { Env } from "./api/#shared"

const DevCountryOverride = '';
const UnsupportedCountries = new Set(['IN', 'BR', 'RU']);

const PROEditionHref = 'https://buy.polar.sh/polar_cl_EFqb6PkmN70VXyivEBMhO6Yh6gYF46LYvsxmHmmanJo'
const BusinessEditionHref = 'https://buy.polar.sh/polar_cl_kFbgM18zwWdfKDwucc63rf6hthR7kzAAhBDD2dCPNcc'

// const lightDark = (x?: string|null) => x === 'light' ? 'light' : x === 'dark' ? 'dark' : undefined;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const dev = url.hostname === 'localhost'

  // const request = context.request;
  const response = await context.env.ASSETS.fetch(context.request);

  const country = (dev && DevCountryOverride) || context.request.headers.get('cf-ipcountry') || 'US';
  const unsupportedCountry = UnsupportedCountries.has(country);

  const searchParams = url.searchParams;
  // const colorScheme = lightDark(searchParams.get('color-scheme'))

  let rewriter = new HTMLRewriter()

  if (!searchParams.has('css-vars')) {
    rewriter = rewriter
      // .on('meta[name="color-scheme"]', { element(el) { el.setAttribute('content', colorScheme || 'dark light') } })
      .on('body', {
        element(el) {
          if (!searchParams.has('css-vars')) {
            if (!unsupportedCountry) {
              // el.append(`<script defer src="https://cdn.jsdelivr.net/npm/@polar-sh/checkout@0.1/dist/embed.global.js" data-auto-init></script>`, { html: true });
            } else {
              el.append('<script defer src="https://gumroad.com/js/gumroad.js"></script>', { html: true });
            }
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

  if (unsupportedCountry) {
    rewriter = rewriter.on('a[href^="https://buy.polar.sh"]', {
      element(el) {
        const href = el.getAttribute('href')!;
        let newHref = href;
        switch (href) {
          case PROEditionHref:
            newHref = 'https://qwtel.gumroad.com/l/smzwr/z8acasd';
            break;
          case BusinessEditionHref:
            newHref = 'https://qwtel.gumroad.com/l/smzwr/z8acasd?option=lFAu5YJXnIoi7WmG79HCsQ%3D%3D';
            break;
        }
        el.setAttribute('href', newHref);
      },
      text(txt) {
        if (txt.lastInTextNode) txt.replace('Buy Now'); else txt.remove();
      },
    })
  }

  if (dev) {
    rewriter = rewriter.on('a[href^="https://buy.polar.sh"]', {
      element(el) {
        const href = el.getAttribute('href')!;
        let newHref = href;
        switch (href) {
          case PROEditionHref:
            newHref = 'https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_6UZUT7AMFnMuxYbwQFGA4shpYnByJYNrbUGlysKk5IM/redirect';
            break;
          case BusinessEditionHref:
            newHref = 'https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_BbK-Xv1yzZaLjCBoW3mYPAm4q5mKD7sC59pK9NVOTyk/redirect';
            break;
        }
        el.setAttribute('href', newHref);
      }
    })
  }

  if (dev && response.status === 200) {
    const buf = await rewriter.transform(response).arrayBuffer()
    return new Response(buf, { headers: response.headers, status: response.status });
  } else {
    return rewriter.transform(response)
  }
}
