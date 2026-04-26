import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — CraftedDay',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-serif text-xl text-primary mb-4">{title}</h2>
      <div className="text-primary/80 text-base leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="flex items-center justify-between px-8 py-6 max-w-3xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="CraftedDay" width={28} height={28} className="opacity-90" />
          <span className="font-serif text-xl text-primary tracking-tight">CraftedDay</span>
        </Link>
      </nav>

      <main className="flex-1 px-6 pb-20 max-w-3xl mx-auto w-full">
        <h1 className="font-serif text-4xl text-primary mb-2 mt-8">Privacy Policy</h1>
        <p className="text-muted text-sm mb-12">Effective date: April 20, 2026</p>

        <Section title="Overview">
          <p>
            CraftedDay (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is operated by Bennett Levaton, doing business as CraftedDay. This Privacy Policy explains what information we collect, how we use it, and your rights with respect to it.
          </p>
          <p>
            By using CraftedDay, you agree to the collection and use of information as described here.
          </p>
        </Section>

        <Section title="Information We Collect">
          <p><strong className="font-medium">Account information.</strong> When you sign in, we collect your name and email address through our authentication provider, Clerk. If you use Apple Sign In or Google Sign In, we receive the information you authorize those services to share.</p>
          <p><strong className="font-medium">Profile data.</strong> We store the preferences you set during onboarding and in settings: your display name, meditation experience level, primary goals, and preferred voice gender.</p>
          <p><strong className="font-medium">Session content.</strong> When you generate a meditation, we store the prompt you provided, the generated script, the audio file, and the session duration. When you complete a session check-in, we store your mood response, what helped, and any optional notes you wrote.</p>
          <p><strong className="font-medium">Usage data.</strong> We record timestamps of sessions to compute stats like streaks and total time meditated. We do not track device identifiers, advertising IDs, or precise location.</p>
        </Section>

        <Section title="How We Use Your Information">
          <p>We use your information to:</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>Generate personalized meditation sessions tailored to your profile and history</li>
            <li>Improve the quality of future sessions based on your check-in feedback</li>
            <li>Display your session history and personal stats</li>
            <li>Send optional daily reminder notifications (you may disable these at any time)</li>
            <li>Respond to support requests</li>
          </ul>
          <p>We do not sell your personal information. We do not use your data for advertising.</p>
        </Section>

        <Section title="Third-Party Services">
          <p>CraftedDay relies on the following third-party services to operate. Each has its own privacy policy.</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li><strong className="font-medium">Clerk</strong> — authentication and identity management (clerk.com)</li>
            <li><strong className="font-medium">Vercel</strong> — application hosting and serverless functions (vercel.com)</li>
            <li><strong className="font-medium">PlanetScale</strong> — database storage (planetscale.com)</li>
            <li><strong className="font-medium">Anthropic</strong> — AI generation of meditation scripts (anthropic.com). Your prompt and profile context are sent to Anthropic&apos;s API to generate your session script.</li>
            <li><strong className="font-medium">Inworld AI</strong> — text-to-speech voice synthesis (inworld.ai). The generated script is sent to Inworld to produce audio.</li>
            <li><strong className="font-medium">Cloudflare R2</strong> — audio file storage (cloudflare.com). Generated audio files are stored in Cloudflare R2.</li>
            <li><strong className="font-medium">RevenueCat</strong> — subscription management (revenuecat.com). Your app user ID, subscription status, and purchase events are processed by RevenueCat to manage billing on our behalf.</li>
            <li><strong className="font-medium">Apple</strong> — in-app purchases and subscriptions (apple.com/legal/privacy)</li>
            <li><strong className="font-medium">Vercel Web Analytics</strong> — aggregated, privacy-friendly usage analytics (vercel.com/legal/privacy-policy). We record anonymized page-view and device-type metrics. No cross-site tracking and no advertising identifiers.</li>
          </ul>
          <p>We share only the data each provider needs to perform their specific function. We do not share your information with any other third parties.</p>
        </Section>

        <Section title="Data Storage and Security">
          <p>Your data is stored in a PostgreSQL database hosted on PlanetScale and audio files in Cloudflare R2, both secured with encryption at rest and in transit. We use industry-standard practices to protect your information, including HTTPS for all communications and token-based authentication via Clerk.</p>
          <p>No method of transmission over the internet is 100% secure. We cannot guarantee absolute security, but we take reasonable precautions to protect your data.</p>
        </Section>

        <Section title="Your Rights">
          <p>You may request to:</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>Access the personal data we hold about you</li>
            <li>Correct inaccurate profile information (editable in the app)</li>
            <li>Delete your account and all associated data</li>
          </ul>
          <p>
            To request account deletion or a data export, email us at{' '}
            <a href="mailto:support@craftedday.com" className="text-accent underline underline-offset-2">support@craftedday.com</a>.
            We will process your request within 30 days.
          </p>
        </Section>

        <Section title="Children's Privacy">
          <p>CraftedDay is intended for users aged 13 and older. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us and we will delete it promptly.</p>
          <p>Users between 13 and 16 should have a parent or guardian review this Privacy Policy before use.</p>
        </Section>

        <Section title="California Privacy Rights">
          <p>If you are a California resident, you have rights under the California Consumer Privacy Act (CCPA), including the right to know, delete, and opt out of sale of personal information. We do not sell personal information. To exercise your rights, contact us at the email below.</p>
        </Section>

        <Section title="Changes to This Policy">
          <p>We may update this Privacy Policy from time to time. We will notify you of material changes by updating the effective date at the top of this page. Continued use of the app after changes constitutes your acceptance of the updated policy.</p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this Privacy Policy? Reach us at{' '}
            <a href="mailto:support@craftedday.com" className="text-accent underline underline-offset-2">support@craftedday.com</a>.
          </p>
          <p>Bennett Levaton, DBA CraftedDay — California, United States</p>
        </Section>
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
