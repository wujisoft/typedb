export class DbError extends Error {}
export class DbLockingError extends DbError {}
export class DbConfigError extends DbError {}
export class DbInvalidCallError extends DbError {}
export class DbResultError extends DbError {}