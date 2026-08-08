"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import SignOutButton from "./SignOutButton";
import CurrencySwitcher from "./CurrencySwitcher";
import ThemeToggle from "./ThemeToggle";
import NavLogo from "./NavLogo";

const BASE_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products/us-only", label: "US Only", provider: "daisysim_usa" },
  { href: "/products", label: "USA and Canada", provider: "daisysms" },
  { href: "/products/international", label: "All countries", provider: "daisysim" },
  { href: "/wallet", label: "Wallet" },
  { href: "/topup", label: "Top Up" },
  { href: "/rentals", label: "Rentals" },
  { href: "/history", label: "History" },
  { href: "https://www.legitstorez.com", label: "Buy Logs", external: true },
];

export default function CustomerSidebar({
  profile,
  daisysmsEnabled = true,
  daisysimEnabled = false,
  usOnlyEnabled = false,
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Whichever provider is switched off at /admin/providers drops out of the
  // nav entirely — not just greyed out — same as the section disappearing
  // from the dashboard/products pages themselves.
  const LINKS = BASE_LINKS.filter((link) => {
    if (link.provider === "daisysms") return daisysmsEnabled;
    if (link.provider === "daisysim") return daisysimEnabled;
    if (link.provider === "daisysim_usa") return usOnlyEnabled;
    return true;
  });

  const navLinks = (
    <>
      {LINKS.map((link) =>
        link.external ? (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileOpen(false)}
            className="nav-link"
          >
            {link.label}
          </a>
        ) : (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMobileOpen(false)}
            className={`nav-link ${pathname.startsWith(link.href) ? "active" : ""}`}
          >
            {link.label}
          </Link>
        )
      )}

      {profile?.role === "admin" && (
        <>
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold px-3 pt-4 pb-1.5">
            Admin
          </div>
          <Link
            href="/admin"
            onClick={() => setMobileOpen(false)}
            className={`nav-link ${pathname.startsWith("/admin") ? "active" : ""}`}
          >
            Admin panel
          </Link>
        </>
      )}
    </>
  );

  return (
    <>
      {/* Mobile top bar — replaces the sidebar below the md breakpoint */}
      <div className="md:hidden relative z-40">
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-night-900 border-b border-gray-200 dark:border-night-700">
          <NavLogo />
          <div className="flex items-center gap-1.5">
            <CurrencySwitcher compact />
            <ThemeToggle />
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="p-1.5 rounded-lg text-gray-500 dark:text-night-300 hover:bg-gray-100 dark:hover:bg-night-800"
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Floats over the page content instead of pushing it down — a
            half-width drawer anchored to the right, not a full-width strip */}
        {mobileOpen && (
          <nav className="absolute top-full right-0 w-1/2 bg-white dark:bg-night-900 border-l border-b border-gray-200 dark:border-night-700 shadow-modal p-3 space-y-0.5">
            {navLinks}
            <div className="pt-2 mt-2 border-t border-gray-200 dark:border-night-700">
              <SignOutButton className="nav-link w-full" />
            </div>
          </nav>
        )}
      </div>

      {/* Dims the page behind the dropdown; tapping it closes the menu */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 top-[52px] bg-black/20 z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-white dark:bg-night-900 border-r border-gray-200 dark:border-night-700 p-4">
        <div className="px-2 pb-6">
          <NavLogo />
        </div>

        <nav className="flex-1 space-y-0.5">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold px-3 pt-2 pb-1.5">
            Menu
          </div>
          {navLinks}
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
    </>
  );
}
