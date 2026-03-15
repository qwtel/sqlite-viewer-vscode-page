/// <reference types="@cloudflare/workers-types/2023-07-01" />

import languageParser from 'accept-language-parser';
import { Polar } from "@polar-sh/sdk";

import { Env } from "./api/#shared"
import { CountryInfo, PPP } from './api/#data';

export const LANGS: ('en'|'de'|'fr'|'pt-br'|'ja'|'es'|'ko')[] = ['en', 'de', 'fr', 'pt-br', 'ja', 'es', 'ko'];
const LocaleByLang = Object.freeze({
  'en': 'en-US',
  'de': 'de-DE',
  'fr': 'fr-FR',
  'pt-br': 'pt-BR',
  'ja': 'ja-JP',
  'es': 'es-ES',
  'ko': 'ko-KR',
});

const DevCountryOverride = 'BG';

const PercentToTier = Object.freeze({ 0: 0, 20: 1, 40: 2, 60: 3 });

const lightDark = (x?: string|null) => x === 'light' ? 'light' : x === 'dark' ? 'dark' : undefined;

const ns = 'sqlite-viewer-vscode-page.8';
const ttlDay = 60 * 60 * 24;
// const JapanDisplayTaxRate = 0.1;

const discountHtml = (price: LocalizedPrice, discountedPrice: LocalizedPrice) => html`
  <del class="pricing-table-price-currency h2 o-50" title="${price.currencyCode}">${price.currencySymbol}</del><del class="pricing-table-price-amount h1 o-50">${price.amountHtml}</del>
  <span class="pricing-table-price-currency h2" title="${discountedPrice.currencyCode}">${discountedPrice.currencySymbol}</span><span class="pricing-table-price-amount h1">${discountedPrice.amountHtml}</span>
  <small class="text-xxs">+&nbsp;VAT</small>
`;

const discountHintHtml = (discountPercent: number, country: string, flag: string) => html`
  <span class="price-hint text-xxs nowrap">${discountPercent}% off for all visitors from ${country} ${flag}</span>
`;

const EUR_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES'
]);

type ProductKey = 'pro' | 'be' | 'pro-subscribe';

