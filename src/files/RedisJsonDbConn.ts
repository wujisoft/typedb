import { ADbTableBase, colType, DbLockingError, DbMetadataInfo, FkType, IDbConn } from "..";
import { v4 as uuid } from 'uuid';
import { createClient } from 'redis';
import { MetaInfoEntry } from "..";

type multiType = ReturnType<ReturnType<typeof createClient>['multi']>;

export class RedisJsonDbConn implements IDbConn {
    prefix = () => '';

    protected TABLE_PREFIX = 'TABLE/';

    readRedis: ReturnType<typeof createClient>;
    constructor(public redis: ReturnType<typeof createClient>, read?: ReturnType<typeof createClient>) {
        this.readRedis = read ?? redis;
    }

    async get(table: string, ids: string[]): Promise<any[]>
    {
        const prefix = this.prefix();
        if(ids === undefined || ids === null)
            ids = [];
        ids = ids.filter((y) => y);
        if(!ids || ids.length < 1)
            return [];
        const data = await this.readRedis.hmGet(prefix + this.TABLE_PREFIX + table, ids);
        return data.map(row => this.decode(row));
    }

    async findIndex(table: string, idx: string, query: string): Promise<string[]>
    {
        if(!query)
            return [];
        const prefix = this.prefix();
        const result = [];
        let cursor = 0, res: Awaited<ReturnType<typeof this.redis.hScan>>;
        do {
            res = await this.readRedis.hScan(prefix + 'INDEX/' + table + '/' + idx, cursor, { MATCH: '*\x00' + query });
            cursor = res.cursor;
            result.push(...res.tuples.map((x:any) => x.value));
        } while(cursor !== 0);
        return result;
    }

    async findUnique(table: string, idx: string, query: string): Promise<string[]>
    {
        if(!query)
            return [];
        const result = [];
        const prefix = this.prefix();
        let cursor = 0, res: Awaited<ReturnType<typeof this.redis.hScan>>;
        do {
            res = await this.readRedis.hScan(prefix + 'UINDEX/' + table + '/' + idx, cursor, { MATCH: query });
            cursor = res.cursor;
            result.push(...res.tuples.map((x:any) => x.value));
        } while(cursor !== 0);
        return result;
    }

    async getUnique(table: string, idx: string, query: string[]): Promise<string[]>
    {
        if(!query || query.length < 1)
            return [];
        const prefix = this.prefix();
        return await this.readRedis.hmGet(prefix + 'UINDEX/' + table + '/' + idx, query);
    }

    async all(table: string): Promise<any[]>
    {
        const prefix = this.prefix();
        return Object.values(await this.readRedis.hGetAll(prefix + this.TABLE_PREFIX + table)).map(row => this.decode(row));
    }

    async watchAllIndexes(isoCli: ReturnType<typeof createClient>, ih: MetaInfoEntry[], prefix: string, table: string) {
        const idx = ih.filter(x => x.type === colType.key || x.type === colType.computed).map(x => prefix + 'INDEX/' + table + '/' + x.propertyKey);
        const fks = ih.filter(x => x.type === colType.fk && (x.fkType === FkType.remote || x.fkType === FkType.remoteMulti)).map(x => prefix + 'INDEX/' + table + '/' + x.propertyKey.substring(1) + '_ID');
        const uidx = ih.filter(x => x.type === colType.unique || x.type === colType.computedUnique).map(x => prefix + 'UINDEX/' + table + '/' + x.propertyKey);
        await isoCli.watch([table, ...idx, ...uidx, ...fks]);
    }

