import { ADbTableBase, DbConfigError, DbKeyQueryable, DbPKQueryable, DbUniqueQueryable, IDbConn } from "..";




export enum colType {
    col,
    key,
    unique,
    fk,
    pk,
    computed,
    computedUnique
}

export const enum FkType {
    local,
    remote,
    remoteMulti,
    localSingle,
}

export interface MetaInfoEntry {
    target: ADbTableBase;
    propertyKey: string;
    type: colType;
    isArray?: boolean;
    fkTable?: string;
    fkName?: string;
    fkType?: FkType;
    func?: (obj: any) => any;
}

export class DbMetadataInfo {

    static entrys: MetaInfoEntry[] = [];
    static classinfo: { [clsName: string]: { constructor: { new(...args:any[]): ADbTableBase }, list?: boolean, PK: string, dbconn: string, archivemode: "protected" | "active" | "none", archivedb: string, historydb?: string } } = {};
    static tableInfo: { [tableName: string]: { [colName: string]: MetaInfoEntry }} = {};
    static inheritInfo: { [tableName: string]: { [colName: string]: MetaInfoEntry }} = {};

    static dbconns: { [name: string]:IDbConn } = {};

    static init() {
        this.entrys.forEach(x => {
            const tabName = x.target.constructor.name;
            if(!this.tableInfo[tabName])
                this.tableInfo[tabName] = <any>[];
            if(!this.tableInfo[tabName][x.propertyKey])
                this.tableInfo[tabName][x.propertyKey] = x;
        });

        Object.entries(this.classinfo).forEach(([, { constructor: cls }]) => {
            this.inheritInfo[cls.name] = this.tableInfo[cls.name];
            let obj = cls.prototype;
            do {
                obj = Object.getPrototypeOf(obj);
                if(!obj)
                    break;
                const tabName = obj.constructor.name;
                this.inheritInfo[cls.name] = {...this.inheritInfo[cls.name], ...this.tableInfo[tabName]};
            } while(obj);
            Object.entries(this.inheritInfo[cls.name]).forEach(([,v]) => this.initField(cls.prototype, v));
            const pk = Object.entries(this.inheritInfo[cls.name]).find(([, value]) => value.type === colType.pk);
            if(!pk)
                throw new DbConfigError('TypeDB Object ' + cls.name + ' has no primary key');
            if(!this.dbconns[this.classinfo[cls.name].dbconn])
                throw new DbConfigError('TypeDB DbConn object ' + this.classinfo[cls.name].dbconn + ' is missing');
            this.classinfo[cls.name].list = this.dbconns[this.classinfo[cls.name].dbconn].isListType ?? false;
            this.classinfo[cls.name].PK = pk?.[0];
        });
    }
    private static initField<T extends ADbTableBase>(target: T, meta: MetaInfoEntry) {
        if(meta.type === colType.fk) {
            Object.defineProperty(target, meta.propertyKey, {
                get: function () { return this.__getFKProperty(meta.propertyKey); }
            });
            if(meta.fkType === FkType.remote || meta.fkType === FkType.remoteMulti) {
                Object.defineProperty(target, meta.propertyKey.substring(1), {
                    set: function (value) { this.__setFKProperty(meta.propertyKey, value); },
                    get: function () { return this.__getFKCacheProperty(meta.propertyKey.substring(1)); }
                });
                Object.defineProperty(target, meta.propertyKey.substring(1) + '_ID', {
                    get: function () { return this.__getProperty(meta.propertyKey.substring(1) + '_ID'); },
                    set: function (value) { this.__setProperty(meta.propertyKey.substring(1) + '_ID', value); },
                    enumerable: true
                });
            } else {
                Object.defineProperty(target, meta.propertyKey.substring(1), {
                    get: function () { return this.__getFKCacheProperty(meta.propertyKey.substring(1)); }
                });
            }
        } else if(meta.type === colType.computed || meta.type === colType.computedUnique) {
            Object.defineProperty(target, meta.propertyKey, {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                get: function () { return meta.func!.apply(this, [this]) }
            });
        } else {
            Object.defineProperty(target, meta.propertyKey, {
                get:        function () { return this.__getProperty(meta.propertyKey); },
                set:        function (value) { this.__setProperty(meta.propertyKey, value); },
                enumerable: true
            });
        }
        if(meta.type === colType.key || meta.type === colType.computed) {
            (<any>target.constructor)[meta.propertyKey] = new DbKeyQueryable(<{new(...args:any[]):ADbTableBase}>target.constructor, meta.propertyKey);
        }
        if(meta.type === colType.pk) {
            (<any>target.constructor)[meta.propertyKey] = new DbPKQueryable(<{new(...args:any[]):ADbTableBase}>target.constructor, meta.propertyKey);
            Object.defineProperty(target.constructor, '__PK', { value: meta.propertyKey, writable: false });
        }
        if(meta.type === colType.unique || meta.type === colType.computedUnique) {
            (<any>target.constructor)[meta.propertyKey] = new DbUniqueQueryable(<{new(...args:any[]):ADbTableBase}>target.constructor, meta.propertyKey);
        }
        if(meta.type === colType.fk && (meta.fkType === FkType.remote || meta.fkType === FkType.remoteMulti)) {
            const fkid_name = meta.propertyKey.substring(1) + '_ID';
            (<any>target.constructor)[fkid_name] = new DbKeyQueryable(<{new(...args:any[]):ADbTableBase}>target.constructor, fkid_name);
        }
    }

