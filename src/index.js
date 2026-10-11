// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css'; 
import { registerSW } from './line/notify';
import { isDevtoolsOn, loadDevtools } from './line/DevToolsView';


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

registerSW();
if (isDevtoolsOn()) loadDevtools();
