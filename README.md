# what is TypeDB

TypeDB is a object storage framework that allows developers to store object structures in any database of their choice. The initial release contains only an Adapter for Redis/KeyDB and uses JSON Storage, but the storage backend can be extended to support other databases at will. 

# intializing

after loading/declaring/requireing all DB Classes you are going to use during execution you need to call
```ts
    DbMetadataInfo.init();
```
Additionally you need to define all datasources you are doing to use:
```ts
    DbMetadataInfo.addDbConn(new RedisJsonDbConn(redis));
    DbMetadataInfo.addDbConn(new RedisJsonDbConn(redis2), 'archive');
```

# declaring data structures

all objects that are stored in a typedb backend need to be defined as propper classes in typescript/javascript. Inheritance is supported as long as the final object that gets stored has a @DbRow decorator applied to it. 

See the following simple example on how to describe your datastructure:

```ts
//@DbRow decorator needs to be on the final class of the inherited element to mark the object as being storable in a database
//additially all database objects need to inherit from ADbTableBase
@DbRow()
export class Company extends ADbTableBase {

    // Static properties that get initialized by the decorators.
    // They are used to query data from the database 

    //DbPkQueryable: is the object type used on the primarykey of the object
    static ID: DbPKQueryable<any, string>;
    //DbUniqueQueryable: is used for unique index querys
    static companyName: DbUniqueQueryable<Company, string>;
    //DbKeyQueryable: should be created for any non-unique indexes that are used to query objects
    static address: DbKeyQueryable<Company, string>;

    //Instance Properties

    // Any propertry that should be stored in the database must have either a @DbPk, @DbCol, @DbUnique or @DbKey decorator.
    // keep in mind that TypeDB does not support split keys and only @DbPk, @DbUnique and @DbKey marked fields are queryable from the database

    //@DbOk REQUIRED: declares the primary key of an object. 
    @DbPK() ID!: string;
    //@DbCol declares a column to be added to the database set. 
    @DbCol() created_at!: number;
    @DbCol() modified_at!: number;
    @DbCol() deleted_at?: number;
    //@DbUnique declares a unique index on the database, that can be queried by its associated static property
    @DbUnique()   companyName!: string;
    //@DbKey declared a non-unique index on the database, that can be queried by its associated static property
    @DbKey()      address!: string;
    @DbCol()      value!: number;


    // Foreignkeys

    // the @FK decorator declares a ForeighnKey relation between objects
    // there are 2 types that go together: 
    //

    // FkType.remote means that this objects holds the foreignkey. It references that Priamry key of the other object 
    // so this is the ("N" side of the "1-to-N" relation)
    @FK(FkType.remote, 'Owner')
    $NewOwner!: Fetchable<Owner>; //get
     NewOwner!: Owner;            //set & cache-get

    //FkType.local means that the primary key of this object is stored in the foreignkey object whose class is referenced by the 2nd argument. 
    // so this is the "1" side of the "1-to-N" relation
    @FK(FkType.local, 'CoWorkers', 'NewOwner')
    $CoWorkers!: Fetchable<RowSet<CoWorker>>;
     CoWorkers!: RowSet<CoWorker>;

    //REQUIRED: newID Method:  needs to be implmented. It should return a new, valid primary key 
    newID() { return uuid();  }
}
```

# Fetchables

All query methods, all foreignkey querys and some of the filtering methods return a "Fetchable<T>" object.
It can basically be treated like a Promise. You can either use .then() on it, or you can await it in a async method. 

additially Fetchable<T> allows for chaining of data structure addess. 

in the Above example you could simple so something like
```
const allCoWorkersOfMyCompany = await Company.companyName.get('MyCompany').$CoWorkers;
```
As you can see you can address the $CoWorkers Foreignkey property without having to await the .get() call seperately. 
Please note that this only works for Objects and Properties returning fetchables. 

# rowsets

A RowSet is a an object behaving similar to an array. it has "map", "filter" and "find" capabilitys, but all instance methods 
that are added to your data class can be used on a RowSet and on a Fetchable aswell. 
It is up to you to make sense of the methods you write and to get the types right

exmaple:
```ts
    async sumValues(this: new() => Fetchable<RowSet<this>>): Promise<number> {
        return this.__fetching.then((that) => that.map(x => x.value)).then((values) => values.reduce((pv, cv) => pv + cv, 0))
    }

    //Now use it like this:
    const sum = await Company.all().sumValues();
```

RowSets have getter properties for each Row as well as a length field and a iterator capability. 
This means, additially to using map as shown above, you can also iterate the manually

