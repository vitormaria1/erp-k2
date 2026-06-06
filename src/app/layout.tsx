import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP K2 Salgados",
  description: "ERP para pedidos, estoque, financeiro e relatórios da K2 Salgados.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
