# KOMS setup guide for a new laptop

This guide starts the KOMS restaurant app after cloning the repository on another Windows laptop.

## 1. Install required software

Install these before cloning:

- [Node.js 20 LTS or newer](https://nodejs.org/). Node 24 also works.
- [Git](https://git-scm.com/download/win)
- A MongoDB Atlas account and database, or a local MongoDB server.

Open PowerShell and confirm Node and npm are available:

```powershell
node --version
npm --version
```

## 2. Clone the project

```powershell
git clone https://github.com/nabrajmahatara/KOMS-v1-staff-only-fully-tested.git
cd KOMS-v1-staff-only-fully-tested
```

If your clone folder has a different name, use that folder name in the `cd` command.

## 3. Install all dependencies

Run these three commands from the project root:

```powershell
npm install
npm install --prefix koms-backend
npm install --prefix koms-frontend
```

The root install provides the command that starts both apps together. The other two commands install the backend and frontend packages.

## 4. Create backend environment settings

Copy the backend example file:

```powershell
Copy-Item koms-backend\.env.example koms-backend\.env
```

Open `koms-backend\.env` in VS Code. Set these values:

```env
MONGO_URI=your_real_mongodb_connection_string
PORT=4000
JWT_SECRET=use_a_long_random_secret_here
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173,http://127.0.0.1:5173
NODE_ENV=development
DNS_SERVERS=8.8.8.8,8.8.4.4
```

For MongoDB Atlas:

1. Atlas → Database → Connect → Drivers.
2. Copy your connection string.
3. Replace the username, password, cluster, and database name values.
4. In Atlas Network Access, allow the new laptop's IP address. For local testing, `0.0.0.0/0` works but is less restrictive.

Do not commit `.env`. It contains secrets and is already ignored by Git.

## 5. Create frontend environment settings

Copy the frontend example file:

```powershell
Copy-Item koms-frontend\.env.example koms-frontend\.env
```

For normal laptop-only development, keep:

```env
VITE_API_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
VITE_PUBLIC_APP_URL=http://localhost:5173
```

## 6. Start the app

From the project root, run:

```powershell
npm run dev
```

This starts:

- Backend API: `http://localhost:4000`
- Frontend: `http://localhost:5173`

Open `http://localhost:5173` in the browser.

To stop both services, press `Ctrl + C` in the same PowerShell window.

## 7. Check that it works

Open these URLs:

- `http://localhost:4000/health` should return a healthy JSON response.
- `http://localhost:5173` opens the public restaurant homepage.
- `http://localhost:5173/login` opens staff login.

If the backend says MongoDB cannot connect, check `MONGO_URI`, Atlas Network Access, and your internet connection.

## 8. Use from a phone on the same Wi-Fi

Find the laptop Wi-Fi IPv4 address:

```powershell
ipconfig
```

Use the IPv4 address under `Wireless LAN adapter WiFi`. Example: `192.168.1.12`.

Update `koms-frontend\.env`:

```env
VITE_API_URL=http://YOUR_LAN_IP:4000/api
VITE_SOCKET_URL=http://YOUR_LAN_IP:4000
VITE_PUBLIC_APP_URL=http://YOUR_LAN_IP:5173
```

Update `koms-backend\.env`:

```env
CLIENT_URL=http://localhost:5173,http://127.0.0.1:5173,http://YOUR_LAN_IP:5173
```

Restart `npm run dev`, then open this on the phone:

```text
http://YOUR_LAN_IP:5173
```

Allow Node.js through the Windows Firewall on Private networks if Windows asks. The phone and laptop must use the same Wi-Fi network.

## 9. Menu image uploads

Images are stored locally in `koms-backend/uploads/menu/`.

- Supported formats: JPG, PNG, WebP, AVIF
- Maximum size: 5 MB
- This folder is intentionally ignored by Git.
- Copy this folder manually to another laptop if you need existing uploaded menu photos there.

## 10. Useful commands

```powershell
# Frontend production build and lint
npm run build --prefix koms-frontend
npm run lint --prefix koms-frontend

# Backend lint
npm run lint --prefix koms-backend

# See pending Git changes
git status
```
