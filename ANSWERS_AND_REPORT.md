# Self-check answers and report templates

> Fill the `[brackets]` with numbers from **your own** output files.

---

## Topic 6 — self-check

**1. Cost of `updateOne` + `$set` vs. `replaceOne`.**
`$set` sends only the changed fields over the network and writes a small diff entry to the oplog, so replication traffic is small. It also leaves every other field untouched, so two clients updating *different* fields of the same document don't overwrite each other. `replaceOne` sends the whole new document, writes the full document into the oplog, and silently discards any field the client didn't include — if another client changed a field in between, that change is lost. `replaceOne` makes sense only when you really intend to replace the whole document.

**2. Why `_id` is immutable.**
`_id` is the document's primary key: it's backed by a mandatory unique index, and replication uses it to identify which document each oplog entry applies to (an update in the oplog says "apply this to `_id` = X"). In a sharded collection it can also determine which shard holds the document. Changing it would effectively be a delete plus an insert of a different document, so MongoDB forbids it; to "change" an `_id`, insert a new document and delete the old one.

**3. When an upsert can create a duplicate under concurrent requests.**
If two upserts with the same filter run at the same time, both can find no matching document and both insert one — giving two stock records for the same `productId`. This happens when there is **no unique index** on the filter field(s). The fix is a unique index (done in `topic6_crud.js`: `db.stock.createIndex({productId: 1}, {unique: true})`). Then the second insert fails with a duplicate-key error, and since MongoDB 4.2 the server automatically retries such an upsert as an update when the filter is an equality match on the unique-indexed field.

---

## Topic 7 — explain() analysis (template)

Before the index, `find({ customerId })` used a **COLLSCAN**: totalDocsExamined = [≈600, the whole collection] to return nReturned = [N] documents — a ratio of about [600/N]:1, so roughly [x]% of the work was wasted reading documents that didn't match. The sorted version additionally needed an in-memory **SORT** stage.

After creating `{ customerId: 1, orderDate: -1 }`, the plan became **IXSCAN → FETCH**: totalKeysExamined = [N], totalDocsExamined = [N], nReturned = [N]. The 1:1:1 ratio is the ideal — every key and document read is part of the result. The sorted query also lost its SORT stage, because index entries for one customerId are already stored in orderDate-descending order. This is the ESR rule: the **E**quality field (customerId) comes first, then the **S**ort field (orderDate); a **R**ange field would go last. At 600 documents the time difference is milliseconds, but the docs-examined ratio is what grows with data size.

TTL: the session document inserted at [time] was gone after [x] seconds. Expiry isn't exact because the TTL monitor runs about every 60 s, so deletion happens between 60 and ~120 s after `createdAt`.

---

## Topic 8 — failover description (template, ~half a page)

I started three `mongod` processes on ports 27017–27019 and joined them into replica set `rs0`, giving the 27017 member priority 2 so it would be the first primary. `rs.status()` showed 27017 as PRIMARY and 27018/27019 as SECONDARY, all with health 1. A document written to the primary appeared on 27018 within [~1–2] seconds when read with read preference `secondary`, while a direct write to 27018 was rejected with `NotWritablePrimary` — only the primary accepts writes.

I then force-shut down the primary. The remaining two members stopped receiving heartbeats from it, and after the election timeout (10 s by default) they held an election. Two of three voting members form a majority, so an election could succeed: [27018/27019] became PRIMARY after about [x] seconds, and `rs.status()` showed 27017 as `(not reachable/healthy)` with health 0. During this window the set had no primary and writes would have failed or waited; afterwards, a write to the new primary succeeded, so the cluster recovered without manual intervention.

When I restarted 27017, it rejoined as SECONDARY, replicated the document written during the outage, and then — because of its higher priority — triggered a new election and became PRIMARY again [check that your log shows this]. This shows that a replica set survives the loss of one of three members, and that a rejoining node catches up from the oplog automatically.

---

## Topic 8 — self-check

**1. Why `{w: 1}` writes can be lost.**
With `w: 1` the client gets an acknowledgment as soon as the primary alone has applied the write. If the primary crashes before any secondary copies it from the oplog, a secondary without that write is elected. When the old primary comes back, its history has diverged, so it **rolls back** the unreplicated write (saving it to a rollback file, not to the live data). The application was told "success," but the data is gone. `w: "majority"` prevents this: a write acknowledged by a majority survives any election, because any new primary must have it.

**2. What happens when a majority of nodes become unreachable.**
A primary must be able to see a majority of voting members. If it can't, it **steps down** to SECONDARY, and no other node can be elected either, because nobody can collect a majority of votes. The set becomes read-only: writes fail, and reads work only with a read preference that allows secondaries (possibly stale). This is deliberate — it prevents "split brain," where two partitions each accept writes.

**3. Why `_id` is a poor shard key with monotonically increasing ObjectIds.**
An ObjectId starts with a timestamp, so new values always grow. With ranged sharding, every new document falls into the chunk covering the highest values (up to `MaxKey`), which lives on one shard. That shard takes all inserts (a write hot spot) while the others sit idle, and the balancer must keep migrating chunks away from it. Better options: a **hashed** shard key (`{ _id: "hashed" }`), which spreads inserts evenly, or a compound key with a well-distributed leading field (e.g. `{ customerId: 1, orderDate: 1 }`).

---

## Topic 8 (optional) — sharded cluster configuration

A sharded cluster has three components. **`mongos`** is the query router: applications connect only to it, and it uses cluster metadata to send each query to the shard(s) holding the relevant data, merging results when several shards answer. **Config servers** store that metadata — which chunk ranges of each sharded collection live on which shard. **Shards** hold the actual data, each owning a subset of the chunks.

Note on the syllabus's "2 config servers + 2 shards": since MongoDB 3.4, config servers must be deployed as a **replica set** (CSRS), and since 3.6 every shard must also be a replica set. A 2-member config replica set would run, but losing either member removes its majority, so metadata becomes read-only — production deployments use 3 config servers. A minimal lab layout is therefore: one `mongos`; config replica set `cfg` (`mongod --configsvr --replSet cfg`, ideally 3 members); shard `sh1` and shard `sh2`, each a replica set started with `mongod --shardsvr --replSet sh1|sh2` (1 member each is enough for a lab). Then `mongos --configdb cfg/localhost:27100` starts the router, `sh.addShard("sh1/localhost:27201")` and `sh.addShard("sh2/localhost:27301")` register the shards, and `sh.shardCollection("shop_db.orders", { customerId: "hashed" })` distributes a collection. Balancing is automatic: the balancer moves chunks between shards to keep data evenly spread, and `sh.status()` shows the resulting distribution.
