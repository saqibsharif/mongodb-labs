// =====================================================================
// Topic 7 — Aggregation Framework, indexing, explain(), TTL
// Run:  mongosh "$MONGO_URI/shop_db" --file topic7_aggregation_indexing.js | tee topic7_output.txt
// (Run topic7_seed.js first.) The TTL part waits up to ~3 minutes at the end.
// =====================================================================
db = db.getSiblingDB("shop_db");

function show(label, result) {
  print(`\n=== ${label} ===`);
  printjson(result && typeof result.toArray === "function" ? result.toArray() : result);
}

// Collects every stage name in a plan tree (works for classic and SBE plan shapes).
function stages(p) {
  if (!p || typeof p !== "object") return [];
  let out = p.stage ? [p.stage] : [];
  for (const k of ["queryPlan", "inputStage"]) out = out.concat(stages(p[k]));
  for (const s of p.inputStages || []) out = out.concat(stages(s));
  return out;
}
function explainSummary(label, exp) {
  const es = exp.executionStats;
  show(label, {
    winningPlanStages: stages(exp.queryPlanner.winningPlan).join(" <- "),
    nReturned: es.nReturned,
    totalKeysExamined: es.totalKeysExamined,
    totalDocsExamined: es.totalDocsExamined,
    executionTimeMillis: es.executionTimeMillis,
  });
}

// ---------- 2. Top 5 categories by revenue since 2025-10-05 (last 12 months) ----------
// $match first so later stages see fewer docs; $unwind makes one doc per order item;
// $group sums price*qty per category; then sort and cut to 5.
show("Pipeline 1: top categories by yearly revenue", db.orders.aggregate([
  { $match: { orderDate: { $gte: ISODate("2025-10-05") } } },
  { $unwind: "$items" },
  { $group: { _id: "$items.category", revenue: { $sum: { $multiply: ["$items.price", "$items.qty"] } } } },
  { $sort: { revenue: -1 } },
  { $limit: 5 },
]));

// ---------- 3. Top 5 customers with $lookup ----------
// Group/sort/limit BEFORE $lookup so the join runs only 5 times, not 600.
show("Pipeline 2: top 5 customers + $lookup", db.orders.aggregate([
  { $group: { _id: "$customerId", total: { $sum: "$amount" }, orders: { $sum: 1 } } },
  { $sort: { total: -1 } },
  { $limit: 5 },
  { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "customer" } },
  { $unwind: "$customer" },
  { $project: { _id: 0, customerId: "$_id", name: "$customer.name", city: "$customer.city", orders: 1, total: { $round: ["$total", 2] } } },
]));

// ---------- 4. explain() BEFORE indexing ----------
db.orders.dropIndexes();                       // clean slate on re-runs (keeps _id index)
const cid = db.orders.findOne().customerId;    // a real customerId to query for
print(`\nQuerying customerId = ${cid}`);

const before = db.orders.find({ customerId: cid }).explain("executionStats");
explainSummary("BEFORE index: find({customerId})", before);
const beforeSorted = db.orders.find({ customerId: cid }).sort({ orderDate: -1 }).explain("executionStats");
explainSummary("BEFORE index: find({customerId}).sort({orderDate:-1})", beforeSorted);

// ---------- 5. Compound index following ESR (Equality, Sort, Range) ----------
// customerId is matched by equality -> first; orderDate is the sort key -> second.
show("createIndex {customerId:1, orderDate:-1}", db.orders.createIndex({ customerId: 1, orderDate: -1 }));

const after = db.orders.find({ customerId: cid }).explain("executionStats");
explainSummary("AFTER index: find({customerId})", after);
const afterSorted = db.orders.find({ customerId: cid }).sort({ orderDate: -1 }).explain("executionStats");
explainSummary("AFTER index: find({customerId}).sort({orderDate:-1}) — note: no SORT stage", afterSorted);

print("\n--- Full executionStats BEFORE (for the report) ---");
printjson(before.executionStats);
print("\n--- Full executionStats AFTER (for the report) ---");
printjson(after.executionStats);

// ---------- 6. TTL index ----------
// Documents expire 60 s after createdAt. The TTL monitor runs every ~60 s,
// so deletion typically happens 60–120 s after insert.
show("createIndex TTL on sessions.createdAt", db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 }));
show("insert session", db.sessions.insertOne({ userId: "u1", createdAt: new Date() }));
show("sessions right after insert", db.sessions.find());

const start = Date.now();
while (db.sessions.countDocuments() > 0 && Date.now() - start < 180000) {
  print(`  ${Math.round((Date.now() - start) / 1000)} s: still ${db.sessions.countDocuments()} doc(s)…`);
  sleep(15000);
}
show(`sessions after ${Math.round((Date.now() - start) / 1000)} s (expect [])`, db.sessions.find());
