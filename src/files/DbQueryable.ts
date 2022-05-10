import { ADbTableBase, DbResultError, Fetchable } from "../index";
import { RowSet } from "./DbTable";
import { DbMetadataInfo } from "./MetaInfo";

export class DbQueryable<TTable extends ADbTableBase, TColumn> {
    constructor(public cls: new() => TTable , public prop: string, protected historymode = false) {}
    protected archivemode = false;
    get archive() {
        this.archivemode = true;
        return this;
    }

    get history() {
        return new DbKeyQueryable<TTable, TColumn>(this.cls, this.prop, true);
    }
}

export class DbKeyQueryable<TTable extends ADbTableBase, TColumn> extends DbQueryable<TTable, TColumn> {
    find(search: TColumn | TColumn[] | Promise<TColumn | TColumn[]>): Fetchable<RowSet<TTable>> {
        const db = DbMetadataInfo.getDbConn(this.cls, this.historymode ? 'history' : (this.archivemode ? 'archive' : 'data'));
        const archive = this.archivemode;
        this.archivemode = false;
        const query = Promise.resolve(search).then((search) => 
            Promise.all(
                [search].flat(1).map((v) => v === undefined ? [] : db.findIndex(this.cls.name, this.prop, (<any>v).toString()))
            )
        )
        .then(x => x.flat(1).filter((v,i,a) => (a.indexOf(v) === i)))
        .then(x => db.get(this.cls.name, x));
        return (<any>this.cls).__makeDbRowSet(query, archive, this.historymode);
    }
    findOne(s: TColumn | Promise<TColumn>): Fetchable<TTable> {
        const db = DbMetadataInfo.getDbConn(this.cls, this.historymode ? 'history' : (this.archivemode ? 'archive' : 'data'));
        const  archive = this.archivemode;        
        this.archivemode = false;
        const query = Promise.resolve(s)
        .then(search => db.findIndex(this.cls.name, this.prop, search === undefined ? undefined :(<any>search).toString()))
        .then(x => db.get(this.cls.name, x))
        .then(async x => (x.length > 1) ? Promise.reject(new DbResultError('TypeDB: found more than one record for table ' + this.cls.name + ' search: ' + await s)): x)
        .then(async x => (x.length < 1) ? Promise.reject(new DbResultError('TypeDB: found no record for table ' + this.cls.name + ' search: ' + await s)): x[0]);
        return (<any>this.cls).__makeDbObj(query, archive, this.historymode);
    }
}
export class DbUniqueQueryable<TTable extends ADbTableBase, TColumn> extends DbQueryable<TTable, TColumn> {
    get(search: TColumn | Promise<TColumn>): Fetchable<TTable> {
        const db = DbMetadataInfo.getDbConn(this.cls, this.archivemode ? 'archive' : 'data');
        const archive = this.archivemode; 
        this.archivemode = false;
        const query = Promise.resolve(search).then((search) => 
            db.getUnique(this.cls.name, this.prop, search === undefined ? undefined: (<any>search).toString())
        )
        .then(x => db.get(this.cls.name, x))
        .then(x => x[0]);
        return (<any>this.cls).__makeDbObj(query,archive);
    }

    getMany(search: TColumn[] | Promise<TColumn[]>): Fetchable<RowSet<TTable>> {
        const db = DbMetadataInfo.getDbConn(this.cls, this.archivemode ? 'archive' : 'data');
        const archive = this.archivemode; 
        this.archivemode = false;
        const query = Promise.resolve(search).then((search) => 
            db.getUnique(this.cls.name, this.prop, [search].flat(1).map(x => (<any>x).toString()))
        )        
        .then(x => x.filter((v,i,a) => v !== undefined && (a.indexOf(v) === i)))
        .then(x => db.get(this.cls.name, x));
        return (<any>this.cls).__makeDbRowSet(query, archive);
    }

    find(search: TColumn | TColumn[]): Fetchable<RowSet<TTable>> {
        const db = DbMetadataInfo.getDbConn(this.cls, this.archivemode ? 'archive' : 'data');
        const archive = this.archivemode; 
        this.archivemode = false;
        const query = Promise.resolve(search).then((search) => 
            Promise.all(
                [search].flat(1).map((v) => db.findUnique(this.cls.name, this.prop, v === undefined ? [] : (<any>v).toString()))
            )
        )                
        .then(x => x.flat(1).filter((v,i,a) => (a.indexOf(v) === i)))
        .then(x => db.get(this.cls.name, x));
        return (<any>this.cls).__makeDbRowSet(query, archive);
    }
}

export class DbPKQueryable<TTable extends ADbTableBase, TColumn> extends DbQueryable<TTable, TColumn> {
    get(search: TColumn | Promise<TColumn>): Fetchable<TTable> {
        const db = DbMetadataInfo.getDbConn(this.cls, this.archivemode ? 'archive' : 'data');
        const archive = this.archivemode; 
        this.archivemode = false;
        const query = Promise.resolve(search).then(search => db.get(this.cls.name, (<any>search === undefined) ? [] : [(<any>search).toString()]))
        .then(x => x.length !== 1 ? null : x[0]);
        return (<any>this.cls).__makeDbObj(query, archive);
    }

    getMany(search: TColumn[] | Promise<TColumn[]>): Fetchable<RowSet<TTable>> {
        const db = DbMetadataInfo.getDbConn(this.cls,this.archivemode ? 'archive' : 'data');
        const archive = this.archivemode; 
        this.archivemode = false;
        const query = Promise.resolve(search).then(search => db.get(this.cls.name, (<any[]>search).filter(x => x).filter((v,i,a) => (a.indexOf(v) === i)).map((x:any) => (<any>x).toString())));
        return (<any>this.cls).__makeDbRowSet(query, archive);
    }
}
