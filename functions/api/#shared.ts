
export type Env = {
  PRODUCT_ID: string,
  JWT_PRIVATE_KEY_PKCS8: string,
}

export const JWTPublicKeySPKI = `
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEFK3xjgL1y4OazahxzcvxUVcRPfYY
hixfUOoecMEXQ2c2wy95T/JgmiRh9MxPTdRwoSO1Ub1nVFII2s1d8E2RCw==
-----END PUBLIC KEY-----
`.trim();

export const corsMiddleware: PagesFunction = async (context) => {
  const response = await context.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
};

// Respond to OPTIONS method
export const corsOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
};

export type Purchase = {
  seller_id: string;
  product_id: string;
  product_name: string;
  permalink: string;
  product_permalink: string;
  short_product_id: string;
  email: string;
  price: number;
  gumroad_fee: number;
  currency: string;
  quantity: number;
  discover_fee_charged: boolean;
  can_contact: boolean;
  referrer: string;
  card: {
      visual: string | null;
      type: string | null;
      bin: string | null;
      expiry_month: string | null;
      expiry_year: string | null;
  };
  order_number: number;
  sale_id: string;
  sale_timestamp: string;  // ISO date string
  purchaser_id: string;
  variants: string;
  test: boolean;
  license_key: string;
  ip_country: string;
  is_gift_receiver_purchase: boolean;
  refunded: boolean;
  disputed: boolean;
  dispute_won: boolean;
  id: string;
  created_at: string;  // ISO date string
  custom_fields: any[];  // Assuming custom fields can vary
  chargebacked: boolean;
};

export type ResponseData = {
  success: true;
  uses: number;
  purchase: Purchase;
}|{
  success: false;
  message: string;
};
