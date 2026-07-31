"use client";

// Small reusable "are you sure?" modal. Controlled entirely by props — the
// parent owns the open/closed state and what happens on confirm.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Yes, continue",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-5"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-night-900 rounded-xl2 shadow-modal w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-base mb-2 dark:text-night-100">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-night-300 leading-relaxed mb-6">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn-secondary btn-sm">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className={danger ? "btn-danger btn-sm" : "btn-primary btn-sm"}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
