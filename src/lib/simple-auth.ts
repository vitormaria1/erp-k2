import { cookies } from "next/headers";

export const AUTH_COOKIE_NAME = "k2_session";
const AUTH_COOKIE_VALUE = "k2_admin_session_v1";
export const FINANCE_AUTH_COOKIE_NAME = "k2_finance_session";
const FINANCE_AUTH_COOKIE_VALUE = "k2_finance_session_v1";

export const SIMPLE_LOGIN_USERNAME = "admin";
export const SIMPLE_LOGIN_PASSWORD = "k2123";
export const SIMPLE_FINANCE_PIN = "1975";

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
  cookieStore.delete(FINANCE_AUTH_COOKIE_NAME);
}

export async function isFinanceAuthenticated() {
  const cookieStore = await cookies();
  return cookieStore.get(FINANCE_AUTH_COOKIE_NAME)?.value === FINANCE_AUTH_COOKIE_VALUE;
}

export async function createFinanceSession() {
  const cookieStore = await cookies();
  cookieStore.set(FINANCE_AUTH_COOKIE_NAME, FINANCE_AUTH_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/financeiro",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearFinanceSession() {
  const cookieStore = await cookies();
  cookieStore.delete(FINANCE_AUTH_COOKIE_NAME);
}
