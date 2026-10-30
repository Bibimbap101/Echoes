import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { listen } from './sound.js';
import { applyPrefs } from './prefs.js';

applyPrefs();
listen();

createRoot(document.getElementById('root')).render(<App />);
