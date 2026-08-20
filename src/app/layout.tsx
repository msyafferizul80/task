import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Syazna-OS | Pengurusan Tugasan',
  description: 'Sistem pengurusan tugasan, penjejakan masa & kelulusan Syazna-OS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ms" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased text-slate-800 bg-slate-50 min-h-screen selection:bg-cyan-100 selection:text-cyan-900">
        {children}
      </body>
    </html>
  );
}
