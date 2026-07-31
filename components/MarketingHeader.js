"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/faq", label: "FAQ" },
];

export default function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-night-950/90 backdrop-blur border-b border-gray-100 dark:border-night-800">
      <div className="max-w-6xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 font-extrabold text-lg text-brand-900 dark:text-night-100">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700" />
          NexaVerify
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-gray-600 dark:text-night-300">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-brand-700 dark:hover:text-brand-300 transition">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className="btn-ghost">
            Log in
          </Link>
          <Link href="/login?mode=signup" className="btn-primary">
            Get started
          </Link>
        </div>

        <div className="flex md:hidden items-center gap-1">
          <ThemeToggle />
          <button className="p-2 -mr-2 dark:text-night-200" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-gray-100 dark:border-night-800 px-5 py-4 space-y-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block text-sm font-semibold text-gray-600 dark:text-night-300"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className="flex gap-2 pt-2">
            <Link href="/login" className="btn-secondary flex-1">
              Log in
            </Link>
            <Link href="/login?mode=signup" className="btn-primary flex-1">
              Get started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
