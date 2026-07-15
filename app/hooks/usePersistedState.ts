"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  createMorrowwardStore,
  type MorrowwardState,
  type MorrowwardStore,
  type StorageMode,
} from "../../src/data";

/** Keeps the view model separate from the strict, PII-free persisted model. */
export interface PersistedStateAdapter<T> {
  fromCanonical: (state: MorrowwardState) => T;
  toCanonical: (value: T) => MorrowwardState;
}

export interface PersistenceStatus {
  mode: StorageMode;
  lastStorageError: string | null;
  saving: boolean;
}

export type PersistNow<T> = (value: T) => Promise<void>;

export function usePersistedState<T>(
  databaseName: string,
  initialValue: T,
  adapter: PersistedStateAdapter<T>,
): readonly [T, Dispatch<SetStateAction<T>>, boolean, PersistenceStatus, PersistNow<T>] {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const [persistence, setPersistence] = useState<PersistenceStatus>({
    mode: "memory",
    lastStorageError: null,
    saving: false,
  });
  const initialValueRef = useRef(initialValue);
  const storeRef = useRef<MorrowwardStore | null>(null);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    const store = createMorrowwardStore({
      databaseName,
      defaultState: adapter.toCanonical(initialValueRef.current),
    });
    storeRef.current = store;

    void store
      .load()
      .then((state) => {
        if (!cancelled) {
          setValue(adapter.fromCanonical(state));
          setPersistence({ ...store.diagnostics, saving: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPersistence({ ...store.diagnostics, saving: false });
        }
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
      if (storeRef.current === store) storeRef.current = null;
      void store.dispose();
    };
  }, [adapter, databaseName]);

  useEffect(() => {
    const store = storeRef.current;
    if (!hydrated || !store) return;

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        setPersistence((current) => ({ ...current, saving: true }));
        await store.save(adapter.toCanonical(value));
        setPersistence({ ...store.diagnostics, saving: false });
      })
      .catch(() => {
        setPersistence({ ...store.diagnostics, saving: false });
      });
  }, [adapter, hydrated, value]);

  const persistNow: PersistNow<T> = async (nextValue) => {
    const store = storeRef.current;
    if (!store) throw new Error("Local storage is not ready yet.");
    setPersistence((current) => ({ ...current, saving: true }));
    await saveQueueRef.current.catch(() => undefined);
    await store.save(adapter.toCanonical(nextValue));
    setValue(nextValue);
    setPersistence({ ...store.diagnostics, saving: false });
  };

  return [value, setValue, hydrated, persistence, persistNow] as const;
}
