import './style.css';
import { preload } from './ui/art';
import { App } from './ui/app';

preload();
const app = new App(document.getElementById('table')!);
void app.start();
// Handy for poking at the game from the console while developing.
if (import.meta.env.DEV) Object.assign(window, { app });

// Keeps a copy of the game so it plays offline (src/sw.ts); only in a build, not while developing.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(
    (registration) => {
      // An installed game can stay open for days; look for a new version each time it comes back.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) registration.update().catch(() => {});
      });
    },
    () => {},
  );
}
