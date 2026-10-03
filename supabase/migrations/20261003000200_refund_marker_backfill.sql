-- Set only missing refund markers backed by the same customer's ledger.
-- Does not issue credits, alter balances, or erase existing claim markers.
begin;
update public.rentals r
   set refunded_at = proof.refunded_at
  from (
    select t.reference_id, t.user_id,
           max(t.created_at) filter (where t.type = 'refund') as refunded_at,
           sum(t.amount) filter (where t.type = 'refund') as refunded,
           -sum(t.amount) filter (where t.type = 'purchase') as paid
      from public.transactions t
     where t.type in ('purchase', 'refund')
     group by t.reference_id, t.user_id
  ) proof
 where r.id = proof.reference_id and r.user_id = proof.user_id
   and r.status = 'cancelled' and r.refunded_at is null
   and not r.refund_denied_by_provider
   and proof.paid > 0 and proof.refunded = proof.paid;
commit;
