import "server-only";

// CSV/TXT parsing + validation for the Bulk Account Upload feature (see
// app/api/admin/digital-accounts/templates/[id]/upload). No CSV library is
// installed in this project, so this is a small dependency-free parser.
//
// Two input shapes are supported, auto-detected — no format picker needed:
//
// 1. HEADER row (any of comma/pipe/colon delimited): a first line naming its
//    columns (e.g. "username,password,email"), same as before. Column order
//    doesn't matter and unknown columns are ignored.
//
// 2. HEADERLESS platform logs: no header at all — every line is straight
//    data in one of the recognized layouts below, e.g.:
//      Simple CSV/TXT (2 cols):  username_or_email,password
//      Simple CSV/TXT (3 cols):  username,password,email OR username,password,2fa
//      Default stock order:       username,password,2fa,email,email_password,recovery_email,...
//      Facebook (pipe, 8 cols):  username|password|email|email_password|recovery_email|two_fa|year|friends_count
//      Facebook 2 (pipe, 7 cols, no recovery/2FA — blank placeholder): username|password|email|email_password||year|friends_count
//      Instagram/TikTok (colon, 4 cols): username:password:email:email_password
//      Twitter (pipe, 5 cols): username|password|email|email_password|two_fa
//    The delimiter (comma/pipe/colon) and the column layout (by column
//    count) are both auto-detected from the file itself, per the business
//    owner's request that admins never have to pick a format or include
//    every column — whatever a customer-care-trained format arrives in,
//    just paste it in as CSV or TXT.
export const REQUIRED_EITHER = ["email", "username"]; // at least one required
export const REQUIRED_ALWAYS = ["password"];
export const OPTIONAL_COLUMNS = [
  "email_password",
  "two_fa",
  "recovery_email",
  "recovery_email_password",
  "year",
  "friends_count",
  "extra_data",
];

// Aliases so a header spelled slightly differently still matches — includes
// the exact wording used in the business owner's own format sheet ("Mail",
// "Mail password", "Recovery Mail", "2fa key", "No of friends").
const HEADER_ALIASES = {
  two_fa_code: "two_fa",
  "2fa_key": "two_fa",
  "2fa": "two_fa",
  mail: "email",
  emailpassword: "email_password",
  mail_password: "email_password",
  mailpassword: "email_password",
  recoveryemail: "recovery_email",
  recovery_mail: "recovery_email",
  recoverymail: "recovery_email",
  recoveryemailpassword: "recovery_email_password",
  recovery_mail_password: "recovery_email_password",
  recoverymailpassword: "recovery_email_password",
  no_of_friends: "friends_count",
  number_of_friends: "friends_count",
  numberoffriends: "friends_count",
  friends: "friends_count",
  friend_count: "friends_count",
  extra: "extra_data",
  extradata: "extra_data",
  cookies: "extra_data",
  cookie: "extra_data",
  session: "extra_data",
  sessiondata: "extra_data",
  session_data: "extra_data",
  notes: "extra_data",
};

const KNOWN_COLUMNS = new Set([
  "username",
  "email",
  "password",
  "email_password",
  "two_fa",
  "recovery_email",
  "recovery_email_password",
  "year",
  "friends_count",
  "extra_data",
]);

// A field this long, or containing a recognizable browser-session marker
// (csrftoken, sessionid, cookie attributes like "expires="/"domain="), is
// virtually never a real email, password, or 2FA key — it's leftover
// session/cookie data that got pasted into the log alongside the real
// credentials. Positional parsing has no way to know it doesn't belong
// wherever it landed, so it's pulled out into its own "extra" field instead
// of silently pushing the real values one column over — the actual bug this
// fixes: a cookie string landing in the "email" slot pushed the real email
// into "email password" right next to it.
const COOKIE_LENGTH_THRESHOLD = 80;
const COOKIE_MARKER_RE = /csrftoken|sessionid|\bexpires=|\bdomain=|;\s*path=\//i;

function looksLikeCookieOrSessionData(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (COOKIE_MARKER_RE.test(v)) return true;
  return v.length > COOKIE_LENGTH_THRESHOLD;
}

// Used on the HEADERLESS path: strips any cookie/session-looking field out
// of a row's raw values BEFORE the column layout is chosen, so a stray
// cookie column can never shift every field after it out of place. Multiple
// matches in one row are joined with "; " into a single extra_data value.
function extractCookieFields(raw) {
  const cleaned = [];
  let extra = null;
  for (const field of raw) {
    if (looksLikeCookieOrSessionData(field)) {
      const v = field.trim();
      extra = extra ? `${extra}; ${v}` : v;
    } else {
      cleaned.push(field);
    }
  }
  return { cleaned, extra };
}

