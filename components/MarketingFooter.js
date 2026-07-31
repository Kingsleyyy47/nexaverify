import Link from "next/link";

export default function MarketingFooter() {
  return (
    <footer className="border-t border-gray-100 dark:border-night-800 bg-white dark:bg-night-950">
      <div className="max-w-6xl mx-auto px-5 md:px-8 py-12 grid gap-10 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5 font-extrabold text-base text-brand-900 dark:text-night-100 mb-3">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700" />
            NexaVerify
          </div>
          <p className="text-sm text-gray-500 dark:text-night-400 max-w-xs">
            Instant phone numbers for SMS verification. Pay only for what you use.
          </p>
        </div>

        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-3">Product</div>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-night-300">
            <li>
              <Link href="/#how-it-works" className="hover:text-brand-700 dark:hover:text-brand-300">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/#features" className="hover:text-brand-700 dark:hover:text-brand-300">
                Features
              </Link>
            </li>
            <li>
              <Link href="/faq" className="hover:text-brand-700 dark:hover:text-brand-300">
                FAQ
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-night-400 mb-3">Account</div>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-night-300">
            <li>
              <Link href="/login" className="hover:text-brand-700 dark:hover:text-brand-300">
                Log in
              </Link>
            </li>
            <li>
              <Link href="/login?mode=signup" className="hover:text-brand-700 dark:hover:text-brand-300">
                Create an account
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-night-800 py-5 text-center text-xs text-gray-400 dark:text-night-500">
        © {new Date().getFullYear()} NexaVerify. All rights reserved.
      </div>
    </footer>
  );
}
