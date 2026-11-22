import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | globeTake",
  description: "Privacy Policy for globeTake global civic discourse platform.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-paper text-ink py-12 px-4 sm:px-6">
      <article className="max-w-2xl mx-auto bg-white rounded-3xl p-6 sm:p-10 shadow-[0_10px_35px_rgba(15,23,42,0.06)] space-y-6">
        <header className="space-y-2 border-b border-gray-100 pb-4">
          <Link
            href="/"
            className="text-xs font-semibold text-authority hover:underline"
          >
            ← Back to globeTake
          </Link>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-ink">
            Privacy Policy
          </h1>
          <p className="text-xs text-slate">Last updated: November 2026</p>
        </header>

        <section className="space-y-2 text-sm text-ink/90 leading-relaxed">
          <h2 className="font-semibold text-base text-ink">
            1. Information We Collect
          </h2>
          <p>
            When you sign in to globeTake using Google or email/password, we
            store only the minimum account details required to operate your
            profile: your email address, display name, username, and optional
            profile bio or country selection.
          </p>
        </section>

        <section className="space-y-2 text-sm text-ink/90 leading-relaxed">
          <h2 className="font-semibold text-base text-ink">
            2. How We Use Your Information
          </h2>
          <p>
            Your account information is used strictly to authenticate your
            session, attribute comments and likes you choose to publish, and
            display your public contributor profile on globeTake. We never sell
            your personal data or share it with third-party advertisers.
          </p>
        </section>

        <section className="space-y-2 text-sm text-ink/90 leading-relaxed">
          <h2 className="font-semibold text-base text-ink">
            3. Cookies &amp; Security
          </h2>
          <p>
            We use a single HTTP-only session cookie to keep you signed in
            securely. Passwords are salted and hashed with scrypt, and Google
            OAuth sign-in uses standard OAuth 2.0 CSRF protection.
          </p>
        </section>

        <section className="space-y-2 text-sm text-ink/90 leading-relaxed">
          <h2 className="font-semibold text-base text-ink">
            4. Contact &amp; Data Deletion
          </h2>
          <p>
            To request account deletion or ask any privacy questions, please
            contact{" "}
            <a
              href="mailto:anilcetn@gmail.com"
              className="text-authority font-medium hover:underline"
            >
              anilcetn@gmail.com
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}