// Used on the HEADERED path: column positions are fixed by the header, so
// fields can't be removed/reindexed like the headerless path does. Instead,
// checks each already-mapped optional value and, if it looks like cookie/
// session data, moves it out to extra_data and blanks the original field —
// same end result (nothing sensitive-looking is silently sitting where the
// real value should be), without disturbing column alignment for the row.
function siphonCookieValues(values) {
  let extra = null;
  for (const key of Object.keys(values)) {
    const v = values[key];
    if (v && looksLikeCookieOrSessionData(v)) {
      extra = extra ? `${extra}; ${v}` : v;
      values[key] = "";
    }
  }
  return extra;
}

// Column layouts for headerless files. `null` marks a placeholder column
// that's present in the layout but carries no data (Facebook 2's blank spot
// where Facebook's recovery-email/2FA columns would be).
const LEGACY_POSITIONAL_TEMPLATES = {
  2: ["identifier", "password"],
  4: ["username", "password", "email", "email_password"],
  5: ["username", "password", "email", "email_password", "two_fa"],
  7: ["username", "password", "email", "email_password", null, "year", "friends_count"],
  8: ["username", "password", "email", "email_password", "recovery_email", "two_fa", "year", "friends_count"],
};

const DEFAULT_POSITIONAL_ORDER = [
  "username",
  "password",
  "two_fa",
  "email",
  "email_password",
  "recovery_email",
  "recovery_email_password",
  "year",
  "friends_count",
];

// Shared by both the CSV/TXT bulk upload (one call per row, below) and the
// single-product admin form's insert route
// (app/api/admin/digital-accounts/templates/[id]/single) — same two rules
// either way: password is always required, and at least one of
// email/username is required as the account's identifier. Keeping this in
// one place means the two entry points (bulk upload for many accounts at
// once, this form for adding them one by one) can never quietly drift apart
// on what counts as a complete account.
export function validateAccountFields({ password, email, username }) {
  if (!password) return "Missing password.";
  if (!email && !username) return "Missing both email and username — at least one is required.";
  return null;
}

function normalizeHeader(raw) {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[key] || key;
}

// Picks whichever of comma/pipe/colon appears most often across the WHOLE
// file (not just its first line) — an admin pasting a log dump often has a
// plain label line first (e.g. a bare "TIKTOK" line copied along with the
// format sheet), which has zero of any delimiter. Looking at only that one
// line used to make comma win by default every time it happened to come
// first, silently mis-detecting the real delimiter for the pipe/colon data
// underneath it. Summing counts across every line is immune to any single
// odd line (blank, a label, a trailing one) throwing the detection off.
function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  let best = ",";
  let bestCount = -1;
  for (const d of [",", "|", ":"]) {
    const count = lines.reduce((sum, line) => sum + (line.split(d).length - 1), 0);
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

// Drops a single trailing empty field caused by a trailing delimiter (e.g.
// the business owner's own Twitter example ends in a bare "|") — but only
// ever the very last field, so a deliberate blank placeholder column in the
// middle of a row (Facebook 2's format) is never touched.
function dropTrailingEmpty(fields) {
  let end = fields.length;
  while (end > 1 && fields[end - 1].trim() === "") {
    end--;
  }
  return fields.slice(0, end);
}

function looksLikeEmail(value) {
  return /\S+@\S+\.\S+/.test(String(value || "").trim());
}

function buildDefaultTemplate(colCount) {
  if (colCount === 2) return ["identifier", "password"];
  if (colCount === 3) return ["username", "password", "email_or_two_fa"];
  if (colCount <= DEFAULT_POSITIONAL_ORDER.length) return DEFAULT_POSITIONAL_ORDER.slice(0, colCount);
  return [
    ...DEFAULT_POSITIONAL_ORDER,
    ...Array.from({ length: colCount - DEFAULT_POSITIONAL_ORDER.length }, () => null),
  ];
}

function chooseHeaderlessTemplate(sample, delimiter) {
  const colCount = sample.length;
  if (usesLegacyHeaderlessTemplate(sample, delimiter)) return LEGACY_POSITIONAL_TEMPLATES[colCount];

  if (colCount >= 2) return buildDefaultTemplate(colCount);

  return null;
}

function usesLegacyHeaderlessTemplate(sample, delimiter) {
  const colCount = sample.length;
  if (delimiter === ":" && colCount === 4) return true;

  const thirdIsEmail = looksLikeEmail(sample[2]);
  const fourthIsEmail = looksLikeEmail(sample[3]);

  // Preserve the older documented platform order when the row itself shows
  // email in column 3. Otherwise use the default stock order the admin
  // normally receives: username,password,2fa,mail,mail password,recovery...
  return Boolean(thirdIsEmail && !fourthIsEmail && LEGACY_POSITIONAL_TEMPLATES[colCount]);
}

// Quote-aware splitter for comma-delimited text (the original CSV path) —
// handles quoted fields (so a value can contain a comma or an escaped `""`),
// \r\n or \n line endings, and blank lines (skipped).
function parseQuotedCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      // swallow — \n (or end of text) below closes the row
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

// Simple line-then-delimiter split for pipe/colon-delimited text — these
// formats never need quote handling in practice (credential values don't
// contain "|" or ":"), so a straightforward split keeps this readable.
function parseSimpleDelimitedRows(text, delimiter) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => dropTrailingEmpty(line.split(delimiter)).map((f) => f.trim()));
}

