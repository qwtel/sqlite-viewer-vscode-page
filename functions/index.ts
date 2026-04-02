/// <reference types="@cloudflare/workers-types/2023-07-01" />

import languageParser from 'accept-language-parser';
import { Polar } from "@polar-sh/sdk";

import { Env } from "./api/#shared"
import { CountryInfo, PPP } from './api/#data';
import { formatPriceLocalized, getLocalizedPrices, html, LocaleByPageLang, type LocalizedPrice, type ProductKey } from './api/#pricing';

export type { PolarCurrencyCode } from './api/#pricing';

export const LANGS: ('en'|'de'|'fr'|'pt-br'|'ja'|'es'|'ko')[] = ['en', 'de', 'fr', 'pt-br', 'ja', 'es', 'ko'];

export const DevCountryOverride = 'US';

const lightDark = (x?: string|null) => x === 'light' ? 'light' : x === 'dark' ? 'dark' : undefined;

const Ns = 'sqlite-viewer-vscode-page.8';
const TtlDay = 60 * 60 * 24;
// const JapanDisplayTaxRate = 0.1;

const discountHtml = (price: LocalizedPrice, discountedPrice: LocalizedPrice) => html`
  <del class="pricing-table-price-currency h2 o-50" title="${price.currencyCode}">${price.currencySymbol}</del><del class="pricing-table-price-amount h1 o-50">${price.amountHtml}</del>
  <span class="pricing-table-price-currency h2" title="${discountedPrice.currencyCode}">${discountedPrice.currencySymbol}</span><span class="pricing-table-price-amount h1">${discountedPrice.amountHtml}</span>
`;
// <small class="text-xxs">+&nbsp;VAT</small>

const discountHintHtml = (discountPercent: number, country: string, flag: string) => html`
  <span class="price-hint text-xxs nowrap">${discountPercent}% off for all visitors from ${country} ${flag}</span>
`;

const avatarStackItemHtml = (url: string) => html`<img class="avatar-stack-item" src="${url}">`;

const currencyToggleHtml = (localLabel: string) => html`
  <div class="toggle-wrapper">
    <label class="toggle-label" for="currency-toggle" id="currency-toggle-local-label">${localLabel}</label>
    <label class="toggle">
      <input type="checkbox" id="currency-toggle" class="toggle-input">
      <span class="toggle-slider"></span>
    </label>
    <label class="toggle-label" for="currency-toggle" data-i18n-key="price-currency-usd">USD</label>
  </div>
`;

