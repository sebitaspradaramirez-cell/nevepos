import { hasPermission, logout } from '../lib/auth.js';

export const Sidebar = {
    render: (user) => {
        if (!user) return '';

        const items = [
            { path: '#/pos', icon: '🛒', label: 'Punto de Venta', always: true },
            { path: '#/caja', icon: '💰', label: 'Caja', perm: 'caja' },
            { path: '#/productos', icon: '📦', label: 'Productos', perm: 'productos' },
            { path: '#/inventario', icon: '📊', label: 'Inventario', perm: 'inventario' },
            { path: '#/proveedores', icon: '🏢', label: 'Proveedores', perm: 'proveedores' },
            { path: '#/compras', icon: '🛍️', label: 'Compras', perm: 'compras' },
            { path: '#/reportes', icon: '📈', label: 'Reportes', perm: 'reportes' },
            { path: '#/usuarios', icon: '👤', label: 'Usuarios', perm: 'usuarios' },
            { path: '#/configuracion', icon: '⚙️', label: 'Configuración', perm: 'configuracion' }
        ];

        const visibleItems = items.filter(item => item.always || hasPermission(item.perm));
        
        const currentPath = window.location.hash || '#/';

        let html = `
            <aside id="app-sidebar" style="
                width: 250px; 
                background: #2c3e50; 
                color: white; 
                display: flex; 
                flex-direction: column; 
                height: 100vh;
                transition: transform 0.3s ease;
                position: fixed;
                z-index: 100;
            ">
                <div style="padding: 20px; font-size: 24px; font-weight: bold; border-bottom: 1px solid #34495e; display: flex; justify-content: space-between; align-items: center;">
                    NevePOS
                    <button id="sidebar-close-btn" style="background:none; border:none; color:white; font-size: 20px; cursor: pointer; display: none;">✕</button>
                </div>
                
                <nav style="flex-grow: 1; overflow-y: auto; padding: 10px 0;">
                    <ul style="list-style: none; padding: 0; margin: 0;">
                        ${visibleItems.map(item => `
                            <li>
                                <a href="${item.path}" class="sidebar-link ${currentPath.startsWith(item.path) ? 'active' : ''}" style="
                                    display: block; 
                                    padding: 12px 20px; 
                                    color: #ecf0f1; 
                                    text-decoration: none;
                                    transition: background 0.2s;
                                ">
                                    <span style="margin-right: 10px;">${item.icon}</span> ${item.label}
                                </a>
                            </li>
                        `).join('')}
                    </ul>
                </nav>
                
                <div style="padding: 20px; border-top: 1px solid #34495e; background: #233140;">
                    <div style="margin-bottom: 10px;">
                        <div style="font-weight: bold;">${user.nombre}</div>
                        <div style="font-size: 12px; color: #bdc3c7;">${user.rol?.nombre || 'Usuario'}</div>
                    </div>
                    <button id="sidebar-logout" style="
                        width: 100%; 
                        padding: 8px; 
                        background: #c0392b; 
                        color: white; 
                        border: none; 
                        border-radius: 4px; 
                        cursor: pointer;
                    ">Cerrar Sesión</button>
                </div>
            </aside>
            <style>
                .sidebar-link:hover { background: #34495e; }
                .sidebar-link.active { background: #3498db; border-left: 4px solid #ecf0f1; padding-left: 16px !important; }
                @media (max-width: 768px) {
                    #app-sidebar { transform: translateX(-100%); }
                    #app-sidebar.open { transform: translateX(0); }
                    #sidebar-close-btn { display: block !important; }
                }
            </style>
        `;

        setTimeout(() => {
            const logoutBtn = document.getElementById('sidebar-logout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async () => {
                    await logout();
                    window.location.hash = '#/login';
                });
            }

            const closeBtn = document.getElementById('sidebar-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => Sidebar.close());
            }

            // Close sidebar on mobile when a link is clicked
            document.querySelectorAll('.sidebar-link').forEach(link => {
                link.addEventListener('click', () => {
                    if (window.innerWidth <= 768) {
                        Sidebar.close();
                    }
                });
            });
        }, 0);

        return html;
    },

    toggle: () => {
        const sidebar = document.getElementById('app-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('open');
        }
    },

    close: () => {
        const sidebar = document.getElementById('app-sidebar');
        if (sidebar) {
            sidebar.classList.remove('open');
        }
    }
};
