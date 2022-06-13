import { ADbTableBase, RedisJsonDbConn } from "..";
import { MsgPackEncoder, MsgPackDecoder } from "@gymcore/msgpackstream";

export class RedisMsgpackDbConn extends RedisJsonDbConn {
    #msgpack_enc: MsgPackEncoder = new MsgPackEncoder({EnablePacketTable: false, EnableStreamTable: false});
    #msgpack_dec: MsgPackDecoder = new MsgPackDecoder();

    protected encode<T extends ADbTableBase>(obj: T, add: any = {}): string {
        //return JSON.stringify(value) ?? "null";
        return Buffer.from(this.#msgpack_enc.encodeStream({ ...obj.__raw, ...add })).toString('base64');
    }

    protected decode(msg: string | undefined): any {
        //return typeof value === 'string' ? JSON.parse(value) : undefined;
        if(!msg)
            return null;
        const value = Buffer.from(msg, 'base64');
        return this.#msgpack_dec.decodeStream(new Uint8Array((<Buffer>value).buffer, (<Buffer>value).byteOffset, (<Buffer>value).byteLength));
    }
}