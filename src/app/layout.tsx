import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "globeTake | Küresel Sek Tartışma ve Zihinsel Rekabet Platformu",
  description:
    "Her yaşa, herkese hitap eden sek tartışma ve küresel gündeme yorum platformu. Irkçılık yok, küfür yok, gösteriş yok. Saf zihinsel ve politik rekabet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-paper text-ink antialiased selection:bg-authority selection:text-white">
        {children}
      </body>
    </html>
  );
}
