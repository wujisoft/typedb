import { colType, DbInvalidCallError, DbKeyQueryable, DbMetadataInfo, DbPKQueryable, DbResultError, Fetchable, Fetcher, FkType } from "..";

type NonFunctionPropertyNames<T> = {
    // eslint-disable-next-line @typescript-eslint/ban-types
    [K in keyof T]: T[K] extends Function ? never : K
}[keyof T];
type NonFunctionProperties<T> = Pick<T, NonFunctionPropertyNames<T>>;
type OwnProerties<T> = keyof NonFunctionProperties<Omit<T, keyof ADbTableBase>>;

export abstract class ADbTableBase {
    #prefetch: Promise<this> = Promise.resolve(this);
    #prefetch_completed = false;
    #data_modified: any = {};
    #isRowset = false;
    #data: any;
    #fkcache: any = {};
    #archived = false;
    #history = false;

    #subtable?: string;

    onDelete?(): void;
    onSave?(): void;
    onArchive?(): void;
    onUnarchive?(): void;
    onCreate?(): void;

    abstract newID(): any;

    static new<T extends ADbTableBase>(this: { new(...args:any[]): T }, subtable?: string) {
        const that = new this();
        that.#data = {};
        that.#prefetch_completed = true;
        if(!that.__listTable)
            that.#data[(<any>this).__PK] = that.newID();
        that.#subtable = subtable;

        if(that.onCreate)
            that.onCreate();
        return that;
    }

    static reindex<T extends ADbTableBase>(this: new() => T, subtable?: string) {
        const table = this.constructor.name + (subtable ? '/' + subtable : '');
        DbMetadataInfo.getDbConn(<any>this.constructor).reindex(table, this);
    }

    toJSON<T extends ADbTableBase>(this: T): Partial<T>;
    toJSON<T extends ADbTableBase>(this: RowSet<T>): Partial<T>[];
    toJSON() {
        if(this.#isRowset) {
            return (<RowSet<this>>this).map((x) => x.toJSON());
        } else {
            const dbkeys = Object.keys(DbMetadataInfo.inheritInfo[this.constructor.name]);
            const dbdata = Object.fromEntries(Object.entries(DbMetadataInfo.inheritInfo[this.constructor.name]).filter(([,value]) => value.type !== colType.fk).map(([key]) => [key, (<any>this)[key]]));
            const npData = Object.fromEntries(Object.getOwnPropertyNames(this).filter(name => !dbkeys.includes(name)).map((name) => [name, (<any>this)[name]]));
            return {...dbdata, ...npData};
        }
    }

    toObj() { return this.toJSON(); }