// Parses `csvText` and validates every row against the format requirements.
// Returns { items, errors }. `items` is only ever populated (usable) when
// `errors` is empty — the caller should reject the WHOLE upload if there are
// any errors, rather than inserting the valid rows and skipping bad ones, so
// a typo'd column (or an unrecognized format) never silently drops accounts.
export function parseAndValidateAccountsCsv(csvText) {
  const text = csvText || "";
  if (!text.trim()) {
    return { items: [], errors: [{ row: 0, message: "The file is empty." }] };
  }

  const delimiter = detectDelimiter(text);
  const allRows = delimiter === "," ? parseQuotedCsvRows(text) : parseSimpleDelimitedRows(text, delimiter);
  if (allRows.length === 0) {
    return { items: [], errors: [{ row: 0, message: "The file is empty." }] };
  }

  // Drop leading bare "label" lines — a single field with none of the chosen
  // delimiter in it at all (e.g. a lone "TIKTOK" line pasted along with the
  // format sheet as a section heading). These aren't data and would
  // otherwise be mistaken for row 1, throwing off both the header-vs-
  // headerless check and the column-count auto-detect below. Keeps original
  // line numbers for error messages by carrying them through as a pair
  // rather than re-indexing after the filter.
  const indexed = allRows.map((raw, i) => ({ raw, rowNumber: i + 1 }));
  const firstDataIndex = indexed.findIndex((r) => r.raw.length > 1);
  const rows = firstDataIndex >= 0 ? indexed.slice(firstDataIndex) : indexed;

  const headerRow = rows[0].raw.map(normalizeHeader);
  // A data value can legitimately be something like "2fa" or even
  // "password", so a single known-looking cell is not enough to call the
  // first row a header. Treat it as a header only when it has the same
  // required shape we enforce for headered uploads.
  const looksLikeHeader =
    headerRow.includes("password") && (headerRow.includes("email") || headerRow.includes("username"));

  if (looksLikeHeader) {
    return parseHeaderedRows(rows, headerRow);
  }
  return parseHeaderlessRows(rows, delimiter);
}

function parseHeaderedRows(rows, headerRow) {
  const hasPassword = headerRow.includes("password");
  const hasEmail = headerRow.includes("email");
  const hasUsername = headerRow.includes("username");

  const errors = [];
  if (!hasPassword) {
    errors.push({ row: 0, message: 'Missing required column "password".' });
  }
  if (!hasEmail && !hasUsername) {
    errors.push({ row: 0, message: 'Missing required column — need "email" or "username" (at least one).' });
  }
  if (errors.length > 0) {
    return { items: [], errors };
  }

  const colIndex = {};
  headerRow.forEach((name, idx) => {
    if (KNOWN_COLUMNS.has(name) && !(name in colIndex)) colIndex[name] = idx;
  });

  const items = [];
  for (let r = 1; r < rows.length; r++) {
    const { raw, rowNumber } = rows[r];
    if (raw.every((v) => v.trim() === "")) continue;

    const get = (name) => (name in colIndex ? (raw[colIndex[name]] || "").trim() : "");

    const password = get("password");
    const email = get("email");
    const username = get("username");

    const fieldError = validateAccountFields({ password, email, username });
    if (fieldError) {
      errors.push({ row: rowNumber, message: fieldError });
      continue;
    }

    // Only the optional fields are checked for cookie/session junk — email,
    // username, and password are the required identifiers, so a header-
    // named CSV that put junk there is a naming problem the admin needs to
    // fix, not something safe to silently blank out from under a required
    // check.
    const optionalValues = {
      email_password: get("email_password"),
      two_fa: get("two_fa"),
      recovery_email: get("recovery_email"),
      recovery_email_password: get("recovery_email_password"),
    };
    const siphonedExtra = siphonCookieValues(optionalValues);
    const explicitExtra = get("extra_data");
    const extra_data = [explicitExtra, siphonedExtra].filter(Boolean).join("; ") || null;

    items.push({
      username: username || null,
      email: email || null,
      password,
      email_password: optionalValues.email_password || null,
      two_fa: optionalValues.two_fa || null,
      recovery_email: optionalValues.recovery_email || null,
      recovery_email_password: optionalValues.recovery_email_password || null,
      year: get("year") || null,
      friends_count: get("friends_count") || null,
      extra_data,
    });
  }

  if (errors.length > 0) {
    return { items: [], errors };
  }
  if (items.length === 0) {
    return { items: [], errors: [{ row: 0, message: "No account rows found in the file." }] };
  }
  return { items, errors: [] };
}

