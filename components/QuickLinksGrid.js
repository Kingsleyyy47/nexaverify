import Link from "next/link";
import { Smartphone, Globe2, Globe, KeyRound, Send, Rocket } from "lucide-react";

// The dashboard's 6-tile quick-nav grid (3x3 layout, wraps to 2 rows), right
// below the wallet card — one tap to each product line instead of digging
// through the sidebar or the "+ Buy a number" dropdown. Whichever
// phone-number provider is switched off at /admin/providers drops out of the
// grid entirely, same as everywhere else in the nav. Telegram Premium,
// Social Boost, and "Buy Logs" (Digital Accounts) all use the same "coming
// soon" badge convention as CustomerSidebar — tagged with soonForNonAdmin
// rather than just true, since they're independent products each with their
// own visibility switch (see that component's comment for why a shared
// boolean would clobber one with another's state).
const TILES = [
  {
    key: "daisysms",
    href: "/products",
    label: "USA & Canada",
    icon: Smartphone,
  },
  {
    key: "usOnly",
    href: "/products/us-only",
    label: "US Only",
    icon: Globe2,
  },
  {
    key: "logs",
    href: "/digital-accounts",
    label: "Buy Logs",
    icon: KeyRound,
    soonForNonAdmin: "digitalAccounts",
  },
  {
    key: "daisysim",
    href: "/products/international",
    label: "All countries",
    icon: Globe,
  },
  {
    key: "telegramPremium",
    href: "/products/telegram-premium",
    label: "Telegram Premium",
    icon: Send,
    soonForNonAdmin: "istar",
  },
  {
    key: "socialBoost",
    href: "/products/social-boost",
    label: "Social Boost",
    icon: Rocket,
    soonForNonAdmin: "socialBoost",
  },
];

export default function QuickLinksGrid({
  daisysmsEnabled = true,
  daisysimEnabled = false,
  usOnlyEnabled = false,
  isAdmin = false,
  istarCustomerVisible = false,
  socialBoostCustomerVisible = false,
  digitalAccountsCustomerVisible = false,
}) {
  const enabledFlags = {
    daisysms: daisysmsEnabled,
    usOnly: usOnlyEnabled,
    daisysim: daisysimEnabled,
    logs: true,
    telegramPremium: true,
    socialBoost: true,
  };
  const customerVisibleByTag = {
    istar: istarCustomerVisible,
    socialBoost: socialBoostCustomerVisible,
    digitalAccounts: digitalAccountsCustomerVisible,
  };
  const visible = TILES.filter((t) => enabledFlags[t.key]);

  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-3 mb-7">
      {visible.map((t) => {
        const Icon = t.icon;
        const showSoonBadge = t.soonForNonAdmin && !customerVisibleByTag[t.soonForNonAdmin] && !isAdmin;
        return (
          <Link
            key={t.key}
            href={t.href}
            className="relative card card-pad flex flex-col items-center justify-center gap-2 text-center hover:border-brand-300 dark:hover:border-brand-500 transition"
          >
            {showSoonBadge && (
              <span className="absolute top-2 right-2 badge badge-neutral text-[10px] px-1.5 py-0.5">Soon</span>
            )}
            <Icon size={22} className="text-brand-600 dark:text-brand-400" />
            <span className="font-semibold text-sm">{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
