"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

type NavItem = { href: string; label: string };

const nav: NavItem[] = [
  { href: "/rotas", label: "Rotas" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pedidos", label: "Pedidos" },
  { href: "/carregamentos", label: "Carregamento" },
  { href: "/producao", label: "Produção" },
  { href: "/compras", label: "Compras" },
  { href: "/estoque", label: "Estoque" },
  { href: "/nota-fiscal", label: "Nota Fiscal" },
  { href: "/financeiro", label: "Financeiro" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/clientes", label: "Clientes" },
  { href: "/fornecedores", label: "Fornecedores" },
  { href: "/configuracoes", label: "Configurações" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-[280px] shrink-0 bg-gradient-to-b from-[#b30000] via-[#b30000] to-[#6b0000] text-white">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 overflow-hidden rounded-full bg-white ring-2 ring-white/30">
            <Image src="/k2-logo.jpeg" alt="K2 Salgados" fill className="object-cover" priority />
          </div>
          <div className="leading-tight">
            <div className="text-sm opacity-90">K2 Salgados</div>
            <div className="text-lg font-semibold">ERP</div>
          </div>
        </div>
      </div>

      <nav className="px-4 pb-6">
        <ul className="space-y-1">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={[
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                    active ? "bg-[var(--k2-gold)] text-black" : "hover:bg-white/10",
                  ].join(" ")}
                >
                  <span className="h-2 w-2 rounded-full bg-white/70" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto px-6 pb-6">
        <div className="rounded-2xl bg-white/10 p-4 text-sm">
          <div className="font-semibold">Vítor S. Maria</div>
          <div className="opacity-80">Administrador</div>
        </div>
      </div>
    </aside>
  );
}
