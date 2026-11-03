"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = { onCleared: () => void | Promise<void> };

export default function ClearBusinessDataButton({ onCleared }: Props) {
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !clearing) setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, clearing]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function confirmClear() {
    setClearing(true);
    setError("");
    try {
      const db = createClient();
      const { error: rpcError } = await db.rpc("admin_clear_business_data");
      if (rpcError) {
        if (rpcError.code === "PGRST202" || /could not find the function/i.test(rpcError.message)) {
          throw new Error("The reset function is not installed yet. Run supabase/clear-business-data.sql in the Supabase SQL Editor, then try again.");
        }
        throw rpcError;
      }
      setOpen(false);
      setToast("All business data cleared, profit reset to 0");
      await onCleared();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear business data.");
    } finally {
      setClearing(false);
    }
  }

  return <>
    <button type="button" className="btn danger" onClick={() => { setError(""); setOpen(true); }}>
      Clear All Business Data (Reset Profit to 0)
    </button>

    {open && <div className="receipt-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="clear-data-title" aria-describedby="clear-data-description" onClick={(event) => { if (event.target === event.currentTarget && !clearing) setOpen(false); }}>
      <div className="danger-dialog">
        <h2 id="clear-data-title">Are you sure?</h2>
        <p id="clear-data-description">
          This will PERMANENTLY delete all sales, sale_items, expenses, inventory_movements and reset profit to 0. Products and categories will be kept. This cannot be undone.
        </p>
        {error && <div className="notice danger-notice" role="alert">{error}</div>}
        <div className="row-actions danger-dialog-actions">
          <button ref={cancelRef} type="button" className="btn secondary" onClick={() => setOpen(false)} disabled={clearing}>Cancel</button>
          <button type="button" className="btn danger" onClick={confirmClear} disabled={clearing}>
            {clearing ? "Clearing data…" : "Yes, delete everything"}
          </button>
        </div>
      </div>
    </div>}

    {toast && <div className="toast-success" role="status" aria-live="polite">{toast}</div>}
  </>;
}
