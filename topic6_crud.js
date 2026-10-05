// =====================================================================
// Topic 6 — MongoDB I: document model, BSON, CRUD
// Run:  mongosh "$MONGO_URI/shop_db" --file topic6_crud.js | tee topic6_output.txt
// Note: re-running multiplies electronics prices by 1.10 again (step 4).
// =====================================================================

// `use shop_db` only works interactively; in a script we switch like this:
db = db.getSiblingDB("shop_db");

// Helper: prints a label and the result (cursor -> array) so the output is readable.
function show(label, result) {
  print(`\n=== ${label} ===`);
  printjson(result && typeof result.toArray === "function" ? result.toArray() : result);
}

show("Total products imported", db.products.countDocuments());

// ---------- 3. find() queries (10 distinct ones) ----------

// Q1: range query — products priced between 50 and 200 inclusive.
show("Q1 price 50..200", db.products.find({ price: { $gte: 50, $lte: 200 } }, { name: 1, price: 1, _id: 0 }));

// Q2: $in — products in either electronics or books.
show("Q2 category in [electronics, books]", db.products.find({ category: { $in: ["electronics", "books"] } }, { name: 1, category: 1, _id: 0 }));

// Q3: explicit $and — cheap electronics (under 500).
show("Q3 electronics under 500", db.products.find({ $and: [{ category: "electronics" }, { price: { $lt: 500 } }] }, { name: 1, price: 1, _id: 0 }));

// Q4: sort + skip + limit — "page 3" of the most expensive products (5 per page).
show("Q4 sorted by price desc, skip 10, limit 5", db.products.find({}, { name: 1, price: 1, _id: 0 }).sort({ price: -1 }).skip(10).limit(5));

// Q5: array match — a scalar on an array field matches if ANY element equals it.
show("Q5 tagged 'bestseller'", db.products.find({ tags: "bestseller" }, { name: 1, tags: 1, _id: 0 }));

// Q6: $all — array must contain ALL listed values (order irrelevant).
show("Q6 tags contain both 'eco' and 'gift'", db.products.find({ tags: { $all: ["eco", "gift"] } }, { name: 1, tags: 1, _id: 0 }));

// Q7: $or — out of stock OR very cheap.
show("Q7 stock = 0 OR price < 15", db.products.find({ $or: [{ stock: 0 }, { price: { $lt: 15 } }] }, { name: 1, stock: 1, price: 1, _id: 0 }));

// Q8: $regex — names starting with "W" (case-insensitive).
show("Q8 name starts with W", db.products.find({ name: { $regex: /^w/i } }, { name: 1, _id: 0 }));

// Q9: $size — products with exactly 3 tags.
show("Q9 exactly 3 tags", db.products.find({ tags: { $size: 3 } }, { name: 1, tags: 1, _id: 0 }));

// Q10: low stock in a category, projection excludes _id, sorted by stock ascending.
show("Q10 low-stock sports items (<100)", db.products.find({ category: "sports", stock: { $lt: 100 } }, { name: 1, stock: 1, _id: 0 }).sort({ stock: 1 }));

// ---------- 4. Updates ----------

// $mul multiplies a numeric field in place: +10% on all electronics.
show("Electronics BEFORE +10%", db.products.find({ category: "electronics" }, { name: 1, price: 1, _id: 0 }).limit(3));
show("updateMany $mul 1.10", db.products.updateMany({ category: "electronics" }, { $mul: { price: 1.10 } }));
show("Electronics AFTER +10%", db.products.find({ category: "electronics" }, { name: 1, price: 1, _id: 0 }).limit(3));

// $addToSet adds "sale" only if not already present (running twice won't duplicate it).
const target = db.products.findOne({ category: "books" });
show("Target product for $addToSet", target);
show("updateOne $addToSet 'sale'", db.products.updateOne({ _id: target._id }, { $addToSet: { tags: "sale" } }));
show("updateOne $addToSet 'sale' again (modifiedCount should be 0)", db.products.updateOne({ _id: target._id }, { $addToSet: { tags: "sale" } }));
show("Target after", db.products.findOne({ _id: target._id }, { name: 1, tags: 1 }));

// ---------- 5. Upsert stock quantity ----------

// A unique index on productId protects against duplicate upserts under concurrency (see self-check Q3).
show("createIndex stock.productId unique", db.stock.createIndex({ productId: 1 }, { unique: true }));

// First call: no matching doc -> inserted (look at upsertedId / upsertedCount).
show("Upsert #1 (insert)", db.stock.updateOne({ productId: target._id }, { $set: { quantity: 42 } }, { upsert: true }));
// Second call: doc now exists -> plain update (matchedCount 1, no upsertedId).
show("Upsert #2 (update)", db.stock.updateOne({ productId: target._id }, { $set: { quantity: 40 } }, { upsert: true }));
show("stock document", db.stock.find({ productId: target._id }));

// ---------- 6. Deletes with before/after counts ----------
show("Count 'discontinued' BEFORE", db.products.countDocuments({ category: "discontinued" }));
show("deleteMany discontinued", db.products.deleteMany({ category: "discontinued" }));
show("Count 'discontinued' AFTER (expect 0)", db.products.countDocuments({ category: "discontinued" }));
show("Total products now", db.products.countDocuments());
