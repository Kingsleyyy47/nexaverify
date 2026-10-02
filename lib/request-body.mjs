// Return only JSON objects. Invalid JSON, null, arrays and primitive values
// must be a client error before a route destructures or changes any data.
const BOOLEAN_FIELDS = new Set([
  "enabled", "disabled", "favorite", "auto", "autoMarkup", "customerVisible",
  "daisysmsEnabled", "daisysmsLongTermEnabled", "daisysimEnabled", "usOnlyEnabled",
  "pocketfiVirtualAccountEnabled", "istarEnabled", "socialBoostEnabled", "virtualAccountEnabled",
]);

export async function readObjectBody(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    // A string such as "false" is truthy in JS and must never enable a
    // provider or product. Every API switch uses actual JSON booleans.
    if (Object.entries(body).some(([key, value]) => BOOLEAN_FIELDS.has(key) && typeof value !== "boolean")) return null;
    return body;
  } catch {
    return null;
  }
}
