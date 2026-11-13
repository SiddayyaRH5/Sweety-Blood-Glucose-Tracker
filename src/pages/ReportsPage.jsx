import { useEffect, useMemo, useState } from 'react';
import { Calendar, Download, Edit3, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useReadings } from '../context/ReadingsContext.jsx';
import {
  fetchDailyReportApi,
  fetchMonthToDateReportApi,
  fetchPreviousMonthReportApi,
} from '../services/readingsService.js';
import { GlucoseTrendChart } from '../components/GlucoseTrendChart.jsx';
import {
  buildDailyReport,
  buildMonthToDateReport,
  buildPreviousMonthReport,
  classifyGlucoseLevel,
  formatReadableDate,
  getLocalDateString,
  SLOT_MAP,
} from '../utils/glucose.js';

function downloadCsv(readings, filename) {
  const header = 'Date,Slot,Value (mg/dL),Status,Note\n';
  const rows = readings
    .map((r) => {
      const slotLabel = SLOT_MAP[r.slot].label;
      const status = classifyGlucoseLevel(r.value, r.slot).label;
      const escapedNote = `"${(r.note || '').replace(/"/g, '""')}"`;
      return `${r.readingDate},"${slotLabel}",${r.value},"${status}",${escapedNote}`;
    })
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage({
  onOpenAddModal,
  onOpenEditModal,
  onRequestDelete,
}) {
  const { user } = useAuth();
  const { readings, loading } = useReadings();
  const today = getLocalDateString();
  const [activeTab, setActiveTab] = useState('daily');
  const [dailyDate, setDailyDate] = useState(today);
  const [serverDaily, setServerDaily] = useState(null);
  const [serverMtd, setServerMtd] = useState(null);
  const [serverPrevMonth, setServerPrevMonth] = useState(null);

  useEffect(() => {
    if (!user || user.isPreviewSession) {
      setServerDaily(null);
      setServerMtd(null);
      setServerPrevMonth(null);
      return;
    }

    let active = true;
    Promise.all([
      fetchDailyReportApi(dailyDate),
      fetchMonthToDateReportApi(today),
      fetchPreviousMonthReportApi(today),
    ])
      .then(([daily, mtd, prev]) => {
        if (!active) return;
        setServerDaily(daily);
        setServerMtd(mtd);
        setServerPrevMonth(prev);
      })
      .catch(() => {
        // Fallback to client-side calculation from synced readings if transient error occurs
      });

    return () => {
      active = false;
    };
  }, [user, readings, dailyDate, today]);

  const localDailyReport = useMemo(
    () => buildDailyReport(readings, dailyDate),
    [readings, dailyDate]
  );
  const localMtdReport = useMemo(
    () => buildMonthToDateReport(readings, today),
    [readings, today]
  );
  const localPrevMonthReport = useMemo(
    () => buildPreviousMonthReport(readings, today),
    [readings, today]
  );

  const dailyReport = !user?.isPreviewSession && serverDaily ? serverDaily : localDailyReport;
  const mtdReport = !user?.isPreviewSession && serverMtd ? serverMtd : localMtdReport;
  const prevMonthReport =
    !user?.isPreviewSession && serverPrevMonth ? serverPrevMonth : localPrevMonthReport;

  const currentPeriodReport =
    activeTab === 'month-to-date' ? mtdReport : prevMonthReport;

  const summary =
    activeTab === 'daily' ? dailyReport.summary : currentPeriodReport.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Reports
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Daily, month-to-date, and previous-month blood glucose analytics.
          </p>
        </div>

        {/* Segmented Report Selector */}
        <div
          role="tablist"
          aria-label="Report period selector"
          className="inline-flex items-center gap-1 p-1 bg-white border border-emerald-100 rounded-xl self-start sm:self-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'daily'}
            onClick={() => setActiveTab('daily')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'daily'
                ? 'bg-emerald-700 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-emerald-50'
            }`}
          >
            Daily Report
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'month-to-date'}
            onClick={() => setActiveTab('month-to-date')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'month-to-date'
                ? 'bg-emerald-700 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-emerald-50'
            }`}
          >
            Month-to-Date
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'previous-month'}
            onClick={() => setActiveTab('previous-month')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'previous-month'
                ? 'bg-emerald-700 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-emerald-50'
            }`}
          >
            Previous Month
          </button>
        </div>
      </div>

      {/* Period Header Controls */}
      <div className="bg-white rounded-2xl border border-emerald-100 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        {activeTab === 'daily' ? (
          <div className="flex flex-wrap items-center gap-3">
            <Calendar className="w-4 h-4 text-emerald-700" />
            <label htmlFor="report-daily-date" className="text-sm font-medium text-slate-700">
              Report date
            </label>
            <input
              id="report-daily-date"
              type="date"
              max={today}
              value={dailyDate}
              onChange={(e) => {
                if (e.target.value && e.target.value <= today) {
                  setDailyDate(e.target.value);
                }
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-mono text-slate-900"
            />
            <span className="text-xs text-slate-500">
              {formatReadableDate(dailyDate)}
            </span>
          </div>
        ) : (
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {currentPeriodReport.label}
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {currentPeriodReport.startDate} to {currentPeriodReport.endDate}
            </p>
          </div>
        )}

        {activeTab !== 'daily' && currentPeriodReport.readings.length > 0 && (
          <button
            type="button"
            onClick={() =>
              downloadCsv(
                currentPeriodReport.readings,
                `sweety-${activeTab}-${currentPeriodReport.startDate}.csv`
              )
            }
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        )}
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-emerald-100 p-5">
          <p className="text-xs font-medium text-slate-500">Highest reading</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {loading ? '—' : summary.highest !== null ? summary.highest : '—'}
            {summary.highest !== null && (
              <span className="text-xs font-normal text-slate-500 ml-1">mg/dL</span>
            )}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-100 p-5">
          <p className="text-xs font-medium text-slate-500">Lowest reading</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {loading ? '—' : summary.lowest !== null ? summary.lowest : '—'}
            {summary.lowest !== null && (
              <span className="text-xs font-normal text-slate-500 ml-1">mg/dL</span>
            )}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-100 p-5">
          <p className="text-xs font-medium text-slate-500">Average reading</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-800">
            {loading ? '—' : summary.averageFormatted}
            {summary.average !== null && (
              <span className="text-xs font-normal text-slate-500 ml-1">mg/dL</span>
            )}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-100 p-5">
          <p className="text-xs font-medium text-slate-500">Total readings</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {loading ? '—' : summary.totalCount}
            {summary.totalCount > 0 && (
              <span className="text-xs font-normal text-slate-500 ml-1">
                ({summary.inRangePercent}% in range)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Daily Slot Breakdown OR Period Report Content */}
      {activeTab === 'daily' ? (
        <div className="space-y-4">
          {!loading && dailyReport.summary.totalCount === 0 && (
            <div className="bg-white rounded-2xl border border-emerald-100 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  No readings recorded for {formatReadableDate(dailyDate)}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Log your first blood glucose check for this date to view daily highs, lows, and averages.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenAddModal(dailyDate, 'morning_fasting')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Log reading</span>
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                All four daily reading slots
              </h2>
              <span className="text-xs font-mono text-slate-500">
                {dailyReport.summary.totalCount}/4 logged
              </span>
            </div>

          <div className="divide-y divide-slate-100">
            {dailyReport.slots.map(({ slot, reading }) => {
              const cls = reading ? classifyGlucoseLevel(reading.value, slot.id) : null;
              return (
                <div
                  key={slot.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{slot.label}</p>
                    <p className="text-xs text-slate-500">
                      Target {slot.targetMin}–{slot.targetMax} mg/dL
                      {reading?.note ? ` · ${reading.note}` : ''}
                    </p>
                  </div>

                  {reading && cls ? (
                    <div className="flex items-center gap-4">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${cls.badgeClass}`}
                      >
                        {cls.label}
                      </span>
                      <span className="text-lg font-bold font-mono tabular-nums text-slate-900 w-24 text-right">
                        {reading.value} <span className="text-xs font-normal text-slate-500">mg/dL</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenEditModal(reading)}
                          aria-label={`Edit ${slot.label} reading`}
                          className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRequestDelete(reading)}
                          aria-label={`Delete ${slot.label} reading`}
                          className="p-2 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">No reading</span>
                      <button
                        type="button"
                        onClick={() => onOpenAddModal(dailyDate, slot.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      ) : currentPeriodReport.readings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-emerald-100 p-10 text-center space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            No readings recorded for {currentPeriodReport.label}
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Once readings are logged within {currentPeriodReport.startDate} to {currentPeriodReport.endDate}, your averages, slot breakdown, and chart will appear here.
          </p>
          <button
            type="button"
            onClick={() => onOpenAddModal(today)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Log reading</span>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <GlucoseTrendChart
            readings={currentPeriodReport.readings}
            title={`${currentPeriodReport.label} trend`}
          />

          {/* Slot Averages Table */}
          <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Averages by daily slot
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500">
                    <th className="py-3 px-6 font-medium">Slot</th>
                    <th className="py-3 px-4 font-medium text-right">Count</th>
                    <th className="py-3 px-4 font-medium text-right">Lowest</th>
                    <th className="py-3 px-4 font-medium text-right">Highest</th>
                    <th className="py-3 px-6 font-medium text-right">Average (mg/dL)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {currentPeriodReport.slotBreakdown.map(({ slot, summary: s }) => (
                    <tr key={slot.id} className="hover:bg-emerald-50/30">
                      <td className="py-3 px-6 font-medium text-slate-900">
                        {slot.label}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {s.totalCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {s.lowest ?? '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {s.highest ?? '—'}
                      </td>
                      <td className="py-3 px-6 text-right font-mono tabular-nums font-semibold text-emerald-800">
                        {s.averageFormatted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* All Readings in Period Table */}
          <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Readings in period ({currentPeriodReport.readings.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500">
                    <th className="py-3 px-6 font-medium">Date</th>
                    <th className="py-3 px-4 font-medium">Slot</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Value</th>
                    <th className="py-3 px-6 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {currentPeriodReport.readings.map((r) => {
                    const cls = classifyGlucoseLevel(r.value, r.slot);
                    return (
                      <tr key={r.id} className="hover:bg-emerald-50/30">
                        <td className="py-3 px-6 font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          {r.readingDate}
                        </td>
                        <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                          {SLOT_MAP[r.slot].label}
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
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRequestDelete(r)}
                            aria-label={`Delete ${r.readingDate} ${SLOT_MAP[r.slot].label}`}
                            className="p-1.5 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
