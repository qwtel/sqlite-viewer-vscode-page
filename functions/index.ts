/// <reference types="@cloudflare/workers-types/2023-07-01" />

import languageParser from 'accept-language-parser';

import { Env } from "./api/#shared"

const DevCountryOverride = '';

const DGToTier = Object.freeze({ 0: 0, 20: 1, 40: 2, 60: 3 });

const lightDark = (x?: string|null) => x === 'light' ? 'light' : x === 'dark' ? 'dark' : undefined;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);

  if (!url.pathname.match(/\/(en|de|fr)\//)) {
    const langHeader = context.request.headers.get('accept-language') || '';
    const lang = languageParser.pick(['en', 'de', 'fr'], langHeader);
    url.pathname = `/${lang}${url.pathname}`;
  }

  const response = await context.env.ASSETS.fetch(url);

  const DEV = context.env.DEV;
  const PROHrefByTier = context.env.PRO_HREFS.trim().split('\n');
  const BEHrefByTier = context.env.BE_HREFS.trim().split('\n');

  const country = ((DEV && DevCountryOverride) || context.request.headers.get('cf-ipcountry') || 'US') as keyof typeof PPP;
  const discountGroup = PPP[country] ?? 0;
  const tier = DGToTier[discountGroup];

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
            newHref = PROHrefByTier[tier];
            break;
          case '#purchase-be':
            newHref = BEHrefByTier[tier];
            break;
        }
        el.setAttribute('href', newHref);
      },
    });

  if (!vscode) {
    rewriter = rewriter
      .on('meta[name="color-scheme"]', { element(el) { el.setAttribute('content', colorScheme || 'dark light') } })
      // .on('body', {
      //   element(el) {
      //     el.append(html`<script defer src="https://cdn.jsdelivr.net/npm/@polar-sh/checkout@0.1/dist/embed.global.js" data-auto-init></script>`, { html: true });
      //   }
      // })
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

  if (discountGroup) {
    rewriter = rewriter
      .on(".pricing-table-price", {
        element(element) {
          const price = Number(element.getAttribute('data-price') ?? 0);
          if (!price || Number.isNaN(price)) return;
          element.setInnerContent(html`
            <del class="pricing-table-price-currency h2 o-50">$</del><del class="pricing-table-price-amount h1 o-50">${price}</del>
            <span class="pricing-table-price-currency h2">$</span><span class="pricing-table-price-amount h1">${formatPrice(price * (1 - discountGroup/100))}</span><small class="text-xxs">&nbsp;+&nbsp;VAT</small>
          `, { html: true });
        },
      })
      .on(".price-hint", { 
        element(el) { 
          const [countryName, flag] = CountryInfo[country]; 
          el.replace(html`<span class="price-hint text-xxs nowrap">${discountGroup}% off for all visitors from ${countryName} ${flag}</span>`, { html: true })
        } 
      })
  }

  let transformedResponse;
  if (DEV && response.status === 200) {
    const buf = await rewriter.transform(response).arrayBuffer()
    transformedResponse = new Response(buf, { headers: response.headers, status: response.status });
  } else {
    transformedResponse = rewriter.transform(response);
  }

  if (response.status === 200) {
    transformedResponse.headers.append('vary', 'accept-language');
    transformedResponse.headers.append('vary', 'cf-ipcountry');
  }
  return transformedResponse;
}

const formatPrice = (price: number) => {
  if (Math.floor(price) === price) return price.toString();
  const [a, b] = price.toFixed(2).split('.');
  return html`<span>${a}</span><span class="h2">.${b}</span>`;
}

function html(strings: TemplateStringsArray, ...values: any[]) {
  let str = '', i = 0;
  for (const string of strings) str += string + (values[i++] || '');
  return str.trim();
}

