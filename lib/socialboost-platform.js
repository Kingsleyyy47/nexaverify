// No "server-only" — this is plain string matching, safe to import from
// either a Client Component (the buy form's tab bar) or a server route
// (the services route, to attach `platform` to each item before sending it
// down). Classifies a live SMM panel service into one of the customer-facing
// platform tabs, purely by keyword-matching its `name`/`category`/`type` —
// the panel itself has no dedicated "platform" field.
export const PLATFORMS = ["Instagram", "TikTok", "Facebook", "Twitter"];

const KEYWORDS = {
  Instagram: ["instagram", " ig ", "insta"],
  TikTok: ["tiktok", "tik tok"],
  Facebook: ["facebook", " fb "],
  Twitter: ["twitter", " x (twitter", "x/twitter", "tweet"],
};

export function detectPlatform(service) {
  const haystack = ` ${[service?.name, service?.category, service?.type].filter(Boolean).join(" ")} `.toLowerCase();
  for (const platform of PLATFORMS) {
    if (KEYWORDS[platform].some((kw) => haystack.includes(kw))) {
      return platform;
    }
  }
  return "Other";
}
