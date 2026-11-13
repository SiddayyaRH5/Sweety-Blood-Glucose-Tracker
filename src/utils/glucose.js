export const READING_SLOTS = [
  {
    id: 'morning_fasting',
    label: 'Morning (fasting)',
    shortLabel: 'Fasting',
    timingHint: 'Before breakfast, 8+ hrs fasting',
    targetMin: 70,
    targetMax: 130,
  },
  {
    id: 'after_breakfast',
    label: 'After breakfast',
    shortLabel: 'Breakfast',
    timingHint: '1–2 hrs after morning meal',
    targetMin: 70,
    targetMax: 180,
  },
  {
    id: 'after_lunch',
    label: 'After lunch',
    shortLabel: 'Lunch',
    timingHint: '1–2 hrs after midday meal',
    targetMin: 70,
    targetMax: 180,
  },
  {
    id: 'after_dinner',
    label: 'After dinner',
    shortLabel: 'Dinner',
    timingHint: '1–2 hrs after evening meal',
    targetMin: 70,
    targetMax: 180,
  },
];

export const VALID_SLOTS = new Set(READING_SLOTS.map((s) => s.id));

export const SLOT_MAP = READING_SLOTS.reduce((acc, slot) => {
  acc[slot.id] = slot;
  return acc;
}, {});

export const MIN_GLUCOSE_MG_DL = 40;
export const MAX_GLUCOSE_MG_DL = 600;
export const MAX_READINGS_PER_DAY = 4;

export function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidDateFormat(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  return (
    parsed.getFullYear() === y &&
    parsed.getMonth() === m - 1 &&
    parsed.getDate() === d
  );
}

export function buildReadingId(readingDate, slot) {
  return `${readingDate}_${slot}`;
}

