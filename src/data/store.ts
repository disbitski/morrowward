import Dexie, { type DexieOptions, type Table } from "dexie";
import {
  createDefaultState,
  migrateState,
  parseStateExport,
  serializeStateExport,
  validateState,
  type MorrowwardState,
} from "./state";

const SINGLETON_STATE_ID = "primary";

interface StateRecord {
  id: typeof SINGLETON_STATE_ID;
  updatedAt: string;
  state: unknown;
}

class MorrowwardDatabase extends Dexie {
  states!: Table<StateRecord, string>;

  constructor(name: string, options: DexieOptions) {
    super(name, options);
    this.version(1).stores({ states: "&id, updatedAt" });
  }
}

export type StorageMode = "indexeddb" | "memory";

export interface StoreDiagnostics {
  mode: StorageMode;
  /** Error class only: no user state or browser error text is retained. */
  lastStorageError: string | null;
}

export interface MorrowwardStoreOptions {
  databaseName?: string;
  indexedDB?: DexieOptions["indexedDB"] | null;
  IDBKeyRange?: DexieOptions["IDBKeyRange"] | null;
  now?: () => string;
  defaultState?: MorrowwardState;
}

function copy(state: MorrowwardState): MorrowwardState {
  return JSON.parse(JSON.stringify(state)) as MorrowwardState;
}

function globalIndexedDb(): DexieOptions["indexedDB"] | null {
  return typeof globalThis.indexedDB === "undefined"
    ? null
    : globalThis.indexedDB;
}

function globalKeyRange(): DexieOptions["IDBKeyRange"] | null {
  return typeof globalThis.IDBKeyRange === "undefined"
    ? null
    : globalThis.IDBKeyRange;
}

/** Local-first store that automatically degrades to in-memory state. */
export class MorrowwardStore {
  private database: MorrowwardDatabase | null;
  private memoryState: MorrowwardState;
  private mode: StorageMode;
  private lastStorageError: string | null = null;
  private readonly now: () => string;

  constructor(options: MorrowwardStoreOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.memoryState = options.defaultState
      ? validateState(options.defaultState)
      : createDefaultState(this.now());

    const hasIndexedDbOverride = Object.prototype.hasOwnProperty.call(
      options,
      "indexedDB",
    );
    const hasKeyRangeOverride = Object.prototype.hasOwnProperty.call(
      options,
      "IDBKeyRange",
    );
    const indexedDB = hasIndexedDbOverride
      ? options.indexedDB ?? null
      : globalIndexedDb();
    const IDBKeyRange = hasKeyRangeOverride
      ? options.IDBKeyRange ?? null
      : globalKeyRange();

    if (!indexedDB || !IDBKeyRange) {
      this.database = null;
      this.mode = "memory";
      return;
    }

    this.database = new MorrowwardDatabase(
      options.databaseName ?? "morrowward-local-v1",
      { indexedDB, IDBKeyRange },
    );
    this.mode = "indexeddb";
  }

  get diagnostics(): StoreDiagnostics {
    return { mode: this.mode, lastStorageError: this.lastStorageError };
  }

  private useMemoryFallback(error: unknown): void {
    this.lastStorageError = error instanceof Error ? error.name : "StorageError";
    this.database?.close();
    this.database = null;
    this.mode = "memory";
  }

  async load(): Promise<MorrowwardState> {
    if (!this.database) return copy(this.memoryState);

    try {
      const record = await this.database.states.get(SINGLETON_STATE_ID);
      if (!record) return copy(this.memoryState);
      const state = migrateState(record.state, this.now());
      this.memoryState = state;

      if (
        typeof record.state === "object" &&
        record.state !== null &&
        (record.state as { schemaVersion?: unknown }).schemaVersion !==
          state.schemaVersion
      ) {
        await this.database.states.put({
          id: SINGLETON_STATE_ID,
          updatedAt: state.updatedAt,
          state,
        });
      }
      return copy(state);
    } catch (error) {
      this.useMemoryFallback(error);
      return copy(this.memoryState);
    }
  }

  async save(state: MorrowwardState): Promise<MorrowwardState> {
    const updated = validateState({ ...state, updatedAt: this.now() });
    this.memoryState = updated;

    if (this.database) {
      try {
        await this.database.states.put({
          id: SINGLETON_STATE_ID,
          updatedAt: updated.updatedAt,
          state: updated,
        });
      } catch (error) {
        this.useMemoryFallback(error);
      }
    }
    return copy(updated);
  }

  async export(): Promise<string> {
    const state = await this.load();
    return serializeStateExport(state, this.now());
  }

  async import(serialized: string): Promise<MorrowwardState> {
    const state = parseStateExport(serialized, this.now());
    return this.save(state);
  }

  async reset(): Promise<MorrowwardState> {
    const state = createDefaultState(this.now());
    this.memoryState = state;
    if (this.database) {
      try {
        await this.database.transaction("rw", this.database.states, async () => {
          await this.database?.states.clear();
          await this.database?.states.put({
            id: SINGLETON_STATE_ID,
            updatedAt: state.updatedAt,
            state,
          });
        });
      } catch (error) {
        this.useMemoryFallback(error);
      }
    }
    return copy(state);
  }

  /** Closes the handle; deleteDatabase is intended for tests and local reset tools. */
  async dispose(deleteDatabase = false): Promise<void> {
    const database = this.database;
    if (!database) return;
    if (deleteDatabase) {
      await database.delete();
    } else {
      database.close();
    }
    this.database = null;
  }
}

export function createMorrowwardStore(
  options: MorrowwardStoreOptions = {},
): MorrowwardStore {
  return new MorrowwardStore(options);
}
