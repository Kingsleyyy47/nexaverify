// Shared across every route that creates or changes a username (signup,
// self-service set-username, admin set-username) so the rule can't drift
// between them.
export const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/; // 3-20 chars, starts with a letter

export function isValidUsername(value) {
  return typeof value === "string" && USERNAME_RE.test(value);
}

export const USERNAME_RULES_MESSAGE =
  "Username must be 3-20 characters, start with a letter, and use only letters, numbers, or underscores.";

// Postgres ILIKE treats `_` as "match any single character" and `%` as
// "match any sequence" — since usernames are allowed to contain underscores,
// searching with a raw `.ilike("username", username)` would let e.g.
// "john_doe" also match "johnXdoe", silently letting the wrong account
// through on login or letting a colliding username slip past the signup
// uniqueness check. Escaping the wildcard characters makes ILIKE behave like
// a plain case-insensitive equality check, which is all we actually want here.
export function escapeLikePattern(value) {
  return String(value).replace(/[%_\\]/g, (match) => `\\${match}`);
}
