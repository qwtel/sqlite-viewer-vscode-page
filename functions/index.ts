/// <reference types="@cloudflare/workers-types/2023-07-01" />

import { Env } from "./api/#shared"

const DevCountryOverride = '';

const V2Countries = new Set([
  "US", "CA",
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "CH", "NO", "IS", "LI", "MC", "SM", "AD", "GB", "IL",
  "JP", "KR", "SG", "HK", "TW", "AE", "QA",
  "AU", "NZ",
]);

const PROEditionHrefs = {
  live: 'https://buy.polar.sh/polar_cl_zWrh5cQnCfn0WQtRjoKdN4hL_5uIMaFuKh8kazgiOaA',
  sandbox: 'https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_6UZUT7AMFnMuxYbwQFGA4shpYnByJYNrbUGlysKk5IM/redirect',
  legacy: 'https://qwtel.gumroad.com/l/smzwr',
};

const BusinessEditionHrefs = {
  live: 'https://buy.polar.sh/polar_cl_1nt1xmGrmwZCRfex_41LcNHEnrGI3IRpry7ofTaJACQ',
  sandbox: 'https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_ydGFTF7KnKS0U5UP23Yi2GhRxUlr-OqSBNBvng40kYE/redirect',
  legacy: 'https://qwtel.gumroad.com/l/smzwr?option=lFAu5YJXnIoi7WmG79HCsQ%3D%3D',
};

const LegacyProductId = 'smzwr';

const lightDark = (x?: string|null) => x === 'light' ? 'light' : x === 'dark' ? 'dark' : undefined;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);

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
        if (unsupportedCountry) el.setInnerContent('Buy Now');
        el.setAttribute('href', newHref);
      },
    });

  if (!vscode) {
    rewriter = rewriter
      .on('meta[name="color-scheme"]', { element(el) { el.setAttribute('content', colorScheme || 'dark light') } })
      .on('body', {
        element(el) {
          if (!unsupportedCountry) {
            // el.append(html`<script defer src="https://cdn.jsdelivr.net/npm/@polar-sh/checkout@0.1/dist/embed.global.js" data-auto-init></script>`, { html: true });
          } else {
            el.append(html`<script defer src="https://gumroad.com/js/gumroad.js"></script>`, { html: true });
          }
        }
      })
  }

  if (colorScheme) {
    const prefersColorScheme = new RegExp(`\\(prefers-color-scheme:\\s*${colorScheme}\\)`);
    rewriter = rewriter.on('source[media*="prefers-color-scheme"]', {
      element(source) {
        const media = source.getAttribute('media')!;
        if (!media.match(prefersColorScheme)) source.remove();
        else source.removeAttribute('media');
      }
    });
  }

  if (unsupportedCountry) {
    let productP: Promise<any>|null = null;
    rewriter = rewriter
      .on(".pricing-table-price", {
        async element(element) {
          const variant = Number(element.getAttribute('data-i') ?? 0);
          productP ??= getProduct(context.env, context.waitUntil);
          const prices = await getPrices(productP, country, variant);
          if (prices == null) return;
          let { defaultPrice, price } = prices;
          if (price == defaultPrice) {
            element.setInnerContent(html`
              <span class="pricing-table-price-currency h2">$</span><span data-i="0" class="pricing-table-price-amount h1">${formatPrice(price)}</span><span class=""> + VAT</span>
            `, { html: true });
          } else {
            element.setInnerContent(html`
              <del class="pricing-table-price-currency h2 o-50">$</del><del data-i="0" class="pricing-table-price-amount h1 o-50">${formatPrice(defaultPrice)}</del>
              <span class="pricing-table-price-currency h2">$</span><span data-i="0" class="pricing-table-price-amount h1">${formatPrice(price)}</span><span class=""> + VAT</span>
            `, { html: true });
          }
        }
      })
  }

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

const formatPrice = (price: number) => {
  return price % 100 === 0
    ? (price / 100).toString()
    : (price / 100).toFixed(2);
}

async function getProduct(env: Env, waitUntil: (promise: Promise<any>) => void) {
  let product: any;
  try {
    const cachedProduct = await env.KV?.get(LegacyProductId, 'json') as any;
    if (cachedProduct) {
      console.debug('Using cached product');
      product = cachedProduct;
    } else {
      console.debug('Not using cached product');
      const productUrl = new URL(`https://api.gumroad.com/v2/products/${LegacyProductId}`);
      productUrl.searchParams.append('access_token', env.GUMROAD_ACCESS_TOKEN);

      const productResponse = await fetch(productUrl, { method: 'GET', headers: [[ 'user-agent', navigator.userAgent ]] });
      if (!productResponse.ok) {
        console.error('Product response not ok', productResponse.status);
        return null;
      }

      const productWrapper = await productResponse.clone().json() as any;
      if (productWrapper?.success !== true) {
        console.error('Product response not ok', productWrapper);
        return null
      }

      product = productWrapper.product;

      env.KV && waitUntil(env.KV.put(LegacyProductId, JSON.stringify(product), { expirationTtl: 300 }));
    }
    return product;
  } catch (err) { 
    console.error('Error fetching product', err);
    return null;
  }
}

async function getPrices(productP: Promise<any>, countryH: string, variant = 0) {
  let product: any;
  try {
    product = await productP;
  } catch (err) { 
    console.error('Error fetching product', err);
    return null;
  }

  console.debug('Has Product:', !!product);

  const country = DevCountryOverride || countryH;
  if (!country) {
    console.error('No country code');
    return null;
  }

  console.debug('Country:', country);

  const productVar = product.variants[0]?.options[variant]
  const ppppp = productVar?.purchasing_power_parity_prices as Record<string, number>;
  if (!ppppp) {
    console.error('No prices', product);
    return null;
  }

  const defaultPrice = productVar?.purchasing_power_parity_prices['US'];
  const price = ppppp[country] ?? defaultPrice;

  if (!(country in ppppp)) {
    console.warn('No price for country', country, ppppp);
  }

  return { defaultPrice, price };
}

function html(strings: TemplateStringsArray, ...values: any[]) {
  let str = '', i = 0;
  for (const string of strings) str += string + (values[i++] || '');
  return str.trim();
}
