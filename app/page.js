import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Zap,
  ShieldCheck,
  RefreshCcw,
  Wallet,
  Layers,
  BellRing,
  ArrowRight,
  UserPlus,
  MousePointerClick,
  PhoneIncoming,
  MessageSquareText,
  Smartphone,
  KeyRound,
  Send,
  Rocket,
} from "lucide-react";
import { getSessionProfile } from "@/lib/auth";
import MarketingHeader from "@/components/MarketingHeader";
import MarketingFooter from "@/components/MarketingFooter";
import FaqAccordion from "@/components/FaqAccordion";
import { FAQ_PREVIEW } from "@/lib/faq-data";

// The four product lines the platform actually sells, in the same order
// and with the same icons/labels as the logged-in dashboard's quick-nav
// grid (components/QuickLinksGrid.js) and sidebar, so a visitor sees the
// exact same product names once they sign up — nothing here is renamed or
// re-scoped for marketing purposes.
const PRODUCTS = [
  {
    icon: Smartphone,
    title: "SMS number rentals",
    desc: "Real phone numbers on demand for WhatsApp, Telegram, and dozens of other verifications — USA & Canada, US-only, or worldwide, short-term or long-term.",
  },
  {
    icon: KeyRound,
    title: "Digital accounts & logs",
    desc: "Ready-made social media accounts and logs across platforms, organized by category, with full account details delivered instantly on purchase.",
  },
  {
    icon: Send,
    title: "Telegram Premium & Stars",
    desc: "Gift a Telegram Premium subscription or top up Telegram Stars for any username — delivered straight to their account.",
  },
  {
    icon: Rocket,
    title: "Social Boost",
    desc: "Grow followers, likes, views, and more across social platforms, with reliable delivery and cancel-anytime protection on active orders.",
  },
];

const STEPS = [
  {
    icon: UserPlus,
    title: "Create an account",
    desc: "Sign up in a minute and your wallet is ready to fund.",
  },
  {
    icon: MousePointerClick,
    title: "Pick a product",
    desc: "Numbers, digital accounts, Telegram Premium & Stars, or Social Boost — choose what you need and confirm the price.",
  },
  {
    icon: PhoneIncoming,
    title: "Get it instantly",
    desc: "Numbers and digital accounts are reserved the moment you buy; Telegram and Social Boost orders start processing right away.",
  },
  {
    icon: MessageSquareText,
    title: "Track it in your dashboard",
    desc: "Codes, credentials, and order status all land in your dashboard — no manual refreshing.",
  },
];

const FEATURES = [
  {
    icon: Zap,
    title: "Instant delivery",
    desc: "Numbers, digital accounts, and Telegram orders are fulfilled immediately and pushed to your dashboard as soon as they're ready.",
  },
  {
    icon: Layers,
    title: "One wallet, every product",
    desc: "SMS verification, digital accounts, Telegram Premium & Stars, and Social Boost — fund your balance once and use it across all of them.",
  },
  {
    icon: RefreshCcw,
    title: "Long-term numbers",
    desc: "Keep the same number for a day, a week, or a month when a service needs ongoing access.",
  },
  {
    icon: Wallet,
    title: "Simple wallet billing",
    desc: "Fund your balance once and pay per order — no surprise line items.",
  },
  {
    icon: ShieldCheck,
    title: "Your data, private",
    desc: "Only you can see the codes, credentials, and order details delivered to your account.",
  },
  {
    icon: BellRing,
    title: "Live status updates",
    desc: "Watch a rental or order move from waiting to delivered in real time, right on its page.",
  },
];

