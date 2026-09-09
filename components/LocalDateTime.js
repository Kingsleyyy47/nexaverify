"use client";

// Every date/time shown across the site used to be formatted inside Server
// Components (new Date(x).toLocaleDateString("en-US")) — that runs on
// Node/Vercel's server, so it always rendered in the SERVER's timezone (what
// the business owner called "Supabase time"), not the actual visitor's own
// timezone, no matter where they are. Formatting instead happens here, in a
// Client Component, so the browser's own Intl engine (and its real, local
// timezone) does the work — same timestamp, but displayed the way a clock on
// the visitor's own wall would show it. `value` is any input `new Date()`
// accepts (an ISO string or a Date). Renders nothing (rather than "Invalid
// Date") for a missing/unparseable value.
export default function LocalDateTime({ value, mode = "datetime", className, fallback = "—" }) {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;

  let text;
  if (mode === "date") {
    text = d.toLocaleDateString("en-US");
  } else if (mode === "time") {
    text = d.toLocaleTimeString("en-US");
  } else {
    text = d.toLocaleString("en-US");
  }

  return className ? <span className={className}>{text}</span> : text;
}
