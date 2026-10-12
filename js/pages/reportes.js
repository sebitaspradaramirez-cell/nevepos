import { reportesService } from '../services/reportes.service.js';
import { escapeHtml, formatCOP } from '../lib/utils.js';
import { Auth } from '../lib/auth.js';

export class ReportesPage {
    constructor() {
        this.container = document.getElementById('app-content');
        this.ventas = [];
        this.salesPage = 1;
        this.salesPageSize = 50;
    }

    async render() {
        if (!Auth.hasPermission('reportes')) {
            this.container.innerHTML = '<h2>Acceso Denegado</h2>';
            return;
        }

        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
                        <input type="date" class="form-control" id="filter-inicio" value="${today}">
                        <input type="date" class="form-control" id="filter-fin" value="${today}">
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

            <div class="card mt-6">
                <div class="card-header"><h3 class="card-title">Historial de ventas</h3></div>
                <div class="card-body" style="overflow-x: auto;">
                    <table class="table table-striped">
                        <thead><tr><th>Fecha</th><th>Número</th><th>Método</th><th>Estado</th><th>Total</th></tr></thead>
                        <tbody id="sales-history-body"><tr><td colspan="5">Cargando ventas...</td></tr></tbody>
                    </table>
                    <div class="pagination" id="sales-history-pagination"></div>
                </div>
            </div>
        `;
        
        await this.loadData();
        this.attachEvents();
    }
    
    async loadData() {
        const inicio = document.getElementById('filter-inicio')?.value || new Date().toISOString().split('T')[0];
        const fin = document.getElementById('filter-fin')?.value || new Date().toISOString().split('T')[0];
        
        this.ventas = await reportesService.getHistorialVentas(inicio, fin);
        this.salesPage = 1;
        this.renderSalesHistory();

        let resumen = { total_ventas: 0, num_transacciones: 0, ticket_promedio: 0, items_vendidos: 0 };
        try {
            resumen = await reportesService.getResumenVentas(this.ventas, inicio, fin);
        } catch (error) {
            console.error('No se pudo cargar el resumen del rango:', error);
        }
        
        const kpiContainer = document.getElementById('kpi-container');
        if (kpiContainer) {
            kpiContainer.innerHTML = `
                <div class="card stat-card"><div class="card-body"><div class="stat-label">Total Ventas</div><div class="stat-value">${formatCOP(resumen.total_ventas)}</div></div></div>
                <div class="card stat-card"><div class="card-body"><div class="stat-label">Transacciones</div><div class="stat-value">${resumen.num_transacciones}</div></div></div>
                <div class="card stat-card"><div class="card-body"><div class="stat-label">Ticket Promedio</div><div class="stat-value">${formatCOP(resumen.ticket_promedio)}</div></div></div>
                <div class="card stat-card"><div class="card-body"><div class="stat-label">Items Vendidos</div><div class="stat-value">${resumen.items_vendidos}</div></div></div>
            `;
        }
    }

    renderSalesHistory() {
        const historyBody = document.getElementById('sales-history-body');
        const pagination = document.getElementById('sales-history-pagination');
        if (!historyBody || !pagination) return;

        if (!this.ventas.length) {
            historyBody.innerHTML = '<tr><td colspan="5">No hay ventas para este rango de fechas.</td></tr>';
            pagination.innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(this.ventas.length / this.salesPageSize);
        const from = (this.salesPage - 1) * this.salesPageSize;
        historyBody.innerHTML = this.ventas.slice(from, from + this.salesPageSize).map(venta => `
            <tr>
                <td>${escapeHtml(new Date(venta.fecha).toLocaleString())}</td>
                <td>${escapeHtml(venta.numero_venta || '')}</td>
                <td>${escapeHtml(venta.metodo_pago || '')}</td>
                <td>${escapeHtml(venta.estado || '')}</td>
                <td>${formatCOP(venta.total || 0)}</td>
            </tr>
        `).join('');

        pagination.innerHTML = `
            <button type="button" class="page-btn" id="sales-page-previous" ${this.salesPage === 1 ? 'disabled' : ''}>Anterior</button>
            <span>Página ${this.salesPage} de ${totalPages} · ${this.ventas.length} ventas</span>
            <button type="button" class="page-btn" id="sales-page-next" ${this.salesPage === totalPages ? 'disabled' : ''}>Siguiente</button>
        `;
        document.getElementById('sales-page-previous').addEventListener('click', () => {
            this.salesPage--;
            this.renderSalesHistory();
        });
        document.getElementById('sales-page-next').addEventListener('click', () => {
            this.salesPage++;
            this.renderSalesHistory();
        });
    }
    
    attachEvents() {
        document.getElementById('btn-filter')?.addEventListener('click', () => this.loadData());
        document.getElementById('btn-print')?.addEventListener('click', () => window.print());
        document.getElementById('btn-export-excel')?.addEventListener('click', () => {
            reportesService.exportToExcel([{ test: 'data' }], 'reporte');
        });
    }
}
