export const SESSION_COOKIE_NAME = "session_token";

type CookieMutator = {
  set: (options: {
    name: string;
    value: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
    maxAge?: number;
    expires?: Date;
  }) => unknown;
};

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export function setSessionCookie(store: CookieMutator, token: string) {
  store.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    ...sessionCookieOptions(),
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie(store: CookieMutator) {
  store.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    ...sessionCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(padded, "base64").toString("utf8")
        : atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Cookie presence plus unexpired JWT exp. Signature is still checked by FastAPI. */
export function hasLiveSessionToken(token?: string | null): boolean {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  if (typeof payload.exp !== "number") return true;
  return payload.exp * 1000 > Date.now() + 5000;
}
