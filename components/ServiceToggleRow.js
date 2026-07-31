"use client";

import { useState } from "react";
import ToggleSwitch from "./ToggleSwitch";

export default function ServiceToggleRow({ service }) {
  const [enabled, setEnabled] = useState(service.enabled);
  const [busy, setBusy] = useState(false);

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch("/api/admin/services/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: service.id, enabled: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEnabled(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="feature-row flex items-center justify-between py-4 border-b border-gray-50 last:border-0">
      <div>
        <div className="font-semibold text-sm flex items-center gap-2">
          {service.name}
          <span className="text-xs text-gray-400 font-normal">({service.id})</span>
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          Last price ${Number(service.last_price || 0).toFixed(2)}
          {service.last_count != null ? ` · ${service.last_count} available` : ""}
        </div>
      </div>

      <ToggleSwitch checked={enabled} disabled={busy} onChange={handleToggle} />
    </div>
  );
}
