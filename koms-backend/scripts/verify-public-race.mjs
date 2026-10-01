import dns from 'dns';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Table from '../src/modules/table/table.model.js';
import MenuCategory from '../src/modules/menu/menu-category.model.js';
import MenuItem from '../src/modules/menu/menu-item.model.js';
import Order, { AWAITING_CONFIRMATION } from '../src/modules/order/order.model.js';

dotenv.config();
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,8.8.4.4').split(',').map((server) => server.trim()));

const baseUrl = process.env.KOMS_API_URL || 'http://localhost:4000/api';
const ownerUsername = process.env.KOMS_TEST_OWNER_USERNAME;
const ownerPassword = process.env.KOMS_TEST_OWNER_PASSWORD;
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const sessionId = `customer-session-${suffix}`;
const unavailableSessionId = `unavailable-session-${suffix}`;
const created = { tableIds: [], orderIds: [], menuItemIds: [], categoryIds: [], userIds: [] };

if (!ownerUsername || !ownerPassword) {
  throw new Error('Set KOMS_TEST_OWNER_USERNAME and KOMS_TEST_OWNER_PASSWORD');
}

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

function printRaw(label, response) {
  console.log(`${label}_status=${response.status}`);
  console.log(`${label}_body=${JSON.stringify(response.payload)}`);
}

let ownerToken;
try {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const login = await request('/auth/login', {
    method: 'POST',
    body: { emailOrUsername: ownerUsername, password: ownerPassword },
  });
  if (login.status !== 200) throw new Error(`Owner login failed: ${login.status}`);
  ownerToken = login.payload.data.token;

  const table = await request('/tables', {
    method: 'POST', token: ownerToken,
    body: { name: `PUBLIC-RACE-${suffix}`, capacity: 2, status: 'occupied' },
  });
  if (table.status !== 201) throw new Error(`Table creation failed: ${table.status}`);
  created.tableIds.push(table.payload.data._id);

  const category = await request('/menu/categories', {
    method: 'POST', token: ownerToken,
    body: { name: `PUBLIC-RACE-${suffix}`, displayOrder: 999 },
  });
  if (category.status !== 201) throw new Error(`Category creation failed: ${category.status}`);
  created.categoryIds.push(category.payload.data._id);

  const item = await request('/menu/items', {
    method: 'POST', token: ownerToken,
    body: { name: `PUBLIC-RACE-ITEM-${suffix}`, price: 17.25, category: created.categoryIds[0] },
  });
  if (item.status !== 201) throw new Error(`Item creation failed: ${item.status}`);
  created.menuItemIds.push(item.payload.data._id);

  const orderPath = `/public/table/${table.payload.data.publicToken}/order`;
  const concurrentBody = {
    customerSessionId: sessionId,
    items: [{ menuItem: created.menuItemIds[0], quantity: 1, notes: 'Race test', price: 0 }],
  };
  const [first, second] = await Promise.all([
    request(orderPath, { method: 'POST', body: concurrentBody }),
    request(orderPath, { method: 'POST', body: concurrentBody }),
  ]);
  printRaw('race_response_1', first);
  printRaw('race_response_2', second);
  for (const response of [first, second]) {
    const orderId = response.payload?.data?.orderId;
    if (orderId && !created.orderIds.includes(orderId)) created.orderIds.push(orderId);
  }

  const matchingOrders = await Order.find({
    table: created.tableIds[0],
    customerSessionId: sessionId,
    status: AWAITING_CONFIRMATION,
  }).select('_id status totalAmount items').lean();
  console.log(`race_database_count=${matchingOrders.length}`);
  console.log(`race_database_orders=${JSON.stringify(matchingOrders.map((order) => ({ id: order._id, status: order.status, totalAmount: order.totalAmount, itemCount: order.items.length })))}`);
  if (matchingOrders.length !== 1) throw new Error(`Expected one awaiting ticket, found ${matchingOrders.length}`);

  const unavailableToggle = await request(`/menu/items/${created.menuItemIds[0]}/availability`, {
    method: 'PATCH', token: ownerToken, body: { isAvailable: false },
  });
  if (unavailableToggle.status !== 200) throw new Error(`Availability disable failed: ${unavailableToggle.status}`);
  const unavailableResponse = await request(orderPath, {
    method: 'POST',
    body: {
      customerSessionId: unavailableSessionId,
      items: [{ menuItem: created.menuItemIds[0], quantity: 1, price: 0 }],
    },
  });
  printRaw('unavailable_response', unavailableResponse);
  if (unavailableResponse.status !== 400) throw new Error(`Expected unavailable item 400, got ${unavailableResponse.status}`);

  const availableAgain = await request(`/menu/items/${created.menuItemIds[0]}/availability`, {
    method: 'PATCH', token: ownerToken, body: { isAvailable: true },
  });
  if (availableAgain.status !== 200) throw new Error(`Availability restore failed: ${availableAgain.status}`);
  console.log('availability_restored=true');
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
