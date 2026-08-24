"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import NumberCard from "./NumberCard";

// Collapsible wrapper around NumberCard for right-after-purchase display —
// used by every buy flow (QuickBuyList, UsOnlyBuyList, BuyForm,
// InternationalBuyForm) so the result behaves identically everywhere:
// rendered directly under whatever was just bought (a specific row in a
// list, or the single purchase panel), open by default, collapsible on tap
// so it doesn't permanently eat screen space on mobile once someone's done
// with it. NumberCard itself already has status polling, the code + copy
// button, and a Cancel button while the number is still "waiting" — this
// component only adds the open/close chrome around it.
export default function PurchasedNumberDropdown({ rental }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-brand-200 dark:border-brand-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-xs font-bold text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-950 hover:bg-brand-100 dark:hover:bg-brand-900 transition"
      >
        <span className="truncate">Purchased — {rental.phone_number}</span>
        <ChevronDown size={15} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="p-3 bg-white dark:bg-night-900">
          <NumberCard rental={rental} />
        </div>
      )}
    </div>
  );
}
