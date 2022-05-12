import { createClient } from 'redis';
import { DbMetadataInfo, RedisListJsonDbConn } from '..';
import { Audit } from './schema/Audit';

type RedisClient = ReturnType<typeof createClient>;

var redis: RedisClient, redis2: RedisClient, redis3: RedisClient;

beforeAll(async () => {
    redis = createClient({database: 4});
    await redis.connect();
    await redis.flushDb();  

    DbMetadataInfo.addDbConn(new RedisListJsonDbConn(redis), 'audit');
    DbMetadataInfo.init();

})

afterAll(() => {
   redis.quit();
})

test("Create new DB entry", async () => {
    let a = Audit.new('sub1');
    a.user = 'Hans',
    a.action = 'something';
    await a.save();
    expect(a.ID).toBe(0);

    a = Audit.new('sub1');
    a.user = 'Hugo',
    a.action = 'something else';
    await a.save();
    expect(a.ID).toBe(1);

    a = Audit.new('sub1');
    a.user = 'Hugo',
    a.action = 'something else 2';
    await a.save();
    expect(a.ID).toBe(2);

    a = Audit.new();
    a.user = 'Hans',
    a.action = 'something';
    await a.save();
    expect(a.ID).toBe(0);

    a = Audit.new();
    a.user = 'Hugo',
    a.action = 'something else';
    await a.save();
    expect(a.ID).toBe(1);

    a = Audit.new();
    a.user = 'Hugo',
    a.action = 'something else 2';
    await a.save();
    expect(a.ID).toBe(2);
});

test('Get record by ID', async() => {
    const a = await Audit.ID.get("1");
    expect(a.user).toBe('Hugo');
})

test('Get record by Key', async() => {
    const a = await Audit.user.find('Hugo');
    expect(a?.length).toBe(2);
    expect(a?.[0].action).toBe('something else');
})

test('Get record by Unique', async() => {
    const a = await Audit.user.find('Hugo');
    const b = await Audit.TxID.get(a?.[0].TxID ?? '');
    expect(a?.length).toBe(2);
    expect(a?.[0].action).toBe('something else');
})

test('Get sub record by ID', async() => {
    const a = await Audit.ID.sub('sub1').get("1");
    expect(a.user).toBe('Hugo');
})

test('Get sub record by Key', async() => {
    const a = await Audit.user.sub('sub1').find('Hugo');
    expect(a?.length).toBe(2);
    expect(a?.[0].action).toBe('something else');
})

test('Get sub record by Unique', async() => {
    const a = await Audit.user.sub('sub1').find('Hugo');
    const b = await Audit.TxID.get(a?.[0].TxID ?? '');
    expect(a?.length).toBe(2);
    expect(a?.[0].action).toBe('something else');
})






