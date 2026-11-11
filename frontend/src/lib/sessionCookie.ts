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