type LocalizedPrice = {
  currencyCode: string,
  currencySymbol: string,
  amountHtml: string,
  priceAmount: number,
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const DEV = context.env.DEV;

  let [numPurchases, avatarUrls] = await Promise.all([
    context.env.KV.get<number>(`${ns}.numPurchases`, 'json'),
    context.env.KV.get<string[]>(`${ns}.avatarUrls`, 'json'),
  ]);

  if (numPurchases == null || avatarUrls == null) {
    [numPurchases, avatarUrls] = await getRecentProductPurchases(context.env).catch((err) => {
      console.error(err);
      return [null, null];
    });
    if (numPurchases != null && avatarUrls != null) {
      context.waitUntil((async () => {
        await Promise.all([
          context.env.KV.put(`${ns}.numPurchases`, JSON.stringify(numPurchases), { expirationTtl: ttlDay }),
          context.env.KV.put(`${ns}.avatarUrls`, JSON.stringify(avatarUrls), { expirationTtl: ttlDay }),
        ]);
      })());
    }
  } 

  const url = new URL(context.request.url);
  const { searchParams } = url;

  let isDedicatedLangPage = false;
  if (!DEV) {
    if (LANGS.some(lang => url.pathname.startsWith(`/${lang}`))) {
      isDedicatedLangPage = true;
    } else {
      const langHeader = searchParams.get('lang') || context.request.headers.get('Accept-Language') || '';
      const lang = languageParser.pick(LANGS, langHeader) ?? 'en';
      url.pathname = `/${lang}${url.pathname}`;
    }
  }

  const pageLang = LANGS.find((lang) => url.pathname === `/${lang}` || url.pathname.startsWith(`/${lang}/`)) ?? 'en';
  const locale = LocaleByLang[pageLang];

  const response = await context.env.ASSETS.fetch(url);

  const PROHrefByTier = context.env.PRO_HREFS.trim().split('\n');
  const BEHrefByTier = context.env.BE_HREFS.trim().split('\n');
  // console.assert(PROHrefByTier.length === 4 && BEHrefByTier.length === 4, 'Invalid PRO_HREFS or BE_HREFS');

  const country = ((DEV && DevCountryOverride) || context.request.headers.get('CF-IPcountry') || 'US').toUpperCase() as keyof typeof PPP;
  const discountPercent = PPP[country] ?? 0;
  const discountTier = PercentToTier[discountPercent];
  const hasDiscount = discountPercent > 0;
  const pricingData = await getLocalizedPrices(context.env, country, locale).catch((err) => {
    console.error(err);
    return null;
  });
  const localizedPrices = pricingData?.local ?? null;

  const colorScheme = lightDark(searchParams.get('color-scheme'))
  const vscode = searchParams.has('css-vars')

  let rewriter = new HTMLRewriter()
    .on('.checkout-link-local', {
      element(el) {
        const product = el.getAttribute('data-checkout-product');
        if (!product) return;
        if (pricingData) {
          el.setAttribute('href', `/api/checkout?product=${encodeURIComponent(product)}&currency=${encodeURIComponent(pricingData.preferredCurrency)}`);
          el.removeAttribute('data-polar-checkout');
          if (!pricingData.hasLocalCurrency) el.setAttribute('style', 'display:none');
        } else {
          const staticHref = product === 'pro' ? PROHrefByTier[discountTier] : product === 'be' ? BEHrefByTier[discountTier] : context.env.PRO_SUBSCRIBE_HREF;
          if (staticHref) el.setAttribute('href', staticHref);
          el.setAttribute('style', 'display:none');
        }
      },
    })
    .on('.checkout-link-usd', {
      element(el) {
        const product = el.getAttribute('data-checkout-product');
        if (!product) return;
        if (pricingData) {
          el.setAttribute('href', `/api/checkout?product=${encodeURIComponent(product)}&currency=USD`);
          el.removeAttribute('data-polar-checkout');
          el.removeAttribute('style');
        } else {
          const staticHref = product === 'pro' ? PROHrefByTier[discountTier] : product === 'be' ? BEHrefByTier[discountTier] : context.env.PRO_SUBSCRIBE_HREF;
          if (staticHref) el.setAttribute('href', staticHref);
          el.removeAttribute('style');
        }
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
        el.setInnerContent(selectedAvatars.map(url => html`<img class="avatar-stack-item" src="${url}">`).join(''), { html: true });
      }
    })
    .on('[data-price-product][data-price-field]', {
      element(el) {
        const product = el.getAttribute('data-price-product') as ProductKey | null;
        const field = el.getAttribute('data-price-field');
        const set = el.getAttribute('data-price-set');
        if (!product || !field) return;
        const price = set === 'usd' && pricingData
          ? pricingData.usd[product]
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

  if (pricingData?.hasLocalCurrency) {
    rewriter = rewriter.on('body', {
      element(el) {
        el.setAttribute('class', (el.getAttribute('class') ?? '') + ' currency-toggle-active');
      },
    });
  }

  if (pricingData) {
    rewriter = rewriter.on('#currency-toggle-wrap', {
      element(el) {
        if (!pricingData.hasLocalCurrency) {
          el.setAttribute('style', 'display:none');
          return;
        }
        el.removeAttribute('style');
        const localLabel = pricingData.preferredCurrency;
        el.setInnerContent(html`
          <div class="toggle-wrapper">
            <label class="toggle-label" for="currency-toggle" id="currency-toggle-local-label">${localLabel}</label>
            <label class="toggle">
              <input type="checkbox" id="currency-toggle" class="toggle-input">
              <span class="toggle-slider"></span>
            </label>
            <label class="toggle-label" for="currency-toggle" data-i18n-key="price-currency-usd">USD</label>
          </div>
        `, { html: true });
      },
    });
  }
    // .on('.plus-vat', {
    //   element(el) {
    //     if (showsInclVat) el.setAttribute('style', 'display: none;')
    //     else el.removeAttribute('style')
    //   },
    // })
    // .on('.incl-vat', {
    //   element(el) {
    //     if (showsInclVat) el.removeAttribute('style')
    //     else el.setAttribute('style', 'display: none;')
    //   },
    // });


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
          const product = element.getAttribute('data-price-product') as Exclude<ProductKey, 'pro-subscribe'> | null;
          if (!product) return;
          const hasDualCurrency = pricingData?.hasLocalCurrency && pricingData.local[product] && pricingData.usd[product];
          if (hasDualCurrency) {
            const localPrice = pricingData!.local[product];
            const usdPrice = pricingData!.usd[product];
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
            element.setInnerContent(
              html`<span class="price-local">${discountHtml(localPrice, localDiscounted)}</span><span class="price-usd">${discountHtml(usdPrice, usdDiscounted)}</span>`,
              { html: true }
            );
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

const formatPriceLocalized = (priceAmount: number, currencyCode: string, locale: string) => {
  const numberFormat = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: 'narrowSymbol',
  });
  const fractionDigits = numberFormat.resolvedOptions().maximumFractionDigits ?? 2;
  const divisor = 10 ** fractionDigits;
  const parts = numberFormat.formatToParts(priceAmount / divisor);
  const currencySymbol = disambiguateCurrencySymbol(
    parts.find((part) => part.type === 'currency')?.value ?? currencyCode,
    currencyCode,
  );
  const amountInt = parts
    .filter((part) => part.type === 'integer' || part.type === 'group')
    .map((part) => part.value)
    .join('');
  const amountFrac = parts.find((part) => part.type === 'fraction')?.value;
  const amountDecimal = parts.find((part) => part.type === 'decimal')?.value ?? '';
  const amountHtml = amountFrac 
    ? amountFrac === '00'
      ? html`${amountInt}`
      : html`<span>${amountInt}</span><span class="h2">${amountDecimal}${amountFrac}</span>` 
    : html`${amountInt}`;
  return { currencyCode, currencySymbol, amountHtml, priceAmount };
}

const disambiguateCurrencySymbol = (symbol: string, currencyCode: string) => {
  if (symbol !== '$' || currencyCode === 'USD') return symbol;
  if (currencyCode.length === 3 && currencyCode.endsWith('D')) return `${currencyCode[0]}$`;
  return `${currencyCode}$`;
}

export type PolarCurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY' | 'CHF' | 'SEK' | 'INR' | 'BRL';

const pickCurrencyByCountry = (country: string) => {
  if (country === 'GB') return 'GBP';
  if (country === 'CA') return 'CAD';
  if (country === 'AU') return 'AUD';
  if (country === 'JP') return 'JPY';
  if (country === 'CH' || country === 'LI') return 'CHF';
  if (country === 'SE') return 'SEK';
  if (country === 'IN') return 'INR';
  if (country === 'BR') return 'BRL';
  if (EUR_COUNTRIES.has(country)) return 'EUR';
  return 'USD';
}

const getProductPrices = async (polar: Polar, productId: string, billingCycle: 'one-time' | 'monthly') => {
  const product = await polar.products.get({ id: productId });
  const pricesByCurrency = new Map<string, number>();
  for (const price of product.prices as any[]) {
    if (price.isArchived) continue;
    if (price.amountType !== 'fixed') continue;
    const isRecurring = price.type === 'recurring';
    if (billingCycle === 'one-time' && isRecurring) continue;
    if (billingCycle === 'monthly' && !isRecurring) continue;
    if (typeof price.priceAmount !== 'number') continue;
    if (typeof price.priceCurrency !== 'string') continue;
    pricesByCurrency.set(price.priceCurrency.toUpperCase(), price.priceAmount);
  }
  return pricesByCurrency;
}

const getProductPricesCached = async (env: Env, polar: Polar, productId: string, billingCycle: 'one-time' | 'monthly', { DEV }: { DEV?: string } = {}) => {
  const cacheKey = `${ns}.prices.${billingCycle}.${productId}`;
  const cached = await env.KV.get<Record<string, number>>(cacheKey, 'json');
  DEV && console.log('cached', cached, { productId, billingCycle, DEV });
  if (cached && typeof cached === 'object') {
    return new Map(Object.entries(cached));
  }
  const pricesByCurrency = await getProductPrices(polar, productId, billingCycle);
  if (pricesByCurrency.size) {
    const serializable = Object.fromEntries(pricesByCurrency.entries());
    !DEV && await env.KV.put(cacheKey, JSON.stringify(serializable), { expirationTtl: ttlDay });
  }
  return pricesByCurrency;
}

const pickLocalizedPrice = (pricesByCurrency: Map<string, number>, preferredCurrency: string, locale: string): LocalizedPrice | null => {
  const selectedCurrency = pricesByCurrency.has(preferredCurrency)
    ? preferredCurrency
    : pricesByCurrency.has('USD')
      ? 'USD'
      : pricesByCurrency.keys().next().value;
  if (!selectedCurrency) return null;
  const selectedAmountRaw = pricesByCurrency.get(selectedCurrency);
  let selectedAmount = selectedAmountRaw;
  // if (selectedCurrency === 'JPY' && selectedAmountRaw != null) {
  //   selectedAmount = Math.round(selectedAmountRaw * (1 + JapanDisplayTaxRate));
  // }
  if (selectedAmount == null) return null;
  return formatPriceLocalized(selectedAmount, selectedCurrency, locale);
}

type PricingData = {
  preferredCurrency: string;
  hasLocalCurrency: boolean;
  local: { pro: LocalizedPrice; be: LocalizedPrice; 'pro-subscribe': LocalizedPrice };
  usd: { pro: LocalizedPrice; be: LocalizedPrice; 'pro-subscribe': LocalizedPrice };
};

const getLocalizedPrices = async (env: Env, country: string, locale: string): Promise<PricingData | null> => {
  if (!env.POLAR_ACCESS_TOKEN || !env.PRO_PRODUCT_ID || !env.BE_PRODUCT_ID) return null;
  const polar = new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN ?? "",
    server: env.POLAR_SERVER === "sandbox" ? "sandbox" : "production",
  });
  const preferredCurrency = pickCurrencyByCountry(country);
  const [proPrices, bePrices, proSubscribePrices] = await Promise.all([
    getProductPricesCached(env, polar, env.PRO_PRODUCT_ID, 'one-time', env),
    getProductPricesCached(env, polar, env.BE_PRODUCT_ID, 'one-time', env),
    getProductPricesCached(env, polar, env.PRO_SUBSCRIBE_PRODUCT_ID, 'monthly', env),
  ]);
  const proLocal = pickLocalizedPrice(proPrices, preferredCurrency, locale);
  const beLocal = pickLocalizedPrice(bePrices, preferredCurrency, locale);
  const proSubLocal = pickLocalizedPrice(proSubscribePrices, preferredCurrency, locale);
  const proUsd = pickLocalizedPrice(proPrices, 'USD', locale);
  const beUsd = pickLocalizedPrice(bePrices, 'USD', locale);
  const proSubUsd = pickLocalizedPrice(proSubscribePrices, 'USD', locale);
  if (!proLocal || !beLocal || !proSubLocal || !proUsd || !beUsd || !proSubUsd) return null;
  const local = { pro: proLocal, be: beLocal, 'pro-subscribe': proSubLocal };
  const usd = { pro: proUsd, be: beUsd, 'pro-subscribe': proSubUsd };
  return {
    preferredCurrency,
    hasLocalCurrency: preferredCurrency !== 'USD',
    local,
    usd,
  };
}

function html(strings: TemplateStringsArray, ...values: any[]) {
  let str = '', i = 0;
  for (const string of strings) str += string + (values[i++] || '');
  return str.trim();
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
