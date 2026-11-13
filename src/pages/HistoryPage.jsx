import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Edit3, Plus, Search, Trash2 } from 'lucide-react';
import { useReadings } from '../context/ReadingsContext.jsx';
import {
  classifyGlucoseLevel,
  getLocalDateString,
  READING_SLOTS,
  SLOT_MAP,
} from '../utils/glucose.js';

const PAGE_SIZE = 20;

export function HistoryPage({
  onOpenAddModal,
  onOpenEditModal,
  onRequestDelete,
}) {
  const { readings, loading } = useReadings();
  const [searchQuery, setSearchQuery] = useState('');
  const [slotFilter, setSlotFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...readings]
      .filter((r) => {
        if (slotFilter !== 'all' && r.slot !== slotFilter) return false;
        if (!q) return true;
        return (
          r.readingDate.includes(q) ||
          SLOT_MAP[r.slot].label.toLowerCase().includes(q) ||
          String(r.value).includes(q) ||
          (r.note || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.readingDate !== b.readingDate) {
          return b.readingDate.localeCompare(a.readingDate);
        }
        return (
          READING_SLOTS.findIndex((s) => s.id === a.slot) -
          READING_SLOTS.findIndex((s) => s.id === b.slot)
        );
      });
  }, [readings, searchQuery, slotFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, slotFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedReadings = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Readings Log
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Search, filter, update, or remove your recorded blood glucose entries.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenAddModal(getLocalDateString())}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors self-start sm:self-auto whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Log Reading</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-emerald-100 p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <label htmlFor="history-search" className="sr-only">
            Search readings
          </label>
          <input
            id="history-search"
            type="text"
            placeholder="Filter by date (YYYY-MM-DD), value, or meal note..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
          />
        </div>

        <div>
          <label htmlFor="history-slot-filter" className="sr-only">
            Filter by slot
          </label>
          <select
            id="history-slot-filter"
            value={slotFilter}
            onChange={(e) => setSlotFilter(e.target.value)}
            className="w-full sm:w-52 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
          >
            <option value="all">All daily slots</option>
            {READING_SLOTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
            <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <h2 className="text-base font-semibold text-slate-900">
              {readings.length === 0 ? 'No readings recorded yet' : 'No matching readings found'}
            </h2>
            <p className="text-sm text-slate-500">
              {readings.length === 0
                ? 'Log your first blood glucose check to begin building your history.'
                : 'Try adjusting your search query or slot filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="py-3 px-6 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Slot</th>
                  <th className="py-3 px-4 font-medium">Note</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Value</th>
                  <th className="py-3 px-6 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {paginatedReadings.map((r) => {
                  const cls = classifyGlucoseLevel(r.value, r.slot);
                  return (
                    <tr key={r.id} className="hover:bg-emerald-50/30">
                      <td className="py-3 px-6 font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {r.readingDate}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                        {SLOT_MAP[r.slot].label}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                        {r.note || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded border ${cls.badgeClass}`}
                        >
                          {cls.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {r.value} mg/dL
                      </td>
                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenEditModal(r)}
                          aria-label={`Edit ${r.readingDate} ${SLOT_MAP[r.slot].label}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 mr-1"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestDelete(r)}
                          aria-label={`Delete ${r.readingDate} ${SLOT_MAP[r.slot].label}`}
                          className="p-1.5 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > PAGE_SIZE && (
          <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <span>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} readings
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <span className="font-mono">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
