/// <reference types="@cloudflare/workers-types/2023-07-01" />

import * as jose from 'jose'
import { badRequest, unsupportedMediaType } from '@worker-tools/response-creators'

type Env = {
  JWT_PRIVATE_KEY_PKCS8: string,
}

export const JWTPublicKey = `
-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEFK3xjgL1y4OazahxzcvxUVcRPfYY
hixfUOoecMEXQ2c2wy95T/JgmiRh9MxPTdRwoSO1Ub1nVFII2s1d8E2RCw==
-----END PUBLIC KEY-----
`.trim();

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (context.request.headers.get('Content-Type') !== 'application/x-www-form-urlencoded') return unsupportedMediaType(); 
  const fd = new URLSearchParams(await context.request.text());
  const accessToken = fd.get('access_token');
  if (!accessToken) return badRequest('Missing access_token');

  let payload: Record<string, any>;
  try {
    const jwtKey = await jose.importSPKI(JWTPublicKey, 'ES256');
    const { payload: { iat, exp, ...rest } } = await jose.jwtVerify(accessToken, jwtKey);
    payload = rest;
  } catch {
    return badRequest('Invalid access_token');
  }

  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setExpirationTime('14d')
    .sign(await jose.importPKCS8(context.env.JWT_PRIVATE_KEY_PKCS8, 'ES256'))
  
  return Response.json({ token }, { headers: [['Authorization', `Bearer ${token}`]] });
}
