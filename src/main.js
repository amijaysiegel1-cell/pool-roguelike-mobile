// Entry point.
import { App } from './app.js';

const app = new App(document.getElementById('app'));
globalThis.__app = app; // handy for debugging in the console
app.start();

if (!globalThis.__BUNDLED && 'serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.match(/^(localhost|127\.)/)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
