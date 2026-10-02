"use client";

import { useEffect, useState } from "react";

// Client components also render on the server. Use UTC for the server and
// first browser render, then display the visitor's timezone after hydration.
export default function LocalDateTime({ value, mode = "datetime", className, fallback = "—" }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const options = mounted ? undefined : { timeZone: "UTC" };
  const text = mode === "date" ? date.toLocaleDateString("en-US", options)
    : mode === "time" ? date.toLocaleTimeString("en-US", options)
    : date.toLocaleString("en-US", options);
  return className ? <span className={className}>{text}</span> : text;
}
