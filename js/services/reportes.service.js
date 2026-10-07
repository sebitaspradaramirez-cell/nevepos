import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import { isOnline } from '../lib/utils.js';

class ReportesService {
    async getHistorialVentas(fechaInicio, fechaFin) {
        if (isOnline()) {
            try {
                const { data, error } = await supabase
                    .from('ventas')
                    .select('*')
                    .gte('fecha', `${fechaInicio}T00:00:00`)
                    .lte('fecha', `${fechaFin}T23:59:59.999`)
                    .order('fecha', { ascending: false })
                    .limit(100);
                if (error) throw error;
                return data || [];
            } catch (error) {
                console.error('Error cargando historial de ventas:', error);
            }
        }

        return db.ventas
            .filter(venta => venta.fecha >= `${fechaInicio}T00:00:00` && venta.fecha <= `${fechaFin}T23:59:59.999`)
            .toArray();
    }

    async getVentasPorDia(fechaInicio, fechaFin) {
        if (navigator.onLine) {
            const { data, error } = await supabase.rpc('get_reporte_ventas', {
                p_fecha_inicio: `${fechaInicio}T00:00:00.000Z`,
                p_fecha_fin: `${fechaFin}T23:59:59.999Z`
            });
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
        const total_ventas = (ventas || []).reduce((sum, venta) => sum + Number(venta.total_ventas || 0), 0);
        const num_transacciones = (ventas || []).reduce((sum, venta) => sum + Number(venta.num_transacciones || 0), 0);
        let items_vendidos = 0;

        if (navigator.onLine) {
            try {
                const { data, error } = await supabase
                    .from('detalle_ventas')
                    .select('cantidad, ventas!inner(fecha, estado)')
                    .gte('ventas.fecha', `${hoy}T00:00:00.000Z`)
                    .lte('ventas.fecha', `${hoy}T23:59:59.999Z`)
                    .eq('ventas.estado', 'completada');
                if (error) throw error;
                items_vendidos = (data || []).reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
            } catch (error) {
                console.error('No se pudo cargar el total de artículos vendidos:', error);
            }
        }

        return {
            total_ventas,
            num_transacciones,
            ticket_promedio: num_transacciones ? Math.round(total_ventas / num_transacciones) : 0,
            items_vendidos
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