const PPP = Object.freeze({
  AF: 60,
  AL: 40,
  DZ: 60,
  AD: 0,
  AO: 60,
  AG: 20,
  AR: 40,
  AM: 60,
  AU: 0,
  AT: 0,
  AZ: 60,
  BS: 0,
  BH: 20,
  BD: 60,
  BB: 0,
  BY: 60,
  BE: 0,
  BZ: 40,
  BJ: 60,
  BT: 60,
  BO: 60,
  BA: 40,
  BW: 40,
  BR: 40,
  BN: 20,
  BG: 40,
  BF: 60,
  BI: 60,
  CV: 40,
  KH: 60,
  CM: 60,
  CA: 0,
  CF: 60,
  TD: 60,
  CL: 20,
  CN: 40,
  CO: 40,
  KM: 40,
  CD: 40,
  CG: 40,
  CR: 20,
  HR: 20,
  CU: 20,
  CY: 0,
  CZ: 0,
  DK: 0,
  DJ: 40,
  DM: 20,
  DO: 40,
  EC: 20,
  EG: 60,
  SV: 20,
  GQ: 40,
  ER: 60,
  EE: 0,
  SZ: 40,
  ET: 60,
  FJ: 40,
  FI: 0,
  FR: 0,
  GA: 40,
  GM: 60,
  GE: 60,
  DE: 0,
  GH: 60,
  GR: 0,
  GD: 20,
  GT: 20,
  GN: 60,
  GW: 60,
  GY: 40,
  HT: 60,
  HN: 40,
  HU: 0,
  IS: 0,
  IN: 60,
  ID: 60,
  IR: 60,
  IQ: 40,
  IE: 0,
  IL: 0,
  IT: 0,
  JM: 40,
  JP: 0,
  JO: 40,
  KZ: 60,
  KE: 60,
  KI: 40,
  KP: 60,
  KR: 0,
  XK: 40,
  KW: 20,
  KG: 60,
  LA: 60,
  LV: 0,
  LB: 60,
  LS: 40,
  LR: 60,
  LY: 40,
  LI: 0,
  LT: 0,
  LU: 0,
  MG: 60,
  MW: 60,
  MY: 40,
  MV: 40,
  ML: 60,
  MT: 0,
  MH: 40,
  MR: 60,
  MU: 40,
  MX: 20,
  FM: 40,
  MD: 60,
  MC: 0,
  MN: 60,
  ME: 40,
  MA: 60,
  MZ: 60,
  MM: 60,
  NA: 40,
  NR: 40,
  NP: 60,
  NL: 0,
  NZ: 0,
  NI: 40,
  NE: 60,
  NG: 60,
  MK: 40,
  NO: 0,
  OM: 20,
  PK: 60,
  PW: 40,
  PS: 60,
  PA: 20,
  PG: 60,
  PY: 40,
  PE: 40,
  PH: 60,
  PL: 0,
  PT: 0,
  QA: 20,
  RO: 20,
  RU: 40,
  RW: 60,
  KN: 20,
  LC: 20,
  VC: 20,
  WS: 40,
  SM: 0,
  ST: 60,
  SA: 20,
  SN: 60,
  RS: 40,
  SC: 20,
  SL: 60,
  SG: 0,
  SK: 0,
  SI: 0,
  SB: 40,
  SO: 60,
  ZA: 40,
  SS: 60,
  ES: 0,
  LK: 60,
  SD: 60,
  SR: 40,
  SE: 0,
  CH: 0,
  SY: 60,
  TW: 20,
  TJ: 60,
  TZ: 60,
  TH: 40,
  TL: 60,
  TG: 60,
  TO: 40,
  TT: 20,
  TN: 40,
  TR: 40,
  TM: 60,
  TV: 40,
  UG: 60,
  UA: 40,
  AE: 20,
  GB: 0,
  US: 0,
  UY: 40,
  UZ: 60,
  VU: 40,
  VA: 0,
  VE: 40,
  VN: 60,
  XX: 0,
  YE: 60,
  ZM: 60,
  ZW: 60,
});

