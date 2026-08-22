declare module 'sql.js' {
  export interface QueryResults {
    columns: string[]
    values: any[][]
  }

  export class Database {
    constructor(data?: number[] | Uint8Array)
    run(sql: string): void
    exec(sql: string): QueryResults[]
    prepare(sql: string): any
    export(): Uint8Array
    close(): void
  }

  export interface SqlJsStatic {
    Database: typeof Database
  }

  export interface InitSqlJsOptions {
    locateFile?: (filename: string) => string
  }

  export interface InitSqlJsStatic {
    (options?: InitSqlJsOptions): Promise<SqlJsStatic>
  }

  const initSqlJs: InitSqlJsStatic
  export default initSqlJs
}
