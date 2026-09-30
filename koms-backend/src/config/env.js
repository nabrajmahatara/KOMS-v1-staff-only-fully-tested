import dotenv from 'dotenv';
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const clientUrls = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const localViteOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

const required = ['MONGO_URI', 'JWT_SECRET'];
required.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`⚠️  Missing env variable: ${key} — check your .env file`);
  }
});

export default {
  port: process.env.PORT || 4000,
  nodeEnv,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrls,
  isAllowedClientOrigin(origin) {
    return (
      clientUrls.includes(origin) ||
      (nodeEnv !== 'production' && localViteOrigin.test(origin))
    );
  },
  dnsServers: (process.env.DNS_SERVERS || '8.8.8.8,8.8.4.4')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean),
};
