// Read-only reconciliation. A claim marker is not evidence of a wallet credit.
export function auditSettlements(tables, now = Date.now()) {
  const findings = [], ledger = new Map();
  const cents = n => Math.round(Number(n) * 100);
  for (const tx of tables.transactions || []) {
    if (!tx.reference_id) continue;
    const key = tx.user_id + ":" + tx.reference_id;
    const totals = ledger.get(key) || { purchase: 0, refund: 0, deposit: 0 };
    if (tx.type in totals) totals[tx.type] += cents(tx.amount);
    ledger.set(key, totals);
  }
  const mature = row => now - new Date(row.updated_at || row.completed_at || row.reviewed_at || row.created_at).getTime() > 180000;
  for (const [table, rows] of Object.entries(tables)) {
    if (table === "transactions") continue;
    for (const row of rows) {
      if (!mature(row)) continue; // Ignore legitimate operations still in flight.
      const totals = ledger.get(row.user_id + ":" + row.id) || { purchase: 0, refund: 0, deposit: 0 };
      if (row.refunded_at && totals.purchase < 0 && totals.refund <= 0 && Number(row.price_ngn ?? row.price) > 0 && table !== "social_boost_orders") {
        findings.push({ table, id: row.id, issue: "Marked refunded without a wallet refund" });
      }
      if ((table === "payment_transactions" && row.status === "completed") || (table === "topup_requests" && row.status === "approved")) {
        const expected = cents(row.confirmed_amount_ngn ?? row.amount_ngn);
        if (totals.deposit !== expected) findings.push({ table, id: row.id, issue: "Completed deposit does not match wallet ledger" });
      }
      if ((table === "telegram_gift_orders" || table === "social_boost_orders") && totals.purchase === 0) {
        findings.push({ table, id: row.id, issue: "Provider order has no recorded wallet debit" });
      }
      if (totals.refund > -totals.purchase) findings.push({ table, id: row.id, issue: "Refund exceeds recorded purchase" });
    }
  }
  return findings;
}