const priceDualCurrencyHtml = (localPrice: LocalizedPrice, localDiscounted: LocalizedPrice, usdPrice: LocalizedPrice, usdDiscounted: LocalizedPrice) => (
  html`<span class="price-local">${discountHtml(localPrice, localDiscounted)}</span><span class="price-usd">${discountHtml(usdPrice, usdDiscounted)}</span>`
)

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const DEV = context.env.DEV;

  let [numPurchases, avatarUrls] = await Promise.all([
    context.env.KV.get<number>(`${Ns}.numPurchases`, 'json'),
    context.env.KV.get<string[]>(`${Ns}.avatarUrls`, 'json'),
  ]);

  if (numPurchases == null || avatarUrls == null) {
    [numPurchases, avatarUrls] = await getRecentProductPurchases(context.env).catch((err) => {
      console.error(err);
      return [null, null];
    });
    if (numPurchases != null && avatarUrls != null) {
      context.waitUntil((async () => {
        await Promise.all([
          context.env.KV.put(`${Ns}.numPurchases`, JSON.stringify(numPurchases), { expirationTtl: TtlDay }),
          context.env.KV.put(`${Ns}.avatarUrls`, JSON.stringify(avatarUrls), { expirationTtl: TtlDay }),
        ]);
      })());
    }
  } 

  const url = new URL(context.request.url);
  const { searchParams } = url;
  const headers = context.request.headers;

  let isDedicatedLangPage = false;
  if (LANGS.some(lang => url.pathname.startsWith(`/${lang}`))) {
    isDedicatedLangPage = true;
  } else {
    const langHeader = searchParams.get('lang') || headers.get('Accept-Language') || '';
    const lang = languageParser.pick(LANGS, langHeader) ?? 'en';
    url.pathname = `/${lang}${url.pathname}`;
  }

  const pageLang = LANGS.find((lang) => url.pathname === `/${lang}` || url.pathname.startsWith(`/${lang}/`)) ?? 'en';
  const locale = LocaleByPageLang[pageLang as keyof typeof LocaleByPageLang] ?? 'en-US';

  const response = await context.env.ASSETS.fetch(url);

  const country = ((DEV && DevCountryOverride) || headers.get('CF-IPcountry') || 'US').toUpperCase() as keyof typeof PPP;
  const showsInclVat = country !== 'US' && country !== 'CA' && country !== 'IN';
  const discountPercent = PPP[country] ?? 0;
  const hasDiscount = discountPercent > 0;
  const pricingData = await getLocalizedPrices(context.env, country, locale).catch((err) => {
    console.error(err);
    return null;
  });
  const localizedPrices = pricingData?.local;

  const colorScheme = lightDark(searchParams.get('color-scheme'))
  const secFetchDest = headers.get('Sec-Fetch-Dest')?.toLowerCase();
  const vscode = secFetchDest === 'iframe' || searchParams.has('css-vars');
  const ua = headers.get('User-Agent') ?? '';
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium/.test(ua);
  const removeWebm = vscode || isSafari;

  let rewriter = new HTMLRewriter();
  if (removeWebm) {
    rewriter = rewriter.on('video source[src$=".webm"]', {
      element(el) {
        el.remove();
      },
    });
  }

  rewriter = rewriter
    .on('.checkout-link-local', {
      element(el) {
        const product = el.getAttribute('data-checkout-product');
        if (!product) return;
        if (pricingData) {
          el.setAttribute('href', `/api/checkout?product=${product}&currency=local&locale=${pageLang}`);
          el.removeAttribute('data-polar-checkout');
          if (!pricingData.hasAnyLocalCurrency) el.setAttribute('style', 'display:none');
        } else {
          el.setAttribute('href', `/api/checkout?product=${product}&currency=usd&locale=${pageLang}`);
          el.removeAttribute('data-polar-checkout');
          el.setAttribute('style', 'display:none');
        }
      },
    })
    .on('.checkout-link-usd', {
      element(el) {
        const product = el.getAttribute('data-checkout-product');
        if (!product) return;
        el.setAttribute('href', `/api/checkout?product=${product}&currency=usd&locale=${pageLang}`);
        el.removeAttribute('data-polar-checkout');
        el.removeAttribute('style');
      },
    })
    .on('.purchased-n-times', {
      element(el) {
        const content = el.getAttribute('content');
        if (content && numPurchases) {
          el.setInnerContent(content.replace('{n}', numPurchases.toString()), { html: true });
        }
      }
    })
    .on('.avatar-stack', {
      element(el) {
        const selectedAvatars = [...avatarUrls ?? []].sort(() => Math.random() - 0.5).slice(0, 5);
        el.setInnerContent(selectedAvatars.map(url => avatarStackItemHtml(url)).join(''), { html: true });
      }
    })
    .on('[data-price-product][data-price-field]', {
      element(el) {
        const product = el.getAttribute('data-price-product') as ProductKey | null;
        const field = el.getAttribute('data-price-field');
        const set = el.getAttribute('data-price-set');
        if (!product || !field) return;
        const price = set === 'usd' && pricingData
          ? pricingData.usd[product as ProductKey]
          : set === 'local' && pricingData
            ? pricingData.local[product]
            : localizedPrices?.[product];
        if (!price) return;
        if (field === 'currency') {
          el.setAttribute('title', price.currencyCode);
          el.setInnerContent(price.currencySymbol);
        } else if (field === 'amount') {
          el.setInnerContent(price.amountHtml, { html: true });
        }
      },
    });

  if (pricingData?.hasAnyLocalCurrency) {
    rewriter = rewriter.on('body', {
      element(el) {
        el.setAttribute('class', (el.getAttribute('class') ?? '') + ' currency-toggle-active');
      },
    });
  }

  if (pricingData) {
    rewriter = rewriter.on('#currency-toggle-wrap', {
      element(el) {
        if (!pricingData.hasAnyLocalCurrency) {
          el.setAttribute('style', 'display:none');
          return;
        }
        el.removeAttribute('style');
        const localLabel = pricingData.preferredCurrency;
        el.setInnerContent(currencyToggleHtml(localLabel), { html: true });
      },
    })
    .on('.plus-vat', {
      element(el) {
        if (showsInclVat) el.setAttribute('style', 'display: none;')
        else {
          el.removeAttribute('style');
          if (pageLang === 'en' && (country === 'US' || country === 'CA')) {
            el.setInnerContent('+&nbsp;taxes', { html: true });
          }
        }
      },
    })
    .on('.incl-vat', {
      element(el) {
        if (showsInclVat) el.removeAttribute('style')
        else el.setAttribute('style', 'display: none;')
      },
    });
  }

  if (hasDiscount) {
    rewriter = rewriter
      .on('.i18n-hide, .toggle-container--pricing, .monthly-price', {
      element(el) {
          el.remove();
        }
      })
  }

  if (!vscode) {
    rewriter = rewriter
      .on('meta[name="color-scheme"]', { element(el) { el.setAttribute('content', colorScheme || 'dark light') } })
      .on('body', {
        element(el) {
          el.append(html`<script defer src="https://cdn.jsdelivr.net/npm/@polar-sh/checkout@0.1/dist/embed.global.js" data-auto-init></script>`, { html: true });
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

  if (discountPercent) {
    rewriter = rewriter
      .on(".pricing-table-price", {
        element(element) {
          const product = element.getAttribute('data-price-product') as Exclude<ProductKey, 'prosub'> | null;
          if (!product) return;
          const hasDualCurrency = pricingData?.hasAnyLocalCurrency && pricingData.local[product]?.hasPreferredCurrency;
          if (hasDualCurrency) {
            const localPrice = pricingData?.local[product];
            const usdPrice = pricingData?.usd[product];
            if (!localPrice || !usdPrice) return;
            const localDiscounted = formatPriceLocalized(
              Math.round(localPrice.priceAmount * (1 - discountPercent / 100)),
              localPrice.currencyCode,
              locale
            );
            const usdDiscounted = formatPriceLocalized(
              Math.round(usdPrice.priceAmount * (1 - discountPercent / 100)),
              usdPrice.currencyCode,
              locale
            );
            element.setInnerContent(priceDualCurrencyHtml(localPrice, localDiscounted, usdPrice, usdDiscounted), { html: true });
          } else {
            const price = localizedPrices?.[product];
            if (!price) return;
            const discountedAmountMinor = Math.round(price.priceAmount * (1 - discountPercent / 100));
            const discountedPrice = formatPriceLocalized(discountedAmountMinor, price.currencyCode, locale);
            element.setInnerContent(discountHtml(price, discountedPrice), { html: true });
          }
        },
      })
      .on(".price-hint", { 
        element(el) { 
          const [countryName, flag] = CountryInfo[country]; 
          if (el.getAttribute('class')?.includes('monthly-price')) return;
          el.replace(discountHintHtml(discountPercent, countryName, flag), { html: true })
        } 
      })
  }

  let transformedResponse;
  if (DEV && response.status === 200) {
    const buf = await rewriter.transform(response).arrayBuffer();
    transformedResponse = new Response(buf, { headers: response.headers, status: response.status });
  } else {
    transformedResponse = rewriter.transform(response);
  }

  if (response.status === 200) {
    if (!isDedicatedLangPage) transformedResponse.headers.append('Vary', 'Accept-Language');
    transformedResponse.headers.append('Vary', 'CF-IPCountry');
    transformedResponse.headers.set('Cache-Control', 'public, max-age=600') 
  }
  return transformedResponse;
}

async function* genNonEmptyAvatarUrls(avatarUrls: string[]): AsyncGenerator<string, void, unknown> {
  for (const url of avatarUrls) {
    if (!url) {
      continue;
    }

    try {
      const urlObj = new URL(url);
      urlObj.searchParams.set('d', '404');
      const testUrl = urlObj.toString();
      
      const response = await fetch(testUrl, { method: 'HEAD' });

      if (response.status !== 404) {
        yield url;
      }
    } catch (error) {
      continue;
    }
  }
}

async function getRecentProductPurchases(env: Env): Promise<[count: number, avatarUrls: string[]]> {
  const polar = new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN ?? "",
    server: env.POLAR_SERVER === "sandbox" ? "sandbox" : "production",
  });

  const productId = [env.PRO_PRODUCT_ID, env.BE_PRODUCT_ID];

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30.5);
  const cutoffDate = thirtyDaysAgo

  const result = await polar.orders.list({
    productId,
    page: 1,
    limit: 100,
    sorting: ['-created_at'],
  });

  let purchaseCount = 0;
  let avatarUrls: string[] = [];

  outer: for await (const page of result) {
    for (const order of page.result.items) {
      if (!env.DEV && order.createdAt < cutoffDate) break outer;
      purchaseCount++;
      avatarUrls.push(order.customer.avatarUrl);
    }
  }

  const validAvatarUrls: string[] = [];
  const avatarGenerator = genNonEmptyAvatarUrls(avatarUrls);
  
  for await (const validUrl of avatarGenerator) {
    validAvatarUrls.push(validUrl);
    if (validAvatarUrls.length >= 40) break;
  }

  return [purchaseCount, validAvatarUrls];
}