    delIndexElement(multi: multiType, table: string, element: MetaInfoEntry, orig: any, prefix: string, pk: string): multiType {
        if(!orig || (
            ![colType.fk, colType.computed, colType.computedUnique].includes(element.type) 
            && 
            orig[element.propertyKey] === undefined
        ))
            return multi;
        if(element.type === colType.key || element.type === colType.computed) {
            if(element.isArray && Array.isArray(orig[element.propertyKey])) {
                orig[element.propertyKey].forEach((entry: string) => {
                    if(entry !== undefined)
                        multi = multi.hDel(prefix + 'INDEX/' + table + '/' + element.propertyKey, orig[pk] + String.fromCharCode(0) + entry);
                });
                return multi;
            }
            return multi.hDel(prefix + 'INDEX/' + table + '/' + element.propertyKey, orig[pk] + String.fromCharCode(0) + orig[element.propertyKey]);
        }
        if(element.type === colType.unique || element.type === colType.computedUnique) {
            if(element.isArray && Array.isArray(orig[element.propertyKey])) {
                orig[element.propertyKey].forEach((entry: string) => {
                    if(entry !== undefined)
                        multi = multi.hDel(prefix + 'UINDEX/' + table + '/' + element.propertyKey, entry);
                });
                return multi;
            }
            return multi.hDel(prefix + 'UINDEX/' + table + '/' + element.propertyKey, orig[element.propertyKey]);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if(element.type === colType.fk && (element.fkType! === FkType.remote || element.fkType! === FkType.remoteMulti)) {
            if(element.isArray && Array.isArray(orig[element.propertyKey.substring(1) + '_ID'])) {
                orig[element.propertyKey.substring(1) + '_ID'].forEach((entry: string) => {
                    if(entry !== undefined)
                        multi = multi.hDel(prefix + 'INDEX/' + table + '/' + element.propertyKey.substring(1) + '_ID', orig[pk] + String.fromCharCode(0) + entry);
                });
                return multi;
            }
            return multi.hDel(prefix + 'INDEX/' + table + '/' + element.propertyKey.substring(1) + '_ID', orig[pk] + String.fromCharCode(0) + orig[element.propertyKey.substring(1) + '_ID']);
        }
        return multi;
    }

    addIndexElement(multi: multiType, table: string, element: MetaInfoEntry, obj: any, prefix: string, pk: string): multiType {
        if((element.type === colType.key || element.type === colType.computed) && (<any>obj)[element.propertyKey] !== undefined) {
            if(element.isArray) {
                (<any>obj)[element.propertyKey]?.forEach((entry: string) => {
                    if(entry !== undefined)
                        multi = multi.hSet(prefix + 'INDEX/' + table + '/' + element.propertyKey, (<any>obj)[pk] + String.fromCharCode(0) + entry, (<any>obj)[pk]);
                });
                return multi;
            }
            else return multi.hSet(prefix + 'INDEX/' + table + '/' + element.propertyKey, (<any>obj)[pk] + String.fromCharCode(0) + (<any>obj)[element.propertyKey], (<any>obj)[pk]);
        }
        if((element.type === colType.unique || element.type === colType.computedUnique) && (<any>obj)[element.propertyKey] !== undefined) {
            if(element.isArray) {
                (<any>obj)[element.propertyKey]?.forEach((entry: string) => {
                    if(entry !== undefined)
                        multi = multi.hSet(prefix + 'UINDEX/' + table + '/' + element.propertyKey, entry, (<any>obj)[pk]);
                });
                return multi;
            }
            else return multi.hSet(prefix + 'UINDEX/' + table + '/' + element.propertyKey, (<any>obj)[element.propertyKey], (<any>obj)[pk]);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if(element.type === colType.fk && (element.fkType! === FkType.remote || element.fkType! === FkType.remoteMulti) && (<any>obj)[element.propertyKey.substring(1) + '_ID'] !== undefined) {
            if(element.isArray) {
                (<any>obj)[element.propertyKey.substring(1) + '_ID'].forEach((entry: string) => {
                    if(entry !== undefined)
                        multi = multi.hSet(
                            prefix + 'INDEX/' + table + '/' + element.propertyKey.substring(1) + '_ID',
                            (<any>obj)[pk] + String.fromCharCode(0) + entry,
                            (<any>obj)[pk]);
                });
            }
            else return multi.hSet(
                prefix + 'INDEX/' + table + '/' + element.propertyKey.substring(1) + '_ID',
                (<any>obj)[pk] + String.fromCharCode(0) + (<any>obj)[element.propertyKey.substring(1) + '_ID'],
                (<any>obj)[pk]);
        }
        return multi;
    }

    async delete(table: string, obj: ADbTableBase): Promise<boolean>
    {
        const prefix = this.prefix();
        const pk = (<any>obj.constructor).__PK;
        const ih = Object.values(DbMetadataInfo.inheritInfo[obj.constructor.name]);
        let retry = 100;
        do {
            try {
                await this.redis.executeIsolated(async (isoCli) => {
                    await this.watchAllIndexes(isoCli, ih, prefix, prefix + this.TABLE_PREFIX + table);
                    const orig = <ADbTableBase> await (<any>obj).constructor.__makeDbObj(this.get(table, [(<any>obj)[pk]]).then(x => x[0]), false, false, undefined);
                    let multi = isoCli.multi();
                    ih.forEach(element => {
                        multi = this.delIndexElement(multi, table, element, orig, prefix, pk);
                    });
                    multi = multi.hDel(prefix + this.TABLE_PREFIX + table, (<any>orig)[pk]);
                    return await multi.exec();
                });
                return true;
            // eslint-disable-next-line no-empty
            } catch{ }
        } while(retry-- > 0);
        throw new DbLockingError('TypeDB: Optimistic locking failed');
    }

    async upsert(table: string, obj: ADbTableBase, nx = false, history = false, force = false): Promise<boolean>
    {
        if(!force && Object.entries(obj.__dirty).length < 1)
            return false;
        const prefix = this.prefix();
        const pk = (<any>obj.constructor).__PK;
        const ih = Object.values(DbMetadataInfo.inheritInfo[obj.constructor.name]);
        let retry = 100;
        do {
            try {
                await this.redis.executeIsolated(async (isoCli) => {
                    await this.watchAllIndexes(isoCli, ih, prefix, prefix + this.TABLE_PREFIX + table);
                    const orig = <ADbTableBase> await (<any>obj).constructor.__makeDbObj(this.get(table, [(<any>obj)[pk]]).then(x => x[0]), false, false, undefined);
                    if(orig && nx)
                        return false;
                    let multi = isoCli.multi();
                    if(history) {
                        const newPK = uuid();
                        ih.forEach(element => {
                            if([colType.key, colType.computed, colType.unique, colType.computedUnique, colType.pk].includes(element.type) && (<any>obj)[element.propertyKey] !== undefined) {
                                if(element.isArray) {
                                    (<any>obj)[element.propertyKey]?.forEach((entry:string) => {
                                        if(entry)
                                            multi = multi.hSet(prefix + 'INDEX/' + table + '/' + element.propertyKey, newPK + String.fromCharCode(1) + (<any>obj)[pk] + String.fromCharCode(0) + entry, newPK);
                                    })
                                } else 
                                multi = multi.hSet(prefix + 'INDEX/' + table + '/' + element.propertyKey, newPK + String.fromCharCode(1) + (<any>obj)[pk] + String.fromCharCode(0) + (<any>obj)[element.propertyKey], newPK);
                            }
                        });
                        multi = multi.hSet(prefix + this.TABLE_PREFIX + table, newPK, this.encode(obj, { '$$PK': newPK, '$$timestamp': +new Date() }));
                    } else {
                        ih.forEach(element => {
                            if(orig) {
                                multi = this.delIndexElement(multi, table, element, orig, prefix, pk);
                            }
                            multi = this.addIndexElement(multi, table, element, obj, prefix, pk);
                        });
                        multi = multi.hSet(prefix + this.TABLE_PREFIX + table, (<any>obj)[pk], this.encode(obj));
                    }
                        return await multi.exec();
                });
                return true;
            // eslint-disable-next-line no-empty
            } catch(e) { console.log('ERROR:', e); }
        } while(retry-- > 0);
        throw new DbLockingError('TypeDB: Optimistic locking failed');
    }

    async reindex<T extends ADbTableBase>(table: string, ctr: new() => T) {
        const prefix = this.prefix();
        const pk = DbMetadataInfo.classinfo[ctr.name].PK;
        const ih = Object.values(DbMetadataInfo.inheritInfo[ctr.name]);
        let retry = 100;
        do {
            try {
                await this.redis.executeIsolated(async (isoCli) => {
                    await this.watchAllIndexes(isoCli, ih, prefix, prefix + this.TABLE_PREFIX + table);
                    let multi = isoCli.multi();
                    let i: string[] = <any>await isoCli.keys(prefix + 'INDEX/' + table + '/*');
                    i.forEach((e) => multi = multi.del(e));
                    i = <any>await isoCli.keys(prefix + 'UINDEX/' + table + '/*');
                    i.forEach((e) => multi = multi.del(e));
                    const data = await (<any>ctr).__makeDbRowSet(this.all(table), false, false, undefined);
                    for(const obj of data) {
                        ih.forEach(element => {
                            multi = this.addIndexElement(multi, table, element, obj, prefix, pk);
                        });
                    }
                    await multi.exec();
                });
                return true;
            // eslint-disable-next-line no-empty
            } catch{ }
        } while(retry-- > 0);
        throw new DbLockingError('TypeDB: Optimistic locking failed');
    }

    protected decode(obj: string | undefined): any {
        if(!obj)
            return null;
        return JSON.parse(obj);
    }

    protected encode<T extends ADbTableBase>(obj: T, add: any = {}): string {

        return JSON.stringify({ ...obj.__raw, ...add });
    }
}