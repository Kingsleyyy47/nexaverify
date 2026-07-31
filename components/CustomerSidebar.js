"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "./SignOutButton";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/wallet", label: "Wallet" },
  { href: "/topup", label: "Top Up" },
  { href: "/rentals", label: "Rentals" },
  { href: "/history", label: "History" },
];

export default function CustomerSidebar({ profile }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-white dark:bg-night-900 border-r border-gray-200 dark:border-night-700 p-4">
      <div className="flex items-center gap-2.5 font-extrabold text-base px-2 pb-6 dark:text-night-100">
        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700" />
        NexaVerify
      </div>

      <nav className="flex-1 space-y-0.5">
        <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold px-3 pt-2 pb-1.5">
          Menu
        </div>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link ${pathname.startsWith(link.href) ? "active" : ""}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="pt-4 mt-auto border-t border-gray-200 dark:border-night-700">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-bold shrink-0">
            {(profile?.username || profile?.email || "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold truncate dark:text-night-200">
              {profile?.username || profile?.email}
            </div>
          </div>
        </div>
        <SignOutButton className="nav-link mt-1 w-full" />
      </div>
    </aside>
  );
}
