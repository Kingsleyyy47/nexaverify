import "server-only";

// CSV parsing + validation for the Bulk Account Upload feature (see
// app/api/admin/digital-accounts/templates/[id]/upload). No CSV library is
// installed in this project, so this is a small dependency-free RFC4180-ish
// parser: handles quoted fields (so a value can contain a comma or a
// double-quoted `""`), \r\n or \n line endings, and blank lines (skipped).
// Good enough for the simple, mostly-unquoted exports this feature expects —
// not a general-purpose CSV library.

export const REQUIRED_EITHER = ["email", "username"]; // at least one required
export const REQUIRED_ALWAYS = ["password"];
export const OPTIONAL_COLUMNS = [
  "email_password",
  "two_fa",
  "recovery_email",
  "recovery_email_password",
];

// Aliases so a header spelled slightly differently still matches — e.g. the
// sample CSV shown in the admin UI uses "two_fa", but the requirements text
// also mentions "two_fa_code" as an accepted name for the same column.
const HEADER_ALIASES = {
  two_fa_code: "two_fa",
  emailpassword: "email_password",
  recoveryemail: "recovery_email",
  recoveryemailpassword: "recovery_email_password",
};

const KNOWN_COLUMNS = new Set([
  "username",
  "email",
  "password",
  "email_password",
  "two_fa",
  "recovery_email",
  "recovery_email_password",
]);

// Shared by both the CSV bulk upload (one call per row, below) and the
// single-product admin form's insert route
// (app/api/admin/digital-accounts/templates/[id]/single) — same two rules
// either way: password is always required, and at least one of
// email/username is required as the account's identifier. Keeping this in
// one place means the two entry points (CSV for many accounts at once, this
// form for adding them one by one) can never quietly drift apart on what
// counts as a complete account.
export function validateAccountFields({ password, email, username }) {
  if (!password) return "Missing password.";
  if (!email && !username) return "Missing both email and username — at least one is required.";
  return null;
}

function normalizeHeader(raw) {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[key] || key;
}

// Splits raw CSV text into rows of raw string fields, respecting
// double-quoted fields (which may contain commas, newlines, and escaped `""`).
function parseRows(text) {
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

  // Last field/row (files don't always end with a trailing newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

// Parses `csvText` and validates every row against the format requirements.
// Returns { items, errors }. `items` is only ever populated (usable) when
// `errors` is empty — the caller should reject the WHOLE upload if there are
// any errors, rather than inserting the valid rows and skipping bad ones, so
// a typo'd column never silently drops accounts.
export function parseAndValidateAccountsCsv(csvText) {
  const rows = parseRows(csvText || "");
  if (rows.length === 0) {
    return { items: [], errors: [{ row: 0, message: "The file is empty." }] };
  }

  const headerRow = rows[0].map(normalizeHeader);
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
    // A fully blank data line (possible trailing blank row in the file).
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
