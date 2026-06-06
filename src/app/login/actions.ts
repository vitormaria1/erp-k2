"use server";

import { redirect } from "next/navigation";

import {
  SIMPLE_LOGIN_PASSWORD,
  SIMPLE_LOGIN_USERNAME,
  createSession,
  clearSession,
} from "@/lib/simple-auth";

export type LoginState = {
  error: string | null;
};

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (username !== SIMPLE_LOGIN_USERNAME || password !== SIMPLE_LOGIN_PASSWORD) {
    return { error: "Usuário ou senha inválidos." };
  }

  await createSession();
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
