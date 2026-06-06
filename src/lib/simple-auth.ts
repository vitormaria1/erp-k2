import { cookies } from "next/headers";

export const AUTH_COOKIE_NAME = "k2_session";
const AUTH_COOKIE_VALUE = "k2_admin_session_v1";

export const SIMPLE_LOGIN_USERNAME = "admin";
export const SIMPLE_LOGIN_PASSWORD = "k2123";

export async function isAuthenticated() {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value === AUTH_COOKIE_VALUE;
}

export async function createSession() {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, AUTH_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}
