// No credentials or browser state: the caller supplies its server-side client.
// Never retry a money mutation automatically after an uncertain response.
function databaseError(error) {
  return Object.assign(new Error(error.message || "Wallet operation failed"), error);
}

export async function adjustBalance(admin, args) {
  const amount = Number(args.p_amount);
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 9_999_999_999.99) {
    throw new Error("Wallet amount must be a finite, non-zero NGN amount");
  }
  const cents = Math.round(amount * 100);
  if (!cents || (args.p_type === "purchase" && cents >= 0) ||
      (["refund", "deposit"].includes(args.p_type) && cents <= 0)) {
    throw new Error("Wallet amount has the wrong sign or is below one kobo");
  }
  const params = { ...args, p_amount: cents / 100 };

  // Refunds can only return money that this account actually paid for this
  // order. In particular, rollback of a failed debit must not create credit.
  if (args.p_type === "refund") {
    if (!args.p_reference_id) throw new Error("A refund must reference its purchase");
    const { data: ledger, error } = await admin.from("transactions")
      .select("type, amount, balance_after")
      .eq("user_id", args.p_user_id).eq("reference_id", args.p_reference_id)
      .in("type", ["purchase", "refund"]);
    if (error) throw databaseError(error);
    const paid = -(ledger || []).filter((t) => t.type === "purchase")
      .reduce((sum, t) => sum + Math.round(Number(t.amount) * 100), 0);
    const refunds = (ledger || []).filter((t) => t.type === "refund");
    const returned = refunds.reduce((sum, t) => sum + Math.round(Number(t.amount) * 100), 0);
    if (paid > 0 && returned <= paid && refunds.some((t) => Math.round(Number(t.amount) * 100) === cents)) {
      return Number(refunds.at(-1).balance_after);
    }
    if (paid <= 0 || cents > paid - returned) {
      throw Object.assign(new Error("Refund exceeds the recorded purchase debit"), { code: "REFUND_EXCEEDS_PURCHASE" });
    }
  }

  // Deposit references are unique payment/top-up records. On recovery, reuse
  // the recorded credit; a repeated approval must not manufacture a deposit.
  if (args.p_type === "deposit" && args.p_reference_id) {
    const { data: credited, error: lookupError } = await admin.from("transactions")
      .select("balance_after").eq("user_id", args.p_user_id).eq("reference_id", args.p_reference_id)
      .eq("type", "deposit").eq("amount", params.p_amount).limit(1).maybeSingle();
    if (lookupError) throw databaseError(lookupError);
    if (credited) return Number(credited.balance_after);
  }
  let result;
  try { result = await admin.rpc("adjust_balance", params); }
  catch (error) { result = { data: null, error }; }
  const { data, error } = result;
  if (error) {
    // A lost HTTP response can follow a committed database transaction. Look
    // for that exact ledger entry before reporting failure or unclaiming it.
    if (args.p_reference_id) {
      const { data: committed, error: readError } = await admin.from("transactions")
        .select("balance_after").eq("user_id", args.p_user_id)
        .eq("reference_id", args.p_reference_id).eq("type", args.p_type)
        .eq("amount", params.p_amount).order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (!readError && committed) return Number(committed.balance_after);
    }
    throw databaseError(error);
  }
  if (data == null || !Number.isFinite(Number(data))) {
    throw new Error("Wallet operation returned no confirmed balance");
  }
  return Number(data);
}
