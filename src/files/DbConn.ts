import { ADbTableBase } from "..";

export interface IDbConn {
    get(table: string, ids: string[]): Promise<unknown[]>;
    findIndex(table: string, idx: string, query: string): Promise<string[]>;
    findUnique(table: string, idx: string, query: string): Promise<string[]>;
    getUnique(table: string, idx: string, query: string[]): Promise<string[]>;
    all(table: string): Promise<unknown[]>;
    delete(table: string, object: ADbTableBase): Promise<boolean>;
    upsert(table: string, object: ADbTableBase, nx: boolean, history: boolean, force: boolean): Promise<boolean>;

    reindex<T extends ADbTableBase>(table: string, ctr: new() => T): void;
}