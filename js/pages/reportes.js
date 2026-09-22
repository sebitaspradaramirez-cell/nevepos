import { reportesService } from '../services/reportes.service.js';

export class ReportesPage {
    constructor() {
        this.container = document.getElementById('app-content');
    }

    async render() {
        this.container.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">Reportes y Dashboard</h1>
                <div class="export-bar">
                    <button class="btn btn-outline" id="btn-export-excel">Exportar a Excel</button>
                    <button class="btn btn-primary" id="btn-print">Imprimir Reporte</button>
                </div>
            </div>
            
            <div class="card mb-6">
                <div class="card-body">
                    <div class="date-filter-group">
                        <label class="form-label mb-0">Rango de fechas:</label>
                        <input type="date" class="form-control" id="filter-inicio">
                        <input type="date" class="form-control" id="filter-fin">
                        <button class="btn btn-primary" id="btn-filter">Aplicar</button>
                    </div>
                </div>
            </div>

            <div class="kpi-row" id="kpi-container">
                <!-- KPIs injected here -->
            </div>

            <div class="reportes-grid">
                <div class="card">
                    <div class="card-header"><h3 class="card-title">Ventas por Día</h3></div>
                    <div class="card-body chart-container"><canvas id="chart-ventas-dia"></canvas></div>
                </div>
                <div class="card">
                    <div class="card-header"><h3 class="card-title">Top 10 Productos</h3></div>
                    <div class="card-body chart-container"><canvas id="chart-top-productos"></canvas></div>
                </div>
            </div>
        `;
        
        await this.loadData();
        this.attachEvents();
    }
    
    async loadData() {
        const inicio = document.getElementById('filter-inicio')?.value || new Date().toISOString().split('T')[0];
        const fin = document.getElementById('filter-fin')?.value || new Date().toISOString().split('T')[0];
        
        const resumen = await reportesService.getResumenDiario();
        
        const kpiContainer = document.getElementById('kpi-container');
        if (kpiContainer) {
            kpiContainer.innerHTML = `
                <div class="card stat-card"><div class="card-body"><div class="stat-label">Total Ventas</div><div class="stat-value">$${resumen.total_ventas}</div></div></div>
                <div class="card stat-card"><div class="card-body"><div class="stat-label">Transacciones</div><div class="stat-value">${resumen.num_transacciones}</div></div></div>
                <div class="card stat-card"><div class="card-body"><div class="stat-label">Ticket Promedio</div><div class="stat-value">$${resumen.ticket_promedio}</div></div></div>
                <div class="card stat-card"><div class="card-body"><div class="stat-label">Items Vendidos</div><div class="stat-value">${resumen.items_vendidos}</div></div></div>
            `;
        }
    }
    
    attachEvents() {
        document.getElementById('btn-filter')?.addEventListener('click', () => this.loadData());
        document.getElementById('btn-print')?.addEventListener('click', () => window.print());
        document.getElementById('btn-export-excel')?.addEventListener('click', () => {
            reportesService.exportToExcel([{ test: 'data' }], 'reporte');
        });
    }
}
