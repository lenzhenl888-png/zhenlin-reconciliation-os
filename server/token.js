import crypto from "node:crypto";

const defaultSecret = "dev-only-change-me";

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(text, secret) {
  return crypto.createHmac("sha256", secret).update(text).digest("base64url");
}

export function getTokenSecret() {
  return process.env.JWT_SECRET || process.env.AUTH_TOKEN_SECRET || defaultSecret;
}

export function createToken(payload, expiresInSeconds = 60 * 60 * 8) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedBody = base64url(JSON.stringify(body));
  const signature = sign(`${encodedHeader}.${encodedBody}`, getTokenSecret());
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

export function verifyToken(token) {
  const [encodedHeader, encodedBody, signature] = String(token).split(".");
  if (!encodedHeader || !encodedBody || !signature) throw new Error("INVALID_TOKEN");
  const expected = sign(`${encodedHeader}.${encodedBody}`, getTokenSecret());
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("INVALID_TOKEN");
  }
  const payload = JSON.parse(Buffer.from(encodedBody, "base64url").toString("utf8"));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("TOKEN_EXPIRED");
  return payload;
}
