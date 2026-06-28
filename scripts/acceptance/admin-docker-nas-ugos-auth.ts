import { constants, randomUUID, publicEncrypt } from "node:crypto";

type FetchLike = typeof fetch;

export interface UgosAuthInputs {
  cookie_present: boolean;
  query_token_present: boolean;
  x_ugreen_auth_present: boolean;
  authorization_present: boolean;
  username_password_present: boolean;
  password_login_attempted: boolean;
  password_login_succeeded: boolean;
  password_login_code: string;
  password_login_message: string;
  password_login_token_present: boolean;
  password_login_cookie_present: boolean;
}

export interface UgosAuthResolution {
  headers: Record<string, string>;
  query_token: string;
  inputs: UgosAuthInputs;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function publicKeyPemFromToken(token: string): string {
  const decoded = Buffer.from(token, "base64").toString("utf8").trim();
  if (decoded.includes("BEGIN RSA PUBLIC KEY")) {
    return decoded
      .replace("BEGIN RSA PUBLIC KEY", "BEGIN PUBLIC KEY")
      .replace("END RSA PUBLIC KEY", "END PUBLIC KEY");
  }
  if (decoded.includes("BEGIN")) {
    return decoded;
  }
  return `-----BEGIN PUBLIC KEY-----\n${decoded}\n-----END PUBLIC KEY-----`;
}

function encryptPassword(publicKeyToken: string, password: string): string {
  return publicEncrypt({
    key: publicKeyPemFromToken(publicKeyToken),
    padding: constants.RSA_PKCS1_PADDING
  }, Buffer.from(password, "utf8")).toString("base64");
}

function cookieHeaderFromResponse(headers: Headers): string {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = withGetSetCookie.getSetCookie?.() ?? [];
  const fallback = headers.get("set-cookie");
  const values = setCookies.length > 0 ? setCookies : (fallback ? [fallback] : []);

  return values
    .map((item) => item.split(";")[0]?.trim() ?? "")
    .filter(Boolean)
    .join("; ");
}

async function fetchWithTimeout(input: {
  fetchImpl: FetchLike;
  url: string;
  timeout_ms: number;
  init: RequestInit;
}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeout_ms);
  try {
    return await input.fetchImpl(input.url, {
      ...input.init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function loginWithPassword(input: {
  fetchImpl: FetchLike;
  baseUrl: string;
  username: string;
  password: string;
  timeout_ms: number;
}): Promise<{
  headers: Record<string, string>;
  query_token: string;
  succeeded: boolean;
  code: string;
  message: string;
  token_present: boolean;
  cookie_present: boolean;
}> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const clientId = `mixlab-codex-${randomUUID()}`;
  const checkResponse = await fetchWithTimeout({
    fetchImpl: input.fetchImpl,
    url: `${baseUrl}/ugreen/v1/verify/check`,
    timeout_ms: input.timeout_ms,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "UG-Client-Id": clientId
      },
      body: JSON.stringify({ username: input.username })
    }
  });
  const rsaToken = checkResponse.headers.get("x-rsa-token") ?? "";
  if (!checkResponse.ok || !rsaToken) {
    return {
      headers: {},
      query_token: "",
      succeeded: false,
      code: String(checkResponse.status),
      message: "rsa-token-missing",
      token_present: false,
      cookie_present: false
    };
  }

  const loginResponse = await fetchWithTimeout({
    fetchImpl: input.fetchImpl,
    url: `${baseUrl}/ugreen/v1/verify/login`,
    timeout_ms: input.timeout_ms,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "UG-Client-Id": clientId
      },
      body: JSON.stringify({
        username: input.username,
        password: encryptPassword(rsaToken, input.password),
        keepalive: false,
        otp: true,
        is_simple: false
      })
    }
  });
  const parsed = asRecord(await loginResponse.json().catch(() => null));
  const data = asRecord(parsed.data);
  const token = asString(data.api_token) ||
    asString(data.static_token) ||
    asString(data.token) ||
    asString(parsed.api_token) ||
    asString(parsed.static_token) ||
    asString(parsed.token);
  const cookie = cookieHeaderFromResponse(loginResponse.headers);
  const headers: Record<string, string> = {};
  if (cookie) {
    headers.Cookie = cookie;
  }

  return {
    headers,
    query_token: token,
    succeeded: loginResponse.ok && (token.length > 0 || cookie.length > 0),
    code: asString(parsed.code) || String(loginResponse.status),
    message: asString(parsed.msg) || asString(parsed.message),
    token_present: token.length > 0,
    cookie_present: cookie.length > 0
  };
}

export async function resolveUgosAuthFromEnv(input: {
  env: NodeJS.ProcessEnv;
  baseUrl: string;
  fetchImpl?: FetchLike;
  timeout_ms?: number;
}): Promise<UgosAuthResolution> {
  const env = input.env;
  const headers: Record<string, string> = {};
  const cookie = env.MIXLAB_UGOS_COOKIE?.trim();
  const queryToken = env.MIXLAB_UGOS_TOKEN?.trim();
  const xUgreenAuth = env.MIXLAB_UGOS_X_UGREEN_AUTH?.trim();
  const authorization = env.MIXLAB_UGOS_AUTHORIZATION?.trim();
  const username = env.MIXLAB_UGOS_USERNAME?.trim() || env.MIXLAB_NAS_USERNAME?.trim();
  const password = env.MIXLAB_UGOS_PASSWORD ?? env.MIXLAB_NAS_PASSWORD ?? "";

  if (cookie) {
    headers.Cookie = cookie;
  }
  if (xUgreenAuth) {
    headers["X-Ugreen-Auth"] = xUgreenAuth;
  }
  if (authorization) {
    headers.Authorization = authorization;
  }

  const explicitAuthPresent = Boolean(cookie || queryToken || xUgreenAuth || authorization);
  const passwordLoginAllowed = !explicitAuthPresent && Boolean(username && password);
  let loginHeaders: Record<string, string> = {};
  let loginQueryToken = "";
  let loginSucceeded = false;
  let loginCode = "";
  let loginMessage = "";
  let loginTokenPresent = false;
  let loginCookiePresent = false;

  if (passwordLoginAllowed) {
    const login = await loginWithPassword({
      fetchImpl: input.fetchImpl ?? fetch,
      baseUrl: input.baseUrl,
      username,
      password,
      timeout_ms: input.timeout_ms ?? 8000
    }).catch((error) => ({
      headers: {},
      query_token: "",
      succeeded: false,
      code: "exception",
      message: error instanceof Error ? error.message : String(error),
      token_present: false,
      cookie_present: false
    }));
    loginHeaders = login.headers;
    loginQueryToken = login.query_token;
    loginSucceeded = login.succeeded;
    loginCode = login.code;
    loginMessage = login.message;
    loginTokenPresent = login.token_present;
    loginCookiePresent = login.cookie_present;
  }

  return {
    headers: {
      ...headers,
      ...loginHeaders
    },
    query_token: queryToken || loginQueryToken,
    inputs: {
      cookie_present: Boolean(cookie || loginHeaders.Cookie),
      query_token_present: Boolean(queryToken || loginQueryToken),
      x_ugreen_auth_present: Boolean(xUgreenAuth),
      authorization_present: Boolean(authorization),
      username_password_present: Boolean(username && password),
      password_login_attempted: passwordLoginAllowed,
      password_login_succeeded: loginSucceeded,
      password_login_code: loginCode,
      password_login_message: loginMessage,
      password_login_token_present: loginTokenPresent,
      password_login_cookie_present: loginCookiePresent
    }
  };
}
