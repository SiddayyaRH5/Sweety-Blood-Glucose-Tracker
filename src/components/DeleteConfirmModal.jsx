import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { formatReadableDate, SLOT_MAP } from '../utils/glucose.js';

export function DeleteConfirmModal({ reading, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (!reading) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm(reading.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete reading.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 id="delete-modal-title" className="text-base font-bold text-slate-900">
            Delete reading?
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close confirmation dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Remove the <span className="font-semibold text-slate-900">{SLOT_MAP[reading.slot].label}</span>{' '}
            reading of{' '}
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {reading.value} mg/dL
            </span>{' '}
            on {formatReadableDate(reading.readingDate)}? This action cannot be undone.
          </p>

          {error && (
            <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={deleting}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-60 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>{deleting ? 'Deleting...' : 'Delete reading'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
