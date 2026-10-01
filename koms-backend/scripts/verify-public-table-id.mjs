import dotenv from 'dotenv';
import dns from 'dns';
import mongoose from 'mongoose';
import { io } from 'socket.io-client';
import Order from '../src/modules/order/order.model.js';
import User from '../src/modules/auth/user.model.js';

dotenv.config();
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,8.8.4.4').split(',').map((server) => server.trim()));
const baseUrl = process.env.KOMS_API_URL || 'http://localhost:4000/api';
const socketUrl = baseUrl.replace(/\/api$/, '');
const ownerUsername = process.env.KOMS_TEST_OWNER_USERNAME;
const ownerPassword = process.env.KOMS_TEST_OWNER_PASSWORD;
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const sessionId = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
const created = { tableIds: [], orderIds: [], menuItemIds: [], categoryIds: [], userIds: [] };

if (!ownerUsername || !ownerPassword) throw new Error('Set KOMS_TEST_OWNER_USERNAME and KOMS_TEST_OWNER_PASSWORD');

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let payload; try { payload = JSON.parse(text); } catch { payload = text; }
  return { status: response.status, payload };
}
function raw(label, response) { console.log(`${label}_status=${response.status}`); console.log(`${label}_body=${JSON.stringify(response.payload)}`); }
function waitFor(socket, event, predicate = () => true, ms = 5000) {
  return new Promise((resolve, reject) => {
    const listener = (payload) => { if (!predicate(payload)) return; clearTimeout(timeout); socket.off(event, listener); resolve(payload); };
    const timeout = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timed out waiting for ${event}`)); }, ms);
    socket.on(event, listener);
  });
}
function expectNone(socket, event, predicate = () => true, ms = 500) {
  return new Promise((resolve, reject) => {
    const listener = (payload) => { if (!predicate(payload)) return; clearTimeout(timeout); socket.off(event, listener); reject(new Error(`Unexpected ${event}`)); };
    const timeout = setTimeout(() => { socket.off(event, listener); resolve(); }, ms);
    socket.on(event, listener);
  });
}
async function connect(token) {
  const socket = io(socketUrl, { auth: { token }, transports: ['websocket'] });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}

let ownerToken; let waiterSocket; let kitchenSocket; let waiterToken;
try {
  const login = await request('/auth/login', { method: 'POST', body: { emailOrUsername: ownerUsername, password: ownerPassword } });
  if (login.status !== 200) throw new Error(`Owner login failed: ${login.status}`);
  ownerToken = login.payload.data.token;
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const makeStaff = async (role) => {
    const username = `e2e_public_id_${role}_${suffix}`;
    const createdStaff = await request('/auth/create-staff', { method: 'POST', token: ownerToken, body: { username, email: `${username}@example.test`, password: 'E2ePass!234', role } });
    if (createdStaff.status !== 201) throw new Error(`Staff creation failed: ${createdStaff.status}`);
    created.userIds.push(createdStaff.payload.data._id);
    const staffLogin = await request('/auth/login', { method: 'POST', body: { emailOrUsername: username, password: 'E2ePass!234' } });
    return staffLogin.payload.data.token;
  };
  waiterToken = await makeStaff('waiter'); const kitchenToken = await makeStaff('kitchen_staff');
  waiterSocket = await connect(waiterToken); kitchenSocket = await connect(kitchenToken);

  const makeTable = async (name, status) => {
    const response = await request('/tables', { method: 'POST', token: ownerToken, body: { name, capacity: 2, status } });
    if (response.status !== 201) throw new Error(`Table creation failed: ${response.status}`);
    created.tableIds.push(response.payload.data._id); return response.payload.data;
  };
  const occupied = await makeTable(`PUBLIC-ID-OCC-${suffix}`, 'occupied');
  const free = await makeTable(`PUBLIC-ID-FREE-${suffix}`, 'free');
  const reserved = await makeTable(`PUBLIC-ID-RES-${suffix}`, 'reserved');
  const category = await request('/menu/categories', { method: 'POST', token: ownerToken, body: { name: `PUBLIC-ID-${suffix}`, displayOrder: 999 } });
  if (category.status !== 201) throw new Error(`Category creation failed: ${category.status}`);
  created.categoryIds.push(category.payload.data._id);
  const makeItem = async (name, price, isAvailable) => {
    const result = await request('/menu/items', { method: 'POST', token: ownerToken, body: { name, price, category: created.categoryIds[0], isAvailable } });
    if (result.status !== 201) throw new Error(`Item creation failed: ${result.status}`);
    created.menuItemIds.push(result.payload.data._id); return result.payload.data;
  };
  const firstItem = await makeItem(`PUBLIC-ID-A-${suffix}`, 11.25, true);
  const secondItem = await makeItem(`PUBLIC-ID-B-${suffix}`, 7.5, true);
  const unavailable = await makeItem(`PUBLIC-ID-HIDDEN-${suffix}`, 99, false);

  const listOccupied = await request('/public/tables/occupied'); raw('occupied_tables', listOccupied);
  console.log(`occupied_table_fields_only_id_name=${listOccupied.payload.data.every((table) => Object.keys(table).every((key) => ['_id', 'name'].includes(key)))}`);
  const path = `/public/tables/${occupied._id}/order`;
  const waiterEvent = waitFor(waiterSocket, 'order:awaitingConfirmation');
  const noKitchen = expectNone(kitchenSocket, 'order:new');
  const firstOrder = await request(path, { method: 'POST', body: { customerSessionId: sessionId, items: [{ menuItem: firstItem._id, quantity: 2, price: 0 }, { menuItem: secondItem._id, quantity: 1, price: 999999 }] } });
  raw('successful_public_table_order', firstOrder); const firstId = firstOrder.payload.data.orderId; created.orderIds.push(firstId);
  const firstEvent = await waiterEvent; await noKitchen;
  console.log(`waiter_received_awaiting_event=${firstEvent._id === firstId}`); console.log('kitchen_received_order_new_before_confirmation=false');
  console.log(`server_total=${firstOrder.payload.data.totalAmount}`); console.log('expected_total=30');

  const append = await request(path, { method: 'POST', body: { customerSessionId: sessionId, items: [{ menuItem: secondItem._id, quantity: 2, price: 1 }] } }); raw('append_same_awaiting_ticket', append);
  const kitchenAfterConfirm = waitFor(kitchenSocket, 'order:new', (order) => order._id === firstId);
  const confirm = await request(`/orders/${firstId}/customer-confirmation`, { method: 'PATCH', token: waiterToken, body: { action: 'confirm' } }); raw('confirm_ticket', confirm); await kitchenAfterConfirm; console.log(`kitchen_received_order_new_after_confirmation=${firstId}`);
  const newTicket = await request(path, { method: 'POST', body: { customerSessionId: sessionId, items: [{ menuItem: firstItem._id, quantity: 1 }] } }); raw('new_ticket_after_confirmation', newTicket); created.orderIds.push(newTicket.payload.data.orderId);

  const qrTable = await makeTable(`PUBLIC-ID-QR-${suffix}`, 'occupied');
  const qrSessionId = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
  const qrOrder = await request(`/public/table/${qrTable.publicToken}/order`, { method: 'POST', body: { customerSessionId: qrSessionId, items: [{ menuItem: firstItem._id, quantity: 1 }] } });
  raw('existing_qr_order', qrOrder); created.orderIds.push(qrOrder.payload.data.orderId);

  raw('free_table_order', await request(`/public/tables/${free._id}/order`, { method: 'POST', body: { customerSessionId: sessionId, items: [{ menuItem: firstItem._id, quantity: 1 }] } }));
  raw('reserved_table_order', await request(`/public/tables/${reserved._id}/order`, { method: 'POST', body: { customerSessionId: sessionId, items: [{ menuItem: firstItem._id, quantity: 1 }] } }));
  raw('bad_table_id_order', await request('/public/tables/not-a-valid-table-id/order', { method: 'POST', body: { customerSessionId: sessionId, items: [{ menuItem: firstItem._id, quantity: 1 }] } }));
  raw('unavailable_item_order', await request(path, { method: 'POST', body: { customerSessionId: `${sessionId}x`, items: [{ menuItem: unavailable._id, quantity: 1 }] } }));

  // The table-id endpoint permits 30 requests per minute per client IP. Seven
  // earlier requests in this run use that endpoint, so the 24th malformed
  // request below must be the first one rate-limited (31 requests total).
  const rateLimitResults = [];
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    rateLimitResults.push(await request(path, { method: 'POST', body: {} }));
  }
  const first429 = rateLimitResults.findIndex((result) => result.status === 429) + 1;
  console.log(`rate_limit_malformed_statuses=${rateLimitResults.map((result) => result.status).join(',')}`);
  console.log(`rate_limit_first_429_malformed_attempt=${first429}`);
  console.log(`rate_limit_429_body=${JSON.stringify(rateLimitResults.at(-1).payload)}`);
  if (first429 !== 24) throw new Error(`Expected the first 429 on malformed attempt 24, received ${first429 || 'none'}`);
} finally {
  waiterSocket?.disconnect(); kitchenSocket?.disconnect();
  console.log(`cleanup_manifest=${JSON.stringify(created)}`);
  if (created.orderIds.length && mongoose.connection.readyState === 1) await Order.deleteMany({ _id: { $in: created.orderIds } });
  for (const id of created.menuItemIds) await request(`/menu/items/${id}`, { method: 'DELETE', token: ownerToken });
  for (const id of created.categoryIds) await request(`/menu/categories/${id}`, { method: 'DELETE', token: ownerToken });
  for (const id of created.tableIds) {
    await request(`/tables/${id}/status`, { method: 'PATCH', token: ownerToken, body: { status: 'free' } });
    await request(`/tables/${id}`, { method: 'DELETE', token: ownerToken });
  }
  if (created.userIds.length && mongoose.connection.readyState === 1) await User.deleteMany({ _id: { $in: created.userIds } });
  await mongoose.disconnect();
}
