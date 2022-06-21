import { createClient } from 'redis';
import { DbInvalidCallError, DbMetadataInfo, DbResultError, RedisMsgpackDbConn } from '..';
import { Company, SubCompanyData } from './schema/Company';
import { Owner } from './schema/Owner';

type RedisClient = ReturnType<typeof createClient>;

var redis: RedisClient, redis2: RedisClient, redis3: RedisClient;

beforeAll(async () => {
    redis = createClient();
    redis2 = createClient({database: 2});
    redis3 = createClient({database: 3});
    await redis.connect();
    await redis2.connect();
    await redis3.connect();
    await redis.flushDb();
    await redis2.flushDb();
    await redis3.flushDb();    

    DbMetadataInfo.addDbConn(new RedisMsgpackDbConn(redis));
    DbMetadataInfo.addDbConn(new RedisMsgpackDbConn(redis2), 'archive');
    DbMetadataInfo.addDbConn(new RedisMsgpackDbConn(redis3), 'history');
    DbMetadataInfo.init();

})

afterAll(() => {
   redis.quit();
   redis2.quit();
   redis3.quit();
})

test("Create new DB entry", async () => {
    const c = Company.new();
    c.companyName = 'TestCompany';
    c.address = 'Nullstr 5';
    c.value = 42;
    c.volatileProp = "test";
    //console.log(c.companyNameComputed);
    expect(await c.save()).toBe(true);

    const b = Company.new();
    b.companyName = 'SomeCompany';
    b.address = 'Undefstr 7';
    b.value = 42;
    await b.save();
    await b.save();
    await b.save();
    await b.save();
    await b.save();
});

test("if volatile property is not saved", async () => {
    const c = await Company.companyName.get('TestCompany');
    expect(c?.volatileProp).toBeUndefined();
})

test("if volatile property is exported", async () => {
    const c = await Company.companyName.get('TestCompany');
    expect(c?.toJSON().volatileProp).toBeUndefined();
    c!.volatileProp = 'test1';
    expect(c?.toJSON().volatileProp).toBe('test1');
})

test("read DB entry by UniqueIndex", async () => {
    const r = await Company.companyName.get('TestCompany');
    expect(r?.companyName).toBe('TestCompany');
})

test("find DB entries by UniqueIndex", async () => {
    const r = await Company.companyName.find('*Company');
    expect(r?.length).toBe(2);
})

test("read Multiple DB entries by UniqueIndex", async () => {
    const r = await Company.companyName.getMany(['TestCompany', 'SomeCompany']);
    expect(r?.[0].companyName).toBe('TestCompany');
    expect(r?.[1].companyName).toBe('SomeCompany');
});

test("find DB entries by KeyIndex", async () => {
    const r = await Company.address.find(['*str*']);
    expect(r?.length).toBe(2);
})

test("findOne DB entries by KeyIndex", async () => {
    const r = await Company.address.findOne("Undefstr*")
    expect(r?.companyName).toBe("SomeCompany");
})

test("findOne DB entries by KeyIndex with multiple results", async () => {
    expect.assertions(1);
    try {
        const r = await Company.address.findOne("*str*");
    } catch(e) {
        expect(e).toBeInstanceOf(DbResultError);
    }
    
})

test("PK get", async() => {
    const b = Company.new();
    b.companyName = 'BlaCompany';
    b.address = 'GoDiestr 7';
    b.value = 42;
    await b.save();
    const a:Company = await Company.ID.get(b.ID);
    expect(a?.companyName).toBe('BlaCompany');
});

test("Create FK entry", async() => {
    const a = Owner.new();
    const b = Company.new();
    b.companyName = 'FKCompany';
    b.address = 'whateverstr. 3';
    b.value = 78;
    a.ownerName = 'Hans Hugo';
    b.NewOwner = a;
    expect(await a.save()).toBeTruthy();
    expect(await b.save()).toBeTruthy();
});

test("Read FK entry from remote", async() => {
    const a = await Company.companyName.get('FKCompany');
    const b = await a?.$NewOwner;
    expect(b?.ownerName).toBe('Hans Hugo');
});

