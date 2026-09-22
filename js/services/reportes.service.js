import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';

class ReportesService {
    async getVentasPorDia(fechaInicio, fechaFin) {
        if (navigator.onLine) {
            const { data, error } = await supabase.rpc('get_reporte_ventas', { f_inicio: fechaInicio, f_fin: fechaFin });
            if (error) throw error;
            return data;
        } else {
            const ventas = await db.ventas.where('fecha').between(fechaInicio, fechaFin).toArray();
            // Aggregate locally...
            return ventas; // Simplified for now
        }
    }

    async getVentasPorProducto(fechaInicio, fechaFin) {
        if (navigator.onLine) {
            const { data, error } = await supabase.rpc('get_ventas_por_producto', { f_inicio: fechaInicio, f_fin: fechaFin });
            if (error) throw error;
            return data;
        }
        return [];
    }

    async getVentasPorCategoria(fechaInicio, fechaFin) {
        // Implementation
        return [];
    }

    async getProductosMasVendidos(limit = 10, fechaInicio, fechaFin) {
        // Implementation
        return [];
    }

    async getProductosBajaRotacion(dias = 30) {
        // Implementation
        return [];
    }

    async getUtilidadBruta(fechaInicio, fechaFin) {
        // Implementation
        return 0;
    }

    async getResumenDiario() {
        const hoy = new Date().toISOString().split('T')[0];
        const ventas = await this.getVentasPorDia(hoy, hoy);
        return {
            total_ventas: 0,
            num_transacciones: 0,
            ticket_promedio: 0,
            items_vendidos: 0
        };
    }

    exportToExcel(data, filename) {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Datos");
        XLSX.writeFile(wb, `${filename}.xlsx`);
    }

    exportToPDF(elementId) {
        window.print();
    }
}

export const reportesService = new ReportesService();
