// =====================================================================
// Topic 7 — seed data: 50 users + 600 orders (nested items, orderDate)
// Run:  mongosh "$MONGO_URI/shop_db" --file topic7_seed.js
// Re-running drops and recreates users / orders / sessions.
// =====================================================================
db = db.getSiblingDB("shop_db");
db.users.drop(); db.orders.drop(); db.sessions.drop();

const rand = n => Math.floor(Math.random() * n);
const pick = arr => arr[rand(arr.length)];

const first = ["Anna", "Janis", "Liga", "Peteris", "Maria", "Omar", "Elena", "Karlis", "Sofia", "Ali"];
const last  = ["Berzins", "Ozola", "Kalnins", "Khan", "Petrova", "Lacis", "Smith", "Garcia", "Liepa", "Novak"];
const cities = ["Riga", "Jurmala", "Daugavpils", "Liepaja", "Tallinn", "Vilnius"];

const users = [];
for (let i = 0; i < 50; i++) {
  users.push({ _id: new ObjectId(), name: `${pick(first)} ${pick(last)}`, email: `user${i}@example.com`, city: pick(cities) });
}
db.users.insertMany(users);

const catalog = [
  { product: "Wireless Mouse", category: "electronics", price: 24.99 },
  { product: "Portable SSD", category: "electronics", price: 119.0 },
  { product: "Smartwatch", category: "electronics", price: 249.0 },
  { product: "Clean Code", category: "books", price: 34.5 },
  { product: "Dune", category: "books", price: 12.99 },
  { product: "Running Jacket", category: "clothing", price: 89.0 },
  { product: "Sneakers", category: "clothing", price: 110.0 },
  { product: "Coffee Grinder", category: "home", price: 59.0 },
  { product: "Air Purifier", category: "home", price: 179.0 },
  { product: "Yoga Mat", category: "sports", price: 29.0 },
  { product: "Bike Helmet", category: "sports", price: 65.0 },
  { product: "Board Game", category: "toys", price: 39.0 },
];

const now = Date.now();
const twoYears = 730 * 24 * 3600 * 1000;
const orders = [];
for (let i = 0; i < 600; i++) {
  const items = [];
  const n = 1 + rand(4);
  for (let j = 0; j < n; j++) {
    const c = pick(catalog);
    items.push({ product: c.product, category: c.category, price: c.price, qty: 1 + rand(3) });
  }
  const amount = Math.round(items.reduce((s, it) => s + it.price * it.qty, 0) * 100) / 100;
  // Skewed customer choice so some customers clearly order more (makes "top 5" meaningful).
  const customer = users[Math.floor(Math.pow(Math.random(), 2) * users.length)];
  orders.push({
    customerId: customer._id,
    orderDate: new Date(now - Math.random() * twoYears),   // spread over the last 2 years
    status: pick(["paid", "shipped", "delivered", "cancelled"]),
    items,
    amount,
  });
}
db.orders.insertMany(orders);

print(`users: ${db.users.countDocuments()}, orders: ${db.orders.countDocuments()}`);
printjson(db.orders.findOne());
