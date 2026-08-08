"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

// The dashboard's "+ Buy a number" button — opens a small menu so customers
// can pick which catalog: US Only (server7 DaisySim), USA & Canada
// (DaisySMS, via /products), or All countries (DaisySim, via
// /products/international). Same three destinations as the sidebar links,
// same order (US Only listed first, above USA & Canada, per how the sidebar
// orders them). Whichever provider is switched off at /admin/providers is
// dropped from the menu entirely.
const OPTIONS = [
  {
    key: "usOnly",
    href: "/products/us-only",
    label: "US Only",
    description: "USA virtual numbers",
  },
  {
    key: "daisysms",
    href: "/products",
    label: "USA & Canada",
    description: "Standard and long-term rentals",
  },
  {
    key: "daisysim",
    href: "/products/international",
    label: "All countries",
    description: "International numbers, any country",
  },
];

export default function BuyNumberMenu({ daisysmsEnabled = true, daisysimEnabled = false, usOnlyEnabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const enabledFlags = { usOnly: usOnlyEnabled, daisysms: daisysmsEnabled, daisysim: daisysimEnabled };
  const visible = OPTIONS.filter((o) => enabledFlags[o.key]);

  if (visible.length === 0) return null;

  // Only one catalog live — skip the dropdown entirely and just link straight there.
  if (visible.length === 1) {
    return (
      <Link href={visible[0].href} className="btn-primary">
        + Buy a number
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-primary flex items-center gap-1.5"
      >
        + Buy a number
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-100 dark:border-night-700 bg-white dark:bg-night-900 shadow-modal z-20 overflow-hidden">
          {visible.map((o, i) => (
            <Link
              key={o.key}
              href={o.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-3 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-night-800 dark:text-night-100 ${
                i > 0 ? "border-t border-gray-100 dark:border-night-700" : ""
              }`}
            >
              {o.label}
              <span className="block text-xs font-normal text-gray-400 dark:text-night-400 mt-0.5">
                {o.description}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
