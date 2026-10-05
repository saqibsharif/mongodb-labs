#!/usr/bin/env bash
# =====================================================================
# Topic 8 — local 3-node replica set + failover (run in Codespaces)
# Run:  bash topic8_replica_set.sh 2>&1 | tee topic8_log.txt
# WARNING: wipes ~/data/db1..db3 for a clean start each time.
# =====================================================================
set -u
step() { echo; echo "===================== $* ====================="; date '+%H:%M:%S'; }
run()  { echo "\$ $*"; "$@"; }

STATUS_JS='rs.status().members.forEach(m => print(m.name.padEnd(18), m.stateStr.padEnd(28), "health=" + m.health))'

wait_primary() {   # $1 = port to ask
  for i in $(seq 1 30); do
    P=$(mongosh --port "$1" --quiet --eval 'db.hello().primary || ""' 2>/dev/null)
    if [ -n "$P" ]; then echo "PRIMARY is $P (after ~$((i*2)) s)"; return 0; fi
    sleep 2
  done
  echo "No PRIMARY found after 60 s"; return 1
}

step "0. Clean start"
pkill -x mongod 2>/dev/null; sleep 3
rm -rf ~/data/db1 ~/data/db2 ~/data/db3 ~/data/*.log

step "1. Start 3 mongod processes"
run mkdir -p ~/data/db1 ~/data/db2 ~/data/db3
for i in 1 2 3; do
  run mongod --replSet rs0 --port $((27016 + i)) --dbpath ~/data/db$i --bind_ip localhost --fork --logpath ~/data/db$i.log
done

step "2. rs.initiate (27017 gets priority 2 so it is the predictable first PRIMARY)"
run mongosh --port 27017 --quiet --eval '
printjson(rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "localhost:27017", priority: 2 },
    { _id: 1, host: "localhost:27018" },
    { _id: 2, host: "localhost:27019" }
  ]
}))'
wait_primary 27017

step "3. rs.status() BEFORE failure"
sleep 5   # let secondaries finish initial sync
mongosh --port 27017 --quiet --eval "$STATUS_JS"
mongosh --port 27017 --quiet --eval 'EJSON.stringify(rs.status(), null, 2)' > rs_status_before.json
echo "(full output saved to rs_status_before.json)"

step "4. Write on PRIMARY (27017), read on SECONDARY (27018)"
run mongosh --port 27017 --quiet --eval 'printjson(db.test.insertOne({ msg: "hello", at: new Date() }))'
sleep 2
run mongosh --port 27018 --quiet --eval 'db.getMongo().setReadPref("secondary"); printjson(db.test.find().toArray())'
echo "Writing directly to a SECONDARY should fail with NotWritablePrimary:"
mongosh --port 27018 --quiet --eval 'db.test.insertOne({ msg: "should fail" })' 2>&1 | tail -n 3

step "5. Kill the PRIMARY (27017) and watch the election"
mongosh --port 27017 --quiet --eval 'db.getSiblingDB("admin").shutdownServer({ force: true })' 2>&1 | tail -n 2
echo "(a connection error above is expected — the server just shut down)"
wait_primary 27018
NEW_PRIMARY=$(mongosh --port 27018 --quiet --eval 'db.hello().primary')
NEW_PORT=${NEW_PRIMARY##*:}

step "rs.status() AFTER failure"
mongosh --port 27018 --quiet --eval "$STATUS_JS"
mongosh --port 27018 --quiet --eval 'EJSON.stringify(rs.status(), null, 2)' > rs_status_after.json
echo "(full output saved to rs_status_after.json)"

step "Write to the NEW primary ($NEW_PRIMARY) — cluster still accepts writes"
run mongosh --port "$NEW_PORT" --quiet --eval 'printjson(db.test.insertOne({ msg: "written after failover", at: new Date() }))'

step "Extra: restart 27017 — it rejoins, catches up, then retakes PRIMARY (priority 2)"
run mongod --replSet rs0 --port 27017 --dbpath ~/data/db1 --bind_ip localhost --fork --logpath ~/data/db1.log
sleep 25
mongosh --port 27018 --quiet --eval "$STATUS_JS"
run mongosh --port 27017 --quiet --eval 'db.getMongo().setReadPref("primaryPreferred"); printjson(db.test.find().toArray())'

step "Done"
