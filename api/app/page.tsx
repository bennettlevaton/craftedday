import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="CraftedDay" width={28} height={28} className="opacity-90" />
          <span className="font-serif text-xl text-primary tracking-tight">CraftedDay</span>
        </div>
        <Link href="/support" className="text-sm text-muted hover:text-primary transition-colors">
          Support
        </Link>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-16 pb-24 max-w-2xl mx-auto">
        {/* Breathing circle — mirrors the player screen */}
        <div className="relative flex items-center justify-center mb-14 select-none">
          <div
            className="breathe rounded-full"
            style={{ width: 200, height: 200, background: 'radial-gradient(circle, rgba(193,122,74,0.22) 0%, rgba(193,122,74,0.04) 100%)' }}
          />
          <div
            className="breathe-inner absolute rounded-full"
            style={{ width: 110, height: 110, backgroundColor: 'rgba(193,122,74,0.13)' }}
          />
        </div>

        <h1 className="font-serif text-4xl sm:text-5xl font-normal leading-tight text-primary mb-5">
          Your daily meditation,<br />made for you.
        </h1>
        <p className="text-muted text-lg leading-relaxed mb-10 max-w-md">
          A new AI-generated session every morning — personalized to your experience, goals, and how you&apos;ve been feeling.
        </p>

        {/* App Store CTA */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3 bg-primary text-surface px-7 py-4 rounded-full opacity-50 cursor-not-allowed select-none">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            <span className="text-sm font-medium">Download on the App Store</span>
          </div>
          <span className="text-xs text-muted">Coming soon</span>
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-divider" />

      {/* How it works */}
      <section className="px-6 py-20 max-w-2xl mx-auto w-full">
        <h2 className="font-serif text-2xl text-primary mb-12 text-center">How it works</h2>
        <div className="flex flex-col sm:flex-row gap-10 sm:gap-6">
          {[
            { n: '1', title: 'Tell us about you', body: 'Share your experience level, goals, and how you\'re feeling today.' },
            { n: '2', title: 'We craft your session', body: 'A meditation is generated just for you — script, pacing, and voice included.' },
            { n: '3', title: 'Listen and reflect', body: 'Your session is ready every morning. Check in after and we\'ll get better over time.' },
          ].map(({ n, title, body }) => (
            <div key={n} className="flex-1 flex flex-col gap-3">
              <span className="font-serif text-3xl text-accent">{n}</span>
              <h3 className="font-serif text-lg text-primary">{title}</h3>
              <p className="text-muted text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-divider" />

      {/* What you get */}
      <section className="px-6 py-20 max-w-2xl mx-auto w-full">
        <h2 className="font-serif text-2xl text-primary mb-10 text-center">What you get</h2>
        <ul className="flex flex-col gap-4">
          {[
            'A fresh session generated for you every morning',
            'AI voice that adapts to your experience and pace',
            'Mood check-ins that make each session better than the last',
            'Full session history — revisit any meditation, any time',
            'Background music that stays in sync with your voice guide',
          ].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <span className="mt-1 w-4 h-4 flex-shrink-0 rounded-full bg-accent/20 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-accent block" />
              </span>
              <span className="text-primary text-base leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>

        {/* Subscription note */}
        <p className="mt-10 text-sm text-muted text-center leading-relaxed border border-divider rounded-2xl px-6 py-4 bg-surface">
          CraftedDay is free to explore. Daily generated sessions and full personalization require a premium subscription.
        </p>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-divider px-6 py-8">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
          <span>© {new Date().getFullYear()} Bennett Levaton</span>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
            <Link href="/support" className="hover:text-primary transition-colors">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
