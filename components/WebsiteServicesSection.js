import {
  Search,
  Clock,
  Smartphone,
  ShieldCheck,
  TrendingUp,
  Pencil,
  Rocket,
  BarChart3,
  MessageCircle,
  Check,
} from "lucide-react";

const REASONS = [
  {
    icon: Search,
    title: "Show up when people search",
    desc: "Be there the moment a customer looks for a business like yours on Google.",
  },
  {
    icon: Clock,
    title: "Sell around the clock",
    desc: "Take orders and bookings while you sleep — a website never closes.",
  },
  {
    icon: ShieldCheck,
    title: "Look like a real business",
    desc: "Customers trust a business with a proper website far more than one without.",
  },
  {
    icon: TrendingUp,
    title: "Pull ahead of competitors",
    desc: "Plenty of businesses in your space still don't have one — that's your opening.",
  },
  {
    icon: Smartphone,
    title: "Great on every screen",
    desc: "Looks right whether a customer's on an iPhone, an Android, or a laptop.",
  },
  {
    icon: Pencil,
    title: "Update it yourself",
    desc: "Change a price or add a product in minutes — no developer required.",
  },
];

const PROOF = [
  {
    value: "₦600k+",
    label: "Extra yearly revenue one client tracked from just 5 new customers a month, off a ₦150,000 site.",
  },
  {
    value: "₦2M",
    label: "What a fashion retailer client made in 6 months after we built their online store.",
  },
  {
    value: "10x",
    label: "How much more customers say they trust a business once it has a professional website.",
  },
];

const PACKAGES = [
  {
    name: "Starter Website",
    tagline: "Get online, fast",
    price: "₦50,000",
    timeline: "Ready in 3-5 days",
    pitch: "For businesses losing customers who simply can't find them online yet.",
    features: [
      "5-page website, built to look good",
      "Works perfectly on phone and desktop",
      "Clear contact details customers can act on",
      "Set up to be found on Google",
      "Free hosting for the first year",
      "Small content tweaks included",
    ],
    bestFor: "Salons, restaurants, small shops, freelancers",
    highlight: false,
  },
  {
    name: "Business Builder",
    tagline: "Bring in customers every month",
    price: "₦150,000",
    timeline: "Ready in 7-10 days",
    pitch: "Built to actually bring in new customers, not just sit online looking nice.",
    features: [
      "Full 10-page professional website",
      "Stronger Google search visibility",
      "Your location shown on Google Maps",
      "Linked to your Instagram & WhatsApp",
      "Edit your own content anytime",
      "Free hosting for the first year",
      "3 rounds of design changes included",
    ],
    bestFor: "Growing businesses, service providers, consultants",
    highlight: true,
  },
  {
    name: "Online Store",
    tagline: "Sell while you sleep",
    price: "₦300,000",
    timeline: "Ready in 14-21 days",
    pitch: "A full storefront that keeps taking orders whether you're at your desk or not.",
    features: [
      "Unlimited products, your own online shop",
      "Customers pay you automatically",
      "Simple stock and product management",
      "Customer accounts and order history",
      "Works on every device",
      "Set up to be found on Google",
      "Free hosting for the first year",
      "Easy-to-use admin dashboard",
    ],
    bestFor: "Clothing, electronics, food vendors, any retailer",
    highlight: false,
  },
];

const TRUST = [
  {
    icon: Rocket,
    title: "Built fast",
    desc: "Live in days, not months — you start seeing customers sooner.",
  },
  {
    icon: BarChart3,
    title: "Results that show up",
    desc: "Clients typically see sales climb within months of launch.",
  },
  {
    icon: MessageCircle,
    title: "We're reachable",
    desc: "Real answers when you message us — not a ticket queue.",
  },
];

