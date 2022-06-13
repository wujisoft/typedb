import { DbCol, DbKey, DbRow, DbUnique, DbKeyQueryable, DbUniqueQueryable } from "../../index";
import { DbTable } from "./DbTable";
import { v4 as uuid } from 'uuid';
import { FK, FkType } from "../../files/MetaInfo";
import { Fetchable } from "../../files/Fetchable";
import { RowSet } from "../../files/DbTable";

@DbRow()
export class Role extends DbTable {
    static rolename: DbKeyQueryable<Role, string>; 

    @DbKey()
    rolename!: string;

    @FK(FkType.remoteMulti, "Group")
    $Group!: Fetchable<RowSet<Group>>;
     Group!: RowSet<Group>;
}

@DbRow()
export class Group extends DbTable {
    static groupname: DbKeyQueryable<Group, string>; 

    @DbKey()
    groupname!: string;

    @FK(FkType.local, "Role")
    $Role!: Fetchable<RowSet<Role>>;
     Role!: RowSet<Role>;
}


