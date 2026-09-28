import type { RawRow, RawTables, TableName } from '@/lib/domain/schema';

/**
 * Storage-agnostic table access. Google Sheets today; a database adapter later.
 * The repository above it owns all business rules, so swapping the adapter never touches the UI.
 */
export interface TableAdapter {
  readonly kind: 'sheets' | 'local';
  /** Reads every table (one round-trip on Sheets). */
  readAll(): Promise<RawTables>;
  /** Reads one table fresh from the source. */
  readTable(table: TableName): Promise<RawRow[]>;
  /** Merges `row` into the existing row identified by its key (unknown columns are preserved). */
  updateRow(table: TableName, key: string, row: RawRow): Promise<void>;
  appendRows(table: TableName, rows: RawRow[]): Promise<void>;
  /** Replaces the whole content of the given tables (init / demo reset / settings). */
  replaceTables(tables: Partial<RawTables>): Promise<void>;
  describe(): Record<string, string>;
}

export class AdapterError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AdapterError';
  }
}
