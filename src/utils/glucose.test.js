import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyReport,
  buildMonthToDateReport,
  buildPreviousMonthReport,
  buildReadingId,
  calculateReportSummary,
  classifyGlucoseLevel,
  getPreviousMonthBounds,
  validateReadingInput,
} from './glucose.js';

const TODAY = '2026-11-12';

function makeReading(readingDate, slot, value, userId = 'user-1') {
  return {
    id: buildReadingId(readingDate, slot),
    userId,
    readingDate,
    slot,
    value,
    createdAt: '2026-11-12T08:00:00.000Z',
    updatedAt: '2026-11-12T08:00:00.000Z',
  };
}

test('validateReadingInput accepts valid integer glucose values between 40 and 600', () => {
  const resMin = validateReadingInput(
    { readingDate: TODAY, slot: 'morning_fasting', value: '40' },
    [],
    undefined,
    TODAY
  );
  assert.equal(resMin.valid, true);
  assert.equal(resMin.parsedValue, 40);

  const resMax = validateReadingInput(
    { readingDate: TODAY, slot: 'after_dinner', value: 600 },
    [],
    undefined,
    TODAY
  );
  assert.equal(resMax.valid, true);
  assert.equal(resMax.parsedValue, 600);
});

test('validateReadingInput rejects out-of-range, decimal, empty, and future dates', () => {
  const emptyRes = validateReadingInput(
    { readingDate: TODAY, slot: 'morning_fasting', value: '' },
    [],
    undefined,
    TODAY
  );
  assert.equal(emptyRes.valid, false);
  assert.equal(emptyRes.errors.value, 'Please enter a glucose value.');

  const lowRes = validateReadingInput(
    { readingDate: TODAY, slot: 'morning_fasting', value: '39' },
    [],
    undefined,
    TODAY
  );
  assert.equal(lowRes.valid, false);
  assert.equal(lowRes.errors.value, 'Value must be between 40 and 600 mg/dl.');

  const highRes = validateReadingInput(
    { readingDate: TODAY, slot: 'morning_fasting', value: '601' },
    [],
    undefined,
    TODAY
  );
  assert.equal(highRes.valid, false);
  assert.equal(highRes.errors.value, 'Value must be between 40 and 600 mg/dl.');

  const decimalRes = validateReadingInput(
    { readingDate: TODAY, slot: 'morning_fasting', value: '112.5' },
    [],
    undefined,
    TODAY
  );
  assert.equal(decimalRes.valid, false);
  assert.match(decimalRes.errors.value ?? '', /Decimal values are not allowed/i);

  const futureRes = validateReadingInput(
    { readingDate: '2026-11-13', slot: 'morning_fasting', value: '110' },
    [],
    undefined,
    TODAY
  );
  assert.equal(futureRes.valid, false);
  assert.equal(futureRes.errors.readingDate, 'Date cannot be in the future.');

  const invalidSlotRes = validateReadingInput(
    { readingDate: TODAY, slot: 'midnight_snack', value: '110' },
    [],
    undefined,
    TODAY
  );
  assert.equal(invalidSlotRes.valid, false);
  assert.ok(invalidSlotRes.errors.slot);
});

test('validateReadingInput prevents duplicate slots and more than 4 readings per day', () => {
  const existing = [
    makeReading(TODAY, 'morning_fasting', 98),
    makeReading(TODAY, 'after_breakfast', 135),
    makeReading(TODAY, 'after_lunch', 142),
  ];

  const dupRes = validateReadingInput(
    { readingDate: TODAY, slot: 'after_lunch', value: '101' },
    existing,
    undefined,
    TODAY
  );
  assert.equal(dupRes.valid, false);
  assert.equal(dupRes.errors.slot, 'You already have an After lunch reading for this date.');

  // Editing same reading ID is allowed
  const editRes = validateReadingInput(
    { readingDate: TODAY, slot: 'morning_fasting', value: '101' },
    existing,
    buildReadingId(TODAY, 'morning_fasting'),
    TODAY
  );
  assert.equal(editRes.valid, true);

  // Adding 4th reading succeeds
  const fourthRes = validateReadingInput(
    { readingDate: TODAY, slot: 'after_dinner', value: '130' },
    existing,
    undefined,
    TODAY
  );
  assert.equal(fourthRes.valid, true);

  // Adding a reading when 4 already exist fails
  const fullDay = [...existing, makeReading(TODAY, 'after_dinner', 130)];
  const fifthRes = validateReadingInput(
    { readingDate: TODAY, slot: 'after_dinner', value: '135' },
    fullDay.slice(0, 3).concat(makeReading(TODAY, 'after_dinner', 130)),
    undefined,
    TODAY
  );
  assert.equal(fifthRes.valid, false);
});

