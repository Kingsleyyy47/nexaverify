import "server-only";

const PAGE_SIZE = 1000;

// PostgREST caps a select at 1000 rows unless it is explicitly paged. Each
// call must build a fresh query so range/order do not accumulate.
export async function fetchAllRows(buildQuery, orderColumn) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery()
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// Use this for a unique-key .in(...) lookup. Each chunk stays below the
// server's row cap and avoids an oversized URL for a large catalog.
export async function fetchRowsInChunks(values, buildQuery, chunkSize = 500) {
  const rows = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const { data, error } = await buildQuery(values.slice(i, i + chunkSize));
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

export async function upsertRowsInChunks(admin, table, rows, onConflict, chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + chunkSize), { onConflict });
    if (error) throw error;
  }
}
