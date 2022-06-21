import { DbComputed } from "../../files/MetaInfo";
import { DbCol, DbKey, DbRow, DbUnique, FK, FkType,DbUniqueQueryable, DbKeyQueryable, Fetchable } from "../../index";
import { DbTable } from "./DbTable";
import { Owner } from "./Owner";
import { MPType } from '@gymcore/msgpackstream';

@MPType
export class SubCompanyData {
    doSomething() { return 5 }
    data = 31;
}

@DbRow({archivemode: "active", historydb: "history"})
export class Company extends DbTable {

    static companyName: DbUniqueQueryable<Company, string>;
    static address: DbKeyQueryable<Company, string>;

    static comTest: DbKeyQueryable<Company, string>;

    
    static products: DbUniqueQueryable<Company, string>;
    static prices: DbKeyQueryable<Company, string>;
    static compTestArr: DbKeyQueryable<Company, string>;
    
    @DbUnique()   companyName!: string;
    @DbKey()      address!: string;
    @DbCol()      value!: number;

    @FK(FkType.remote, 'Owner')
    $NewOwner!: Fetchable<Owner>; //get
     NewOwner!: Owner;            //set

    @DbComputed(() => 'hallo')
    readonly comTest?: string;

    volatileProp?: string;


    @DbUnique(true)
    products!: string[];

    @DbKey(true)
    prices!: string[];

    @DbComputed(() => ['a', 'b', 'c'], false, true)
    compTestArr!: string[];

    @DbComputed((obj: Company) => 'XX'+obj.companyName)
    companyNameComputed!: string[];

    @DbCol()
    subData!: SubCompanyData;

}
