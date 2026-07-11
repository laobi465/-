import { store } from './store';
import { startScheduler } from './scheduler';
import { startTunnel } from './tunnel';
import { startApi } from './api';
import { detectRealIp, getRealIp } from './validator';
import { config } from './config';

async function main() {
  console.log('=== Proxy Pool Service starting ===');

  // Restore any previously persisted proxies.
  store.load();

  // Detect this server's public IP (for anonymity / leak detection).
  await detectRealIp();
  console.log(`real IP: ${getRealIp() ?? 'unknown (anonymity comparison disabled)'}`);

  // Begin the 5-minute refresh loop + 1-minute expiry sweep.
  startScheduler();

  // Start the rotating tunnel proxy that the dashboard advertises.
  startTunnel();
  console.log(`tunnel address: ${store.getTunnelInfo(getRealIp()).address}`);

  // Start the HTTP API + WebSocket for the frontend dashboard.
  startApi();

  console.log(`refresh interval: ${config.refreshIntervalMs / 60000} min`);
  console.log(`proxy TTL: ${config.proxyTtlMs / 60000} min (expired proxies auto-deleted)`);
  console.log('=== ready ===');
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
