import http from 'http';
import app from './app';
import sequelize from './config/database';
import { attachPortalWs } from './services/portalWsService';
import { attachStaffWs } from './services/staffWsService';

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('✅ Models synced');
    }

    // Use http.createServer so we can attach WebSocket servers on the same port.
    // Each WS service checks the path and skips if it doesn't own it — order matters:
    //   /ws/portal — customer portal (token auth)
    //   /ws/staff  — staff mobile app (JWT auth)
    const httpServer = http.createServer(app);
    attachPortalWs(httpServer);
    attachStaffWs(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`🚀 RISO HUB API running on port ${PORT} [${process.env.NODE_ENV}]`);
      console.log(`🔌 Portal WebSocket: ws://localhost:${PORT}/ws/portal`);
      console.log(`🔌 Staff WebSocket:  ws://localhost:${PORT}/ws/staff`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();
