import dns from 'dns';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { io } from 'socket.io-client';
import Table from '../src/modules/table/table.model.js';
import MenuCategory from '../src/modules/menu/menu-category.model.js';
import MenuItem from '../src/modules/menu/menu-item.model.js';
import Order from '../src/modules/order/order.model.js';
import User from '../src/modules/auth/user.model.js';

dotenv.config();
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,8.8.4.4').split(',').map((server) => server.trim()));

const baseUrl = process.env.KOMS_API_URL || 'http://localhost:4000/api';
const socketUrl = baseUrl.replace(/\/api$/, '');
const ownerUsername = process.env.KOMS_TEST_OWNER_USERNAME;
const ownerPassword = process.env.KOMS_TEST_OWNER_PASSWORD;
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const created = { tableId: null, categoryId: null, itemId: null, users: [] };

if (!ownerUsername || !ownerPassword) {
  throw new Error('Set KOMS_TEST_OWNER_USERNAME and KOMS_TEST_OWNER_PASSWORD');
}

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

function waitForSocketEvent(socket, event, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const listener = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

function expectNoSocketEvent(socket, event, predicate, waitMs = 800) {
  return new Promise((resolve, reject) => {
    const listener = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(event, listener);
      reject(new Error(`Unexpected ${event} received`));
    };
    const timeout = setTimeout(() => {
      socket.off(event, listener);
      resolve();
    }, waitMs);
    socket.on(event, listener);
  });
}

async function connectSocket(token) {
  const socket = io(socketUrl, { auth: { token }, transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket connection timed out')), 5000);
    socket.once('connect', () => { clearTimeout(timeout); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timeout); reject(error); });
  });
  return socket;
}

let ownerToken;
let waiterSocket;
let kitchenSocket;
try {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const ownerLogin = await request('/auth/login', { method: 'POST', body: { emailOrUsername: ownerUsername, password: ownerPassword } });
  if (ownerLogin.status !== 200) throw new Error(`Owner login failed: ${ownerLogin.status}`);
  ownerToken = ownerLogin.payload.data.token;

  const createStaff = async (role) => {
    const username = `e2e_${role}_${suffix}`;
    const response = await request('/auth/create-staff', { method: 'POST', token: ownerToken, body: { username, email: `${username}@example.test`, password: 'E2ePass!234', role } });
    if (response.status !== 201) throw new Error(`${role} creation failed: ${response.status} ${JSON.stringify(response.payload)}`);
    created.users.push(response.payload.data._id);
    const login = await request('/auth/login', { method: 'POST', body: { emailOrUsername: username, password: 'E2ePass!234' } });
    if (login.status !== 200) throw new Error(`${role} login failed: ${login.status}`);
    return login.payload.data.token;
  };

  const waiterToken = await createStaff('waiter');
  const kitchenToken = await createStaff('kitchen_staff');
  waiterSocket = await connectSocket(waiterToken);
  kitchenSocket = await connectSocket(kitchenToken);

  const table = await request('/tables', { method: 'POST', token: ownerToken, body: { name: `REVIEW-${suffix}`, capacity: 2, status: 'occupied' } });
  if (table.status !== 201) throw new Error(`Table creation failed: ${table.status}`);
  created.tableId = table.payload.data._id;
  const category = await request('/menu/categories', { method: 'POST', token: ownerToken, body: { name: `REVIEW-${suffix}`, displayOrder: 999 } });
  if (category.status !== 201) throw new Error(`Category creation failed: ${category.status}`);
  created.categoryId = category.payload.data._id;
  const item = await request('/menu/items', { method: 'POST', token: ownerToken, body: { name: `REVIEW-ITEM-${suffix}`, price: 12, category: created.categoryId } });
  if (item.status !== 201) throw new Error(`Item creation failed: ${item.status}`);
  created.itemId = item.payload.data._id;

  const orderPath = `/public/table/${table.payload.data.publicToken}/order`;
  const firstAwaiting = waitForSocketEvent(waiterSocket, 'order:awaitingConfirmation');
  const noKitchenBeforeConfirmation = expectNoSocketEvent(kitchenSocket, 'order:new', () => true);
  const firstPublic = await request(orderPath, { method: 'POST', body: { customerSessionId: `review-session-${suffix}`, items: [{ menuItem: created.itemId, quantity: 1 }] } });
  if (firstPublic.status !== 201) throw new Error(`Public order failed: ${firstPublic.status}`);
  const awaitingOrder = await firstAwaiting;
  await noKitchenBeforeConfirmation;
  console.log(`waiter_awaiting_event_order=${awaitingOrder._id}`);
  console.log('kitchen_before_confirmation=false');

  const kitchenNew = waitForSocketEvent(kitchenSocket, 'order:new', (order) => order._id === awaitingOrder._id);
  const confirm = await request(`/orders/${awaitingOrder._id}/customer-confirmation`, { method: 'PATCH', token: waiterToken, body: { action: 'confirm' } });
  if (confirm.status !== 200 || confirm.payload.data.status !== 'pending') throw new Error(`Confirm failed: ${confirm.status} ${JSON.stringify(confirm.payload)}`);
  await kitchenNew;
  console.log(`confirm_status=${confirm.status}`);
  console.log(`kitchen_after_confirmation_order=${awaitingOrder._id}`);

  const secondAwaiting = waitForSocketEvent(waiterSocket, 'order:awaitingConfirmation');
  const secondPublic = await request(orderPath, { method: 'POST', body: { customerSessionId: `reject-session-${suffix}`, items: [{ menuItem: created.itemId, quantity: 1 }] } });
  if (secondPublic.status !== 201) throw new Error(`Second public order failed: ${secondPublic.status}`);
  const rejectedOrder = await secondAwaiting;
  const noKitchenAfterReject = expectNoSocketEvent(kitchenSocket, 'order:new', (order) => order._id === rejectedOrder._id);
  const reject = await request(`/orders/${rejectedOrder._id}/customer-confirmation`, { method: 'PATCH', token: waiterToken, body: { action: 'reject', rejectionReason: 'Test rejection' } });
  if (reject.status !== 200 || reject.payload.data.status !== 'cancelled') throw new Error(`Reject failed: ${reject.status} ${JSON.stringify(reject.payload)}`);
  await noKitchenAfterReject;
  console.log(`reject_status=${reject.status}`);
  console.log(`kitchen_after_rejection=false`);
} finally {
  waiterSocket?.disconnect();
  kitchenSocket?.disconnect();
  if (created.tableId) await Order.deleteMany({ table: created.tableId });
  if (created.itemId && ownerToken) await request(`/menu/items/${created.itemId}`, { method: 'DELETE', token: ownerToken });
  if (created.categoryId && ownerToken) await request(`/menu/categories/${created.categoryId}`, { method: 'DELETE', token: ownerToken });
  if (created.tableId && ownerToken) await request(`/tables/${created.tableId}`, { method: 'DELETE', token: ownerToken });
  if (created.users.length) await User.updateMany({ _id: { $in: created.users } }, { isActive: false });
  await mongoose.disconnect();
}
