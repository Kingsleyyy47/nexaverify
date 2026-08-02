"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import SignOutButton from "./SignOutButton";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/topups", label: "Top-up requests" },
  { href: "/admin/currency", label: "Currency rates" },
  { href: "/admin/numbers", label: "Long-term numbers" },
  { href: "/admin/international", label: "International (DaisySim)" },
];

export default function AdminSidebar({ profile }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = (
    <>
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMobileOpen(false)}
            className={`nav-link ${active ? "active" : ""}`}
          >
            {link.label}
          </Link>
        );
      })}

      <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold px-3 pt-4 pb-1.5">
        Storefront
      </div>
      <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="nav-link">
        Customer view
      </Link>
    </>
  );

  return (
    <>
      {/* Mobile top bar — replaces the sidebar below the md breakpoint */}
      <div className="md:hidden relative z-40">
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-night-900 border-b border-gray-200 dark:border-night-700">
          <div className="flex items-center gap-2 font-extrabold text-base dark:text-night-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/nexaverify-mark.png" alt="NexaVerify" className="h-7 w-auto" />
            NexaVerify <span className="badge badge-neutral">Admin</span>
          </div>
          <div className="flex items-center gap-1.5">
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
        <div className="flex items-center gap-2 font-extrabold text-base px-2 pb-6 dark:text-night-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/nexaverify-mark.png" alt="NexaVerify" className="h-7 w-auto" />
          NexaVerify <span className="badge badge-neutral">Admin</span>
        </div>

        <nav className="flex-1 space-y-0.5">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold px-3 pt-2 pb-1.5">
            Admin
          </div>
          {navLinks}
        </nav>

        <div className="pt-4 mt-auto border-t border-gray-200 dark:border-night-700">
          <div className="px-3 py-2 text-xs font-bold truncate dark:text-night-200">
            {profile?.username || profile?.email}
          </div>
          <SignOutButton className="nav-link w-full" />
        </div>
      </aside>
    </>
  );
}
