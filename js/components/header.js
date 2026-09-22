import { Sidebar } from './sidebar.js';
import { formatDate } from '../lib/utils.js';

export const Header = {
    render: () => {
        const html = `
            <header style="
                background: white; 
                padding: 15px 20px; 
                box-shadow: 0 2px 5px rgba(0,0,0,0.05); 
                display: flex; 
                justify-content: space-between; 
                align-items: center;
                border-bottom: 1px solid #eee;
            ">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <button id="header-menu-btn" style="
                        background: none; 
                        border: none; 
                        font-size: 24px; 
                        cursor: pointer;
                        display: none;
                    ">☰</button>
                    <h2 id="header-title" style="margin: 0; font-size: 1.25rem; color: #333;">Punto de Venta</h2>
                </div>
                
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div id="header-clock" style="color: #666; font-size: 14px; display: none;"></div>
                    
                    <div id="header-sync-status" style="display: none; align-items: center; gap: 5px; color: #2196f3; font-size: 14px;">
                        <span class="spin-icon">↻</span> Sincronizando...
                    </div>
                    
                    <div id="header-online-status" style="display: flex; align-items: center; gap: 5px; font-size: 14px;">
                        <div id="online-dot" style="width: 10px; height: 10px; border-radius: 50%; background: #4caf50;"></div>
                        <span id="online-text">En línea</span>
                    </div>
                </div>
            </header>
            <style>
                @media (max-width: 768px) {
                    #header-menu-btn { display: block !important; }
                    #header-clock { display: none !important; }
                }
                @media (min-width: 769px) {
                    #header-clock { display: block !important; }
                }
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .spin-icon { display: inline-block; animation: spin 2s linear infinite; }
            </style>
        `;

        setTimeout(() => {
            const menuBtn = document.getElementById('header-menu-btn');
            if (menuBtn) {
                menuBtn.addEventListener('click', () => Sidebar.toggle());
            }

            Header.updateOnlineStatus(navigator.onLine);
            window.addEventListener('online', () => Header.updateOnlineStatus(true));
            window.addEventListener('offline', () => Header.updateOnlineStatus(false));

            Header.updateClock();
            setInterval(() => Header.updateClock(), 60000);
        }, 0);

        return html;
    },

    setTitle: (title) => {
        const el = document.getElementById('header-title');
        if (el) el.textContent = title;
    },

    setSyncStatus: (syncing) => {
        const el = document.getElementById('header-sync-status');
        if (el) {
            el.style.display = syncing ? 'flex' : 'none';
        }
    },

    updateOnlineStatus: (isOnline) => {
        const dot = document.getElementById('online-dot');
        const text = document.getElementById('online-text');
        if (dot && text) {
            if (isOnline) {
                dot.style.background = '#4caf50';
                text.textContent = 'En línea';
            } else {
                dot.style.background = '#f44336';
                text.textContent = 'Sin conexión';
            }
        }
    },

    updateClock: () => {
        const clock = document.getElementById('header-clock');
        if (clock) {
            clock.textContent = formatDate(new Date(), 'datetime');
        }
    }
};
