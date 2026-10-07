// Minimal ambient types for the `bun:sqlite` built-in module.
//
// The server runs under Bun, so `bun:sqlite` exists at runtime, but the project
// does not depend on @types/bun (its global augmentations can clash with Next's
// DOM/Node lib types). This declares only the subset lib/ledger.ts uses.
// If @types/bun is ever added, delete this file.

declare module "bun:sqlite" {
  export interface RunResult {
    lastInsertRowid: number | bigint;
    changes: number;
  }

  export interface Statement<Row = unknown> {
    get(...params: unknown[]): Row | null;
    all(...params: unknown[]): Row[];
    run(...params: unknown[]): RunResult;
  }

  export class Database {
    constructor(filename?: string, options?: unknown);
    query<Row = unknown>(sql: string): Statement<Row>;
    run(sql: string, ...params: unknown[]): RunResult;
    exec(sql: string): void;
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
    close(): void;
  }
}
