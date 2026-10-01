import dns from 'dns';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Table from '../src/modules/table/table.model.js';
import MenuCategory from '../src/modules/menu/menu-category.model.js';
import MenuItem from '../src/modules/menu/menu-item.model.js';
import Order from '../src/modules/order/order.model.js';

dotenv.config();
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,8.8.4.4').split(',').map((server) => server.trim()));

const baseUrl = process.env.KOMS_API_URL || 'http://localhost:4000/api';
const ownerUsername = process.env.KOMS_TEST_OWNER_USERNAME;
const ownerPassword = process.env.KOMS_TEST_OWNER_PASSWORD;
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const customerSessionId = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
const created = { tableIds: [], orderIds: [], menuItemIds: [], categoryIds: [], userIds: [] };
const statusKeys = ['awaiting_confirmation', 'pending', 'confirmed', 'preparing', 'ready', 'served', 'paid', 'cancelled'];

if (!ownerUsername || !ownerPassword) throw new Error('Set KOMS_TEST_OWNER_USERNAME and KOMS_TEST_OWNER_PASSWORD');

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = text; }
  return { status: response.status, payload };
}

function printResponse(label, response) {
  console.log(`${label}_status=${response.status}`);
  console.log(`${label}_body=${JSON.stringify(response.payload)}`);
}

let ownerToken;
try {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const login = await request('/auth/login', { method: 'POST', body: { emailOrUsername: ownerUsername, password: ownerPassword } });
  if (login.status !== 200) throw new Error(`Owner login failed: ${login.status}`);
  ownerToken = login.payload.data.token;

  const baseline = await request('/reports/today', { token: ownerToken });
  printResponse('baseline_report', baseline);
  if (baseline.status !== 200) throw new Error(`Baseline report failed: ${baseline.status}`);

  const table = await request('/tables', { method: 'POST', token: ownerToken, body: { name: `REPORT-AWAITING-${suffix}`, capacity: 2, status: 'occupied' } });
  if (table.status !== 201) throw new Error(`Table creation failed: ${table.status}`);
  created.tableIds.push(table.payload.data._id);
  const category = await request('/menu/categories', { method: 'POST', token: ownerToken, body: { name: `REPORT-AWAITING-${suffix}`, displayOrder: 999 } });
  if (category.status !== 201) throw new Error(`Category creation failed: ${category.status}`);
  created.categoryIds.push(category.payload.data._id);
  const item = await request('/menu/items', { method: 'POST', token: ownerToken, body: { name: `REPORT-AWAITING-ITEM-${suffix}`, price: 12.5, category: created.categoryIds[0] } });
  if (item.status !== 201) throw new Error(`Item creation failed: ${item.status}`);
  created.menuItemIds.push(item.payload.data._id);

  const publicOrder = await request(`/public/table/${table.payload.data.publicToken}/order`, {
    method: 'POST',
    body: { customerSessionId, items: [{ menuItem: created.menuItemIds[0], quantity: 1 }] },
  });
  printResponse('unconfirmed_customer_order', publicOrder);
  if (publicOrder.payload?.data?.orderId) created.orderIds.push(publicOrder.payload.data.orderId);
  if (publicOrder.status !== 201 || publicOrder.payload.data.status !== 'awaiting_confirmation') throw new Error('Customer order was not left awaiting confirmation');

  const report = await request('/reports/today', { token: ownerToken });
  printResponse('report_with_awaiting_order', report);
  if (report.status !== 200) throw new Error(`Report failed: ${report.status}`);
  const before = baseline.payload.data;
  const after = report.payload.data;
  const allKeysPresent = statusKeys.every((key) => Object.hasOwn(after.ordersByStatus, key));
  const sevenExistingStatusesUnchanged = statusKeys.filter((key) => key !== 'awaiting_confirmation').every((key) => before.ordersByStatus[key] === after.ordersByStatus[key]);
  console.log(`all_eight_status_keys_present=${allKeysPresent}`);
  console.log(`awaiting_confirmation_before=${before.ordersByStatus.awaiting_confirmation}`);
  console.log(`awaiting_confirmation_after=${after.ordersByStatus.awaiting_confirmation}`);
  console.log(`seven_existing_statuses_unchanged=${sevenExistingStatusesUnchanged}`);
  console.log(`total_orders_incremented_by_one=${after.totalOrders === before.totalOrders + 1}`);
  console.log(`paid_revenue_unchanged=${after.totalRevenue === before.totalRevenue}`);
  if (!allKeysPresent || after.ordersByStatus.awaiting_confirmation !== before.ordersByStatus.awaiting_confirmation + 1 || !sevenExistingStatusesUnchanged) throw new Error('Report status totals are incorrect');
} finally {
  console.log(`cleanup_manifest=${JSON.stringify(created)}`);
  if (created.orderIds.length) await Order.deleteMany({ _id: { $in: created.orderIds } });
  if (ownerToken) await Promise.all(created.menuItemIds.map((id) => request(`/menu/items/${id}`, { method: 'DELETE', token: ownerToken })));
  if (ownerToken) await Promise.all(created.categoryIds.map((id) => request(`/menu/categories/${id}`, { method: 'DELETE', token: ownerToken })));
  if (ownerToken) for (const id of created.tableIds) {
    await request(`/tables/${id}/status`, { method: 'PATCH', token: ownerToken, body: { status: 'free' } });
    await request(`/tables/${id}`, { method: 'DELETE', token: ownerToken });
  }
  await mongoose.disconnect();
}
