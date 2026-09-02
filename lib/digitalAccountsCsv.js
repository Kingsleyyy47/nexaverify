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
//    data in one of the fixed layouts the business sells logs in (see
//    POSITIONAL_TEMPLATES below), e.g.:
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
]);

// Column layouts for headerless files, keyed by column count after a
// trailing empty field (from a trailing delimiter, e.g. Twitter's example
// ending in "|") has been stripped. `null` marks a placeholder column that's
// present in the layout but carries no data (Facebook 2's blank spot where
// Facebook's recovery-email/2FA columns would be).
const POSITIONAL_TEMPLATES = {
  4: ["username", "password", "email", "email_password"],
  5: ["username", "password", "email", "email_password", "two_fa"],
  7: ["username", "password", "email", "email_password", null, "year", "friends_count"],
  8: ["username", "password", "email", "email_password", "recovery_email", "two_fa", "year", "friends_count"],
};

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

// Picks whichever of comma/pipe/colon appears most often on the file's first
// non-blank line — that's overwhelmingly likely to be the actual field
// separator for that line (a real header or data row uses its delimiter
// consistently; the other two candidate characters essentially never appear
// at all in these mostly-alphanumeric credential files).
function detectDelimiter(text) {
  const firstLine = (text.split(/\r?\n/).find((l) => l.trim() !== "") || "");
  let best = ",";
  let bestCount = -1;
  for (const d of [",", "|", ":"]) {
    const count = firstLine.split(d).length - 1;
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
  if (fields.length > 1 && fields[fields.length - 1].trim() === "") {
    return fields.slice(0, -1);
  }
  return fields;
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
  const rows = delimiter === "," ? parseQuotedCsvRows(text) : parseSimpleDelimitedRows(text, delimiter);
  if (rows.length === 0) {
    return { items: [], errors: [{ row: 0, message: "The file is empty." }] };
  }

  const headerRow = rows[0].map(normalizeHeader);
  const looksLikeHeader = headerRow.some((h) => KNOWN_COLUMNS.has(h));

  if (looksLikeHeader) {
    return parseHeaderedRows(rows, headerRow);
  }
  return parseHeaderlessRows(rows);
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
    const raw = rows[r];
    if (raw.every((v) => v.trim() === "")) continue;

    const rowNumber = r + 1; // 1-based, matches what a spreadsheet app would show
    const get = (name) => (name in colIndex ? (raw[colIndex[name]] || "").trim() : "");

    const password = get("password");
    const email = get("email");
    const username = get("username");

    const fieldError = validateAccountFields({ password, email, username });
    if (fieldError) {
      errors.push({ row: rowNumber, message: fieldError });
      continue;
    }

    items.push({
      username: username || null,
      email: email || null,
      password,
      email_password: get("email_password") || null,
      two_fa: get("two_fa") || null,
      recovery_email: get("recovery_email") || null,
      recovery_email_password: get("recovery_email_password") || null,
      year: get("year") || null,
      friends_count: get("friends_count") || null,
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

function parseHeaderlessRows(rows) {
  const colCount = dropTrailingEmpty(rows[0]).length;
  const template = POSITIONAL_TEMPLATES[colCount];
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

  rows.forEach((raw, idx) => {
    if (raw.every((v) => v.trim() === "")) return;
    const rowNumber = idx + 1;

    const values = {};
    template.forEach((field, i) => {
      if (!field) return; // placeholder column (e.g. Facebook 2's blank slot) — no data to read
      values[field] = (raw[i] || "").trim();
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
