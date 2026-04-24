import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://craftedday.com'),
  title: 'CraftedDay — Your daily meditation, made for you',
  description: 'Personalized meditations shaped around your mood, goals, and experience — with a fresh session every day.',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
  openGraph: {
    title: 'CraftedDay — Your daily meditation, made for you',
    description: 'Personalized meditations shaped around your mood, goals, and experience — with a fresh session every day.',
    url: 'https://craftedday.com',
    siteName: 'CraftedDay',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'CraftedDay' }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'CraftedDay — Your daily meditation, made for you',
    description: 'Personalized meditations shaped around your mood, goals, and experience — with a fresh session every day.',
    images: ['/logo.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
