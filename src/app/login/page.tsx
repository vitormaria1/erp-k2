import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { isAuthenticated } from "@/lib/simple-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAuthenticated()) {
    redirect("/dashboard");
  }

  return (
    <main className="login-shell relative min-h-screen overflow-hidden">
      <div className="login-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-10">
        <div className="w-full max-w-[560px]">
          <div className="mb-6 text-center text-2xl font-medium tracking-[0.08em] text-white/90 sm:mb-8 sm:text-3xl">
            Refletindo o Amor no Sabor
          </div>
          <div className="relative">
            <LoginForm />
          </div>
        </div>
      </div>
    </main>
  );
}
