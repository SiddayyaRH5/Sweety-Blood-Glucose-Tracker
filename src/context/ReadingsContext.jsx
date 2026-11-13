import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext.jsx';
import {
  createReadingApi,
  deleteReadingApi,
  fetchReadingsApi,
  updateReadingApi,
} from '../services/readingsService.js';
import {
  buildReadingId,
  generateDemoSeedReadings,
  getLocalDateString,
  READING_SLOTS,
  validateReadingInput,
} from '../utils/glucose.js';

const ReadingsContext = createContext(null);

function sortReadings(items) {
  return [...items].sort((a, b) => {
    if (a.readingDate !== b.readingDate) {
      return b.readingDate.localeCompare(a.readingDate);
    }
    return (
      READING_SLOTS.findIndex((s) => s.id === a.slot) -
      READING_SLOTS.findIndex((s) => s.id === b.slot)
    );
  });
}

export function ReadingsProvider({ children }) {
  const { user } = useAuth();
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshReadings = useCallback(async () => {
    if (!user) {
      setReadings([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (user.isPreviewSession) {
      setReadings(generateDemoSeedReadings(user.id, getLocalDateString()));
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const items = await fetchReadingsApi();
      setReadings(sortReadings(items));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load blood glucose readings.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshReadings();
  }, [refreshReadings]);

  const addReading = useCallback(
    async (input) => {
      if (!user) throw new Error('You must be signed in to add a reading.');

      const localCheck = validateReadingInput(
        input,
        readings,
        undefined,
        getLocalDateString()
      );
      if (!localCheck.valid || localCheck.parsedValue === undefined) {
        const firstMsg =
          localCheck.errors.general ||
          localCheck.errors.value ||
          localCheck.errors.readingDate ||
          localCheck.errors.slot ||
          localCheck.errors.note ||
          'Please check reading fields.';
        throw new Error(firstMsg);
      }

      if (user.isPreviewSession) {
        const now = new Date().toISOString();
        const newReading = {
          id: buildReadingId(input.readingDate, input.slot),
          userId: user.id,
          readingDate: input.readingDate,
          slot: input.slot,
          value: localCheck.parsedValue,
          note: input.note?.trim() ? input.note.trim().slice(0, 280) : undefined,
          createdAt: now,
          updatedAt: now,
        };
        setReadings((prev) => sortReadings([newReading, ...prev]));
        return;
      }

      const created = await createReadingApi({
        readingDate: input.readingDate,
        slot: input.slot,
        value: localCheck.parsedValue,
        note: input.note,
      });
      setReadings((prev) => sortReadings([created, ...prev]));
    },
    [user, readings]
  );

  const editReading = useCallback(
    async (readingId, input) => {
      if (!user) throw new Error('You must be signed in to update a reading.');
      const existing = readings.find((r) => r.id === readingId);
      if (!existing || existing.userId !== user.id) {
        throw new Error('Reading not found or access denied.');
      }

      const localCheck = validateReadingInput(
        {
          readingDate: existing.readingDate,
          slot: existing.slot,
          value: input.value,
          note: input.note,
        },
        readings,
        readingId,
        getLocalDateString()
      );
      if (!localCheck.valid || localCheck.parsedValue === undefined) {
        const firstMsg =
          localCheck.errors.general ||
          localCheck.errors.value ||
          localCheck.errors.note ||
          'Please check reading fields.';
        throw new Error(firstMsg);
      }

      if (user.isPreviewSession) {
        const now = new Date().toISOString();
        setReadings((prev) =>
          prev.map((r) =>
            r.id === readingId
              ? {
                  ...r,
                  value: localCheck.parsedValue,
                  note: input.note?.trim() ? input.note.trim().slice(0, 280) : undefined,
                  updatedAt: now,
                }
              : r
          )
        );
        return;
      }

      const updated = await updateReadingApi({
        readingId,
        value: localCheck.parsedValue,
        note: input.note,
      });
      setReadings((prev) =>
        sortReadings(prev.map((r) => (r.id === readingId ? updated : r)))
      );
    },
    [user, readings]
  );

  const removeReading = useCallback(
    async (readingId) => {
      if (!user) throw new Error('You must be signed in to delete a reading.');
      const existing = readings.find((r) => r.id === readingId);
      if (!existing || existing.userId !== user.id) {
        throw new Error('Reading not found or access denied.');
      }

      if (user.isPreviewSession) {
        setReadings((prev) => prev.filter((r) => r.id !== readingId));
        return;
      }

      await deleteReadingApi(readingId);
      setReadings((prev) => prev.filter((r) => r.id !== readingId));
    },
    [user, readings]
  );

  const value = useMemo(
    () => ({
      readings,
      loading,
      error,
      refreshReadings,
      addReading,
      editReading,
      removeReading,
      clearError: () => setError(null),
    }),
    [readings, loading, error, refreshReadings, addReading, editReading, removeReading]
  );

  return <ReadingsContext.Provider value={value}>{children}</ReadingsContext.Provider>;
}

export function useReadings() {
  const ctx = useContext(ReadingsContext);
  if (!ctx) {
    throw new Error('useReadings must be used inside ReadingsProvider');
  }
  return ctx;
}