test("Chain FK entry from remote", async() => {
    const b = await Company.companyName.get('FKCompany').$NewOwner;
    expect(b?.ownerName).toBe('Hans Hugo');
});

test("filter (async) on rowset", async () => {
    const r = await Company.all()
    const f = await r?.filter(async (elem) => elem.value === 42)
    expect(f?.length).toBe(3);
})

test("chain filter on rowset", async () => {
    const r = await Company.all().filter((elem) => elem.value === 42)
    expect(r?.length).toBe(3);
})

test("map on rowset", async () => {
    const r = await Company.all();
    const m = r?.map((elem) => elem.value);
    expect(m?.[0]).toBeGreaterThan(1);
})

test("map (async) on rowset", async () => {
    const r = await Company.all();
    const m = r?.map(async (elem) => elem.value);
    expect(m).toBeInstanceOf(Promise);
    expect((await m)?.[0]).toBeGreaterThan(1);
})

test("chain map on rowset", async () => {
    const r = await Company.all().map((elem) => elem.value);
    expect(r?.[0]).toBeGreaterThan(1);
})

test("find on rowset", async () => {
    const r = await Company.all();
    const m = r?.find((elem) => elem.value === 42);
    expect(m?.value).toBeGreaterThan(1);
})

test("find (async) on rowset", async () => {
    const r = await Company.all();
    const m = r?.find(async (elem) => elem.value === 42, true);
    expect(m).toBeInstanceOf(Promise);
    expect((await m)?.value).toBeGreaterThan(1);
})

test("chain find on rowset", async () => {
    const r = await Company.all().find((elem) => elem.value === 42);
    expect(r?.value).toBeGreaterThan(1);
})

test("null FK on remote", async () => {
    const a = Company.new();
    const b = await a.$NewOwner;
    expect(b).toBeNull();
});

test("null FK on local", async () => {
    const a = Owner.new();
    const b = await a.$MyCompany;
    expect(b?.length).toBe(0);
})

test("fromObject", async() => {
    const a = Company.fromObject({ 
        address: "Objectstr. 12",
        companyName: "NullableCompany"
    });
    expect(a.address).toBe("Objectstr. 12");
})

test("save fromObject", async() => {
    const a = await Company.fromObject({ 
        address: "Objectstr. 12",
        companyName: "NullableCompany"
    }, true);
    const b = await Company.ID.get(a?.ID ?? "");
    expect(b.address).toBe("Objectstr. 12");
})

test("delete", async() => {
    const a = await Company.companyName.get("NullableCompany");
    expect(a?.companyName).toBe("NullableCompany");
    await a?.delete();
    const b = await Company.companyName.get("NullableCompany");
    expect(b).toBeNull();
})

test("iterator", async() => {
    const a = await Company.all() ?? [];
    const r = [];
    for(let elem of a) {
        r.push(elem);
    }
    expect(r.length).toBe(4);
})

test("Read FK entry from local", async() => {
    const a = await Owner.ownerName.get('Hans Hugo');
    const b = await a?.$MyCompany;
    expect(b?.[0].companyName).toBe("FKCompany");
});

test("Chain FK entry from local", async() => {
    const a = await Owner.ownerName.get('Hans Hugo').$MyCompany;
    expect(a?.[0].companyName).toBe("FKCompany");
});

test("FK remote prefetch", async () => {
    const row = await Company.companyName.get('FKCompany');
    await row?.$NewOwner;
    expect(row?.NewOwner.ownerName).toBe('Hans Hugo');
});

test("FK remote prefetch error", async() => {
    expect.assertions(1);
    const row = await Company.companyName.get('FKCompany');
    try {
        row?.NewOwner.ownerName;
    } catch(e) {
        expect(e).toBeInstanceOf(DbInvalidCallError);
    }
})

test("FK local prefetch", async () => {
    const row = await Owner.ownerName.get('Hans Hugo');
    await row?.$MyCompany;
    expect(row?.MyCompany[0].companyName).toBe('FKCompany');
});

test("FK local prefetch error", async () => {
    expect.assertions(1);
    const row = await Owner.ownerName.get('Hans Hugo');
    try {
        row?.MyCompany[0].companyName
    } catch(e) {
        expect(e).toBeInstanceOf(DbInvalidCallError);
    }
});

