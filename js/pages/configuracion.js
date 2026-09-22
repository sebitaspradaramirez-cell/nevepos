import { SyncManager } from '../lib/sync.js';

export class ConfiguracionPage {
    constructor() {
        this.container = document.getElementById('app-content');
    }

    async render() {
        this.container.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">Configuración</h1>
            </div>
            
            <div class="card mb-6">
                <div class="card-header"><h3 class="card-title">Información del Negocio</h3></div>
                <div class="card-body">
                    <div class="form-group">
                        <label class="form-label">Nombre del Negocio</label>
                        <input type="text" class="form-control" id="conf-nombre" value="NevePOS Papelería">
                    </div>
                </div>
                <div class="card-footer">
                    <button class="btn btn-primary" id="btn-save-biz">Guardar</button>
                </div>
            </div>

            <div class="card mb-6">
                <div class="card-header"><h3 class="card-title">Gestión de Datos y Sincronización</h3></div>
                <div class="card-body flex gap-4">
                    <button class="btn btn-outline" id="btn-sync-now">Sincronizar Ahora</button>
                    <button class="btn btn-outline" id="btn-export-db">Exportar Base de Datos Local</button>
                </div>
            </div>
        `;
        
        this.attachEvents();
    }
    
    attachEvents() {
        document.getElementById('btn-sync-now')?.addEventListener('click', () => {
            SyncManager.fullSync();
        });
    }
}
