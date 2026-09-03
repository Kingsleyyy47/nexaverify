"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, Rocket, Wallet, Send, KeyRound } from "lucide-react";

// Fixed bottom tab bar shown only on mobile (md:hidden) — a faster way to
// reach the 5 things customers tap most, instead of opening the hamburger
// drawer every time. Wallet is deliberately the middle (3rd of 5) tab, per
// the business owner's request. Telegram Premium and Social Boost reuse the
// exact same "coming soon" dot convention as CustomerSidebar/QuickLinksGrid
// (tagged by soonForNonAdmin, not a shared boolean, since they're two
// independently-gated products — see CustomerSidebar.js's comment for why).
const TABS = [
  { key: "sms", href: "/products", label: "SMS", icon: Phone },
  { key: "socialBoost", href: "/products/social-boost", label: "Social Boost", icon: Rocket, soonForNonAdmin: "socialBoost" },
  { key: "wallet", href: "/wallet", label: "Wallet", icon: Wallet },
  { key: "telegram", href: "/products/telegram-premium", label: "Telegram", icon: Send, soonForNonAdmin: "istar" },
  { key: "logs", href: "/digital-accounts", label: "Accounts", icon: KeyRound, soonForNonAdmin: "digitalAccounts" },
];

export default function MobileBottomNav({
  isAdmin = false,
  istarCustomerVisible = false,
  socialBoostCustomerVisible = false,
  digitalAccountsCustomerVisible = false,
}) {
  const pathname = usePathname();
  const customerVisibleByTag = {
    istar: istarCustomerVisible,
    socialBoost: socialBoostCustomerVisible,
    digitalAccounts: digitalAccountsCustomerVisible,
  };

  function isActive(tab) {
    if (tab.key === "sms") {
      // "SMS" covers every phone-number product page EXCEPT the two other
      // tabs' own routes, which live under the same /products/* prefix.
      return (
        pathname.startsWith("/products") &&
        !pathname.startsWith("/products/social-boost") &&
        !pathname.startsWith("/products/telegram-premium")
      );
    }
    return pathname.startsWith(tab.href);
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-night-900 border-t border-gray-200 dark:border-night-700"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab);
          const showSoonDot = tab.soonForNonAdmin && !customerVisibleByTag[tab.soonForNonAdmin] && !isAdmin;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`relative flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition ${
                active ? "text-brand-600 dark:text-brand-400" : "text-gray-400 dark:text-night-400"
              }`}
            >
              {showSoonDot && (
                <span className="absolute top-1.5 right-1/2 translate-x-3.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
              <Icon size={20} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
