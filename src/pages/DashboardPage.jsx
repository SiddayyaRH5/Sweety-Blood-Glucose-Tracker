import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useReadings } from '../context/ReadingsContext.jsx';
import {
  buildDailyReport,
  classifyGlucoseLevel,
  formatReadableDate,
  getGreetingForHour,
  getLocalDateString,
  MAX_READINGS_PER_DAY,
} from '../utils/glucose.js';

export function DashboardPage({
  onOpenAddModal,
  onOpenEditModal,
  onRequestDelete,
}) {
  const { user } = useAuth();
  const { readings, loading, error } = useReadings();
  const today = getLocalDateString();
  const [selectedDate, setSelectedDate] = useState(today);

  const firstName = (user?.name || 'there').split(' ')[0];
  const greeting = getGreetingForHour();

  const dailyReport = useMemo(
    () => buildDailyReport(readings, selectedDate),
    [readings, selectedDate]
  );

  const shiftDate = (deltaDays) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    const next = getLocalDateString(dt);
    if (next <= today) {
      setSelectedDate(next);
    }
  };

  const progressCount = dailyReport.summary.totalCount;
  const progressPercent = Math.round((progressCount / MAX_READINGS_PER_DAY) * 100);

  return (
    <div className="space-y-6">
      {/* Greeting & Date Selector Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-800 mb-1">
            Today is {formatReadableDate(today)}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {greeting}, {firstName}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-white border border-emerald-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              aria-label="Previous day"
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-emerald-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center px-2">
              <label htmlFor="dashboard-date-picker" className="sr-only">
                Select date
              </label>
              <input
                id="dashboard-date-picker"
                type="date"
                max={today}
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value && e.target.value <= today) {
                    setSelectedDate(e.target.value);
                  }
                }}
                className="text-sm font-mono text-slate-900 bg-transparent focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              disabled={selectedDate >= today}
              aria-label="Next day"
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {selectedDate !== today && (
            <button
              type="button"
              onClick={() => setSelectedDate(today)}
              className="px-3.5 py-2 rounded-xl bg-white border border-emerald-100 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 transition-colors whitespace-nowrap"
            >
              Jump to Today
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800"
        >
          {error}
        </div>
      )}

      {/* Daily Progress Strip */}
      <section
        aria-label="Daily logging progress"
        className="bg-white rounded-2xl border border-emerald-100 p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Daily progress · {formatReadableDate(selectedDate)}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {progressCount === 4
                ? 'All four daily slots recorded.'
                : `${MAX_READINGS_PER_DAY - progressCount} slot${
                    MAX_READINGS_PER_DAY - progressCount === 1 ? '' : 's'
                  } remaining for this day`}
            </p>
          </div>
          <span className="text-sm font-mono font-semibold text-emerald-800 tabular-nums">
            {progressCount}/{MAX_READINGS_PER_DAY} readings
          </span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-emerald-50 overflow-hidden" role="progressbar" aria-label="Daily reading completion" aria-valuemin={0} aria-valuemax={MAX_READINGS_PER_DAY} aria-valuenow={progressCount}>
          <div
            className="h-full rounded-full bg-emerald-600 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </section>

      {/* 4-Column KPI Summary Strip */}
      <section aria-label="Selected day summary" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="group bg-white rounded-2xl border border-emerald-100/80 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
          <p className="text-xs font-medium text-slate-500">Highest</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {loading ? '—' : dailyReport.summary.highest !== null ? `${dailyReport.summary.highest}` : '—'}
            {dailyReport.summary.highest !== null && (
              <span className="text-xs font-normal text-slate-500 ml-1">mg/dL</span>
            )}
          </p>
        </div>

        <div className="group bg-white rounded-2xl border border-emerald-100/80 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
          <p className="text-xs font-medium text-slate-500">Lowest</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {loading ? '—' : dailyReport.summary.lowest !== null ? `${dailyReport.summary.lowest}` : '—'}
            {dailyReport.summary.lowest !== null && (
              <span className="text-xs font-normal text-slate-500 ml-1">mg/dL</span>
            )}
          </p>
        </div>

        <div className="group bg-white rounded-2xl border border-emerald-100/80 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
          <p className="text-xs font-medium text-slate-500">Average</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-800">
            {loading ? '—' : dailyReport.summary.averageFormatted}
            {dailyReport.summary.average !== null && (
              <span className="text-xs font-normal text-slate-500 ml-1">mg/dL</span>
            )}
          </p>
        </div>

        <div className="group bg-white rounded-2xl border border-emerald-100/80 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
          <p className="text-xs font-medium text-slate-500">Total recorded</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {loading ? '—' : readings.length}
            <span className="text-xs font-normal text-slate-500 ml-1">all time</span>
          </p>
        </div>
      </section>

      {/* Empty Day Notice */}
      {!loading && progressCount === 0 && (
        <div className="bg-white rounded-2xl border border-emerald-100 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              No readings recorded for {formatReadableDate(selectedDate)}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Log your fasting or post-meal glucose checks below to track daily targets and generate insights.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenAddModal(selectedDate, 'morning_fasting')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Log first reading</span>
          </button>
        </div>
      )}

      {/* Four Reading Slot Cards */}
      <section aria-label="Four daily reading slots">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900">Daily reading slots</h2>
          <Link
            to="/reports"
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 transition-colors"
          >
            <span>Open full reports</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dailyReport.slots.map(({ slot, reading }) => {
            const classification = reading
              ? classifyGlucoseLevel(reading.value, slot.id)
              : null;

            return (
              <div
                key={slot.id}
                className="bg-white rounded-2xl border border-emerald-100/80 p-5 shadow-sm flex flex-col justify-between min-h-[156px] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      {slot.label}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {slot.timingHint} · Target {slot.targetMin}–{slot.targetMax} mg/dL
                    </p>
                  </div>

                  {reading && classification && (
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-md border whitespace-nowrap ${classification.badgeClass}`}
                    >
                      {classification.label}
                    </span>
                  )}
                </div>

                {loading ? (
                  <div className="h-10 bg-slate-100 rounded-lg animate-pulse mt-4" />
                ) : reading ? (
                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                          {reading.value}
                        </span>
                        <span className="text-xs font-medium text-slate-500">mg/dL</span>
                      </div>
                      {reading.note && (
                        <p className="text-xs text-slate-600 mt-1.5 line-clamp-1">
                          {reading.note}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenEditModal(reading)}
                        aria-label={`Edit ${slot.label} reading`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRequestDelete(reading)}
                        aria-label={`Delete ${slot.label} reading`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
                    <span className="text-xs text-slate-400">Not recorded yet</span>
                    <button
                      type="button"
                      onClick={() => onOpenAddModal(selectedDate, slot.id)}
                      aria-label={`Log ${slot.label} reading`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Log reading</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
