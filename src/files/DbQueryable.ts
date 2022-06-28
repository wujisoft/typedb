import { ADbTableBase, DbResultError, Fetchable } from "../index";
import { RowSet } from "./DbTable";
import { DbInvalidCallError } from "..";
import { DbMetadataInfo, MetaInfoEntry } from "./MetaInfo";

export class DbQueryable<TTable extends ADbTableBase, TColumn> {
    constructor(public cls: new() => TTable , public prop: string, protected historymode = false) {}
    protected archivemode = false;
    #subtable?: string;
    get archive() {
        this.archivemode = true;
        return this;
    }

    get history() {
        return new DbKeyQueryable<TTable, TColumn>(this.cls, this.prop, true);
    }

    sub(subtable: string) {
        this.#subtable = subtable;
        return this;
    }

    protected get subtable() {
        const sub = this.#subtable;
        this.#subtable = undefined;
        return sub;
    }

    protected get tableName() {
        return this.cls.name + (this.#subtable ? '/' + this.#subtable : '');
    }

}

export class DbKeyQueryable<TTable extends ADbTableBase, TColumn> extends DbQueryable<TTable, TColumn> {
    find(search: TColumn | TColumn[] | Promise<TColumn | TColumn[]>): Fetchable<RowSet<TTable>> {
        const db = DbMetadataInfo.getDbConn(this.cls, this.historymode ? 'history' : (this.archivemode ? 'archive' : 'data'));
        const archive = this.archivemode;
        const table = this.tableName;
        const sub = this.subtable;
        this.archivemode = false;
        const query = Promise.resolve(search).then((search) =>
            Promise.all(
                [search].flat(1).map((v) => v === undefined ? [] : db.findIndex(table, this.prop, (<any>v).toString()))
            )
        )
        .then(x => x.flat(1).filter((v,i,a) => (a.indexOf(v) === i)))
        .then(x => db.get(table, x));
        return (<any>this.cls).__makeDbRowSet(query, archive, this.historymode, sub);
    }
    findOne(s: TColumn | Promise<TColumn>): Fetchable<TTable> {
        const db = DbMetadataInfo.getDbConn(this.cls, this.historymode ? 'history' : (this.archivemode ? 'archive' : 'data'));
        const archive = this.archivemode;
        const table = this.tableName;
        const sub = this.subtable;
        this.archivemode = false;
        const query = Promise.resolve(s)
        .then(search => db.findIndex(table, this.prop, search === undefined ? undefined : (<any>search).toString()))
        .then(x => db.get(table, x))
        .then(async x => (x.length > 1) ? Promise.reject(new DbResultError('TypeDB: found more than one record for table ' + table + ' search: ' + await s)) : x)
        .then(async x => (x.length < 1) ? Promise.reject(new DbResultError('TypeDB: found no record for table ' + table + ' search: ' + await s)) : x[0]);
        return (<any>this.cls).__makeDbObj(query, archive, this.historymode, sub);
    }
}
export class DbUniqueQueryable<TTable extends ADbTableBase, TColumn> extends DbQueryable<TTable, TColumn> {
    get(search: TColumn | Promise<TColumn>): Fetchable<TTable> {
        const db = DbMetadataInfo.getDbConn(this.cls, this.archivemode ? 'archive' : 'data');
        const archive = this.archivemode;
        const table = this.tableName;
        const sub = this.subtable;
        this.archivemode = false;
        const query = Promise.resolve(search).then((search) =>
            db.getUnique(table, this.prop, search === undefined ? undefined : (<any>search).toString())
        )
        .then(x => db.get(table, x))
        .then(x => x[0]);
        return (<any>this.cls).__makeDbObj(query,archive, undefined, sub);
    }

    getMany(search: TColumn[] | Promise<TColumn[]>): Fetchable<RowSet<TTable>> {
        const db = DbMetadataInfo.getDbConn(this.cls, this.archivemode ? 'archive' : 'data');
        const archive = this.archivemode;
        this.archivemode = false;
        const table = this.tableName;
        const sub = this.subtable;
        const query = Promise.resolve(search)
        .then(search => search ?? [])
        .then((search) =>
            db.getUnique(table, this.prop, [search].flat(1).map(x => (<any>x).toString()))
        )
        .then(x => x.filter((v,i,a) => v !== undefined && (a.indexOf(v) === i)))
        .then(x => db.get(table, x));
        return (<any>this.cls).__makeDbRowSet(query, archive, undefined, sub);
    }

    find(search: TColumn | TColumn[]): Fetchable<RowSet<TTable>> {
        const db = DbMetadataInfo.getDbConn(this.cls, this.archivemode ? 'archive' : 'data');
        const archive = this.archivemode;
        this.archivemode = false;
        const table = this.tableName;
        const sub = this.subtable;
        const query = Promise.resolve(search).then((search) =>
            Promise.all(
                [search].flat(1).map((v) => db.findUnique(table, this.prop, v === undefined ? [] : (<any>v).toString()))
            )
        )
        .then(x => x.flat(1).filter((v,i,a) => (a.indexOf(v) === i)))
        .then(x => db.get(table, x));
        return (<any>this.cls).__makeDbRowSet(query, archive, undefined, sub);
    }
}

export class DbPKQueryable<TTable extends ADbTableBase, TColumn> extends DbQueryable<TTable, TColumn> {
    get(search: TColumn | Promise<TColumn>): Fetchable<TTable> {
        const db = DbMetadataInfo.getDbConn(this.cls, this.archivemode ? 'archive' : 'data');
        const archive = this.archivemode;
        const table = this.tableName;
        const sub = this.subtable;
        this.archivemode = false;
        const query = Promise.resolve(search).then(search => db.get(table, (<any>search === undefined) ? [] : [(<any>search).toString()]))
        .then(x => x.length !== 1 ? null : x[0]);
        return (<any>this.cls).__makeDbObj(query, archive, undefined, sub);
    }

    getRange(start: TColumn | Promise<TColumn>, end: TColumn | Promise<TColumn>): Fetchable<RowSet<TTable>> {
        const db = DbMetadataInfo.getDbConn(this.cls,this.archivemode ? 'archive' : 'data');
        if(!db.getRange)
            throw new DbInvalidCallError('TypeDB: getRange is not supported by the requested backend - use a listType backend');
        const archive = this.archivemode;
        const table = this.tableName;
        const sub = this.subtable;
        this.archivemode = false;
        const query = Promise.all([start,end]).then(([start,end]) => db.getRange?.(table, +start, +end));
        return (<any>this.cls).__makeDbRowSet(query, archive, undefined, sub);
    }

    getMany(search: TColumn[] | Promise<TColumn[]>): Fetchable<RowSet<TTable>> {
        const db = DbMetadataInfo.getDbConn(this.cls,this.archivemode ? 'archive' : 'data');
        const archive = this.archivemode;
        const table = this.tableName;
        const sub = this.subtable;
        this.archivemode = false;
        const query = Promise.resolve(search).then(search => search ?? []).then(search => db.get(table, (<any[]>search).filter(x => x).filter((v,i,a) => (a.indexOf(v) === i)).map((x:any) => (<any>x).toString())));
        return (<any>this.cls).__makeDbRowSet(query, archive, undefined, sub);
    }
}
