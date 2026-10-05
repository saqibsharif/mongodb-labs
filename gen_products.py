#!/usr/bin/env python3
"""Topic 6 — generates products.json (55 products) for mongoimport --jsonArray."""
import json, random

random.seed(42)

CATALOG = {
    "electronics": ((20, 900), ["Wireless Mouse", "USB-C Hub", "Bluetooth Speaker", "Laptop Stand",
                                "Noise-Cancelling Headphones", "Webcam", "Mechanical Keyboard",
                                "Smartwatch", "Portable SSD", "Power Bank"]),
    "books": ((8, 60), ["Clean Code", "Designing Data-Intensive Applications", "The Pragmatic Programmer",
                        "Refactoring", "MongoDB: The Definitive Guide", "Atomic Habits", "Dune",
                        "Sapiens", "The Hobbit", "Deep Work"]),
    "clothing": ((10, 150), ["Running Jacket", "Wool Sweater", "Denim Jeans", "Rain Coat", "Hoodie",
                             "Sneakers", "Winter Gloves", "Beanie", "Polo Shirt", "Chino Pants"]),
    "home": ((5, 300), ["Coffee Grinder", "Desk Lamp", "Cast Iron Pan", "Throw Blanket", "Air Purifier",
                        "Kettle", "Plant Pot", "Wall Clock", "Cutting Board", "Bath Towel Set"]),
    "sports": ((10, 400), ["Yoga Mat", "Dumbbell Set", "Bike Helmet", "Tennis Racket", "Football",
                           "Jump Rope", "Resistance Bands", "Water Bottle", "Hiking Backpack", "Foam Roller"]),
    "discontinued": ((5, 100), ["MP3 Player", "DVD Box Set", "Fax Cartridge", "Floppy Disk Pack", "Pager"]),
}
TAGS = ["new", "bestseller", "eco", "gift", "premium", "budget", "limited", "imported"]

products = []
for category, ((lo, hi), names) in CATALOG.items():
    for name in names:
        products.append({
            "name": name,
            "price": round(random.uniform(lo, hi), 2),
            "category": category,
            "tags": random.sample(TAGS, k=random.randint(1, 3)),
            "stock": random.randint(0, 500),
        })

with open("products.json", "w") as f:
    json.dump(products, f, indent=2)
print(f"Wrote {len(products)} products to products.json")
