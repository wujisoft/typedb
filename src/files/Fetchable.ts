import { ADbTableBase, RowSet } from "..";

export class Fetcher<T extends ADbTableBase> {
    constructor(public __base: T) {
        return new Proxy(this, {
            get: (that ,target) => {
                if((<any>this)[target])
                    return (<any>this)[target];
                else
                    return typeof (<any>__base)[target] === 'function' ? (<any>__base)[target].bind(__base) : (<any>__base)[target];
            }
        });
    }

    async then(onFulfilled?: ((value: T|null) => any | PromiseLike<any>), onReject?: (value: any) => any): Promise<T | never> {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if(!this.__base.__fetching) {
          if(onFulfilled) {
            if(this.__base.__fetchIsInvalid)
                return await onFulfilled(null);
            return await onFulfilled(this.__base);
          }
          else 
            return this.__base.__fetching;
        } else {
          return this.__base.__fetching.then(async (that) => {
            if(onFulfilled && this.__base.__fetchIsInvalid)
                return await onFulfilled(null);
            if(this.__base.__fetchIsInvalid)
                return null;                
            if(onFulfilled)
                return await onFulfilled(that);
            return that;
          }, onReject);
        }
    }
    async catch(onReject?: ((value: T) => any | PromiseLike<any>)): Promise<T | never> {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if(!this.__base.__fetching) {
            return this.__base;
        } else {
            return this.__base.__fetching.catch(onReject);
        }
    }
}

export type Fetchable<T extends ADbTableBase> = Fetcher<T> & RowSet<T>;