// Dev-only seed for testing the Claude connector (MCP) against a LOCAL API.
// Creates FICTIONAL test data through the normal API: one owner with two shops
// (so the shop picker shows), products, stock batches (one expired, one expiring
// soon), sales, a customer on credit, an open purchase order, and a restricted
// cashier. Refuses to run against anything but localhost.
//
//   node tools/mcp-dev-seed.mjs [http://localhost:5080]
//
// Test logins created here (local DB only, never real accounts):
//   owner   699000101 / demo-owner-2026   (CompanyAdmin of both demo shops)
//   cashier 699000102 / demo-cashier-2026 (Cashier, reports restricted)

const API = process.argv[2] ?? "http://localhost:5080";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) {
  console.error("Refusing to seed a non-local API:", API);
  process.exit(1);
}

const OWNER = { name: "Demo Owner", phone: "699000101", password: "demo-owner-2026" };
const CASHIER = { name: "Demo Cashier", phone: "699000102", password: "demo-cashier-2026" };
const device = () => crypto.randomUUID();

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString();

const reg = await call("POST", "/api/auth/register", { ...OWNER, deviceId: device(), deviceName: "seed", platform: 2 })
  .catch(async (e) => {
    if (!String(e).includes("409")) throw e;
    console.log("Owner already exists: data was seeded before. Nothing to do.");
    process.exit(0);
  });

async function createShop(name, mainLocationName) {
  const r = await call("POST", "/api/companies", {
    name, description: null, currency: "XAF", deviceId: device(), deviceName: "seed", platform: 2, mainLocationName,
  }, reg.token);
  return { id: r.company.id, token: r.admin.token, locationId: r.defaultLocation.id };
}

const shop = await createShop("Boutique Demo Akwa", "Akwa");
await createShop("Boutique Demo Bonamoussadi", "Bonamoussadi");
const c = `/api/companies/${shop.id}`;
const t = shop.token;

const supplier = await call("POST", `${c}/suppliers`, { name: "Grossiste Demo", contactPhone: "699000199", contactEmail: null }, t);

const productDefs = [
  { name: "Paracetamol 500 mg", barcode: "6000000000011", purchasePrice: 50, salePrice: 100, lowStockThreshold: 20 },
  { name: "Savon Demo 200 g", barcode: "6000000000028", purchasePrice: 300, salePrice: 500, lowStockThreshold: 10 },
  { name: "Riz parfumé 1 kg", barcode: "6000000000035", purchasePrice: 700, salePrice: 1000, lowStockThreshold: 15 },
  { name: "Lait en poudre 400 g", barcode: "6000000000042", purchasePrice: 1800, salePrice: 2500, lowStockThreshold: 5 },
  { name: "Huile 1 L", barcode: "6000000000059", purchasePrice: 1100, salePrice: 1500, lowStockThreshold: 10 },
];
const products = [];
for (const p of productDefs) {
  products.push(await call("POST", `${c}/products`, {
    ...p, categoryId: null, supplierId: supplier.id, taxRateOverridePercent: null, isFavorite: false, packagingLevels: [],
  }, t));
}

// Stock: [productIndex, batch, expiry offset in days, quantity]. Expiry tracking is on by
// default, so every batch needs a date.
const receipts = [
  [0, "PARA-01", 200, 120], [0, "PARA-02", 12, 30],   // one batch expiring soon
  [1, "SAV-01", 700, 8],                               // low stock (threshold 10)
  [2, "RIZ-01", 400, 60],
  [3, "LAIT-01", -5, 4], [3, "LAIT-02", 90, 10],       // one batch already expired
  // Huile: nothing received, so it shows as out of stock.
];
for (const [i, batchNumber, expiry, qty] of receipts) {
  await call("POST", `${c}/products/${products[i].id}/stock/receive`, {
    locationId: shop.locationId, batchNumber, expiryDate: expiry === null ? null : day(expiry),
    quantityInBaseUnits: qty, purchasePricePerBaseUnit: productDefs[i].purchasePrice,
  }, t);
}

const sale = (lines, paymentMethod, customerId = null) => call("POST", `${c}/sales`, {
  locationId: shop.locationId, customerId, paymentMethod,
  productLines: lines.map(([i, quantity]) => ({ productId: products[i].id, quantity, packagingLevelId: null })),
  serviceLines: null, paymentSplits: null,
}, t);
await sale([[0, 10], [2, 3]], 0);
await sale([[1, 2], [3, 1]], 1);
await sale([[2, 5]], 0);

const customer = await call("POST", `${c}/customers`, { name: "Client Demo Credit", phone: "699000150" }, t);
await sale([[3, 2], [0, 4]], 2, customer.id); // credit sale: the customer now owes the shop

await call("POST", `${c}/purchase-orders`, {
  locationId: shop.locationId, supplierId: supplier.id, notes: "Commande demo",
  lines: [{ productId: products[4].id, quantityOrdered: 24, unitCost: 1100 }, { productId: products[1].id, quantityOrdered: 20, unitCost: 300 }],
}, t);

const cashier = await call("POST", `${c}/users`, { ...CASHIER, role: 0 }, t);
const cashierId = cashier.id ?? cashier.userId ?? cashier.user?.id;
await call("PUT", `${c}/users/${cashierId}/permissions`, {
  restrictCatalog: false, restrictPurchasing: false, restrictCustomers: false,
  restrictReportsAndFullSales: true, restrictCashRegister: false, restrictGiftCards: false,
}, t);

console.log("Seeded demo shops for", OWNER.phone, "and restricted cashier", CASHIER.phone);
