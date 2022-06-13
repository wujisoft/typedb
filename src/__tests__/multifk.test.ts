import { createClient } from 'redis';
import { DbMetadataInfo, RedisMsgpackDbConn } from '..';
import { Group, Role } from './schema/roles';

type RedisClient = ReturnType<typeof createClient>;

var redis: RedisClient;

beforeAll(async () => {
    redis = createClient();
    await redis.connect();
    await redis.flushAll();

    DbMetadataInfo.addDbConn(new RedisMsgpackDbConn(redis));
    DbMetadataInfo.init();

})

afterAll(() => {
   redis.quit();
})

test("Create new DB entry", async () => {
    const r = Role.fromObject({rolename: 'testRole'});
    const r2 = Role.fromObject({rolename: 'testRole2'});
    const r3 = Role.fromObject({rolename: 'testRole2'});
    const g = Group.fromObject({groupname: 'testGroup'});
    const g2 = Group.fromObject({groupname: 'testGroup2'});
    const g3 = Group.fromObject({groupname: 'testGroup3'});

    r.Group = g.addTo();
    r.Group = g2.addTo();
    r2.Group = g2.addTo();
    r2.Group = g3.addTo();
    r3.Group = g3.addTo();
    r3.Group = g.addTo();

    await g.save();
    await g2.save();
    await g3.save();
    await r.save();
    await r2.save();
    await r3.save();
});

test("Fetch remote->local", async () => {
    const r = await Role.rolename.findOne('testRole');
    const gr = await r?.$Group;
    expect(gr?.length).toBe(2);
})

test("Fetch local->remote", async () => {
    const g = await Group.groupname.findOne('testGroup');
    const gr = await g?.$Role;
    expect(gr?.length).toBe(2);
})

test("Remove", async () => {
    let r = await Role.rolename.findOne('testRole');
    const groups = await r?.$Group;
    if(r && groups && groups[1])
        r.Group = groups[0].removeFrom();
    await r?.save();
    r = await Role.rolename.findOne('testRole');
    const gr = await r?.$Group;

    expect(gr?.length).toBe(1);
    expect(gr?.[0].groupname).toBe('testGroup2');
})
