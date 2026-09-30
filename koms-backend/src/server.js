import dns from 'node:dns';
import http from 'http';
import app from './app.js';
import connectDB from './config/db.js';
import config from './config/env.js';
import { initSocket } from './config/socket.js';

async function start() {
  if (config.dnsServers.length) {
    dns.setServers(config.dnsServers);
  }
  await connectDB();

  const server = http.createServer(app);
  initSocket(server);

  server.listen(config.port, () => {
    console.log(`🚀 Server running on port ${config.port}`);
  });
}

start();
