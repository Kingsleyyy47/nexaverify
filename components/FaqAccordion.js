"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function FaqAccordion({ items }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="divide-y divide-gray-100 dark:divide-night-800 border border-gray-100 dark:border-night-800 rounded-xl2 bg-white dark:bg-night-900">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={item.q}>
            <button
              className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
              onClick={() => setOpenIndex(isOpen ? -1 : i)}
            >
              <span className="font-semibold text-sm text-gray-900 dark:text-night-100">{item.q}</span>
              <ChevronDown
                size={18}
                className={`shrink-0 text-gray-400 dark:text-night-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <div className="px-5 pb-4 text-sm text-gray-500 dark:text-night-300 leading-relaxed">{item.a}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
