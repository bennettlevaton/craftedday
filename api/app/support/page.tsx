import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support — CraftedDay',
};

export default function Support() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="flex items-center justify-between px-8 py-6 max-w-3xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="CraftedDay" width={28} height={28} className="opacity-90" />
          <span className="font-serif text-xl text-primary tracking-tight">CraftedDay</span>
        </Link>
      </nav>

      <main className="flex-1 px-6 pb-20 max-w-3xl mx-auto w-full">
        <h1 className="font-serif text-4xl text-primary mb-4 mt-8">Support</h1>
        <p className="text-muted text-lg mb-14 leading-relaxed">
          We&apos;re here to help. Reach out any time.
        </p>

        {/* Contact */}
        <section className="mb-14 bg-surface border border-divider rounded-2xl px-8 py-8">
          <h2 className="font-serif text-xl text-primary mb-2">Get in touch</h2>
          <p className="text-muted text-sm mb-5">For questions, feedback, or account help — email us directly.</p>
          <a
            href="mailto:support@craftedday.com"
            className="inline-flex items-center gap-2 bg-accent text-white px-6 py-3 rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
          >
            support@craftedday.com
          </a>
          <p className="text-xs text-muted mt-4">We typically respond within 1–2 business days.</p>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="font-serif text-2xl text-primary mb-8">Common questions</h2>
          <div className="flex flex-col gap-6">
            {[
              {
                q: 'How do I cancel my subscription?',
                a: (
                  <>
                    Subscriptions are managed through Apple. To cancel:
                    <ol className="list-decimal list-inside mt-2 space-y-1 pl-1">
                      <li>Open <strong className="font-medium">Settings</strong> on your iPhone</li>
                      <li>Tap your name at the top</li>
                      <li>Tap <strong className="font-medium">Subscriptions</strong></li>
                      <li>Select <strong className="font-medium">CraftedDay</strong></li>
                      <li>Tap <strong className="font-medium">Cancel Subscription</strong></li>
                    </ol>
                    <p className="mt-2">You&apos;ll retain access until the end of the current billing period.</p>
                  </>
                ),
              },
              {
                q: 'How do I delete my account?',
                a: 'Email us at support@craftedday.com with the subject line "Delete my account." We\'ll permanently remove your account and all associated data within 30 days.',
              },
              {
                q: 'Why isn\'t my daily session showing up?',
                a: 'Daily sessions are generated each morning. If yours hasn\'t appeared, pull to refresh on the home screen. If the issue persists, email us.',
              },
              {
                q: 'Can I request a refund?',
                a: 'Refunds are handled by Apple. Visit reportaproblem.apple.com and select your CraftedDay purchase to request a refund.',
              },
              {
                q: 'Is CraftedDay suitable for people with anxiety or depression?',
                a: 'CraftedDay is a mindfulness and relaxation tool — it is not a medical device or clinical treatment. If you\'re managing a mental health condition, please consult a qualified healthcare professional before using any wellness app.',
              },
            ].map(({ q, a }) => (
              <div key={q} className="border-b border-divider pb-6 last:border-0 last:pb-0">
                <h3 className="font-serif text-lg text-primary mb-2">{q}</h3>
                <div className="text-primary/80 text-sm leading-relaxed">{typeof a === 'string' ? <p>{a}</p> : a}</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-divider px-6 py-8">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
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
