"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

// The dashboard's "+ Buy a number" button — instead of jumping straight to
// the USA/Canada catalog (DaisySMS), this opens a small menu so customers
// can pick either catalog: USA & Canada (DaisySMS, via /products) or All
// countries (DaisySim, via /products/international). Same two destinations
// as the sidebar links, just surfaced here too since this button is the
// more prominent "buy" call-to-action on the page.
export default function BuyNumberMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
          <Link
            href="/products"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-night-800 dark:text-night-100"
          >
            USA &amp; Canada
            <span className="block text-xs font-normal text-gray-400 dark:text-night-400 mt-0.5">
              Standard and long-term rentals
            </span>
          </Link>
          <Link
            href="/products/international"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-night-800 dark:text-night-100 border-t border-gray-100 dark:border-night-700"
          >
            All countries
            <span className="block text-xs font-normal text-gray-400 dark:text-night-400 mt-0.5">
              International numbers, any country
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
