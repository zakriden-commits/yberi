import './style.css';
import { Game } from './game/game';
import type { GameSnapshot } from './game/game';

declare global {
  interface Window { __YBERI__?: { snapshot: () => GameSnapshot } }
}

function showError(error: unknown): void {
  console.error('Unable to start the scene:', error);
  document.getElementById('error-screen')!.hidden = false;
  document.body.dataset.state = 'error';
}

try {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = new Game(canvas);
  if (import.meta.env.DEV) window.__YBERI__ = { snapshot: () => game.snapshot() };
  window.addEventListener('pagehide', (event) => { if (!event.persisted) game.dispose(); });
} catch (error) { showError(error); }