```ts
    //using for
    const allCompanys = await Company.all();
    for(let i = 0; i > allCompanys.length; i++) {
        //do somthing with allCompanys[i]
    }

    //using foreach
    for(const company of allCompanys) {
        //do something with company
    }
```

# static methods
## on ADbTableBase itself
### DbClass.new()

is used to create a new database object. The object has a primary key assigned but is NOT automatically inserted into the database. Make sure to call save() after assigning all needed data

### DbClass.fromObject({ /* Partial<DbClass> */  })

fromObject creates a new DbClass object as does new() but automatically copys all database fields of the provided source object (Marked by decorators) into the new object.
ForeignKey IDs are NOT copyied and need to be assigned after object creation.

### DbClass.reindex()
can be used to recreate all index field of the database after a index has been changed or a new index was added

### DbClass.all()
returns a Fetchable<RowSet<>> containing ALL entries of the current type. Please keep in mind that - depending on your dataaset size can be a huge ammount of data. 

### DbClass.newID():any
this needs to be implemented by the user. It is used to create a new primary key for an object. It should return a primary key (Number or string). 

# instance methods
## on db objects
### toJSON() / toObj()
converts all database fields to a plain object to be used in json encoding of the database, or for debug purposes. Foreignkeys are NOT regarded at the moment.

### archive()
moves an object that has archiving enabled (see @DbRow decorator below) to the archive database 

### unarchive()
moves an object that is archived by to the main dataset. Only works of the archive mode is set to "active". 
protected archives cannot be unarchived

### delete()
deletes an object from the database or archive. 
if archiving is enabled and the object is not yet archived it will be archived instead of deleted. 
if the object is archived and the archivemode is set to "protected" or if the object is a history object, the call will fail.
    

### save()
saves the object to the database. If an object with the same primary key already exists it will be overwritten. 
if the object is archived or a history object the call will fail.


## on RowSets
### sort
behaves exactly like Array.prototype.sort does, except that it can be called on a RowSet or Fetchable<RowSet<>> and will always return a Fetchable<RowSet<>>.
### map
can be called either on a RowSet<> or Fetchable<RowSet<>> and behaves exactly like Array.prototype.map.
If the object is not yet fetched it will return a Promise<[]>, otherwise an array.
### find
can be called either on a RowSet<> or Fetchable<RowSet<>> and behaves exactly like Array.prototype.find.
If the object is not yet fetched it will return a Promise<>, otherwise a database object.
### filter
can be called either on a RowSet<> or Fetchable<RowSet<>> and behaves exactly like Array.prototype.filter with the exception that it always returns a Fetchable<RowSet<T>>
# lifecycle hooks
to implement features like a created_at or modified_at field, we provide a number of lifeccycle hook that can be implemented by implementing the following methods on your database object 
- onDelete():void
- onSave():void
- onArchive():void
- onUnarchive():void
- onCreate():void

# decorators
## property decorators
do not combine the following decorators, one of the is enougth
all decorator calls can be inherited from parent classes.
### @DbPK()
marks a property as a primary key
this MUST be used on exactly one property of the database object. 
only works with object types that respond to "toString()".
### @DbCol()
marks a property as a database column
can contain any object type that can be serialized by your chosed database backend
### @DbUnique()
marks a property as a database column that create a unique index. 
only works with object types that respond to "toString()".
### @DbKey()
marks a property as a database column that create a non-unique index. 
only works with object types that respond to "toString()".
If you're using the redis backend the value should not contain 0 characters
### @FK(FkType.remote, 'RemoteClass')
marks the property as a remote foreignkey. This is the "N" side of the "1-to-N" relation. 
the following propertyName need to start with a $ sign, since it returns a Fetchable. 
additially, you should create the same property without a $ sign afterwards, to allow the FK to be set.

the RemoteClass parameter is optional if the name of the property matches that of the RemoteClass. 

reading $FK will always perform a database query for the FK object. 
writing to $FK is not possible.
readring from FK will return a cached response from the last $FK access. Please note, if you had no previous $FK access an exception is generated.
writing to FK will set the ForeignKey. 

additinally a property without $ prefix but including a _ID suffix can be added to query and manipulate the foreignkey directly. 

### FK(FkType.local, 'RemoteClass', 'RemoteProperty')
marks the property as a remote foreignkey. This is the "1" side of the "1-to-N" relation. 
the following propertyName need to start with a $ sign, since it returns a Fetchable<RowSet<>>. 
additially, you can create the same property without a $ sign afterwards

