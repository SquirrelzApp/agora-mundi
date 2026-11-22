import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "globeTake | Global Civic Debate & Intellectual Discourse Platform",
  description:
    "An open platform for pure debate and global affairs commentary for everyone. No racism, no profanity, no noise. Pure intellectual and political competition.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased selection:bg-authority selection:text-white">
        {children}
      </body>
    </html>
  );
}
