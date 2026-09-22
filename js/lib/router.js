class RouterClass {
    constructor() {
        this.routes = {};
        this.currentRoute = null;
        this.currentView = null;
        this.beforeEachHooks = [];
        
        window.addEventListener('hashchange', () => this.handleRoute());
    }

    init(routes) {
        this.routes = routes;
        this.handleRoute();
    }

    beforeEach(hook) {
        this.beforeEachHooks.push(hook);
    }

    navigate(path) {
        window.location.hash = path;
    }

    getCurrentRoute() {
        return window.location.hash.slice(1) || '/';
    }

    addRoute(path, component) {
        this.routes[path] = component;
    }

    start() {
        this.handleRoute();
    }

    async handleRoute() {
        let path = this.getCurrentRoute();
        
        const to = path;
        const from = this.currentRoute;
        
        for (const hook of this.beforeEachHooks) {
            const result = await hook(to, from);
            if (result === false) return;
            if (typeof result === 'string') {
                this.navigate(result);
                return;
            }
        }

        const route = this.routes[path] || this.routes['*'] || this.routes['/'];
        if (!route) {
            console.error('Route not found:', path);
            return;
        }

        if (this.currentViewInstance && this.currentViewInstance.onUnmount) {
            this.currentViewInstance.onUnmount();
        } else if (this.currentView && this.currentView.onUnmount) {
            this.currentView.onUnmount();
        }

        this.currentRoute = path;
        this.currentView = route;
        
        const container = document.getElementById('app-content');
        if (container) {
            // Support both Class constructors and plain objects
            if (typeof route === 'function') {
                try {
                    const instance = new route(container);
                    this.currentViewInstance = instance;
                    await instance.render(container);
                    if (instance.onMount) instance.onMount();
                } catch (err) {
                    console.error('Error rendering class route:', err);
                }
            } else if (route && typeof route.render === 'function') {
                this.currentViewInstance = null;
                await route.render(container);
                if (route.onMount) {
                    route.onMount();
                }
            }
        } else {
            console.error('#app-content container not found');
        }
    }
}


export const Router = new RouterClass();
