import { ADbTableBase } from "..";

export interface IDbConn {
    readonly isListType?: boolean;

    get(table: string, ids: string[]): Promise<unknown[]>;
    getRange?(table: string, start: number, end: number): Promise<unknown[]>;
    findIndex(table: string, idx: string, query: string): Promise<string[]>;
    findUnique(table: string, idx: string, query: string): Promise<string[]>;
    getUnique(table: string, idx: string, query: string[]): Promise<string[]>;
    all(table: string): Promise<unknown[]>;
    delete(table: string, object: ADbTableBase): Promise<boolean>;
    upsert(table: string, object: ADbTableBase, nx: boolean, history: boolean, force: boolean): Promise<boolean>;

    reindex<T extends ADbTableBase>(table: string, ctr: new() => T): void;
}