export default async function HomePage() {
  const { user, profile } = await getSessionProfile();
  if (user) redirect(profile?.role === "admin" ? "/admin" : "/dashboard");

  return (
    <div className="min-h-screen flex flex-col">
      <MarketingHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white dark:from-night-900 dark:to-night-950">
          <div className="max-w-6xl mx-auto px-5 md:px-8 pt-20 pb-24 text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-800 dark:text-brand-300 text-xs font-bold px-4 py-1.5 mb-6">
              One wallet, every digital product
            </span>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-night-100 max-w-3xl mx-auto leading-[1.1]">
              SMS numbers, digital accounts, Telegram & social growth — <span className="text-brand-600 dark:text-brand-400">all in one place</span>.
            </h1>
            <p className="text-lg text-gray-500 dark:text-night-300 max-w-xl mx-auto mt-6">
              NexaVerify rents you real phone numbers for verification, sells ready-made digital
              accounts and logs, gifts Telegram Premium & Stars, and boosts your social accounts —
              all from one wallet, with instant delivery to your dashboard.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9">
              <Link href="/login?mode=signup" className="btn-primary text-base px-7 py-3">
                Get started <ArrowRight size={18} />
              </Link>
              <Link href="#products" className="btn-secondary text-base px-7 py-3">
                See our products
              </Link>
            </div>
          </div>
        </section>

        {/* Products */}
        <section id="products" className="max-w-6xl mx-auto px-5 md:px-8 py-20 scroll-mt-16">
          <div className="text-center max-w-xl mx-auto mb-14">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-night-100">Our products</h2>
            <p className="text-gray-500 dark:text-night-300 mt-3">
              Four product lines, one account and one wallet to pay for all of them.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {PRODUCTS.map((p) => (
              <div key={p.title} className="card card-pad">
                <div className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center mb-4">
                  <p.icon size={22} />
                </div>
                <div className="font-bold text-base mb-1.5 dark:text-night-100">{p.title}</div>
                <p className="text-sm text-gray-500 dark:text-night-300">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="max-w-6xl mx-auto px-5 md:px-8 py-20 scroll-mt-16">
          <div className="text-center max-w-xl mx-auto mb-14">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-night-100">How it works</h2>
            <p className="text-gray-500 dark:text-night-300 mt-3">From sign-up to code delivered, in four steps.</p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
            {STEPS.map((step, i) => (
              <div key={step.title} className="relative card card-pad">
                <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center mb-4">
                  <step.icon size={20} />
                </div>
                <div className="text-xs font-bold text-brand-600 dark:text-brand-400 mb-1">STEP {i + 1}</div>
                <div className="font-bold text-sm mb-1.5 dark:text-night-100">{step.title}</div>
                <p className="text-sm text-gray-500 dark:text-night-300">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="bg-gray-50 dark:bg-night-900 border-y border-gray-100 dark:border-night-800 scroll-mt-16">
          <div className="max-w-6xl mx-auto px-5 md:px-8 py-20">
            <div className="text-center max-w-xl mx-auto mb-14">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-night-100">Built for reliability</h2>
              <p className="text-gray-500 dark:text-night-300 mt-3">
                Everything you need across numbers, accounts, Telegram, and social growth — without babysitting the process.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {FEATURES.map((f) => (
                <div key={f.title} className="card card-pad bg-white dark:bg-night-950">
                  <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center mb-4">
                    <f.icon size={20} />
                  </div>
                  <div className="font-bold text-sm mb-1.5 dark:text-night-100">{f.title}</div>
                  <p className="text-sm text-gray-500 dark:text-night-300">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ preview */}
        <section className="max-w-3xl mx-auto px-5 md:px-8 py-20">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-night-100">Frequently asked questions</h2>
            <p className="text-gray-500 dark:text-night-300 mt-3">A few things people usually ask before getting started.</p>
          </div>

          <FaqAccordion items={FAQ_PREVIEW} />

          <div className="text-center mt-8">
            <Link href="/faq" className="btn-secondary">
              View all FAQs <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-gradient-to-br from-brand-800 to-brand-500 dark:from-night-900 dark:to-brand-800 text-white">
          <div className="max-w-4xl mx-auto px-5 md:px-8 py-16 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/nexaverify-mark.png" alt="" className="h-12 w-auto mx-auto mb-5" />
            <h2 className="text-3xl font-bold mb-3">Ready to get started?</h2>
            <p className="text-white/80 max-w-lg mx-auto mb-8">
              Create an account, fund your wallet, and get your first number, account, or order in under a minute.
            </p>
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 bg-white text-brand-800 font-semibold px-7 py-3 rounded-lg hover:bg-brand-50 transition"
            >
              Get started <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
