import { CONFIG } from './config.js';
import { Auth } from './lib/auth.js';
import { Router } from './lib/router.js';
import { db } from './lib/db.js';
import { SyncManager } from './lib/sync.js';
import { Sidebar } from './components/sidebar.js';
import { Header } from './components/header.js';

// Pages
import { LoginPage } from './pages/login.js';
import { PosPage } from './pages/pos.js';
import { CajaPage } from './pages/caja.js';
import { ProductosPage } from './pages/productos.js';
import { InventarioPage } from './pages/inventario.js';
import { ProveedoresPage } from './pages/proveedores.js';
import { ComprasPage } from './pages/compras.js';
import { ReportesPage } from './pages/reportes.js';
import { UsuariosPage } from './pages/usuarios.js';
import { ConfiguracionPage } from './pages/configuracion.js';

class App {
    async init() {
        this.auth = Auth;
        this.router = Router;
        
        // Define routes
        this.router.addRoute('/login', LoginPage);
        this.router.addRoute('/pos', PosPage);
        this.router.addRoute('/caja', CajaPage);
        this.router.addRoute('/productos', ProductosPage);
        this.router.addRoute('/inventario', InventarioPage);
        this.router.addRoute('/proveedores', ProveedoresPage);
        this.router.addRoute('/compras', ComprasPage);
        this.router.addRoute('/reportes', ReportesPage);
        this.router.addRoute('/usuarios', UsuariosPage);
        this.router.addRoute('/configuracion', ConfiguracionPage);
        
        // Router middleware
        this.router.beforeEach(async (to) => {
            const user = this.auth.getCurrentUser();
            
            if (!user && to !== '/login') {
                return '/login';
            }
            if (user && to === '/login') {
                return '/pos';
            }
            
            return true;
        });

        // Initialize UI components if authenticated
        const currentUser = this.auth.getCurrentUser();
        if (currentUser) {
            this.setupUI(currentUser);
            SyncManager.init();
        }

        // Listen for auth changes
        this.auth.onAuthStateChange((user) => {
            if (user) {
                this.setupUI(user);
                SyncManager.init();
                this.router.navigate('/pos');
            } else {
                this.teardownUI();
                SyncManager.stopPeriodicSync();
                this.router.navigate('/login');
            }
        });
        
        // Remove loader and start routing
        const loader = document.getElementById('initial-loader');
        if (loader) loader.style.display = 'none';
        
        this.router.start();
    }
    
    setupUI(user) {
        const sidebarEl = document.getElementById('sidebar');
        const headerEl = document.getElementById('app-header');
        
        if (sidebarEl) {
            sidebarEl.innerHTML = Sidebar.render(user);
        }
        if (headerEl) {
            headerEl.innerHTML = Header.render();
        }
    }
    
    teardownUI() {
        const sidebarEl = document.getElementById('sidebar');
        const headerEl = document.getElementById('app-header');
        if (sidebarEl) sidebarEl.innerHTML = '';
        if (headerEl) headerEl.innerHTML = '';
    }
}


const startApp = () => {
    if (window.__neveposAppStarted) return;
    window.__neveposAppStarted = true;
    const app = new App();
    app.init().catch(err => console.error('App initialization failed:', err));
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp, { once: true });
} else {
    startApp();
}
