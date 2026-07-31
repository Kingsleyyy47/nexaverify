"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "./SignOutButton";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/topups", label: "Top-up requests" },
  { href: "/admin/currency", label: "Currency rates" },
  { href: "/admin/numbers", label: "Long-term numbers" },
];

export default function AdminSidebar({ profile }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-white dark:bg-night-900 border-r border-gray-200 dark:border-night-700 p-4">
      <div className="flex items-center gap-2.5 font-extrabold text-base px-2 pb-6 dark:text-night-100">
        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700" />
        NexaVerify <span className="badge badge-neutral">Admin</span>
      </div>

      <nav className="flex-1 space-y-0.5">
        <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold px-3 pt-2 pb-1.5">
          Admin
        </div>
        {LINKS.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href} className={`nav-link ${active ? "active" : ""}`}>
              {link.label}
            </Link>
          );
        })}

        <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-night-400 font-bold px-3 pt-4 pb-1.5">
          Storefront
        </div>
        <Link href="/dashboard" className="nav-link">
          Customer view
        </Link>
      </nav>

      <div className="pt-4 mt-auto border-t border-gray-200 dark:border-night-700">
        <div className="px-3 py-2 text-xs font-bold truncate dark:text-night-200">
          {profile?.username || profile?.email}
        </div>
        <SignOutButton className="nav-link w-full" />
      </div>
    </aside>
  );
}
