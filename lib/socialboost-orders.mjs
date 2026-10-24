// This checkout collects a link and quantity for a single standard order.
// Other provider types need additional fields or recurring billing controls.
export function isSupportedSocialBoostService(service) {
  return String(service?.type || "").trim().toLowerCase() === "default";
}

export function canCancelSocialBoostOrder(order, service) {
  return !order.cancel_requested_at && !order.refunded_at && service?.cancel !== false &&
    !["completed", "canceled", "cancelled", "partial"].includes(String(order.status).trim().toLowerCase());
}

// Never use another order's result as confirmation for the requested order.
export function extractSocialBoostCancelResult(response, providerOrderId) {
  if (Array.isArray(response)) {
    return response.find(item => String(item?.order) === String(providerOrderId))?.cancel;
  }
  if (!response || typeof response !== "object") return undefined;
  if ("cancel" in response && (response.order == null || String(response.order) === String(providerOrderId))) return response.cancel;
  if (Array.isArray(response.orders)) return extractSocialBoostCancelResult(response.orders, providerOrderId);
  return undefined;
}

// An accepted HTTP response is not enough to put an order into React state.
// Keep settlement warnings alongside valid orders, and reject missing records.
export async function readSocialBoostOrderResponse(response, fallback) {
  let data;
  try { data = await response.json(); } catch { throw new Error(fallback); }
  if (!response.ok) throw new Error(data?.error || fallback);
  if (!data?.order || typeof data.order.id !== "string" || !data.order.id) {
    throw new Error(fallback);
  }
  return data;
}
