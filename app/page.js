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
} from "lucide-react";
import { getSessionProfile } from "@/lib/auth";
import MarketingHeader from "@/components/MarketingHeader";
import MarketingFooter from "@/components/MarketingFooter";
import FaqAccordion from "@/components/FaqAccordion";
import { FAQ_PREVIEW } from "@/lib/faq-data";

const STEPS = [
  {
    icon: UserPlus,
    title: "Create an account",
    desc: "Sign up in a minute and your wallet is ready to fund.",
  },
  {
    icon: MousePointerClick,
    title: "Pick a service",
    desc: "Choose the service you need to verify and confirm the price.",
  },
  {
    icon: PhoneIncoming,
    title: "Get your number instantly",
    desc: "A real number is reserved for you the moment you buy.",
  },
  {
    icon: MessageSquareText,
    title: "Receive your code",
    desc: "The verification code lands in your dashboard within seconds.",
  },
];

const FEATURES = [
  {
    icon: Zap,
    title: "Instant delivery",
    desc: "Numbers are reserved immediately and codes are pushed to your dashboard as soon as they arrive — no manual refreshing.",
  },
  {
    icon: Layers,
    title: "Wide service coverage",
    desc: "Verify WhatsApp, Telegram, and dozens of other platforms from one account.",
  },
  {
    icon: RefreshCcw,
    title: "Long-term numbers",
    desc: "Keep the same number for a day, a week, or a month when a service needs ongoing access.",
  },
  {
    icon: Wallet,
    title: "Simple wallet billing",
    desc: "Fund your balance once and pay per number — no surprise line items.",
  },
  {
    icon: ShieldCheck,
    title: "Your codes, private",
    desc: "Only you can see the messages delivered to a number while your rental is active.",
  },
  {
    icon: BellRing,
    title: "Live status updates",
    desc: "Watch a rental go from waiting to delivered in real time, right on the numbers page.",
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
              SMS verification, made simple
            </span>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-night-100 max-w-3xl mx-auto leading-[1.1]">
              Get verified in <span className="text-brand-600 dark:text-brand-400">seconds</span>, not minutes.
            </h1>
            <p className="text-lg text-gray-500 dark:text-night-300 max-w-xl mx-auto mt-6">
              NexaVerify rents you a real phone number on demand, delivers the SMS code straight to
              your dashboard, and lets you keep numbers long-term when you need them again.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9">
              <Link href="/login?mode=signup" className="btn-primary text-base px-7 py-3">
                Get started <ArrowRight size={18} />
              </Link>
              <Link href="#how-it-works" className="btn-secondary text-base px-7 py-3">
                See how it works
              </Link>
            </div>
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
                Everything you need to verify accounts quickly, without babysitting the process.
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
            <h2 className="text-3xl font-bold mb-3">Ready to get verified?</h2>
            <p className="text-white/80 max-w-lg mx-auto mb-8">
              Create an account, fund your wallet, and rent your first number in under a minute.
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