test("RowSet FK remote prefetch", async() => {
    await redis.ping();
    const rows = await Company.all();
    await rows?.$NewOwner;
    expect(rows?.map(x => [x.companyName, x.NewOwner?.ownerName]).find(x => x[0] === 'FKCompany')?.[1]).toBe('Hans Hugo');
    expect(rows?.map(x => [x.companyName, x.NewOwner?.ownerName]).find(x => x[0] === 'TestCompany')?.[1]).toBeUndefined();
    
});

test("RowSet FK local prefetch", async() => {
    await redis.ping();
    const rows = await Owner.all();
    await rows?.$MyCompany;
    expect(rows?.[0].MyCompany.companyName).toBe('FKCompany');
    
});

test("simple Sort", async() => {
    const rows = await Company.all();
    const res = await rows?.sort((a,b) => a.value - b.value);
    expect(res?.[3].companyName).toBe('FKCompany');
})

test("non-prefetch sort", async() => {
    const rows = Company.all();
    const res = await rows?.sort((a,b) => a.value - b.value);
    expect(res?.[3].companyName).toBe('FKCompany');
});

test("archive entry", async() => {
    const row = await Company.companyName.get('TestCompany');
    expect(await row?.archive()).toBeTruthy();
});

test('query archived data', async() => {
    const row = await Company.companyName.archive.get('TestCompany');
    expect(row?.companyName).toBe('TestCompany');
});

test('unarchive entry', async() => {
    const row = await Company.companyName.archive.get('TestCompany');
    expect(await row?.unarchive()).toBeTruthy();
});

test('get history', async() => {
    const rows = await Company.companyName.history.find('SomeCompany');
    expect(rows?.[0]?.companyName).toBe('SomeCompany');
})

test('bug: unlink FKs', async() => {
    let a = await Company.companyName.get('FKCompany');
    const owner = await a?.$NewOwner;
    a!.NewOwner = <any>null;
    await a?.save();
    a = await Company.companyName.get('FKCompany');
    expect(await a?.$NewOwner).toBeNull();
    a!.NewOwner = <any>owner;
    await a?.save();
});

test('bug: delete FK entry and fetch afterwards', async() => {
    const a = await Company.companyName.get('FKCompany');
    const owner = await a?.$NewOwner;
    await a?.delete();
    expect((await owner?.$MyCompany)?.length).toBe(0);
});


test('computed col', async() => {
    const c = Company.new();
    expect(c.comTest).toBe('hallo');
});

test('computed col index cleanup', async()  => {
    const c = await Company.comTest.find('hallo');
    expect(c?.length).toBe(3);
});

test('query computed col', async() => {
    const c = await Company.comTest.find('hallo');
    expect(c?.[0]?.comTest).toBe('hallo');
});

test('arrayIndex', async () => {
    const c = Company.new();
    c.products = ['milch', 'butter', 'brot'];
    c.prices = ['cheap', 'expensive', 'cheap'];
    await c.save();
    const e = Company.new();
    e.prices = ['cheap', 'expensive', 'cheap'];
    await e.save();

    const a = await Company.products.get('milch');
    expect(a?.ID).toBe(c.ID);
    const b = await Company.prices.find('cheap');
    expect(b?.[0].ID).toBe(c.ID);
    expect(b?.[1].ID).toBe(e.ID);
    const d = await Company.compTestArr.find('a');
    expect(d?.length).toBe(5);
});

test('objectReconstruction', async () => {
    const c = Company.new();
    c.subData = new SubCompanyData();
    await c.save();

    const d = <Company>await Company.ID.get(c.ID);
    expect(d.subData?.data).toBe(31);
    expect(d.subData?.doSomething?.()).toBe(5);
})

test('computedIndex with object reference', async() => {
    const c = Company.new();
    c.companyName = 'ComputedTest';
    expect(c.companyNameComputed).toBe('XXComputedTest');
})

test('don\'t update ID in import', async() => {
    const c = Company.new();
    const id = c.ID;
    c.import({ID: 'bla'})
    expect(c.ID).toBe(id);
})
