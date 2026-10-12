import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import { isOnline } from '../lib/utils.js';

class ReportesService {
    getDateRange(fechaInicio, fechaFin) {
        const start = new Date(`${fechaInicio}T00:00:00`);
        const end = new Date(`${fechaFin}T00:00:00`);
        end.setDate(end.getDate() + 1);
        return { start: start.toISOString(), end: end.toISOString() };
    }

    async getHistorialVentas(fechaInicio, fechaFin) {
        const { start, end } = this.getDateRange(fechaInicio, fechaFin);
        if (isOnline()) {
            try {
                const pageSize = 1000;
                const allSales = [];
                let offset = 0;

                while (true) {
                    const { data, error } = await supabase
                        .from('ventas')
                        .select('*')
                        .gte('fecha', start)
                        .lt('fecha', end)
                        .order('fecha', { ascending: false })
                        .range(offset, offset + pageSize - 1);
                    if (error) throw error;

                    allSales.push(...(data || []));
                    if (!data || data.length < pageSize) break;
                    offset += pageSize;
                }

                return allSales;
            } catch (error) {
                console.error('Error cargando historial de ventas:', error);
            }
        }

        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();
        const sales = await db.ventas
            .filter(venta => new Date(venta.fecha).getTime() >= startTime && new Date(venta.fecha).getTime() < endTime)
            .toArray();
        return sales.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
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

    async getResumenVentas(ventas, fechaInicio, fechaFin) {
        const completadas = ventas.filter(venta => venta.estado === 'completada');
        const total_ventas = completadas.reduce((sum, venta) => sum + Number(venta.total || 0), 0);
        const num_transacciones = completadas.length;
        let items_vendidos = 0;

        if (navigator.onLine) {
            try {
                const { start, end } = this.getDateRange(fechaInicio, fechaFin);
                const { data, error } = await supabase
                    .from('detalle_ventas')
                    .select('cantidad, ventas!inner(fecha, estado)')
                    .gte('ventas.fecha', start)
                    .lt('ventas.fecha', end)
                    .eq('ventas.estado', 'completada');
                if (error) throw error;
                items_vendidos = (data || []).reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
            } catch (error) {
                console.error('No se pudo cargar el total de artículos vendidos:', error);
            }
        } else {
            const saleIds = completadas.map(venta => venta.id);
            if (saleIds.length) {
                const details = await db.detalle_ventas.where('venta_id').anyOf(saleIds).toArray();
                items_vendidos = details.reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
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