// Shared between the public marketing page (app/website/page.js) and the
// logged-in customer version (app/(customer)/website/page.js) so the copy
// only lives in one place. `supportUrl` comes from public.onboarding_config
// — the SAME admin-managed link used for the welcome popup's support button
// — so every "message us" button here stays in sync automatically if an
// admin ever changes it, without touching this file.
export default function WebsiteServicesSection({ supportUrl }) {
  const hasSupportLink = Boolean(supportUrl);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white dark:from-night-900 dark:to-night-950">
        <div className="max-w-5xl mx-auto px-5 md:px-8 pt-16 pb-14 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-800 dark:text-brand-300 text-xs font-bold px-4 py-1.5 mb-6">
            Also from NexaVerify
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-night-100 max-w-2xl mx-auto leading-[1.1]">
            A website that actually brings you customers
          </h1>
          <p className="text-lg text-gray-500 dark:text-night-300 max-w-xl mx-auto mt-5">
            Every day without a website is a customer who found someone else instead. We build fast,
            good-looking websites that work for your business 24/7.
          </p>
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-400 mt-4">
            Starting at ₦50,000 · Ready in 3-5 days
          </p>
          {hasSupportLink && (
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex mt-7"
            >
              Get a free quote
            </a>
          )}
        </div>
      </section>

      {/* Why you need one */}
      <section className="max-w-5xl mx-auto px-5 md:px-8 py-16">
        <div className="text-center max-w-xl mx-auto mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-night-100">
            Why your business needs a website
          </h2>
          <p className="text-gray-500 dark:text-night-300 mt-3">
            Here's what a real website does for you that a social media page can't.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
          {REASONS.map((r) => (
            <div key={r.title} className="card card-pad">
              <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center mb-4">
                <r.icon size={20} />
              </div>
              <div className="font-bold text-sm mb-1.5 dark:text-night-100">{r.title}</div>
              <p className="text-sm text-gray-500 dark:text-night-300">{r.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Proof / numbers */}
      <section className="bg-gray-50 dark:bg-night-900 border-y border-gray-100 dark:border-night-800">
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-16">
          <div className="text-center max-w-xl mx-auto mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-night-100">
              What it's actually worth
            </h2>
            <p className="text-gray-500 dark:text-night-300 mt-3">Real numbers from businesses that made the jump.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {PROOF.map((p) => (
              <div key={p.value} className="text-center">
                <div className="text-4xl font-extrabold text-brand-700 dark:text-brand-400 mb-2">{p.value}</div>
                <p className="text-sm text-gray-500 dark:text-night-300 max-w-xs mx-auto">{p.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-6xl mx-auto px-5 md:px-8 py-16">
        <div className="text-center max-w-xl mx-auto mb-4">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-night-100">
            Pick what fits your business
          </h2>
        </div>
        <p className="text-center text-sm text-gray-400 dark:text-night-400 mb-12">
          Every package includes free hosting for the first year (₦12,000 value).
        </p>

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {PACKAGES.map((pkg) => (
            <div
              key={pkg.name}
              className={`card card-pad relative flex flex-col ${
                pkg.highlight ? "border-2 border-brand-500 dark:border-brand-500 shadow-modal" : ""
              }`}
            >
              {pkg.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  Most popular
                </span>
              )}
              <div className="text-xs font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400 mb-1">
                {pkg.tagline}
              </div>
              <h3 className="text-lg font-bold mb-1 dark:text-night-100">{pkg.name}</h3>
              <div className="text-3xl font-extrabold mb-1 dark:text-night-100">{pkg.price}</div>
              <div className="text-xs text-gray-400 dark:text-night-400 mb-4">{pkg.timeline}</div>
              <p className="text-sm text-gray-500 dark:text-night-300 mb-5">{pkg.pitch}</p>

              <ul className="space-y-2.5 mb-6 flex-1">
                {pkg.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm dark:text-night-200">
                    <Check size={15} className="text-brand-600 dark:text-brand-400 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <p className="text-xs text-gray-400 dark:text-night-400 mb-5">
                <span className="font-semibold">Best for:</span> {pkg.bestFor}
              </p>

              {hasSupportLink ? (
                <a
                  href={supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={pkg.highlight ? "btn-primary w-full" : "btn-secondary w-full"}
                >
                  Start your project
                </a>
              ) : (
                <span className="btn-secondary w-full opacity-50 pointer-events-none text-center">
                  Contact us
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="bg-gray-50 dark:bg-night-900 border-y border-gray-100 dark:border-night-800">
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-16">
          <div className="grid sm:grid-cols-3 gap-6">
            {TRUST.map((t) => (
              <div key={t.title} className="text-center">
                <div className="w-11 h-11 rounded-lg bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center mx-auto mb-4">
                  <t.icon size={20} />
                </div>
                <div className="font-bold text-sm mb-1.5 dark:text-night-100">{t.title}</div>
                <p className="text-sm text-gray-500 dark:text-night-300">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-br from-brand-800 to-brand-500 dark:from-night-900 dark:to-brand-800 text-white">
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">Ready to grow your business online?</h2>
          <p className="text-white/80 max-w-lg mx-auto mb-8">
            Tell us your business, what you're looking for, and your timeline — we'll get back to you
            with a free quote within a day.
          </p>
          {hasSupportLink ? (
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white text-brand-800 font-semibold px-7 py-3 rounded-lg hover:bg-brand-50 transition"
            >
              <MessageCircle size={18} />
              Message us
            </a>
          ) : (
            <p className="text-white/70 text-sm">Contact support to get a quote.</p>
          )}
        </div>
      </section>
    </div>
  );
}