const CountryInfo = Object.freeze({
  AF: ["Afghanistan", "🇦🇫"],
  AL: ["Albania", "🇦🇱"],
  DZ: ["Algeria", "🇩🇿"],
  AS: ["American Samoa", "🇦🇸"],
  AD: ["Andorra", "🇦🇩"],
  AO: ["Angola", "🇦🇴"],
  AI: ["Anguilla", "🇦🇮"],
  AQ: ["Antarctica", "🇦🇶"],
  AG: ["Antigua and Barbuda", "🇦🇬"],
  AR: ["Argentina", "🇦🇷"],
  AM: ["Armenia", "🇦🇲"],
  AW: ["Aruba", "🇦🇼"],
  AU: ["Australia", "🇦🇺"],
  AT: ["Austria", "🇦🇹"],
  AZ: ["Azerbaijan", "🇦🇿"],
  BS: ["Bahamas", "🇧🇸"],
  BH: ["Bahrain", "🇧🇭"],
  BD: ["Bangladesh", "🇧🇩"],
  BB: ["Barbados", "🇧🇧"],
  BY: ["Belarus", "🇧🇾"],
  BE: ["Belgium", "🇧🇪"],
  BZ: ["Belize", "🇧🇿"],
  BJ: ["Benin", "🇧🇯"],
  BM: ["Bermuda", "🇧🇲"],
  BT: ["Bhutan", "🇧🇹"],
  BO: ["Bolivia", "🇧🇴"],
  BA: ["Bosnia and Herzegovina", "🇧🇦"],
  BW: ["Botswana", "🇧🇼"],
  BR: ["Brazil", "🇧🇷"],
  BN: ["Brunei", "🇧🇳"],
  BG: ["Bulgaria", "🇧🇬"],
  BF: ["Burkina Faso", "🇧🇫"],
  BI: ["Burundi", "🇧🇮"],
  CV: ["Cape Verde", "🇨🇻"],
  KH: ["Cambodia", "🇰🇭"],
  CM: ["Cameroon", "🇨🇲"],
  CA: ["Canada", "🇨🇦"],
  KY: ["Cayman Islands", "🇰🇾"],
  CF: ["Central African Republic", "🇨🇫"],
  TD: ["Chad", "🇹🇩"],
  CL: ["Chile", "🇨🇱"],
  CN: ["China", "🇨🇳"],
  CO: ["Colombia", "🇨🇴"],
  KM: ["Comoros", "🇰🇲"],
  CG: ["Congo", "🇨🇬"],
  CD: ["Congo (DRC)", "🇨🇩"],
  CR: ["Costa Rica", "🇨🇷"],
  CI: ["Côte d'Ivoire", "🇨🇮"],
  HR: ["Croatia", "🇭🇷"],
  CU: ["Cuba", "🇨🇺"],
  CY: ["Cyprus", "🇨🇾"],
  CZ: ["Czech Republic", "🇨🇿"],
  DK: ["Denmark", "🇩🇰"],
  DJ: ["Djibouti", "🇩🇯"],
  DM: ["Dominica", "🇩🇲"],
  DO: ["Dominican Republic", "🇩🇴"],
  EC: ["Ecuador", "🇪🇨"],
  EG: ["Egypt", "🇪🇬"],
  SV: ["El Salvador", "🇸🇻"],
  GQ: ["Equatorial Guinea", "🇬🇶"],
  ER: ["Eritrea", "🇪🇷"],
  EE: ["Estonia", "🇪🇪"],
  SZ: ["Eswatini", "🇸🇿"],
  ET: ["Ethiopia", "🇪🇹"],
  FJ: ["Fiji", "🇫🇯"],
  FI: ["Finland", "🇫🇮"],
  FR: ["France", "🇫🇷"],
  GA: ["Gabon", "🇬🇦"],
  GM: ["Gambia", "🇬🇲"],
  GE: ["Georgia", "🇬🇪"],
  DE: ["Germany", "🇩🇪"],
  GH: ["Ghana", "🇬🇭"],
  GR: ["Greece", "🇬🇷"],
  GD: ["Grenada", "🇬🇩"],
  GT: ["Guatemala", "🇬🇹"],
  GN: ["Guinea", "🇬🇳"],
  GW: ["Guinea-Bissau", "🇬🇼"],
  GY: ["Guyana", "🇬🇾"],
  HT: ["Haiti", "🇭🇹"],
  HN: ["Honduras", "🇭🇳"],
  HU: ["Hungary", "🇭🇺"],
  IS: ["Iceland", "🇮🇸"],
  IN: ["India", "🇮🇳"],
  ID: ["Indonesia", "🇮🇩"],
  IR: ["Iran", "🇮🇷"],
  IQ: ["Iraq", "🇮🇶"],
  IE: ["Ireland", "🇮🇪"],
  IL: ["Israel", "🇮🇱"],
  IT: ["Italy", "🇮🇹"],
  JM: ["Jamaica", "🇯🇲"],
  JP: ["Japan", "🇯🇵"],
  JO: ["Jordan", "🇯🇴"],
  KZ: ["Kazakhstan", "🇰🇿"],
  KE: ["Kenya", "🇰🇪"],
  KI: ["Kiribati", "🇰🇮"],
  KP: ["North Korea", "🇰🇵"],
  KR: ["South Korea", "🇰🇷"],
  XK: ["Kosovo", "🇽🇰"],
  KW: ["Kuwait", "🇰🇼"],
  KG: ["Kyrgyzstan", "🇰🇬"],
  LA: ["Laos", "🇱🇦"],
  LV: ["Latvia", "🇱🇻"],
  LB: ["Lebanon", "🇱🇧"],
  LS: ["Lesotho", "🇱🇸"],
  LR: ["Liberia", "🇱🇷"],
  LY: ["Libya", "🇱🇾"],
  LI: ["Liechtenstein", "🇱🇮"],
  LT: ["Lithuania", "🇱🇹"],
  LU: ["Luxembourg", "🇱🇺"],
  MG: ["Madagascar", "🇲🇬"],
  MW: ["Malawi", "🇲🇼"],
  MY: ["Malaysia", "🇲🇾"],
  MV: ["Maldives", "🇲🇻"],
  ML: ["Mali", "🇲🇱"],
  MT: ["Malta", "🇲🇹"],
  MH: ["Marshall Islands", "🇲🇭"],
  MR: ["Mauritania", "🇲🇷"],
  MU: ["Mauritius", "🇲🇺"],
  MX: ["Mexico", "🇲🇽"],
  FM: ["Micronesia", "🇫🇲"],
  MD: ["Moldova", "🇲🇩"],
  MC: ["Monaco", "🇲🇨"],
  MN: ["Mongolia", "🇲🇳"],
  ME: ["Montenegro", "🇲🇪"],
  MA: ["Morocco", "🇲🇦"],
  MZ: ["Mozambique", "🇲🇿"],
  MM: ["Myanmar", "🇲🇲"],
  NA: ["Namibia", "🇳🇦"],
  NR: ["Nauru", "🇳🇷"],
  NP: ["Nepal", "🇳🇵"],
  NL: ["Netherlands", "🇳🇱"],
  NZ: ["New Zealand", "🇳🇿"],
  NI: ["Nicaragua", "🇳🇮"],
  NE: ["Niger", "🇳🇪"],
  NG: ["Nigeria", "🇳🇬"],
  MK: ["North Macedonia", "🇲🇰"],
  NO: ["Norway", "🇳🇴"],
  OM: ["Oman", "🇴🇲"],
  PK: ["Pakistan", "🇵🇰"],
  PW: ["Palau", "🇵🇼"],
  PS: ["Palestine", "🇵🇸"],
  PA: ["Panama", "🇵🇦"],
  PG: ["Papua New Guinea", "🇵🇬"],
  PY: ["Paraguay", "🇵🇾"],
  PE: ["Peru", "🇵🇪"],
  PH: ["Philippines", "🇵🇭"],
  PL: ["Poland", "🇵🇱"],
  PT: ["Portugal", "🇵🇹"],
  QA: ["Qatar", "🇶🇦"],
  RO: ["Romania", "🇷🇴"],
  RU: ["Russia", "🇷🇺"],
  RW: ["Rwanda", "🇷🇼"],
  KN: ["Saint Kitts and Nevis", "🇰🇳"],
  LC: ["Saint Lucia", "🇱🇨"],
  VC: ["Saint Vincent and the Grenadines", "🇻🇨"],
  WS: ["Samoa", "🇼🇸"],
  SM: ["San Marino", "🇸🇲"],
  ST: ["Sao Tome and Principe", "🇸🇹"],
  SA: ["Saudi Arabia", "🇸🇦"],
  SN: ["Senegal", "🇸🇳"],
  RS: ["Serbia", "🇷🇸"],
  SC: ["Seychelles", "🇸🇨"],
  SL: ["Sierra Leone", "🇸🇱"],
  SG: ["Singapore", "🇸🇬"],
  SK: ["Slovakia", "🇸🇰"],
  SI: ["Slovenia", "🇸🇮"],
  SB: ["Solomon Islands", "🇸🇧"],
  SO: ["Somalia", "🇸🇴"],
  ZA: ["South Africa", "🇿🇦"],
  SS: ["South Sudan", "🇸🇸"],
  ES: ["Spain", "🇪🇸"],
  LK: ["Sri Lanka", "🇱🇰"],
  SD: ["Sudan", "🇸🇩"],
  SR: ["Suriname", "🇸🇷"],
  SE: ["Sweden", "🇸🇪"],
  CH: ["Switzerland", "🇨🇭"],
  SY: ["Syria", "🇸🇾"],
  TW: ["Taiwan", "🇹🇼"],
  TJ: ["Tajikistan", "🇹🇯"],
  TZ: ["Tanzania", "🇹🇿"],
  TH: ["Thailand", "🇹🇭"],
  TL: ["Timor-Leste", "🇹🇱"],
  TG: ["Togo", "🇹🇬"],
  TO: ["Tonga", "🇹🇴"],
  TT: ["Trinidad and Tobago", "🇹🇹"],
  TN: ["Tunisia", "🇹🇳"],
  TR: ["Turkey", "🇹🇷"],
  TM: ["Turkmenistan", "🇹🇲"],
  TV: ["Tuvalu", "🇹🇻"],
  UG: ["Uganda", "🇺🇬"],
  UA: ["Ukraine", "🇺🇦"],
  AE: ["United Arab Emirates", "🇦🇪"],
  GB: ["United Kingdom", "🇬🇧"],
  US: ["United States", "🇺🇸"],
  UY: ["Uruguay", "🇺🇾"],
  UZ: ["Uzbekistan", "🇺🇿"],
  VU: ["Vanuatu", "🇻🇺"],
  VA: ["Vatican City", "🇻🇦"],
  VE: ["Venezuela", "🇻🇪"],
  VN: ["Vietnam", "🇻🇳"],
  XX: ["Unknown", "🏴‍☠️"],
  YE: ["Yemen", "🇾🇪"],
  ZM: ["Zambia", "🇿🇲"],
  ZW: ["Zimbabwe", "🇿🇼"]
});
