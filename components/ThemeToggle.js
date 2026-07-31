"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const STORAGE_KEY = "nexa-theme";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Light is always the default. The site only switches to dark when the
    // visitor has explicitly tapped this toggle before — we never infer it
    // from the OS/browser color-scheme preference.
    const saved = window.localStorage.getItem(STORAGE_KEY);
    setDark(saved === "dark");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 dark:text-night-300 hover:bg-gray-100 dark:hover:bg-night-800 transition"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