test('calculateReportSummary computes highest, lowest, 1-decimal average, and empty state', () => {
  const empty = calculateReportSummary([]);
  assert.equal(empty.totalCount, 0);
  assert.equal(empty.highest, null);
  assert.equal(empty.lowest, null);
  assert.equal(empty.average, null);
  assert.equal(empty.averageFormatted, '—');

  const summary = calculateReportSummary([
    makeReading(TODAY, 'morning_fasting', 95),
    makeReading(TODAY, 'after_breakfast', 140),
    makeReading(TODAY, 'after_lunch', 156),
  ]);
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.highest, 156);
  assert.equal(summary.lowest, 95);
  assert.equal(summary.average, 130.3);
  assert.equal(summary.averageFormatted, '130.3');
});

test('getPreviousMonthBounds handles year rollover cleanly', () => {
  const janBounds = getPreviousMonthBounds('2026-01-15');
  assert.equal(janBounds.startDate, '2025-12-01');
  assert.equal(janBounds.endDate, '2025-12-31');

  const marLeapBounds = getPreviousMonthBounds('2024-03-10');
  assert.equal(marLeapBounds.startDate, '2024-02-01');
  assert.equal(marLeapBounds.endDate, '2024-02-29');
});

test('daily, month-to-date, and previous-month reports filter strictly by date bounds', () => {
  const readings = [
    makeReading('2026-10-05', 'morning_fasting', 100),
    makeReading('2026-10-20', 'after_dinner', 140),
    makeReading('2026-11-01', 'morning_fasting', 90),
    makeReading('2026-11-12', 'after_lunch', 150),
  ];

  const daily = buildDailyReport(readings, TODAY);
  assert.equal(daily.summary.totalCount, 1);
  assert.equal(daily.slots[2].reading?.value, 150);

  const mtd = buildMonthToDateReport(readings, TODAY);
  assert.equal(mtd.summary.totalCount, 2);
  assert.equal(mtd.summary.averageFormatted, '120.0');

  const prev = buildPreviousMonthReport(readings, TODAY);
  assert.equal(prev.summary.totalCount, 2);
  assert.equal(prev.summary.averageFormatted, '120.0');
});

test('classifyGlucoseLevel distinguishes fasting and post-meal targets', () => {
  assert.equal(classifyGlucoseLevel(65, 'morning_fasting').level, 'low');
  assert.equal(classifyGlucoseLevel(110, 'morning_fasting').level, 'in_range');
  assert.equal(classifyGlucoseLevel(145, 'morning_fasting').level, 'elevated');
  assert.equal(classifyGlucoseLevel(145, 'after_lunch').level, 'in_range');
  assert.equal(classifyGlucoseLevel(260, 'after_dinner').level, 'high');
});

test('validateReadingInput handles non-string and malformed payloads safely', () => {
  const objVal = validateReadingInput(
    { readingDate: TODAY, slot: 'morning_fasting', value: {}, note: 123 },
    [],
    undefined,
    TODAY
  );
  assert.equal(objVal.valid, false);
  assert.ok(objVal.errors.value);
  assert.ok(objVal.errors.note);

  const nanVal = validateReadingInput(
    { readingDate: 20261112, slot: null, value: Number.NaN },
    [],
    undefined,
    TODAY
  );
  assert.equal(nanVal.valid, false);
  assert.ok(nanVal.errors.readingDate);
  assert.ok(nanVal.errors.slot);
  assert.ok(nanVal.errors.value);
});