function parseHeaderlessRows(rows, delimiter) {
  // Strip any cookie/session-looking field out of every row FIRST, before
  // the column count or layout is decided — a stray cookie column would
  // otherwise shift every positional field after it out of place (e.g. a
  // cookie string sitting where "email" belongs pushes the real email into
  // "email password" right next to it). Pulling it out here means the
  // column-count majority vote and the template below both operate on the
  // row's real fields only, same as if the cookie text had never been
  // pasted in at all.
  const prepared = rows.map(({ raw, rowNumber }) => {
    const { cleaned, extra } = extractCookieFields(raw);
    return { raw: cleaned, rowNumber, extra };
  });

  // The layout is decided by whichever column count is MOST COMMON across
  // every row in the file (after trailing-empty trimming), not just
  // whatever the first row happens to be. For a 5-line file that's the same
  // thing in practice, but for a 1000-line file it means one stray or
  // malformed line at the very top can never accidentally pick the wrong
  // template for the other 999 — the majority always wins, and any row that
  // doesn't match gets its own clear error below instead of being silently
  // misaligned into the wrong columns.
  const counts = new Map();
  for (const { raw } of prepared) {
    const n = dropTrailingEmpty(raw).length;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  let colCount = null;
  let bestCount = -1;
  for (const [n, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      colCount = n;
    }
  }

  const sample = prepared.map((r) => dropTrailingEmpty(r.raw)).find((raw) => raw.length === colCount) || [];
  const usesLegacyTemplate = usesLegacyHeaderlessTemplate(sample, delimiter);
  const template = usesLegacyTemplate ? LEGACY_POSITIONAL_TEMPLATES[colCount] : chooseHeaderlessTemplate(sample, delimiter);
  if (!template) {
    return {
      items: [],
      errors: [
        {
          row: 0,
          message: `Could not auto-detect a known log format for ${colCount} column(s). Add a header row (e.g. "username,password,email") or match one of the documented platform formats.`,
        },
      ],
    };
  }

  const errors = [];
  const items = [];

  prepared.forEach(({ raw, rowNumber, extra }) => {
    if (raw.every((v) => v.trim() === "")) return;

    // A row whose own column count doesn't match the file's chosen layout
    // gets a specific, actionable error instead of either being silently
    // dropped or force-fit into the wrong fields — same "reject clearly,
    // never guess" rule this whole parser follows for missing password/
    // identifier below.
    const trimmedRaw = dropTrailingEmpty(raw);
    if (usesLegacyTemplate && trimmedRaw.length !== colCount) {
      errors.push({
        row: rowNumber,
        message: `Expected ${colCount} column(s) (matching the rest of the file) but found ${trimmedRaw.length}.`,
      });
      return;
    }
    if (!usesLegacyTemplate && trimmedRaw.length < 2) {
      errors.push({
        row: rowNumber,
        message: "Expected at least username/email and password columns.",
      });
      return;
    }

    const values = {};
    const rowTemplate = usesLegacyTemplate ? template : buildDefaultTemplate(trimmedRaw.length);
    rowTemplate.forEach((field, i) => {
      if (!field) return; // placeholder column (e.g. Facebook 2's blank slot) — no data to read
      const value = (trimmedRaw[i] || "").trim();
      if (field === "identifier") {
        if (looksLikeEmail(value)) values.email = value;
        else values.username = value;
        return;
      }
      if (field === "email_or_two_fa") {
        if (looksLikeEmail(value)) values.email = value;
        else values.two_fa = value;
        return;
      }
      values[field] = value;
    });

    const password = values.password || "";
    const email = values.email || "";
    const username = values.username || "";

    const fieldError = validateAccountFields({ password, email, username });
    if (fieldError) {
      errors.push({ row: rowNumber, message: fieldError });
      return;
    }

    items.push({
      username: username || null,
      email: email || null,
      password,
      email_password: values.email_password || null,
      two_fa: values.two_fa || null,
      recovery_email: values.recovery_email || null,
      recovery_email_password: values.recovery_email_password || null,
      year: values.year || null,
      friends_count: values.friends_count || null,
      extra_data: extra || null,
    });
  });

  if (errors.length > 0) {
    return { items: [], errors };
  }
  if (items.length === 0) {
    return { items: [], errors: [{ row: 0, message: "No account rows found in the file." }] };
  }
  return { items, errors: [] };
}
