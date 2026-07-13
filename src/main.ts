import { GameApp } from './app/GameApp';
import './ui/styles.css';

const appRoot = document.querySelector<HTMLElement>('#app');
if (!appRoot) {
  throw new Error('#app root missing');
}

const app = new GameApp(appRoot);

window.addEventListener('beforeunload', () => app.dispose());