    async archive() {
        if(this.__listTable)
            throw new DbInvalidCallError('TypeDb: cannot delete/archive list type records');
        if(this.#isRowset)
            throw new DbInvalidCallError('TypeDb: cannot archive rowset');
        if(this.#history)
            throw new DbInvalidCallError('TypeDb: Cannot modify history object');
        if(this.#archived)
            throw new DbInvalidCallError('TypeDb: cannot archive already archived record');
        if(DbMetadataInfo.classinfo[this.constructor.name].archivemode === "none")
            throw new DbInvalidCallError('TypeDb: Archive is not enabled on type ' + this.constructor.name);
        this.#archived = true;
        if(this.onArchive)
            this.onArchive();
        if(!await DbMetadataInfo.getDbConn(<new(...args:any[]) => this>this.constructor, 'archive').upsert(this.__tableName, this, true, false, true))
            throw new DbResultError('TypeDb: writing to archive failed - inconsistent data?');
        return await DbMetadataInfo.getDbConn(<new(...args:any[]) => this>this.constructor).delete(this.__tableName, this);
    }

    async unarchive() {
        if(this.__listTable)
            throw new DbInvalidCallError('TypeDb: cannot unarchive list type datasets');
        if(this.#isRowset)
            throw new DbInvalidCallError('TypeDb: cannot archive rowset');
        if(!this.#archived)
            throw new DbInvalidCallError('TypeDb: cannot unarchive non-archived record');
        if(DbMetadataInfo.classinfo[this.constructor.name].archivemode !== "active")
            throw new DbInvalidCallError('TypeDb: Cannot unarchive from readonly archive');
        this.#archived = false;
        if(this.onUnarchive)
            this.onUnarchive();
        if(!await DbMetadataInfo.getDbConn(<new(...args:any[]) => this>this.constructor).upsert(this.__tableName, this, true, false, true))
            throw new DbResultError('TypeDb: writing to db failed - inconsistent data?');
        return await DbMetadataInfo.getDbConn(<new(...args:any[]) => this>this.constructor, 'archive').delete(this.__tableName, this);
    }

    async delete(): Promise<boolean> {
        if(this.__listTable)
            throw new DbInvalidCallError('TypeDb: cannot delete/archive list type records');
        if(this.#isRowset)
            throw new DbInvalidCallError('TypeDb: cannot archive rowset');
        if(this.#history)
            throw new DbInvalidCallError('TypeDb: Cannot modify history object');
        if(this.#archived && DbMetadataInfo.classinfo[this.constructor.name].archivemode !== "active")
            throw new DbInvalidCallError('TypeDb: cannot modify archived entry of type ' + this.constructor.name);
        if(!this.#archived && DbMetadataInfo.classinfo[this.constructor.name].archivemode !== "none")
            return this.archive();
        if(this.onDelete)
            this.onDelete();
        return DbMetadataInfo.getDbConn(<new(...args:any[]) => this>this.constructor, this.#archived ? 'archive' : 'data').delete(this.__tableName, this);
    }

    async save(): Promise<boolean> {
        if(this.#isRowset)
            throw new DbInvalidCallError('TypeDb: cannot archive rowset');
        if(this.#history)
            throw new DbInvalidCallError('TypeDb: Cannot modify history object');
        if(this.#archived)
            throw new DbInvalidCallError('TypeDb: cannot modify archived entry of type ' + this.constructor.name);
        if(this.onSave)
            this.onSave();
        if(DbMetadataInfo.classinfo[this.constructor.name].historydb && !this.__listTable)
            await DbMetadataInfo.getDbConn(<new(...args:any[]) => this>this.constructor, 'history').upsert(this.__tableName, this, false, true, false);
        return await DbMetadataInfo.getDbConn(<new(...args:any[]) => this>this.constructor).upsert(this.__tableName, this, false, false, false);
    }

    static fromObject<T extends ADbTableBase>(this: { new(...args:any[]): T}, data: Partial<T>, options: { save: true, pk?: string, subtable?: string }|true): Promise<T | null>;
    static fromObject<T extends ADbTableBase>(this: { new(...args:any[]): T}, data: Partial<T>, options?: { save?: false, pk?: string, subtable?: string }): T;
    static fromObject<T extends ADbTableBase>(this: { new(...args:any[]): T}, data: Partial<T>, options: { save?: boolean, pk?: string, subtable?: string }|true = { save: false}): T | Promise<T | null> {
        if(options === true)
            options = { save: true };
        const that = (<any>this).new(options.subtable);
        Object.entries(DbMetadataInfo.inheritInfo[this.name]).filter(([, meta]) => ![colType.fk, colType.pk].includes(meta.type)).forEach(([key]) => {
            if((<any>data)[key] !== undefined) {
                (<any>that)[key] = (<any>data)[key];
            }
        });
        if(options.pk)
            that[(<any>this).__PK] = options.pk;
        if(options.save)
            return that.save().then((success:boolean) => success ? that : null);
        return that;
    }

    import<T extends ADbTableBase>(this: T | RowSet<T>, values: Partial<T>, keys?: OwnProerties<T>[], save?: false): T;
    import<T extends ADbTableBase>(this: T | RowSet<T>, values: Partial<T>, keys?: OwnProerties<T>[], save?: true): Promise<boolean>;
    import<T extends ADbTableBase>(this: T | RowSet<T>, values: Partial<T>, keys?: OwnProerties<T>[], save = false): T | Promise<boolean> {
        (keys ?? <(keyof T)[]>Object.keys(values)).forEach((k) => {
            if(values[k] !== undefined)
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this[k] = values[k]!;
        });
        if(save)
            return this.save();
        return this;
    }

    export<T extends ADbTableBase>(this: T, keys: OwnProerties<T>[], into?: Partial<T>): Partial<T>;
    export<T extends ADbTableBase>(this: RowSet<T>, keys: OwnProerties<T>[]): Partial<T>[];
    export<T extends ADbTableBase>(this: T | RowSet<T>, keys: OwnProerties<T>[], into: Partial<T> = {}): Partial<T> | Partial<T>[] {
        if(this.#isRowset)
            return (<RowSet<T>>this).map(x => x.export(keys));
        else
            return keys.reduce((r, k) => { r[k] = this[k]; return r; }, into);
    }

    /* #region rowset */
    static all<T extends ADbTableBase>(this: { new(...args:any[]): T }, archive?: boolean, history?: false): Fetchable<RowSet<T>>;
    static all<T extends ADbTableBase>(this: { new(...args:any[]): T }, archive: false, history: boolean): Fetchable<RowSet<T>>;
    static all<T extends ADbTableBase>(this: { new(...args:any[]): T }, subtable: string): Fetchable<RowSet<T>>;
    static all<T extends ADbTableBase>(this: { new(...args:any[]): T }, archive: string|boolean = false, history = false): Fetchable<RowSet<T>> {
        const table = this.name + (typeof archive == 'string' ? '/' + archive : '');
        const queryRes = DbMetadataInfo.getDbConn(this, archive ? 'archive' : (history ? 'history' : 'data')).all(table);
        return (this as any).__makeDbRowSet(queryRes, archive, history);
    }

    sort<T extends ADbTableBase>(this: Fetchable<RowSet<T>> | RowSet<T>, cb: (elem1: T, elem2: T) => number): Fetchable<RowSet<T>> {
        const pr = this.#prefetch.then((that:any) => that?.map((x:any) => x).sort(cb).map((x:any) => x.__raw));
        return (<any>this.constructor).__makeDbRowSet(pr, this.#archived, this.#history, this.#subtable);
    }

    map<T extends ADbTableBase, R>(this: Fetchable<RowSet<T>>, cb: (elem: T, index: number, all: RowSet<T>) => R | Promise<R>): R[] | Promise<R[]>;
    map<T extends ADbTableBase, R>(this: RowSet<T>, cb: (elem: T, index: number, all: RowSet<T>) => R | Promise<R>): R[];
    map<T extends ADbTableBase, R>(this: RowSet<T> | Fetchable<RowSet<T>>, cb: (elem: T, index: number, all: RowSet<T>) => R): R[] | Promise<R[]> {
        if(!this.#isRowset)
            throw new DbInvalidCallError('TypeDb: map can only be called on RowSets');
        if(this.#prefetch_completed) {
            const result = [];
            for(let i = 0; i < this.length; i++) {
                result.push(cb(this[i], i, this));
            }
            if(result[0] instanceof Promise)
                return Promise.all(result);
            return result;
        } else {
            return (<Promise<RowSet<T>>>this.#prefetch).then((that) => {
                const result = [];
                for(let i = 0; i < that.length; i++) {
                    result.push(cb(that[i], i, that));
                }
                if(result[0] instanceof Promise)
                    return Promise.all(result);
                return result;
            });
        }
    }

    find<T extends ADbTableBase>(this: RowSet<T> | Fetchable<RowSet<T>>, cb: (elem: T, index: number, all: RowSet<T>) => Promise<boolean>, async: true): Promise<T | undefined>;
    find<T extends ADbTableBase>(this: RowSet<T>, cb: (elem: T, index: number, all: RowSet<T>) => boolean, async?: false): T | undefined;
    find<T extends ADbTableBase>(this: Fetchable<RowSet<T>>, cb: (elem: T, index: number, all: RowSet<T>) => boolean, async?: false): T | undefined | Promise<T | undefined>;
    find<T extends ADbTableBase>(this: RowSet<T> | Fetchable<RowSet<T>>, cb: (elem: T, index: number, all: RowSet<T>) => boolean | Promise<boolean>, async = false): T | undefined | Promise<T | undefined> {
        if(!this.#isRowset)
            throw new DbInvalidCallError('TypeDb: find can only be called on RowSets');
        if(!async && this.#prefetch_completed) {
            for(let i = 0; i < this.length; i++) {
                if(cb(this[i], i, this))
                    return this[i];
            }
            return undefined;
        } else {
            return (<Promise<RowSet<T>>>this.#prefetch).then(async (that) => {
                for(let i = 0; i < that.length; i++) {
                    if(await cb(that[i], i, that))
                        return that[i];
                }
                return undefined;
            });
        }
    }

    filter<T extends ADbTableBase>(this: RowSet<T> | Fetchable<RowSet<T>>, cb: (elem: T, index: number, all: RowSet<T>) => boolean | Promise<boolean>): Fetchable<RowSet<T>> {
        if(!this.#isRowset)
            throw new DbInvalidCallError('TypeDb: filter can only be called on RowSets');
        const result = <T> new (<any>this.constructor);
        result.#isRowset = true;
        result.#subtable = this.#subtable;
        result.#prefetch = (<Promise<RowSet<T>>>this.#prefetch).then(async (that) => {
            let j = 0;
            for(let i = 0; i < that.length; i++) {
                if(await cb(that[i], i, that)) {
                    Object.defineProperty(result, (j++).toString(), { value: that[i], writable: false });
                }
            }
            Object.defineProperty(result, 'length', { value: j, writable: false });
            result.#prefetch_completed = true;
            result.#archived = that.#archived;
            result.#history = that.#history;
            return result;
        });
        return <Fetchable<RowSet<T>>> new Fetcher<T>(result);
    }

    *[Symbol.iterator]<T extends ADbTableBase>(this: RowSet<T>) {
        if(this.#isRowset)
            for(let i = 0; i < this.length; i++) {
                yield this[i];
            }
    }

    /* Internal functions */

    __fetchIsInvalid: true | undefined;
    static __PK: string;

    public get __fetching(): Promise<this> {
        return this.#prefetch;
    }

    public get __fetched(): boolean {
        return this.#prefetch_completed;
    }

    public get __dirty() {
        return this.#data_modified;
    }

    public get __computedData() {
        return Object.fromEntries(
            Object.entries(DbMetadataInfo.inheritInfo[this.constructor.name])
                .filter(([, info]) => [colType.computed, colType.computedUnique].includes(info.type))
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                .map(([col, info]) => [col, info.func!(this)])
            );
    }

    public get __raw() {
        return {
            ...this.#data,
            ...this.__computedData
        };
    }

    public get __historyTimestamp(): number {
        if(!this.#history) {
            throw new DbInvalidCallError('TypeDb: timestamps are only available on history objects');
        }
        return this.#data['$$timestamp'];
    }

    public get __isArchived(): boolean {
        return this.#archived;
    }

    public get __isHistory(): boolean {
        return this.#history;
    }

    public get __subtable(): string | undefined {
        return this.#subtable;
    }

    public get __listTable(): boolean {
        return DbMetadataInfo.classinfo[this.constructor.name].list ?? false;
    }

    public get __tableName(): string {
        return this.constructor.name + (this.__subtable ? '/' + this.__subtable : '');
    }

    __getProperty(key: string) {
        if(this.#isRowset)
            throw new DbInvalidCallError('TypeDb: trying to access property on RowSet');
        if(this.#data === undefined)
            throw new DbInvalidCallError('TypeDb: accessing properties on uninitialized object - did you await?');
        return this.#data[key];
    }

    __setProperty(key: string, value: any) {
        if(this.#history)
            throw new DbInvalidCallError('TypeDb: Cannot modify history object');
        if(this.#data_modified[key] === undefined)
            this.#data_modified[key] = this.#data[key];
        this.#data[key] = value;
    }

    __getFKCacheProperty(key: string): Fetchable<RowSet<this> | this> {
        if(this.#fkcache[key] === undefined)
            throw new DbInvalidCallError('TypeDB: accessing non-fetching FK Property without prefetch - use "await $' + key + '" instead');
        return this.#fkcache[key];
    }

    __getFKProperty(key: string): Fetchable<RowSet<this> | this> {
        const meta = DbMetadataInfo.inheritInfo[this.constructor.name][key];
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const remoteClass = <any>DbMetadataInfo.classinfo[meta.fkTable!].constructor;
        if(this.#isRowset) {
            if(meta.fkType === FkType.local || meta.fkType === FkType.localSingle) {
                if(this.#subtable)
                    throw new DbInvalidCallError('TypeDB: local FK properties are not supported on subtable type datasets');
                const ownPK = (<any>this.constructor).__PK;
                const res = (<DbKeyQueryable<this, string>>remoteClass[meta.fkName + '_ID']).find(this.#prefetch.then(() => (<any>this).map((x:any) => x[ownPK])));
                res.__base.#prefetch = res.__base.#prefetch.then((that:RowSet<ADbTableBase>) => {
                    this.#fkcache[key.substring(1)] = that;
                    const idx = Object.fromEntries(that.map((x:any) => [x[meta.fkName + '_ID'], x ]));
                    for(let i = 0; i < (<RowSet<this>>this).length; i++) {
                        (<RowSet<this>>this)[i].#fkcache[key.substring(1)] = idx[(<any>this)[i][ownPK]] ?? null;
                    }
                    return <any>that;
                });
                return res;
            } else {
                const remotePK = remoteClass.__PK;
                const res = (<DbPKQueryable<this,string>>remoteClass[remotePK]).getMany(this.#prefetch.then(() => (<any>this).map((x:any) => x[meta.propertyKey.substring(1) + '_ID'])));
                res.__base.#prefetch = res.__base.#prefetch.then((that:RowSet<ADbTableBase>) => {
                    this.#fkcache[key.substring(1)] = that;
                    const idx = Object.fromEntries(that.map((x:any) => [x[remotePK], x ]));
                    for(let i = 0; i < (<RowSet<this>>this).length; i++) {
                        (<RowSet<this>>this)[i].#fkcache[key.substring(1)] = idx[(<any>this)[i][meta.propertyKey.substring(1) + '_ID']] ?? null;
                    }
                    return <any>that;
                });
                return res;
            }
        } else {
            if(meta.fkType === FkType.localSingle) {
                if(this.#subtable)
                    throw new DbInvalidCallError('TypeDB: local FK properties are not supported on subtable type datasets');
                const ownPK = (<any>this.constructor).__PK;
                const res = (<DbKeyQueryable<this, string>>remoteClass[meta.fkName + '_ID']).findOne(this.#prefetch.then(() => this.#data[ownPK]));
                res.__base.#prefetch = res.__base.#prefetch.then((that) => {
                    this.#fkcache[key.substring(1)] = that;
                    return <any>that;
                });
                return res;
            } else if(meta.fkType === FkType.local) {
                if(this.#subtable)
                    throw new DbInvalidCallError('TypeDB: local FK properties are not supported on subtable type datasets');
                const ownPK = (<any>this.constructor).__PK;
                const res = (<DbKeyQueryable<this, string>>remoteClass[meta.fkName + '_ID']).find(this.#prefetch.then(() => this.#data[ownPK]));
                res.__base.#prefetch = res.__base.#prefetch.then((that) => {
                    this.#fkcache[key.substring(1)] = that;
                    return <any>that;
                });
                return res;
            } else {
                const remotePK = remoteClass.__PK;
                const res = (<DbPKQueryable<this,string>>remoteClass[remotePK]).get(this.#prefetch.then(() => this.#data[meta.propertyKey.substring(1) + '_ID']));
                res.__base.#prefetch = res.__base.#prefetch.then((that) => {
                    this.#fkcache[key.substring(1)] = that;
                    return that;
                });
                return res;
            }
        }
    }

    __setFKProperty(key: string, value: any) {
        if(this.#isRowset)
            throw new DbInvalidCallError('TypeDb: Cannot set ForeignKey on rowsets');
        if(this.#history)
            throw new DbInvalidCallError('TypeDb: Cannot modify history object');
        const meta = DbMetadataInfo.inheritInfo[this.constructor.name][key];
        if(meta.fkType === FkType.local)
            throw new DbInvalidCallError('TypeDb: ForeignKeys need to be set on remote end of relation');
        if(value === undefined || value === null)
            return (<any>this)[key.substring(1) + '_ID'] = undefined;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const remoteClass = <any>DbMetadataInfo.classinfo[meta.fkTable!].constructor;
        const remotePK = remoteClass.__PK;
        (<any>this)[key.substring(1) + '_ID'] = value[remotePK];
        return value;
    }

    static __makeDbObj<T extends ADbTableBase>(this: new() => T, data: Promise<any>, archived = false, history = false, subtable: string): Fetchable<T> {
        const that = new this();
        that.#archived = archived;
        that.#history = history;
        that.#subtable = subtable;
        that.#prefetch = data.then((row) => {
            if(!row) {
                Object.defineProperty(that, '__fetchIsInvalid', { value: true, writable: false});
            }
            that.#data = row;
            that.#prefetch_completed = true;
            return that;
        });
        return <Fetchable<T>> new Fetcher(that);
    }

    static __makeDbRowSet<T extends ADbTableBase>(this: { new(...args:any[]): T }, data: Promise<any[]>, archived = false, history = false, subtable: string): Fetchable<RowSet<T>> {
        const that = new this();
        that.#isRowset = true;
        that.#archived = archived;
        that.#history = history;
        that.#subtable = subtable;
        that.#prefetch = data.then((rows) => {
            Object.defineProperty(that, 'length', { value: rows.length, writable: false });
            for(let i = 0; i < rows.length; i++) {
                const elem = new this();
                elem.#data = rows[i];
                elem.#subtable = subtable;
                elem.#archived = archived;
                Object.defineProperty(that, i.toString(), { value: elem, writable: false });
            }
            that.#prefetch_completed = true;
            return that;
        });
        return <Fetchable<RowSet<T>>> new Fetcher(that);
    }
}

export interface RS<N> {
    [key: number]: N;
    length: number;
  }

export type RowSet<T extends ADbTableBase> = ADbTableBase & RS<T> & T;
export type UnRow<T> = T extends RowSet<infer U> ? U : T;