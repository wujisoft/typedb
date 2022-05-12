import { DbCol, DbKey, DbRow, DbUnique, DbKeyQueryable, DbUniqueQueryable } from "../../index";
import { DbTable } from "./DbTable";
import { v4 as uuid } from 'uuid';

@DbRow({ dbconn: 'audit' })
export class Audit extends DbTable {

    static user: DbKeyQueryable<Audit, string>;
    static TxID: DbUniqueQueryable<Audit, string>;

    @DbKey()
    user!: string;

    @DbCol()
    action!: string;

    @DbUnique()
    TxID!: string;

    onCreate(): void {
        this.TxID = uuid();
    }
}