the RemoteClass parameter is optional if the name of the property matches that of the RemoteClass. 
the RemoteProperty paramter must be set to the name of the match FkType.remote FK property on the RemoteClass. 
it is optional of the RemoteProperty matched the local class name. 

reading from $FK will always perform a database query for the FK object.
reading from FK will return the cached reponse from the last $FK access. Please note, if you had no previous $FK access an exception is generated. 
writing to either is not possible, please the re FkType.remote side of the FK Relation to SET it. 
## class decorators
### DbRow({ /* parameters */ })
    the DbRow decorator need to be used on all DB objects that are acutally used to store data in a database. It doesn'e need to exist on parent classes that are not directly used to access data.
    the following paramter object can be passed:
- dbconn?: string       => the name of the database connection there this db object should reside (see DbConn objects below) - defaults to "default"
- archivedb?: string    => the name of the archive database connection that is used if achiving is enabled - defaults to "archive"
- archivemode?: "protected" | "active" | "none"    => enabled the archiving of data
    - "protected" => once archived an object cannot be unarchived again, and cannot be modified or deleted in any way (WORM storage)
    - "active" => once archived an object cannot be modified, unarchive and delete are possible however
    - "none" => disabled archiving
- historydb?: string    => name of the history database. if set the history feature gets enabled where every save() is recorded in a history-log database.

# querying DB, archive and history
to query a database entry, you use the DbQueryable objects that are declared as static propertys (see example above)
## DbPKQuerysable
### DbPKQueryable.get(key)
querys a DbObject by its primary key - returns a dbobject or null
### DbPKQueryable.getMany(key[])
Querys a DbObject by a list of primary keys - returns a RowSet<>

## DbUniqueQuerysable
### DbUniqueQueryable.get(key)
querys a DbObject by its unique key - returns a dbobject or null
### DbUniqueQueryable.getMany(key[])
Querys a DbObject by a list of unique keys - returns a RowSet<>
### DbUniqueQueryable.find(search|search[])
Searched a DbObjects unique key by one or more wildcards match depending on the database backend (Redis uses * and ? for wildcards)

## DbKeyQuerysable
### DbKeyQueryable.find(search[])
Searched a DbObjects non-unique key by zero or more wildcards match depending on the database backend (Redis uses * and ? for wildcards)
### DbKeyQueryable.findOne(search)
Searched a DbObjects non-unique key by zero or more wildcards match depending on the database backend (Redis uses * and ? for wildcards)
returns a single object, null (if none was found), or throws an exception if multiple matches exists. 

## history and archive
the DbQueryables can also be used to query the archive and the history of an object (given they are enabled).
To access an archive the command needs to be prefixed with an archive. like this:
```ts
    await Company.companyName.archive.get(...)
```
To access the history of an object the same symtax can be used like this:
```ts
    await Comapany.companyName.archive.find(...)
```
please not that "history" always transforms DbPkQueryable and DbUniqueQueryable types to a DbKeyQueryable object.

# DBConn objects
The IDBConn objects are the base for all database access. We're provind redis with json data as a default storage engine, but implemting IDbConn allows you to store your data elsewhere aswell.
to add a database connection to the framework DbMetadataInfo.addDbConn should be called. It needs to have IDbConn object passed. Optionally a datasource name can be provided to allow for DbObjects to be spread accross multiple databases and storage engines. 

the default storage engine shipped with TypeDB is RedisJsonDbConn(redis). 
It needs an active(connected) Redis@^4.0.0 connection to be passed as its only argument.

# internal propertied and methods
    there are a number of internal properties that start with __ on the dbObjects. While they're not inded to be used outside of the framework the might become quite handy the extending the functionality.
- __fetchIsInvalid: on a Fetchable object it denotes whatever it got a invalid (empty) result. If this is set to the "awaiting"/"Thenning" the Fetchable will return null. 
- __fetching: a Promise that handles the internal fetch state. It can be used to implement calls on Fetchables<> that should wait for the fetch to be complemete before doing something. 
- __fetched: the status of the object. will be set to true after the "await" of the fetchable completed
- __raw: the raw data of the db object. This is used to internally access the data to be stored by the IDbConn object
- __historyTImestamp: on history objects, this is the timestamp the history entry was created at
- __isArchived: if the current object is from an archive DB.
- __isHistory: if the current object is from an history DB.
- __getProperty/__setProperty: Internal getter/setter that are used for all non-FK DbCol marked properties
- __getFKProperty/__getFKCacheProperty/__setFKProperty: internal getter/setter that are used on FK marked properties
- __makeDbObj/__makeDbRowSet: internal methods that create a Fetchable from the data-query Promise. 

# examples
see the src/__test__ directory
