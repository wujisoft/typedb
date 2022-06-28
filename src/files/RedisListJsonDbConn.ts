import { ADbTableBase, DbLockingError, DbMetadataInfo, RedisJsonDbConn } from "..";

export class RedisListJsonDbConn extends RedisJsonDbConn {
    readonly isListType = true;

    protected TABLE_PREFIX = 'LIST/';

    async delete(table: string, obj: ADbTableBase): Promise<boolean> {
        throw new Error('TypeDB RedisList: Delete not supported on list types');
    }

    async all(table: string): Promise<any[]> {
        return this.getRange(table, 0, -1);
    }

    async getRange(table: string, start: number, end: number): Promise<any[]> {
        const prefix = this.prefix();
        const data = await this.readRedis.lRange(prefix + this.TABLE_PREFIX + table, start, end);
        return data.map(row => this.decode(row));
    }

    async get(table: string, ids: string[]): Promise<any[]> {
        const prefix = this.prefix();
        if(ids === undefined || ids === null)
            ids = [];
        const data = await Promise.all(
            ids.map(id =>
                this.readRedis.lRange(prefix + this.TABLE_PREFIX + table, +id, +id)
            )
        );
        return data.flat(1).map(row => this.decode(row));
    }

    async upsert(table: string, obj: ADbTableBase, nx = false, history = false, force = false): Promise<boolean> {
        if(!force && Object.entries(obj.__dirty).length < 1)
            return false;
        if(history)
            throw new Error('TypeDB List: History is not supported on list type tables');
        const pk = (<any>obj.constructor).__PK;
        const prefix = this.prefix();
        const ih = Object.values(DbMetadataInfo.inheritInfo[obj.constructor.name]);
        if((<any>obj)[pk] !== undefined) {
            throw new Error('TypeDB List: Primary key of entry is already set - this is unsupported for list types');
        }
        let retry = 100;
        do {
            try {
                await this.redis.executeIsolated(async (isoCli) => {
                    await this.watchAllIndexes(isoCli, ih, prefix, prefix + this.TABLE_PREFIX + table);
                    const newID = await isoCli.lLen(prefix + this.TABLE_PREFIX + table);
                    (<any>obj)[pk] = newID;
                    let multi = isoCli.multi();
                    ih.forEach(element => {
                        multi = this.addIndexElement(multi, table, element, obj, prefix, pk);
                    });
                    multi = multi.rPush(prefix + this.TABLE_PREFIX + table, this.encode(obj));
                    return await multi.exec();
                });
                return true;
            } catch(e) { console.log('ERROR:', e); }
        } while(retry-- > 0);
        (<any>obj)[pk] = undefined;
        throw new DbLockingError('TypeDB: Optimistic locking failed');
    }
}