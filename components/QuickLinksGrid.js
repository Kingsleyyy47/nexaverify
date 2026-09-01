import Link from "next/link";
import { Smartphone, Globe2, Globe, KeyRound } from "lucide-react";

// The dashboard's 4-tile quick-nav grid, right below the wallet card —
// one tap to each product line instead of digging through the sidebar or the
// "+ Buy a number" dropdown. Whichever phone-number provider is switched off
// at /admin/providers drops out of the grid entirely, same as everywhere
// else in the nav; "Buy Logs" (Digital Accounts) has no such switch and
// always shows.
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
  },
  {
    key: "daisysim",
    href: "/products/international",
    label: "All countries",
    icon: Globe,
  },
];

export default function QuickLinksGrid({ daisysmsEnabled = true, daisysimEnabled = false, usOnlyEnabled = false }) {
  const enabledFlags = { daisysms: daisysmsEnabled, usOnly: usOnlyEnabled, daisysim: daisysimEnabled, logs: true };
  const visible = TILES.filter((t) => enabledFlags[t.key]);

  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 mb-7">
      {visible.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            className="card card-pad flex flex-col items-center justify-center gap-2 text-center hover:border-brand-300 dark:hover:border-brand-500 transition"
          >
            <Icon size={22} className="text-brand-600 dark:text-brand-400" />
            <span className="font-semibold text-sm">{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
