import { ADbTableBase, colType, DbLockingError, DbMetadataInfo, FkType, IDbConn } from "..";
import { v4 as uuid } from 'uuid';
import { createClient } from 'redis'

export class RedisJsonDbConn implements IDbConn {
    prefix = () => '';
    constructor(public redis: ReturnType<typeof createClient>) {}

    async get(table: string, ids: string[]): Promise<any[]> 
    { 
        const prefix = this.prefix();
        ids = ids.filter((y) => y);
        if(!ids || ids.length < 1)
            return [];
        const data = await this.redis.hmGet(prefix + 'TABLE/' + table, ids);
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
            res = await this.redis.hScan(prefix + 'INDEX/' + table + '/' + idx, cursor, { MATCH: '*\x00' + query });
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
            res = await this.redis.hScan(prefix + 'UINDEX/' + table + '/' + idx, cursor, { MATCH: query });
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
        return await this.redis.hmGet(prefix + 'UINDEX/' + table + '/' + idx, query);
    }

    async all(table: string): Promise<any[]> 
    {
        const prefix = this.prefix();
        return Object.values(await this.redis.hGetAll(prefix + 'TABLE/' + table)).map(row => this.decode(row));
    }

    async delete(table: string, obj: ADbTableBase): Promise<boolean> 
    {
        const prefix = this.prefix();
        const pk = (<any>obj.constructor).__PK;
        const ih = Object.values(DbMetadataInfo.inheritInfo[obj.constructor.name]);
        const idx = ih.filter(x => x.type === colType.key).map(x => prefix + 'INDEX/' + table + '/' + x.propertyKey);
        const fks = ih.filter(x => x.type === colType.fk && x.fkType === FkType.remote).map(x => prefix + 'INDEX/' + table + '/' + x.propertyKey.substring(1) + '_ID');
        const uidx = ih.filter(x => x.type === colType.unique).map(x => prefix + 'UINDEX/' + table + '/' + x.propertyKey);
        let retry = 100;
        do {
            try {
                await this.redis.executeIsolated(async (isoCli) => {
                    await isoCli.watch([prefix + 'TABLE/' + table, ...idx, ...uidx, ...fks]);
                    const orig = this.decode(await isoCli.hGet(prefix + 'TABLE/' + table, (<any>obj)[pk]));
                    let multi = isoCli.multi();
                    ih.forEach(element => {
                        if(element.type === colType.key) 
                            multi = multi.hDel(prefix + 'INDEX/' + table + '/' + element.propertyKey, orig[pk] + String.fromCharCode(0) + orig[element.propertyKey]);
                        if(element.type === colType.unique)
                            multi = multi.hDel(prefix + 'UINDEX/'+ table + '/' + element.propertyKey, orig[element.propertyKey]);
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        if(element.type === colType.fk && element.fkType! === FkType.remote)
                            multi = multi.hDel(prefix + 'INDEX/' + table + '/' + element.propertyKey.substring(1), orig[pk] + String.fromCharCode(0) + orig[element.propertyKey.substring(1) + '_ID']);
                    });
                    multi = multi.hDel(prefix + 'TABLE/' + table, orig[pk]);
                    return await multi.exec();
                });
                return true;
            // eslint-disable-next-line no-empty
            } catch { }
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
        const idx = ih.filter(x => history ? [colType.key, colType.unique, colType.pk].includes(x.type) : x.type === colType.key ).map(x => 'INDEX/' + table + '/' + x.propertyKey);
        const fks = ih.filter(x => x.type === colType.fk && x.fkType === FkType.remote).map(x => prefix + 'INDEX/' + table + '/' + x.propertyKey.substring(1) + '_ID');
        const uidx = history ? [] : ih.filter(x => x.type === colType.unique).map(x => prefix + 'UINDEX/' + table + '/' + x.propertyKey);
        let retry = 100;
        do {
            try {
                await this.redis.executeIsolated(async (isoCli) => {
                    await isoCli.watch([prefix + 'TABLE/' + table, ...idx, ...uidx, ...fks]);  
                    const orig = this.decode(await isoCli.hGet(prefix + 'TABLE/' + table, (<any>obj)[pk]));
                    if(orig && nx)
                        return false;
                    let multi = isoCli.multi();
                    if(history) {
                        const newPK = uuid();
                        ih.forEach(element => {
                            if([colType.key, colType.unique, colType.pk].includes(element.type) && (<any>obj)[element.propertyKey] !== undefined) {
                                multi = multi.hSet(prefix + 'INDEX/' + table + '/' + element.propertyKey, newPK + String.fromCharCode(1) + (<any>obj)[pk] + String.fromCharCode(0) + (<any>obj)[element.propertyKey], newPK);
                            }
                        });
                        multi = multi.hSet(prefix + 'TABLE/' + table, newPK, this.encode(obj, { '$$PK': newPK, '$$timestamp': +new Date() })); 
                    } else {
                        ih.forEach(element => {
                            if(orig) {
                                if(element.type === colType.key) 
                                    multi = multi.hDel(prefix + 'INDEX/' + table + '/' + element.propertyKey, orig[pk] + String.fromCharCode(0) + orig[element.propertyKey]);
                                if(element.type === colType.unique)
                                    multi = multi.hDel(prefix + 'UINDEX/'+ table + '/' + element.propertyKey, orig[element.propertyKey]);
                                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                if(element.type === colType.fk && element.fkType! === FkType.remote)
                                    multi = multi.hDel(prefix + 'INDEX/' + table + '/' + element.propertyKey.substring(1), orig[pk] + String.fromCharCode(0) + orig[element.propertyKey.substring(1) + '_ID']);
                            }
                            if(element.type === colType.key && (<any>obj)[element.propertyKey] !== undefined) 
                                multi = multi.hSet(prefix + 'INDEX/' + table + '/' + element.propertyKey, (<any>obj)[pk] + String.fromCharCode(0) + (<any>obj)[element.propertyKey], (<any>obj)[pk]);
                            if(element.type === colType.unique && (<any>obj)[element.propertyKey] !== undefined)
                                multi = multi.hSet(prefix + 'UINDEX/'+ table + '/' + element.propertyKey, (<any>obj)[element.propertyKey], (<any>obj)[pk]);
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            if(element.type === colType.fk && element.fkType! === FkType.remote && (<any>obj)[element.propertyKey.substring(1) + '_ID'] !== undefined)
                                multi = multi.hSet(
                                    prefix + 'INDEX/' + table + '/' + element.propertyKey.substring(1) + '_ID', 
                                    (<any>obj)[pk] + String.fromCharCode(0) + (<any>obj)[element.propertyKey.substring(1) + '_ID'], 
                                    (<any>obj)[pk]);   
                        });
                        multi = multi.hSet(prefix + 'TABLE/' + table, (<any>obj)[pk], this.encode(obj));
                    }
                    return await multi.exec();
                });
                return true;
            // eslint-disable-next-line no-empty
            } catch(e) { console.log('ERROR:', e) }
        } while(retry-- > 0);
        throw new DbLockingError('TypeDB: Optimistic locking failed');
    }

    async reindex<T extends ADbTableBase>(table: string, ctr: new() => T) {
        const prefix = this.prefix();
        const pk = DbMetadataInfo.classinfo[ctr.name].PK;
        const ih = Object.values(DbMetadataInfo.inheritInfo[ctr.name]);
        const idx = ih.filter(x => x.type === colType.key).map(x => prefix + 'INDEX/' + table + '/' + x.propertyKey);
        const fks = ih.filter(x => x.type === colType.fk && x.fkType === FkType.remote).map(x => prefix + 'INDEX/' + table + '/' + x.propertyKey.substring(1) + '_ID');
        const uidx = ih.filter(x => x.type === colType.unique).map(x => prefix + 'UINDEX/' + table + '/' + x.propertyKey);
        let retry = 100;
        do {
            try {
                await this.redis.executeIsolated(async (isoCli) => {
                    await isoCli.watch([prefix + 'TABLE/' + table, ...idx, ...uidx, ...fks]);        
                    let multi = isoCli.multi();
                    let i: string[] = <any>await isoCli.keys(prefix + 'INDEX/' + table + '/*');
                    i.forEach((e) => multi = multi.del(e));
                    i = <any>await isoCli.keys(prefix + 'UINDEX/'+table+'/*');
                    i.forEach((e) => multi = multi.del(e));
                    const data = <any>await isoCli.hGetAll(prefix + 'TABLE/' + table);
                    for(const obj of data) {
                        ih.forEach(element => {
                            if(element.type === colType.key && (<any>obj)[element.propertyKey] !== undefined) 
                                multi = multi.hSet(prefix + 'INDEX/' + table + '/' + element.propertyKey, obj[pk] + String.fromCharCode(0) + obj[element.propertyKey], obj[pk]);
                            if(element.type === colType.unique && (<any>obj)[element.propertyKey] !== undefined)
                                multi = multi.hSet(prefix + 'UINDEX/'+ table + '/' + element.propertyKey, obj[element.propertyKey], obj[pk]);
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            if(element.type === colType.fk && element.fkType! === FkType.remote && (<any>obj)[element.propertyKey.substring(1) + '_ID'] !== undefined)
                                multi = multi.hSet(
                                    prefix + 'INDEX/' + table + '/' + element.propertyKey.substring(1) + '_ID', 
                                    (<any>obj)[pk] + String.fromCharCode(0) + (<any>obj)[element.propertyKey.substring(1) + '_ID'], 
                                    (<any>obj)[pk]);    
                        })
                    }
                    await multi.exec();
                });
                return true;
            // eslint-disable-next-line no-empty
            } catch { }
        } while(retry-- > 0);
        throw new DbLockingError('TypeDB: Optimistic locking failed');
    }

    private decode(obj: string|undefined): any {
        if(!obj)
            return null;
        return JSON.parse(obj);
    }

    private encode<T extends ADbTableBase>(obj: T, add: any = {}): string {

        return JSON.stringify({ ...obj.__raw, ...add });
    }
}