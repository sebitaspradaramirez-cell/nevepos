import { formatCOP, escapeHtml, truncate } from '../lib/utils.js';

export const ProductCard = {
    render: (producto) => {
        let stockColor = '#4caf50'; // green
        if (producto.stock_actual <= 0) stockColor = '#f44336'; // red
        else if (producto.stock_actual <= 5) stockColor = '#ff9800'; // yellow

        return `
            <div class="product-card" data-id="${producto.id}" style="
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 15px;
                cursor: pointer;
                background: white;
                transition: transform 0.1s, box-shadow 0.1s;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                height: 100%;
                box-sizing: border-box;
            " onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.1)';" 
               onmouseout="this.style.transform='none'; this.style.boxShadow='none';">
                
                <div style="font-size: 12px; color: #666; margin-bottom: 5px;">
                    ${escapeHtml(producto.categoria_nombre || 'Sin categoría')}
                </div>
                
                <div style="font-weight: bold; font-size: 16px; margin-bottom: 10px; flex-grow: 1;">
                    ${escapeHtml(truncate(producto.nombre, 40))}
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <div style="color: #2196f3; font-weight: bold; font-size: 18px;">
                        ${formatCOP(producto.precio_venta)}
                    </div>
                    <div style="
                        background-color: ${stockColor}; 
                        color: white; 
                        padding: 3px 8px; 
                        border-radius: 12px; 
                        font-size: 12px; 
                        font-weight: bold;
                    ">
                        ${producto.stock_actual}
                    </div>
                </div>
            </div>
        `;
    },

    renderGrid: (productos, onSelect) => {
        if (!productos || productos.length === 0) {
            return `<div style="text-align: center; padding: 40px; color: #888; grid-column: 1 / -1;">Sin resultados</div>`;
        }

        const html = `
            <div style="
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 15px;
                padding: 10px;
            " id="product-grid-container">
                ${productos.map(p => ProductCard.render(p)).join('')}
            </div>
        `;

        setTimeout(() => {
            const container = document.getElementById('product-grid-container');
            if (container) {
                container.querySelectorAll('.product-card').forEach((card, index) => {
                    card.addEventListener('click', () => {
                        if (onSelect) onSelect(productos[index]);
                    });
                });
            }
        }, 0);

        return html;
    }
};