    static getDbConn<T extends ADbTableBase>(table: new(...args:any[]) => T, mode: "data" | "archive" | "history" = "data"): IDbConn {
        if(mode === "archive") {
            if(!this.classinfo[table.name]?.archivedb || !this.dbconns[this.classinfo[table.name]?.archivedb])
                throw new DbConfigError('TypeDB: no ArchiveDB for type ' + table.name);
            return this.dbconns[this.classinfo[table.name]?.archivedb];
        } else if(mode === "history") {
            if(!this.classinfo[table.name]?.historydb || !this.dbconns[this.classinfo[table.name]?.historydb ?? -1])
                throw new DbConfigError('TypeDB: no HistoryDB for type ' + table.name);
            return this.dbconns[this.classinfo[table.name]?.historydb ?? -1];
        } else {
            if(!this.classinfo[table.name]?.dbconn || !this.dbconns[this.classinfo[table.name]?.dbconn])
                throw new DbConfigError('TypeDB: no IDbConn for type ' + table.name);
            return this.dbconns[this.classinfo[table.name]?.dbconn];
        }
    }

    static addDbConn(dbConn: IDbConn, name = 'default') {
        this.dbconns[name] = dbConn;
    }
}


export function DbCol() {
    return <T extends ADbTableBase> (target: T, propertyKey: string) => {
        DbMetadataInfo.entrys.push({target, propertyKey, type: colType.col });
    };
}

export function DbKey(isArray = false) {
    return <T extends ADbTableBase> (target: T, propertyKey: string) => {
        DbMetadataInfo.entrys.push({target, propertyKey, type: colType.key, isArray });
    };
}

export function DbPK() {
    return <T extends ADbTableBase> (target: T, propertyKey: string) => {
        DbMetadataInfo.entrys.push({target, propertyKey, type: colType.pk });
    };
}

export function DbUnique(isArray = false) {
    return <T extends ADbTableBase> (target: T, propertyKey: string) => {
        DbMetadataInfo.entrys.push({target, propertyKey, type: colType.unique, isArray });
    };
}

export function DbRow(params: {dbconn?: string, archivedb?: string, archivemode?: "protected" | "active" | "none", historydb?: string} = {}) {
        return <T extends { new(...args: any[]): ADbTableBase }> (constructor: T) => {
            DbMetadataInfo.classinfo[constructor.name] = {
                constructor, PK:          'ID',
                dbconn:      params.dbconn ?? 'default',
                archivedb:   params.archivedb ?? 'archive',
                archivemode: params.archivemode ?? "none",
                historydb:   params.historydb
            };
            return constructor;
        };
}

export function FK(fktype: FkType.remote, className?: string): <T extends ADbTableBase> (target: T, propertyKey: string) => void;
export function FK(fktype: FkType.remoteMulti, className?: string): <T extends ADbTableBase> (target: T, propertyKey: string) => void;
export function FK(fktype: FkType.local, className?: string, remoteProperty?: string): <T extends ADbTableBase> (target: T, propertyKey: string) => void;
export function FK(fktype: FkType.localSingle, className?: string, remoteProperty?: string): <T extends ADbTableBase> (target: T, propertyKey: string) => void;
export function FK(fkType: FkType, className?: string, remoteProperty?: string) {
    return <T extends ADbTableBase> (target: T, propertyKey: string) => {
        DbMetadataInfo.entrys.push({target, propertyKey, type: colType.fk, fkTable: className ?? propertyKey.substring(1), fkName: remoteProperty ?? target.constructor.name, fkType, isArray: fkType === FkType.remoteMulti });
    };
}

export function DbComputed<T extends ADbTableBase, F>(func: (obj: T) => F, unique = false, isArray = false) {
    return (target: T, propertyKey: string) => {
        DbMetadataInfo.entrys.push({target, propertyKey, type: unique ? colType.computedUnique : colType.computed, func, isArray });
    };
}