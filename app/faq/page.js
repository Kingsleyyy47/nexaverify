import Link from "next/link";
import { ArrowRight } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import MarketingFooter from "@/components/MarketingFooter";
import FaqAccordion from "@/components/FaqAccordion";
import { FAQ_CATEGORIES } from "@/lib/faq-data";

export const metadata = {
  title: "FAQ — NexaVerify",
};

export default function FaqPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingHeader />

      <main className="flex-1 bg-gradient-to-b from-brand-50 to-white dark:from-night-900 dark:to-night-950">
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-extrabold text-gray-900 dark:text-night-100">Frequently asked questions</h1>
            <p className="text-gray-500 dark:text-night-300 mt-3">
              Everything about accounts, buying numbers, and long-term rentals.
            </p>
          </div>

          <div className="space-y-10">
            {FAQ_CATEGORIES.map((category) => (
              <div key={category.title}>
                <h2 className="text-sm font-bold uppercase tracking-wide text-brand-700 dark:text-brand-400 mb-3">
                  {category.title}
                </h2>
                <FaqAccordion items={category.items} />
              </div>
            ))}
          </div>

          <div className="text-center mt-14 card card-pad bg-white dark:bg-night-900">
            <div className="font-bold text-lg mb-1.5 dark:text-night-100">Still have questions?</div>
            <p className="text-sm text-gray-500 dark:text-night-300 mb-5">
              Sign up and reach out from your account — we're happy to help.
            </p>
            <Link href="/login?mode=signup" className="btn-primary inline-flex">
              Get started <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
