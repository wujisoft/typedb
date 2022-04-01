import { DbCol, DbRow, DbUnique, DbUniqueQueryable, Fetchable, FK, FkType, RowSet } from "../../index";
import { DbTable } from "./DbTable";
import { Company } from "./Company";

@DbRow()
export class Owner extends DbTable {
    static ownerName: DbUniqueQueryable<Owner, string>;

    @DbUnique()    ownerName!: string
    @DbCol()       age!: number;

    @FK(FkType.local, 'Company', 'NewOwner')
    $MyCompany!: Fetchable<RowSet<Company>> //get
     MyCompany!: RowSet<Company> //get
}