export function validateReadingInput(
  input,
  existingReadings,
  editingReadingId,
  todayStr = getLocalDateString()
) {
  const errors = {};
  const safeInput = input && typeof input === 'object' ? input : {};

  const readingDate = typeof safeInput.readingDate === 'string' ? safeInput.readingDate.trim() : '';
  if (!readingDate) {
    errors.readingDate = 'Reading date is required.';
  } else if (!isValidDateFormat(readingDate)) {
    errors.readingDate = 'Enter a valid date in YYYY-MM-DD format.';
  } else if (readingDate > todayStr) {
    errors.readingDate = 'Date cannot be in the future.';
  }

  const slot = typeof safeInput.slot === 'string' ? safeInput.slot.trim() : '';
  if (!slot) {
    errors.slot = 'Reading slot is required.';
  } else if (!VALID_SLOTS.has(slot)) {
    errors.slot = 'Select one of the four valid daily reading slots.';
  }

  const rawValue =
    typeof safeInput.value === 'number'
      ? Number.isFinite(safeInput.value)
        ? String(safeInput.value)
        : ''
      : typeof safeInput.value === 'string'
        ? safeInput.value.trim()
        : '';
  let parsedValue;

  if (!rawValue) {
    errors.value = 'Please enter a glucose value.';
  } else if (!/^-?\d+$/.test(rawValue)) {
    if (/^-?\d*\.\d+$/.test(rawValue)) {
      errors.value =
        'Decimal values are not allowed. Value must be a whole number between 40 and 600 mg/dl.';
    } else {
      errors.value = 'Value must be a whole number between 40 and 600 mg/dl.';
    }
  } else {
    const num = Number(rawValue);
    if (!Number.isInteger(num)) {
      errors.value = 'Value must be a whole number between 40 and 600 mg/dl.';
    } else if (num < MIN_GLUCOSE_MG_DL || num > MAX_GLUCOSE_MG_DL) {
      errors.value = `Value must be between ${MIN_GLUCOSE_MG_DL} and ${MAX_GLUCOSE_MG_DL} mg/dl.`;
    } else {
      parsedValue = num;
    }
  }

  if (safeInput.note !== undefined && safeInput.note !== null && typeof safeInput.note !== 'string') {
    errors.note = 'Note must be plain text.';
  } else if (typeof safeInput.note === 'string' && safeInput.note.trim().length > 280) {
    errors.note = 'Note must be 280 characters or fewer.';
  }

  if (!errors.readingDate && !errors.slot) {
    const sameDayReadings = existingReadings.filter(
      (r) => r.readingDate === readingDate && r.id !== editingReadingId
    );
    const duplicateSlot = sameDayReadings.find((r) => r.slot === slot);
    if (duplicateSlot) {
      const slotLabel = SLOT_MAP[slot].label;
      const article = /^[aeiou]/i.test(slotLabel) ? 'an' : 'a';
      errors.slot = `You already have ${article} ${slotLabel} reading for this date.`;
    } else if (!editingReadingId && sameDayReadings.length >= MAX_READINGS_PER_DAY) {
      errors.general = `You can add only ${MAX_READINGS_PER_DAY} readings per day.`;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    parsedValue,
  };
}

export function classifyGlucoseLevel(value, slot) {
  const targetMax = SLOT_MAP[slot]?.targetMax ?? 180;
  if (value < 70) {
    return {
      level: 'low',
      label: 'Low',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      textClass: 'text-amber-700',
    };
  }
  if (value <= targetMax) {
    return {
      level: 'in_range',
      label: 'In range',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      textClass: 'text-emerald-700',
    };
  }
  if (value < 250) {
    return {
      level: 'elevated',
      label: 'Elevated',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      textClass: 'text-amber-700',
    };
  }
  return {
    level: 'high',
    label: 'High',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    textClass: 'text-rose-700',
  };
}

export function calculateReportSummary(readings) {
  if (readings.length === 0) {
    return {
      totalCount: 0,
      highest: null,
      lowest: null,
      average: null,
      averageFormatted: '—',
      inRangeCount: 0,
      inRangePercent: 0,
    };
  }

  let highest = -Infinity;
  let lowest = Infinity;
  let sum = 0;
  let inRangeCount = 0;

  for (const r of readings) {
    if (r.value > highest) highest = r.value;
    if (r.value < lowest) lowest = r.value;
    sum += r.value;
    if (classifyGlucoseLevel(r.value, r.slot).level === 'in_range') {
      inRangeCount += 1;
    }
  }

  const rawAvg = sum / readings.length;
  const average = Math.round(rawAvg * 10) / 10;

  return {
    totalCount: readings.length,
    highest,
    lowest,
    average,
    averageFormatted: average.toFixed(1),
    inRangeCount,
    inRangePercent: Math.round((inRangeCount / readings.length) * 100),
  };
}

export function buildDailyReport(readings, date) {
  const dayReadings = readings.filter((r) => r.readingDate === date);
  const bySlot = new Map();
  for (const r of dayReadings) {
    bySlot.set(r.slot, r);
  }

  return {
    date,
    summary: calculateReportSummary(dayReadings),
    slots: READING_SLOTS.map((slot) => ({
      slot,
      reading: bySlot.get(slot.id) ?? null,
    })),
  };
}

export function getMonthToDateBounds(referenceDate = getLocalDateString()) {
  const [y, m] = referenceDate.split('-').map(Number);
  const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  return {
    startDate,
    endDate: referenceDate,
    label: `${monthName} (Month-to-Date)`,
  };
}

export function getPreviousMonthBounds(referenceDate = getLocalDateString()) {
  const [y, m] = referenceDate.split('-').map(Number);
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  const lastDayOfPrevMonth = new Date(prevYear, prevMonth, 0).getDate();

  const startDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const endDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(
    lastDayOfPrevMonth
  ).padStart(2, '0')}`;
  const label = new Date(prevYear, prevMonth - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return { startDate, endDate, label };
}

function buildPeriodReport(allReadings, bounds) {
  const filtered = allReadings
    .filter(
      (r) =>
        r.readingDate >= bounds.startDate && r.readingDate <= bounds.endDate
    )
    .sort((a, b) => {
      if (a.readingDate !== b.readingDate) {
        return b.readingDate.localeCompare(a.readingDate);
      }
      return (
        READING_SLOTS.findIndex((s) => s.id === a.slot) -
        READING_SLOTS.findIndex((s) => s.id === b.slot)
      );
    });

  return {
    ...bounds,
    summary: calculateReportSummary(filtered),
    readings: filtered,
    slotBreakdown: READING_SLOTS.map((slot) => ({
      slot,
      summary: calculateReportSummary(filtered.filter((r) => r.slot === slot.id)),
    })),
  };
}

export function buildMonthToDateReport(
  allReadings,
  referenceDate = getLocalDateString()
) {
  return buildPeriodReport(allReadings, getMonthToDateBounds(referenceDate));
}

export function buildPreviousMonthReport(
  allReadings,
  referenceDate = getLocalDateString()
) {
  return buildPeriodReport(allReadings, getPreviousMonthBounds(referenceDate));
}

export function formatReadableDate(dateStr) {
  if (!isValidDateFormat(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getGreetingForHour(hour = new Date().getHours()) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function generateDemoSeedReadings(
  userId,
  referenceDate = getLocalDateString()
) {
  const [y, m, d] = referenceDate.split('-').map(Number);
  const baseDate = new Date(y, m - 1, d);
  const result = [];

  const offsets = [
    { daysAgo: 0, slots: { morning_fasting: 98, after_breakfast: 138, after_lunch: 146 } },
    { daysAgo: 1, slots: { morning_fasting: 102, after_breakfast: 144, after_lunch: 152, after_dinner: 136 } },
    { daysAgo: 2, slots: { morning_fasting: 94, after_breakfast: 132, after_lunch: 141, after_dinner: 129 } },
    { daysAgo: 3, slots: { morning_fasting: 106, after_breakfast: 155, after_dinner: 148 } },
    { daysAgo: 5, slots: { morning_fasting: 99, after_breakfast: 139, after_lunch: 164, after_dinner: 134 } },
    { daysAgo: 8, slots: { morning_fasting: 96, after_breakfast: 135, after_lunch: 148, after_dinner: 131 } },
    { daysAgo: 15, slots: { morning_fasting: 104, after_breakfast: 149, after_lunch: 158, after_dinner: 142 } },
    { daysAgo: 22, slots: { morning_fasting: 109, after_breakfast: 162, after_lunch: 174, after_dinner: 151 } },
    { daysAgo: 30, slots: { morning_fasting: 101, after_breakfast: 146, after_lunch: 156, after_dinner: 139 } },
    { daysAgo: 36, slots: { morning_fasting: 97, after_breakfast: 141, after_lunch: 149, after_dinner: 135 } },
  ];

  for (const item of offsets) {
    const dt = new Date(baseDate);
    dt.setDate(dt.getDate() - item.daysAgo);
    const dateStr = getLocalDateString(dt);
    const entries = Object.entries(item.slots);
    for (const [slot, value] of entries) {
      const id = buildReadingId(dateStr, slot);
      const ts = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 9, 0, 0).toISOString();
      result.push({
        id,
        userId,
        readingDate: dateStr,
        slot,
        value,
        createdAt: ts,
        updatedAt: ts,
      });
    }
  }

  return result;
}
