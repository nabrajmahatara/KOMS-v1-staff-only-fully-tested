import dns from 'dns';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { io } from 'socket.io-client';
import Order from '../src/modules/order/order.model.js';
import User from '../src/modules/auth/user.model.js';
import Table from '../src/modules/table/table.model.js';
import MenuCategory from '../src/modules/menu/menu-category.model.js';
import MenuItem from '../src/modules/menu/menu-item.model.js';

dotenv.config();
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,8.8.4.4').split(',').map((server) => server.trim()));
const baseUrl = process.env.KOMS_API_URL || 'http://localhost:4000/api';
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const password = 'E2eTestingPass123!';
const ownerUsername = process.env.KOMS_TEST_OWNER_USERNAME;
const ownerPassword = process.env.KOMS_TEST_OWNER_PASSWORD;
// This run-local manifest is the only authority for cleanup. IDs are recorded
// immediately after each successful create operation; no cleanup uses names.
const created = { tableIds: [], orderIds: [], menuItemIds: [], categoryIds: [], userIds: [] };
const sockets = [];
const results = [];

function record(name, passed, detail = '') { results.push({ name, passed }); console.log(`${passed ? 'PASS' : 'FAIL'} - ${name}${detail ? `: ${detail}` : ''}`); }
function assert(value, message) { if (!value) throw new Error(message); }
function sessionId() { return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url'); }
async function request(path, { method = 'GET', token, body, apiBaseUrl = baseUrl } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let payload; try { payload = JSON.parse(text); } catch { payload = text; }
  return { status: response.status, payload };
}
function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl.replace('/api', ''), { auth: { token }, transports: ['websocket'], timeout: 5000 });
    sockets.push(socket); socket.once('connect', () => resolve(socket)); socket.once('connect_error', reject);
  });
}
function waitFor(socket, event, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const listener = (payload) => { if (!predicate(payload)) return; clearTimeout(timeout); socket.off(event, listener); resolve(payload); };
    const timeout = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timed out waiting for ${event}`)); }, timeoutMs);
    socket.on(event, listener);
  });
}
function expectNone(socket, event, predicate = () => true, waitMs = 500) {
  return new Promise((resolve, reject) => {
    const listener = (payload) => { if (!predicate(payload)) return; clearTimeout(timeout); socket.off(event, listener); reject(new Error(`Unexpected ${event}`)); };
    const timeout = setTimeout(() => { socket.off(event, listener); resolve(); }, waitMs);
    socket.on(event, listener);
  });
}
async function cleanup(token) {
  for (const id of created.orderIds) {
    const order = await request(`/orders/${id}`, { token });
    if (order.status === 200 && !['paid', 'cancelled'].includes(order.payload.data.status)) await request(`/orders/${id}/status`, { method: 'PATCH', token, body: { status: order.payload.data.status === 'served' ? 'paid' : 'cancelled' } });
  }
  for (const id of created.menuItemIds) await request(`/menu/items/${id}`, { method: 'DELETE', token });
  for (const id of created.categoryIds) await request(`/menu/categories/${id}`, { method: 'DELETE', token });
  for (const id of created.tableIds) {
    const table = await request(`/tables/${id}`, { token });
    if (table.status === 200 && table.payload.data.status !== 'free') await request(`/tables/${id}/status`, { method: 'PATCH', token, body: { status: 'free' } });
    await request(`/tables/${id}`, { method: 'DELETE', token });
  }
  // The app intentionally has no production hard-delete endpoint for orders
  // or staff. The harness therefore removes only the exact fixture IDs it
  // created through this direct, test-only database cleanup.
  if (created.orderIds.length) await Order.deleteMany({ _id: { $in: created.orderIds } });
  if (created.userIds.length) await User.deleteMany({ _id: { $in: created.userIds } });

  const count = async (Model, ids) => (ids.length ? Model.countDocuments({ _id: { $in: ids } }) : 0);
  const remaining = {
    tables: await count(Table, created.tableIds),
    orders: await count(Order, created.orderIds),
    menuItems: await count(MenuItem, created.menuItemIds),
    categories: await count(MenuCategory, created.categoryIds),
    users: await count(User, created.userIds),
  };
  console.log(`cleanup_verification=${JSON.stringify(remaining)}`);
  assert(Object.values(remaining).every((value) => value === 0), `Fixture cleanup left records behind: ${JSON.stringify(remaining)}`);
}

let ownerToken;
try {
  assert(ownerUsername && ownerPassword, 'Set KOMS_TEST_OWNER_USERNAME and KOMS_TEST_OWNER_PASSWORD');
  const ownerLogin = await request('/auth/login', { method: 'POST', body: { emailOrUsername: ownerUsername, password: ownerPassword } });
  assert(ownerLogin.status === 200 && ownerLogin.payload.data.user.role === 'owner', 'Configured test account must be an active owner');
  ownerToken = ownerLogin.payload.data.token;
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  record('Owner test account authenticated', true, '200');

  const createStaff = async (role, label) => {
    const username = `e2e_${label}_${suffix}`;
    const made = await request('/auth/create-staff', { method: 'POST', token: ownerToken, body: { username, email: `${username}@example.test`, password, role } });
    assert(made.status === 201, `create ${role}: ${made.status}`); created.userIds.push(made.payload.data._id);
    const login = await request('/auth/login', { method: 'POST', body: { emailOrUsername: username, password } });
    assert(login.status === 200, `${role} login: ${login.status}`); return { token: login.payload.data.token, id: made.payload.data._id };
  };
  const waiterA = await createStaff('waiter', 'waiter_a');
  const waiterB = await createStaff('waiter', 'waiter_b');
  const kitchenUser = await createStaff('kitchen_staff', 'kitchen');
  const cashierUser = await createStaff('cashier', 'cashier');
  record('Owner creates waiter, kitchen, and cashier test staff', true, '201');
  const deniedStaff = await request('/auth/create-staff', { method: 'POST', token: waiterA.token, body: { username: `e2e_denied_${suffix}`, email: `e2e_denied_${suffix}@example.test`, password, role: 'waiter' } });
  record('Waiter cannot create staff', deniedStaff.status === 403, String(deniedStaff.status));

  const lifecycle = await createStaff('waiter', 'lifecycle');
  const deactivate = await request(`/auth/staff/${lifecycle.id}/deactivate`, { method: 'PATCH', token: ownerToken });
  const inactive = await request('/auth/me', { token: lifecycle.token });
  record('Owner deactivates staff and stale JWT is blocked', deactivate.status === 200 && inactive.status === 401, `${deactivate.status}/${inactive.status}`);
  const waiterDeactivate = await request(`/auth/staff/${lifecycle.id}/deactivate`, { method: 'PATCH', token: waiterB.token });
  record('Waiter cannot deactivate staff', waiterDeactivate.status === 403, String(waiterDeactivate.status));
  const ownerDeactivate = await request(`/auth/staff/${ownerLogin.payload.data.user._id}/deactivate`, { method: 'PATCH', token: ownerToken });
  record('Owner cannot deactivate self', ownerDeactivate.status === 400, String(ownerDeactivate.status));
  const reactivate = await request(`/auth/staff/${lifecycle.id}/reactivate`, { method: 'PATCH', token: ownerToken });
  const active = await request('/auth/me', { token: lifecycle.token });
  record('Owner reactivates staff and JWT works again', reactivate.status === 200 && active.status === 200, `${reactivate.status}/${active.status}`);

  const category = await request('/menu/categories', { method: 'POST', token: ownerToken, body: { name: `E2E-${suffix}`, displayOrder: 999 } });
  assert(category.status === 201, `category: ${category.status}`); created.categoryIds.push(category.payload.data._id);
  const available = await request('/menu/items', { method: 'POST', token: ownerToken, body: { name: `E2E available ${suffix}`, price: 10, category: created.categoryIds[0], prepTimeMinutes: 5 } });
  const unavailable = await request('/menu/items', { method: 'POST', token: ownerToken, body: { name: `E2E unavailable ${suffix}`, price: 10, category: created.categoryIds[0], isAvailable: false } });
  assert(available.status === 201 && unavailable.status === 201, 'menu item creation failed'); created.menuItemIds.push(available.payload.data._id, unavailable.payload.data._id);
  const staffTable = await request('/tables', { method: 'POST', token: ownerToken, body: { name: `E2E-staff-${suffix}`, capacity: 2 } });
  assert(staffTable.status === 201, `staff table: ${staffTable.status}`); created.tableIds.push(staffTable.payload.data._id);
  record('Owner creates table and menu', true, '201');
  const deniedTable = await request('/tables', { method: 'POST', token: waiterA.token, body: { name: `Denied-${suffix}`, capacity: 2 } });
  const deniedCategory = await request('/menu/categories', { method: 'POST', token: waiterA.token, body: { name: `Denied-${suffix}` } });
  const deniedItem = await request('/menu/items', { method: 'POST', token: waiterA.token, body: { name: `Denied-${suffix}`, price: 1, category: created.categoryIds[0] } });
  record('Waiter management requests are denied', [deniedTable, deniedCategory, deniedItem].every((entry) => entry.status === 403), `${deniedTable.status}/${deniedCategory.status}/${deniedItem.status}`);

  const kitchenSocket = await connect(kitchenUser.token); const waiterSocket = await connect(waiterA.token); const waiterBSocket = await connect(waiterB.token); const cashierSocket = await connect(cashierUser.token);
  const events = { kitchenNew: [], kitchenUpdated: [], cashierUpdated: [], waiterReady: [], waiterItem: [], waiterBA: [], waiterAwaiting: [], waiterNotifications: [] };
  kitchenSocket.on('order:new', (order) => events.kitchenNew.push(order)); kitchenSocket.on('order:updated', (order) => events.kitchenUpdated.push(order));
  cashierSocket.on('order:updated', (order) => events.cashierUpdated.push(order)); waiterSocket.on('order:ready', (order) => events.waiterReady.push(order)); waiterSocket.on('order:itemUpdated', (order) => events.waiterItem.push(order)); waiterSocket.on('order:awaitingConfirmation', (order) => events.waiterAwaiting.push(order)); waiterSocket.on('notification:new', (notification) => events.waiterNotifications.push(notification)); waiterBSocket.on('order:ready', (order) => events.waiterBA.push(order));

  const staffOrderResponse = await request('/orders', { method: 'POST', token: waiterA.token, body: { table: staffTable.payload.data._id, items: [{ menuItem: available.payload.data._id, quantity: 1, notes: 'E2E' }] } });
  assert(staffOrderResponse.status === 201, `staff order: ${staffOrderResponse.status}`); const staffOrder = staffOrderResponse.payload.data; created.orderIds.push(staffOrder._id);
  await new Promise((resolve) => setTimeout(resolve, 250));
  record('Waiter creates order and kitchen receives order:new', events.kitchenNew.some((entry) => entry._id === staffOrder._id), '201');
  const waiterSkipItem = await request(`/orders/${staffOrder._id}/items/${staffOrder.items[0]._id}/status`, { method: 'PATCH', token: waiterA.token, body: { itemStatus: 'served' } });
  record('Waiter cannot skip a pending item straight to served', waiterSkipItem.status === 403, String(waiterSkipItem.status));
  const unavailableStaff = await request('/orders', { method: 'POST', token: waiterA.token, body: { table: staffTable.payload.data._id, items: [{ menuItem: unavailable.payload.data._id, quantity: 1 }] } });
  record('Staff order rejects unavailable menu item', unavailableStaff.status === 400, String(unavailableStaff.status));
  const itemId = staffOrder.items[0]._id;
  const preparing = await request(`/orders/${staffOrder._id}/items/${itemId}/status`, { method: 'PATCH', token: kitchenUser.token, body: { itemStatus: 'preparing' } });
  record('Kitchen updates item status', preparing.status === 200, String(preparing.status));
  const waiterItemDenied = await request(`/orders/${staffOrder._id}/items/${itemId}/status`, { method: 'PATCH', token: waiterA.token, body: { itemStatus: 'ready' } });
  record('Waiter cannot update item status', waiterItemDenied.status === 403, String(waiterItemDenied.status));
  const skip = await request(`/orders/${staffOrder._id}/status`, { method: 'PATCH', token: waiterA.token, body: { status: 'served' } });
  record('Skipped overall status is rejected', skip.status === 400, String(skip.status));
  assert((await request(`/orders/${staffOrder._id}/items/${itemId}/status`, { method: 'PATCH', token: kitchenUser.token, body: { itemStatus: 'ready' } })).status === 200, 'staff item ready failed');
  await new Promise((resolve) => setTimeout(resolve, 250));
  record('Socket delivery and ready notification reach only the owning waiter', events.waiterReady.some((entry) => entry._id === staffOrder._id) && events.waiterItem.some((entry) => entry.orderId === staffOrder._id) && events.waiterNotifications.some((entry) => entry.type === 'ORDER_READY' && entry.relatedOrder?.toString() === staffOrder._id.toString()) && events.waiterBA.length === 0 && events.kitchenUpdated.length >= 2, `kitchen=${events.kitchenUpdated.length}, waiter-ready=${events.waiterReady.length}, notifications=${events.waiterNotifications.length}, other-waiter=${events.waiterBA.length}`);
  const otherWaiterServe = await request(`/orders/${staffOrder._id}/items/${itemId}/status`, { method: 'PATCH', token: waiterB.token, body: { itemStatus: 'served' } });
  record('Different waiter cannot mark another waiter\'s ready item served', otherWaiterServe.status === 403, String(otherWaiterServe.status));
  const waiterServe = await request(`/orders/${staffOrder._id}/items/${itemId}/status`, { method: 'PATCH', token: waiterA.token, body: { itemStatus: 'served' } });
  record('Assigned waiter marks a ready item served and auto-advances order', waiterServe.status === 200 && waiterServe.payload.data.status === 'served' && waiterServe.payload.data.items.every((entry) => entry.itemStatus === 'served'), `${waiterServe.status}/${waiterServe.payload.data.status}`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  record('Cashier receives waiter-served order update', events.cashierUpdated.some((entry) => entry._id === staffOrder._id && entry.status === 'served'), `served-events=${events.cashierUpdated.filter((entry) => entry.status === 'served').length}`);
  assert((await request(`/orders/${staffOrder._id}/status`, { method: 'PATCH', token: cashierUser.token, body: { status: 'paid' } })).status === 200, 'staff order paid failed');
  const singleTable = await request(`/tables/${staffTable.payload.data._id}`, { token: ownerToken });
  record('Payment releases a single-ticket table', singleTable.payload.data.status === 'free', singleTable.payload.data.status);

  const kitchenServeOrderResponse = await request('/orders', { method: 'POST', token: waiterA.token, body: { table: staffTable.payload.data._id, items: [{ menuItem: available.payload.data._id, quantity: 1, notes: 'Kitchen serves this' }] } });
  assert(kitchenServeOrderResponse.status === 201, `kitchen-serve order: ${kitchenServeOrderResponse.status}`);
  const kitchenServeOrder = kitchenServeOrderResponse.payload.data;
  created.orderIds.push(kitchenServeOrder._id);
  const kitchenServeItemId = kitchenServeOrder.items[0]._id;
  assert((await request(`/orders/${kitchenServeOrder._id}/items/${kitchenServeItemId}/status`, { method: 'PATCH', token: kitchenUser.token, body: { itemStatus: 'preparing' } })).status === 200, 'kitchen preparing failed');
  assert((await request(`/orders/${kitchenServeOrder._id}/items/${kitchenServeItemId}/status`, { method: 'PATCH', token: kitchenUser.token, body: { itemStatus: 'ready' } })).status === 200, 'kitchen ready failed');
  const kitchenServe = await request(`/orders/${kitchenServeOrder._id}/items/${kitchenServeItemId}/status`, { method: 'PATCH', token: kitchenUser.token, body: { itemStatus: 'served' } });
  record('Kitchen staff can still mark a ready item served', kitchenServe.status === 200 && kitchenServe.payload.data.status === 'served', `${kitchenServe.status}/${kitchenServe.payload.data.status}`);
  assert((await request(`/orders/${kitchenServeOrder._id}/status`, { method: 'PATCH', token: cashierUser.token, body: { status: 'paid' } })).status === 200, 'kitchen-served order payment failed');

  const publicTable = await request('/tables', { method: 'POST', token: ownerToken, body: { name: `E2E-public-${suffix}`, capacity: 2, status: 'occupied' } });
  assert(publicTable.status === 201, `public table: ${publicTable.status}`); created.tableIds.push(publicTable.payload.data._id); const path = `/public/table/${publicTable.payload.data.publicToken}/order`;
  record('Public invalid table token returns 404', (await request('/public/table/not-a-real-public-token')).status === 404, '404');
  const unavailablePublic = await request(path, { method: 'POST', body: { customerSessionId: sessionId(), items: [{ menuItem: unavailable.payload.data._id, quantity: 1 }] } });
  record('Public order rejects unavailable menu item', unavailablePublic.status === 400, String(unavailablePublic.status));

  const tableIdPublic = await request('/tables', { method: 'POST', token: ownerToken, body: { name: `E2E-public-id-${suffix}`, capacity: 2, status: 'occupied' } });
  assert(tableIdPublic.status === 201, `table-ID public table: ${tableIdPublic.status}`);
  created.tableIds.push(tableIdPublic.payload.data._id);
  const tableIdPath = `/public/tables/${tableIdPublic.payload.data._id}/order`;
  const occupiedTables = await request('/public/tables/occupied');
  const listedTable = occupiedTables.payload?.data?.find((table) => table._id === tableIdPublic.payload.data._id);
  record('Public occupied-table list exposes only occupied table IDs and names', occupiedTables.status === 200 && listedTable && Object.keys(listedTable).every((key) => ['_id', 'name'].includes(key)), `${occupiedTables.status}/${JSON.stringify(listedTable)}`);

  const tableIdSession = sessionId();
  const tableIdAwait = waitFor(waiterSocket, 'order:awaitingConfirmation');
  const tableIdNoKitchen = expectNone(kitchenSocket, 'order:new', (order) => order.table?._id === tableIdPublic.payload.data._id || order.table === tableIdPublic.payload.data._id);
  const tableIdFirst = await request(tableIdPath, { method: 'POST', body: { customerSessionId: tableIdSession, items: [{ menuItem: available.payload.data._id, quantity: 2, price: 999999 }] } });
  assert(tableIdFirst.status === 201, `table-ID first order: ${tableIdFirst.status}`);
  const tableIdFirstId = tableIdFirst.payload.data.orderId;
  created.orderIds.push(tableIdFirstId);
  const tableIdAwaitedOrder = await tableIdAwait;
  await tableIdNoKitchen;
  record('Token-free customer order requires an occupied table and ignores client price', tableIdFirst.payload.data.totalAmount === 20 && tableIdAwaitedOrder._id === tableIdFirstId, `${tableIdFirst.status}/total=${tableIdFirst.payload.data.totalAmount}`);

  const tableIdAppend = await request(tableIdPath, { method: 'POST', body: { customerSessionId: tableIdSession, items: [{ menuItem: available.payload.data._id, quantity: 1, price: 0 }] } });
  record('Token-free repeated submission appends to the same awaiting ticket', tableIdAppend.status === 200 && tableIdAppend.payload.data.appended && tableIdAppend.payload.data.orderId === tableIdFirstId && tableIdAppend.payload.data.totalAmount === 30, `${tableIdAppend.status}/total=${tableIdAppend.payload.data.totalAmount}`);

  const tableIdKitchenConfirmed = waitFor(kitchenSocket, 'order:new', (order) => order._id === tableIdFirstId);
  const tableIdConfirm = await request(`/orders/${tableIdFirstId}/customer-confirmation`, { method: 'PATCH', token: waiterA.token, body: { action: 'confirm' } });
  await tableIdKitchenConfirmed;
  record('Token-free confirmation assigns waiter and emits kitchen order:new', tableIdConfirm.status === 200 && tableIdConfirm.payload.data.status === 'pending' && tableIdConfirm.payload.data.waiter?._id === waiterA.id, `${tableIdConfirm.status}/${tableIdConfirm.payload.data.status}`);

  const tableIdNew = await request(tableIdPath, { method: 'POST', body: { customerSessionId: tableIdSession, items: [{ menuItem: available.payload.data._id, quantity: 1 }] } });
  assert(tableIdNew.status === 201, `table-ID post-confirmation order: ${tableIdNew.status}`);
  const tableIdSecondId = tableIdNew.payload.data.orderId;
  created.orderIds.push(tableIdSecondId);
  record('Token-free submission after confirmation creates a new ticket', tableIdSecondId !== tableIdFirstId && !tableIdNew.payload.data.appended, `${tableIdFirstId}/${tableIdSecondId}`);

  assert((await request(`/orders/${tableIdFirstId}/status`, { method: 'PATCH', token: waiterA.token, body: { status: 'cancelled' } })).status === 200, 'table-ID first ticket cancellation failed');
  assert((await request(`/orders/${tableIdSecondId}/customer-confirmation`, { method: 'PATCH', token: waiterA.token, body: { action: 'reject', rejectionReason: 'E2E cleanup' } })).status === 200, 'table-ID second ticket rejection failed');
  const tableIdFree = await request(tableIdPath, { method: 'POST', body: { customerSessionId: sessionId(), items: [{ menuItem: available.payload.data._id, quantity: 1 }] } });
  assert((await request(`/tables/${tableIdPublic.payload.data._id}/status`, { method: 'PATCH', token: ownerToken, body: { status: 'reserved' } })).status === 200, 'table-ID reserve failed');
  const tableIdReserved = await request(tableIdPath, { method: 'POST', body: { customerSessionId: sessionId(), items: [{ menuItem: available.payload.data._id, quantity: 1 }] } });
  record('Token-free public order rejects free and reserved tables', tableIdFree.status === 409 && tableIdReserved.status === 409, `${tableIdFree.status}/${tableIdReserved.status}`);

  const reportBefore = await request('/reports/today', { token: ownerToken }); assert(reportBefore.status === 200, 'baseline report failed');
  const customerSession = sessionId(); const awaitEvent = waitFor(waiterSocket, 'order:awaitingConfirmation'); const noKitchen = expectNone(kitchenSocket, 'order:new');
  const firstPublic = await request(path, { method: 'POST', body: { customerSessionId: customerSession, items: [{ menuItem: available.payload.data._id, quantity: 2, notes: 'No onions', price: 999999 }] } });
  assert(firstPublic.status === 201, `first public: ${firstPublic.status}`); const firstId = firstPublic.payload.data.orderId; created.orderIds.push(firstId); const firstEvent = await awaitEvent; await noKitchen;
  record('Customer order does not emit order:new to kitchen', firstEvent._id === firstId, `order=${firstId}`);
  record('Waiter queue receives order:awaitingConfirmation', events.waiterAwaiting.some((entry) => entry._id === firstId), `events=${events.waiterAwaiting.length}`);
  record('Client-supplied price is ignored and server recalculates', firstPublic.payload.data.totalAmount === 20, `total=${firstPublic.payload.data.totalAmount}`);
  const appendEvent = waitFor(waiterSocket, 'order:awaitingConfirmation', (entry) => entry._id === firstId);
  const appended = await request(path, { method: 'POST', body: { customerSessionId: customerSession, items: [{ menuItem: available.payload.data._id, quantity: 1, price: 0 }] } }); await appendEvent;
  record('Repeated customer submission appends to same awaiting ticket', appended.status === 200 && appended.payload.data.appended && appended.payload.data.orderId === firstId && appended.payload.data.totalAmount === 30, `${appended.status}/total=${appended.payload.data.totalAmount}`);
  const kitchenConfirmed = waitFor(kitchenSocket, 'order:new', (entry) => entry._id === firstId);
  const confirmed = await request(`/orders/${firstId}/customer-confirmation`, { method: 'PATCH', token: waiterA.token, body: { action: 'confirm' } }); await kitchenConfirmed;
  record('Waiter confirmation assigns waiter and emits kitchen order:new', confirmed.status === 200 && confirmed.payload.data.status === 'pending' && confirmed.payload.data.waiter?.role === 'waiter', `${confirmed.status}/${confirmed.payload.data.status}`);
  const secondEvent = waitFor(waiterSocket, 'order:awaitingConfirmation');
  const afterConfirmation = await request(path, { method: 'POST', body: { customerSessionId: customerSession, items: [{ menuItem: available.payload.data._id, quantity: 1 }] } });
  assert(afterConfirmation.status === 201, `post-confirmation submit: ${afterConfirmation.status}`); const secondId = afterConfirmation.payload.data.orderId; created.orderIds.push(secondId); const secondTicket = await secondEvent;
  record('Submission after confirmation creates a new awaiting ticket', secondId !== firstId && secondTicket._id === secondId && !afterConfirmation.payload.data.appended, `first=${firstId}, second=${secondId}`);
  const reportAwaiting = await request('/reports/today', { token: ownerToken }); const keys = ['awaiting_confirmation', 'pending', 'confirmed', 'preparing', 'ready', 'served', 'paid', 'cancelled'];
  record('Report includes awaiting_confirmation and all existing status keys', reportAwaiting.status === 200 && keys.every((key) => Object.hasOwn(reportAwaiting.payload.data.ordersByStatus, key)) && reportAwaiting.payload.data.ordersByStatus.awaiting_confirmation === reportBefore.payload.data.ordersByStatus.awaiting_confirmation + 1, `awaiting=${reportAwaiting.payload.data.ordersByStatus.awaiting_confirmation}`);

  assert((await request(`/orders/${firstId}/status`, { method: 'PATCH', token: waiterA.token, body: { status: 'cancelled' } })).status === 200, 'first customer ticket cancellation failed');
  const afterFirstCancelled = await request(`/tables/${publicTable.payload.data._id}`, { token: ownerToken });
  record('Cancelling one ticket on a multi-ticket table does not free it prematurely', afterFirstCancelled.payload.data.status === 'occupied', afterFirstCancelled.payload.data.status);
  assert((await request(`/orders/${secondId}/customer-confirmation`, { method: 'PATCH', token: waiterA.token, body: { action: 'reject', rejectionReason: 'E2E cleanup' } })).status === 200, 'customer rejection failed');
  const afterCancel = await request(`/tables/${publicTable.payload.data._id}`, { token: ownerToken });
  record('Cancelling final ticket frees the multi-ticket table', afterCancel.payload.data.status === 'free', afterCancel.payload.data.status);
  const qrAutoClaim = await request(path, { method: 'POST', body: { customerSessionId: sessionId(), items: [{ menuItem: available.payload.data._id, quantity: 1 }] } });
  assert(qrAutoClaim.status === 201, `QR auto-claim: ${qrAutoClaim.status}`);
  created.orderIds.push(qrAutoClaim.payload.data.orderId);
  const qrAutoClaimTable = await request(`/tables/${publicTable.payload.data._id}`, { token: ownerToken });
  record('QR order atomically claims a free table and creates its ticket', qrAutoClaimTable.payload.data.status === 'occupied' && qrAutoClaim.payload.data.status === 'awaiting_confirmation', `${qrAutoClaim.status}/${qrAutoClaimTable.payload.data.status}`);

  const qrReservedTable = await request('/tables', { method: 'POST', token: ownerToken, body: { name: `E2E-qr-reserved-${suffix}`, capacity: 2, status: 'reserved' } });
  assert(qrReservedTable.status === 201, `QR reserved table: ${qrReservedTable.status}`);
  created.tableIds.push(qrReservedTable.payload.data._id);
  const qrReservedResult = await request(`/public/table/${qrReservedTable.payload.data.publicToken}/order`, { method: 'POST', body: { customerSessionId: sessionId(), items: [{ menuItem: available.payload.data._id, quantity: 1 }] } });
  const qrReservedAfter = await request(`/tables/${qrReservedTable.payload.data._id}`, { token: ownerToken });
  record('QR order leaves a reserved table unchanged', qrReservedResult.status === 409 && qrReservedAfter.payload.data.status === 'reserved', `${qrReservedResult.status}/${qrReservedAfter.payload.data.status}`);

  const pickerFreeTable = await request('/tables', { method: 'POST', token: ownerToken, body: { name: `E2E-picker-free-${suffix}`, capacity: 2 } });
  assert(pickerFreeTable.status === 201, `picker free table: ${pickerFreeTable.status}`);
  created.tableIds.push(pickerFreeTable.payload.data._id);
  const pickerFreeResult = await request(`/public/tables/${pickerFreeTable.payload.data._id}/order`, { method: 'POST', body: { customerSessionId: sessionId(), items: [{ menuItem: available.payload.data._id, quantity: 1 }] } });
  const pickerFreeAfter = await request(`/tables/${pickerFreeTable.payload.data._id}`, { token: ownerToken });
  record('Table-picker path still rejects and does not claim a free table', pickerFreeResult.status === 409 && pickerFreeAfter.payload.data.status === 'free', `${pickerFreeResult.status}/${pickerFreeAfter.payload.data.status}`);

  const qrRaceTable = await request('/tables', { method: 'POST', token: ownerToken, body: { name: `E2E-qr-race-${suffix}`, capacity: 2 } });
  assert(qrRaceTable.status === 201, `QR race table: ${qrRaceTable.status}`);
  created.tableIds.push(qrRaceTable.payload.data._id);
  const qrRacePath = `/public/table/${qrRaceTable.payload.data.publicToken}/order`;
  const qrRaceSession = sessionId();
  const qrRaceBody = { customerSessionId: qrRaceSession, items: [{ menuItem: available.payload.data._id, quantity: 1 }] };
  const [qrRaceOne, qrRaceTwo] = await Promise.all([
    request(qrRacePath, { method: 'POST', body: qrRaceBody }),
    request(qrRacePath, { method: 'POST', body: qrRaceBody }),
  ]);
  const qrRaceIds = [...new Set([qrRaceOne.payload?.data?.orderId, qrRaceTwo.payload?.data?.orderId].filter(Boolean))];
  created.orderIds.push(...qrRaceIds);
  const qrRaceCount = await Order.countDocuments({ table: qrRaceTable.payload.data._id, source: 'customer', customerSessionId: qrRaceSession, status: 'awaiting_confirmation' });
  const qrRaceAfter = await request(`/tables/${qrRaceTable.payload.data._id}`, { token: ownerToken });
  record('Concurrent QR requests claim once and append to one awaiting ticket', qrRaceCount === 1 && qrRaceIds.length === 1 && [201, 200].includes(qrRaceOne.status) && [201, 200].includes(qrRaceTwo.status) && qrRaceAfter.payload.data.status === 'occupied', `${qrRaceOne.status}/${qrRaceTwo.status}/orders=${qrRaceCount}/table=${qrRaceAfter.payload.data.status}`);

  assert((await request(`/tables/${tableIdPublic.payload.data._id}/status`, { method: 'PATCH', token: ownerToken, body: { status: 'occupied' } })).status === 200, 'table-ID reoccupy failed');
  const rateLimitResponses = [];
  const rateLimitBaseUrl = baseUrl.replace('localhost', '127.0.0.1');
  for (let attempt = 0; attempt < 31; attempt += 1) rateLimitResponses.push(await request(tableIdPath, { method: 'POST', body: {}, apiBaseUrl: rateLimitBaseUrl }));
  const first429 = rateLimitResponses.findIndex((response) => response.status === 429) + 1;
  record('Token-free order endpoint enforces its 30-per-minute rate limit', first429 === 31 && rateLimitResponses.slice(0, -1).every((response) => response.status === 400), `statuses=${rateLimitResponses.map((response) => response.status).join(',')}`);
  record('Waiter is denied daily report', (await request('/reports/today', { token: waiterA.token })).status === 403, '403');
} catch (error) {
  record('Harness execution', false, error.message);
} finally {
  for (const socket of sockets) socket.disconnect();
  console.log(`cleanup_manifest=${JSON.stringify(created)}`);
  if (ownerToken) await cleanup(ownerToken);
  await mongoose.disconnect();
}
if (results.some((result) => !result.passed)) process.exitCode = 1;
