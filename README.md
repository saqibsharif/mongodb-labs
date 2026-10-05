# MongoDB Labs — Topics 6, 7, 8: how to run everything

## 0. One-time setup

**Atlas (Topics 6–7):** follow section A of the syllabus. Keep Network Access at `0.0.0.0/0` — Codespaces' IP changes, so a single IP won't work.

**Codespaces:** create a codespace, then install the tools (this auto-detects the Ubuntu codename instead of hard-coding `jammy`; note the syllabus's wrapped `-` / `o` is really `-o`):

```bash
sudo apt-get install -y gnupg curl lsb-release
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org mongodb-mongosh mongodb-database-tools
mongosh --version && mongoimport --version && mongod --version
```
(If `apt-get update` complains about the codename, run `cat /etc/os-release` — MongoDB 8.0 supports Ubuntu focal/jammy/noble.)

Upload this folder into the codespace (drag-and-drop into the file explorer), `cd` into it, and set your connection string **without a trailing slash**:

```bash
export MONGO_URI="mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net"
mongosh "$MONGO_URI"      # prompt like: Atlas atlas-xxxx-shard-0 [primary] test>
```
If your password has special characters (`@ : / ? #`), URL-encode them or change the password.

## Topic 6
```bash
python3 gen_products.py
mongoimport --uri "$MONGO_URI/shop_db" --collection products --file products.json --jsonArray --drop
mongosh "$MONGO_URI/shop_db" --file topic6_crud.js | tee topic6_output.txt
```
Deliverable: `topic6_crud.js` (commented) + `topic6_output.txt`.

## Topic 7
```bash
mongosh "$MONGO_URI/shop_db" --file topic7_seed.js
mongosh "$MONGO_URI/shop_db" --file topic7_aggregation_indexing.js | tee topic7_output.txt
```
The last part waits 1–3 minutes for the TTL deletion — that's normal.
Deliverable: the script, `topic7_output.txt` (explain before/after), and the analysis in `ANSWERS_AND_REPORT.md`.

## Topic 8 (local, in Codespaces — not Atlas)
```bash
bash topic8_replica_set.sh 2>&1 | tee topic8_log.txt
```
Produces `topic8_log.txt`, `rs_status_before.json`, `rs_status_after.json`.
Deliverable: those three files + the failover description in `ANSWERS_AND_REPORT.md`.

To stop everything afterwards: `pkill -x mongod`.
