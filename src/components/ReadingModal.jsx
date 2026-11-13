import { useEffect, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import {
  getLocalDateString,
  MAX_GLUCOSE_MG_DL,
  MIN_GLUCOSE_MG_DL,
  READING_SLOTS,
  validateReadingInput,
} from '../utils/glucose.js';

export function ReadingModal({
  isOpen,
  onClose,
  existingReadings,
  initialDate,
  initialSlot,
  editingReading,
  onSave,
}) {
  const today = getLocalDateString();
  const isEditing = Boolean(editingReading);

  const [readingDate, setReadingDate] = useState(initialDate || today);
  const [slot, setSlot] = useState(initialSlot || 'morning_fasting');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingReading) {
      setReadingDate(editingReading.readingDate);
      setSlot(editingReading.slot);
      setValue(String(editingReading.value));
      setNote(editingReading.note ?? '');
    } else {
      const targetDate = initialDate || today;
      setReadingDate(targetDate);
      if (initialSlot) {
        setSlot(initialSlot);
      } else {
        const usedSlots = new Set(
          existingReadings
            .filter((r) => r.readingDate === targetDate)
            .map((r) => r.slot)
        );
        const firstAvailable =
          READING_SLOTS.find((s) => !usedSlots.has(s.id))?.id ?? 'morning_fasting';
        setSlot(firstAvailable);
      }
      setValue('');
      setNote('');
    }
    setFieldErrors({});
    setSubmitError(null);
    setSaving(false);
  }, [isOpen, editingReading, initialDate, initialSlot, existingReadings, today]);

  if (!isOpen) return null;

  const usedSlotsOnDate = new Set(
    existingReadings
      .filter((r) => r.readingDate === readingDate && r.id !== editingReading?.id)
      .map((r) => r.slot)
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    const validation = validateReadingInput(
      { readingDate, slot, value, note },
      existingReadings,
      editingReading?.id,
      today
    );

    if (!validation.valid) {
      const nextErrors = {};
      if (validation.errors.readingDate) nextErrors.readingDate = validation.errors.readingDate;
      if (validation.errors.slot) nextErrors.slot = validation.errors.slot;
      if (validation.errors.value) nextErrors.value = validation.errors.value;
      if (validation.errors.note) nextErrors.note = validation.errors.note;
      if (validation.errors.general) setSubmitError(validation.errors.general);
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      await onSave({
        readingDate,
        slot,
        value: value.trim(),
        note: note.trim(),
      });
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to save reading. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reading-modal-title"
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-emerald-100 shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 id="reading-modal-title" className="text-lg font-bold text-slate-900">
            {isEditing ? 'Edit glucose reading' : 'Log glucose reading'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reading dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
          {submitError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="reading-date"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Date
            </label>
            <input
              id="reading-date"
              type="date"
              max={today}
              value={readingDate}
              disabled={isEditing}
              onChange={(e) => {
                setReadingDate(e.target.value);
                setFieldErrors((prev) => ({ ...prev, readingDate: '' }));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 disabled:bg-slate-50 disabled:text-slate-500"
            />
            {fieldErrors.readingDate && (
              <p className="mt-1 text-xs text-rose-700">{fieldErrors.readingDate}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="reading-slot"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Daily slot
            </label>
            <select
              id="reading-slot"
              value={slot}
              disabled={isEditing}
              onChange={(e) => {
                setSlot(e.target.value);
                setFieldErrors((prev) => ({ ...prev, slot: '' }));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 disabled:bg-slate-50 disabled:text-slate-500"
            >
              {READING_SLOTS.map((s) => {
                const taken = usedSlotsOnDate.has(s.id);
                return (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {taken && !isEditing ? ' (Already logged)' : ''}
                  </option>
                );
              })}
            </select>
            {fieldErrors.slot && (
              <p className="mt-1 text-xs text-rose-700">{fieldErrors.slot}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="reading-value"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Glucose value (mg/dL)
            </label>
            <input
              id="reading-value"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 112"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setFieldErrors((prev) => ({ ...prev, value: '' }));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
            <p className="mt-1 text-xs text-slate-500">
              Whole integer between {MIN_GLUCOSE_MG_DL} and {MAX_GLUCOSE_MG_DL} mg/dL (no decimals).
            </p>
            {fieldErrors.value && (
              <p className="mt-1 text-xs text-rose-700">{fieldErrors.value}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="reading-note"
                className="block text-sm font-medium text-slate-700"
              >
                Meal or context note (optional)
              </label>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                {note.length}/280
              </span>
            </div>
            <textarea
              id="reading-note"
              rows={2}
              maxLength={280}
              placeholder="e.g. Oatmeal & berries, 20 min walk"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setFieldErrors((prev) => ({ ...prev, note: '' }));
              }}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 resize-none"
            />
            {fieldErrors.note && (
              <p className="mt-1 text-xs text-rose-700">{fieldErrors.note}</p>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Save reading'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
