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

  const table = await request('/tables', { method: 'POST', token: ownerToken, body: { name: `PUBLIC-PAGE-${suffix}`, capacity: 2, status: 'occupied' } });
  if (table.status !== 201) throw new Error(`Table creation failed: ${table.status}`);
  created.tableIds.push(table.payload.data._id);

  const category = await request('/menu/categories', { method: 'POST', token: ownerToken, body: { name: `PUBLIC-PAGE-${suffix}`, displayOrder: 999 } });
  if (category.status !== 201) throw new Error(`Category creation failed: ${category.status}`);
  created.categoryIds.push(category.payload.data._id);

  const createItem = async (name, price, isAvailable) => {
    const result = await request('/menu/items', { method: 'POST', token: ownerToken, body: { name, price, category: created.categoryIds[0], isAvailable } });
    if (result.status !== 201) throw new Error(`Menu item creation failed: ${result.status}`);
    created.menuItemIds.push(result.payload.data._id);
    return result.payload.data;
  };
  const firstItem = await createItem(`PUBLIC-PAGE-A-${suffix}`, 11.25, true);
  const secondItem = await createItem(`PUBLIC-PAGE-B-${suffix}`, 7.5, true);
  const unavailableItem = await createItem(`PUBLIC-PAGE-HIDDEN-${suffix}`, 99, false);

  const validTable = await request(`/public/table/${table.payload.data.publicToken}`);
  printResponse('valid_table', validTable);

  const publicMenu = await request('/public/menu');
  printResponse('public_menu', publicMenu);
  const returnedItemIds = new Set(publicMenu.payload.data.items.map((item) => item._id));
  console.log(`unavailable_item_returned=${returnedItemIds.has(unavailableItem._id)}`);
  if (returnedItemIds.has(unavailableItem._id)) throw new Error('Unavailable item was exposed by public menu');

  const orderPath = `/public/table/${table.payload.data.publicToken}/order`;
  const firstOrder = await request(orderPath, {
    method: 'POST',
    body: {
      customerSessionId,
      items: [
        { menuItem: firstItem._id, quantity: 2, notes: 'No onions', price: 0 },
        { menuItem: secondItem._id, quantity: 1, notes: '', price: 999999 },
      ],
    },
  });
  printResponse('first_public_order', firstOrder);
  if (firstOrder.payload?.data?.orderId) created.orderIds.push(firstOrder.payload.data.orderId);
  const expectedFirstTotal = firstItem.price * 2 + secondItem.price;
  console.log(`first_expected_total=${expectedFirstTotal}`);
  console.log(`first_server_total=${firstOrder.payload.data.totalAmount}`);
  if (firstOrder.status !== 201 || firstOrder.payload.data.totalAmount !== expectedFirstTotal) throw new Error('First public order did not use server menu prices');

  const secondOrder = await request(orderPath, {
    method: 'POST',
    body: { customerSessionId, items: [{ menuItem: secondItem._id, quantity: 2, price: 1 }] },
  });
  printResponse('second_public_order', secondOrder);
  const expectedSecondTotal = expectedFirstTotal + secondItem.price * 2;
  console.log(`second_expected_total=${expectedSecondTotal}`);
  console.log(`same_order_id=${secondOrder.payload.data.orderId === firstOrder.payload.data.orderId}`);
  if (secondOrder.status !== 200 || !secondOrder.payload.data.appended || secondOrder.payload.data.orderId !== firstOrder.payload.data.orderId || secondOrder.payload.data.totalAmount !== expectedSecondTotal) throw new Error('Second submission did not append correctly');

  const freeTable = await request(`/tables/${created.tableIds[0]}/status`, { method: 'PATCH', token: ownerToken, body: { status: 'free' } });
  if (freeTable.status !== 200) throw new Error(`Unable to free test table: ${freeTable.status}`);
  const freeTableOrder = await request(orderPath, { method: 'POST', body: { customerSessionId, items: [{ menuItem: firstItem._id, quantity: 1 }] } });
  printResponse('free_table_public_order', freeTableOrder);
  if (freeTableOrder.status !== 409) throw new Error(`Expected 409 for free table, got ${freeTableOrder.status}`);

  const invalidTable = await request('/public/table/this-is-not-a-real-public-token');
  printResponse('invalid_table', invalidTable);
  if (invalidTable.status !== 404) throw new Error(`Expected invalid token 404, got ${invalidTable.status}`);
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
