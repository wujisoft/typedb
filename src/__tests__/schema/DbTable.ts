import { ADbTableBase, DbCol, DbPK, DbPKQueryable } from "../../index";
import { v4 as uuid } from 'uuid';

export class DbTable extends ADbTableBase {

    static ID: DbPKQueryable<any, string>;

    @DbPK() ID!: string;
    @DbCol() created_at!: number;
    @DbCol() modified_at!: number;
    @DbCol() deleted_at?: number;

    newID() { return uuid();  }

    onCreate() {
        this.modified_at = this.created_at = + new Date();
    }

    onSave() {
        this.modified_at = + new Date();
    }

    onArchive() {
        this.deleted_at = + new Date();
    }

    onUnarchive() {
        this.deleted_at = undefined;
    }

    onDelete() {
        // void
    }

    
}