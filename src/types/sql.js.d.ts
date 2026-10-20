declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: (string | number | null)[]): void;
    exec(sql: string): { columns: string[]; values: (string | number | null)[][] }[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface Statement {
    bind(params?: (string | number | null)[]): boolean;
    step(): boolean;
    get(): (string | number | null)[];
    getColumnNames(): string[];
    free(): boolean;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
}

// Приложение импортирует конкретный билд (`dist/sql-wasm.js`), а не корневой exports-map:
// у '.' стоит browser-условие, и vite мог бы подставить другой бинарь, чем тот, что лежит
// рядом с глиной. Типы те же, что у 'sql.js'.
declare module 'sql.js/dist/sql-wasm.js' {
  export * from 'sql.js';
  export { default } from 'sql.js';
}
