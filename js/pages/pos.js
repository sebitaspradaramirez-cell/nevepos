import { getCurrentUser, requireAuth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { formatCOP, generateUUID, generateNumeroVenta, debounce, isOnline, escapeHtml } from '../lib/utils.js';
import { Toast } from '../lib/toast.js';
import { Modal } from '../components/modal.js';
import { VentasService } from '../services/ventas.service.js';
import { CajaService } from '../services/caja.service.js';

let cart = [];
let allProducts = [];
let allCategories = [];
let selectedCategory = null;
let selectedPaymentMethod = 'efectivo';
let currentTurno = null;
let searchInputHandler = null;
let keydownHandler = null;

const renderCart = () => {
    const cartItemsEl = document.getElementById('cart-items');
    const cartCountEl = document.getElementById('cart-count');
    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total');
    const btnCobrar = document.getElementById('btn-cobrar');
    const discountInput = document.getElementById('cart-discount');
    const discount = parseInt(discountInput.value) || 0;

    cartCountEl.textContent = cart.reduce((acc, item) => acc + item.cantidad, 0);

    if (cart.length === 0) {
        cartItemsEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Carrito vacío</div>';
        subtotalEl.textContent = formatCOP(0);
        totalEl.textContent = formatCOP(0);
        btnCobrar.textContent = '🛒 Cobrar';
        btnCobrar.disabled = true;
        return;
    }

    let subtotal = 0;
    let html = '';
    
    cart.forEach((item, index) => {
        const itemTotal = item.precio_unitario * item.cantidad;
        subtotal += itemTotal;
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
                <div style="flex: 1;">
                    <div style="font-weight: bold; font-size: 14px;">${escapeHtml(item.producto.nombre)}</div>
                    <div style="color: #888; font-size: 12px;">${formatCOP(item.precio_unitario)}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <button class="btn btn-sm" onclick="PosApp.updateQuantity(${index}, ${item.cantidad - 1})" style="padding: 2px 8px;">-</button>
                    <input type="number" value="${item.cantidad}" onchange="PosApp.updateQuantity(${index}, parseInt(this.value))" style="width: 40px; text-align: center; padding: 2px;">
                    <button class="btn btn-sm" onclick="PosApp.updateQuantity(${index}, ${item.cantidad + 1})" style="padding: 2px 8px;">+</button>
                </div>
                <div style="width: 80px; text-align: right; font-weight: bold;">
                    ${formatCOP(itemTotal)}
                </div>
                <button class="btn btn-danger btn-sm" onclick="PosApp.removeFromCart(${index})" style="margin-left: 10px; padding: 2px 8px;">X</button>
            </div>
        `;
    });

    cartItemsEl.innerHTML = html;
    
    const total = Math.max(0, subtotal - discount);
    
    subtotalEl.textContent = formatCOP(subtotal);
    totalEl.textContent = formatCOP(total);
    btnCobrar.textContent = `🛒 Cobrar - ${formatCOP(total)}`;
    btnCobrar.disabled = false;
};

const renderProducts = (products) => {
    const grid = document.getElementById('pos-products');
    if (!products.length) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: #888;">Sin resultados</div>';
        return;
    }

    grid.innerHTML = products.map(p => {
        const outOfStock = p.stock_actual <= 0;
        let stockColor = '#4caf50';
        if (outOfStock) stockColor = '#f44336';
        else if (p.stock_actual <= 5) stockColor = '#ff9800';

        return `
            <div class="pos-product-card" onclick="${outOfStock ? '' : `PosApp.addToCart('${p.id}')`}" style="
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 10px;
                cursor: ${outOfStock ? 'not-allowed' : 'pointer'};
                background: white;
                opacity: ${outOfStock ? '0.6' : '1'};
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                height: 120px;
            ">
                <div style="font-size: 13px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                    ${escapeHtml(p.nombre)}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                    <div style="color: #2196f3; font-weight: bold;">${formatCOP(p.precio_venta)}</div>
                    <div style="background: ${stockColor}; color: white; font-size: 11px; padding: 2px 6px; border-radius: 10px;">
                        ${outOfStock ? 'Agotado' : p.stock_actual}
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

const procesarVenta = async () => {
    if (cart.length === 0) return;
    
    const discountInput = document.getElementById('cart-discount');
    const discount = parseInt(discountInput.value) || 0;
    const subtotal = cart.reduce((acc, item) => acc + (item.precio_unitario * item.cantidad), 0);
    const total = Math.max(0, subtotal - discount);
    
    let pagoCon = total;
    if (selectedPaymentMethod === 'efectivo') {
        const pagoInput = document.getElementById('pago-con-input');
        pagoCon = parseInt(pagoInput.value) || 0;
        if (pagoCon < total) {
            Toast.error('El monto pagado es menor al total');
            return;
        }
    }
    
    const cambio = pagoCon - total;
    const clientName = document.getElementById('client-name').value || 'Consumidor Final';

    Modal.confirm('Confirmar Venta', `Total a cobrar: ${formatCOP(total)}<br>Método: ${selectedPaymentMethod}<br>Cambio: ${formatCOP(cambio)}`, async () => {
        try {
            const items = cart.map(c => ({
                producto_id: c.producto.id,
                cantidad: c.cantidad,
                precio_unitario: c.precio_unitario,
                descuento: c.descuento
            }));

            const { venta, detalles } = await VentasService.registrar(
                items, null, selectedPaymentMethod, discount, `Cliente: ${clientName}`, currentTurno.id
            );

            Toast.success('Venta registrada exitosamente');
            
            // Generate receipt
            showReceipt(venta, detalles, clientName, pagoCon, cambio);
            
            // Clear cart
            cart = [];
            discountInput.value = '';
            document.getElementById('client-name').value = '';
            document.getElementById('pago-con-input').value = '';
            renderCart();
            
            // Refresh products to show updated stock
            allProducts = await db.productos.where('activo').equals(1).toArray();
            document.getElementById('pos-search').value = '';
            renderProducts(allProducts);
            document.getElementById('pos-search').focus();

        } catch (error) {
            console.error(error);
            Toast.error('Error al registrar venta: ' + error.message);
        }
    });
};

const showReceipt = (venta, detalles, clientName, pagoCon, cambio) => {
    const user = getCurrentUser();
    let itemsHtml = detalles.map(d => {
        const prod = allProducts.find(p => p.id === d.producto_id);
        const name = prod ? escapeHtml(prod.nombre.substring(0, 20)) : 'Producto';
        return `
            <tr>
                <td style="padding: 2px 0;">${d.cantidad}</td>
                <td style="padding: 2px 0;">${name}</td>
                <td style="padding: 2px 0; text-align: right;">${formatCOP(d.subtotal)}</td>
            </tr>
        `;
    }).join('');

    const receiptHtml = `
        <div id="receipt-print" style="width: 300px; margin: 0 auto; font-family: monospace; font-size: 14px; padding: 10px;">
            <div style="text-align: center; font-weight: bold; margin-bottom: 10px; font-size: 16px;">
                PAPELERÍA NEVEPOS<br>
                NIT: 123456789-0
            </div>
            <div style="margin-bottom: 10px;">
                Fecha: ${new Date(venta.fecha).toLocaleString()}<br>
                Venta #: ${venta.numero_venta}<br>
                Cajero: ${user ? user.nombre : 'Admin'}<br>
                Cliente: ${escapeHtml(clientName)}
            </div>
            <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; margin-bottom: 10px; padding: 5px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="text-align: left; padding: 2px 0;">Cant</th>
                            <th style="text-align: left; padding: 2px 0;">Desc</th>
                            <th style="text-align: right; padding: 2px 0;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
            </div>
            <div style="text-align: right; margin-bottom: 10px;">
                Subtotal: ${formatCOP(venta.subtotal)}<br>
                Descuento: ${formatCOP(venta.descuento)}<br>
                <div style="font-size: 16px; font-weight: bold; margin-top: 5px;">TOTAL: ${formatCOP(venta.total)}</div>
            </div>
            <div style="border-top: 1px dashed #000; padding-top: 10px; margin-bottom: 10px;">
                Método: ${venta.metodo_pago}<br>
                Pagó con: ${formatCOP(pagoCon)}<br>
                Cambio: ${formatCOP(cambio)}
            </div>
            <div style="text-align: center; font-weight: bold; margin-top: 20px;">
                ¡Gracias por su compra!
            </div>
        </div>
    `;

    Modal.open({
        title: 'Recibo de Venta',
        content: receiptHtml,
        size: 'md',
        actions: [
            { label: 'Cerrar', class: 'btn-secondary', onClick: (e, m) => m.close() },
            { 
                label: 'Imprimir', 
                class: 'btn-primary', 
                onClick: () => {
                    const printContents = document.getElementById('receipt-print').innerHTML;
                    const originalContents = document.body.innerHTML;
                    document.body.innerHTML = printContents;
                    window.print();
                    document.body.innerHTML = originalContents;
                    window.location.reload(); // Quick fix to restore event listeners after print hack
                } 
            }
        ]
    });
};

// Expose functions for inline HTML event handlers
window.PosApp = {
    addToCart: (productoId) => {
        const producto = allProducts.find(p => p.id === productoId);
        if (!producto) return;

        const existing = cart.find(c => c.producto.id === productoId);
        const qty = existing ? existing.cantidad + 1 : 1;

        if (qty > producto.stock_actual) {
            Toast.warning('Stock insuficiente');
            return;
        }

        if (existing) {
            existing.cantidad = qty;
        } else {
            cart.push({
                producto,
                cantidad: 1,
                precio_unitario: producto.precio_venta,
                descuento: 0
            });
        }
        renderCart();
    },
    updateQuantity: (index, newQty) => {
        if (newQty <= 0) return;
        const item = cart[index];
        if (newQty > item.producto.stock_actual) {
            Toast.warning('Stock insuficiente');
            return;
        }
        item.cantidad = newQty;
        renderCart();
    },
    removeFromCart: (index) => {
        cart.splice(index, 1);
        renderCart();
    }
};

export const PosPage = {
    render: async (container) => {
        if (!requireAuth()) return;

        container.innerHTML = `
            <div style="display: flex; height: calc(100vh - 65px); background: #f0f2f5;">
                
                <!-- Left Panel -->
                <div style="width: 60%; padding: 15px; display: flex; flex-direction: column; gap: 15px;">
                    <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <input type="text" id="pos-search" placeholder="Buscar producto (F2)..." autofocus style="width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 16px;">
                        
                        <div id="pos-categories" style="display: flex; gap: 10px; overflow-x: auto; margin-top: 10px; padding-bottom: 5px;">
                            <!-- Categorias -->
                        </div>
                    </div>
                    
                    <div id="pos-products" style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; align-content: start;">
                        <!-- Products -->
                    </div>
                </div>

                <!-- Right Panel -->
                <div style="width: 40%; background: white; border-left: 1px solid #ddd; display: flex; flex-direction: column; box-shadow: -2px 0 5px rgba(0,0,0,0.05);">
                    <div style="padding: 15px; background: #2c3e50; color: white; font-weight: bold; font-size: 18px;">
                        🛒 Carrito (<span id="cart-count">0</span>)
                    </div>
                    
                    <div id="cart-items" style="flex: 1; overflow-y: auto; background: #fafafa;">
                        <div style="padding: 20px; text-align: center; color: #888;">Carrito vacío</div>
                    </div>
                    
                    <div style="padding: 15px; border-top: 1px solid #ddd; background: white;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px; color: #666;">
                            <span>Subtotal:</span>
                            <span id="cart-subtotal" style="font-weight: bold;">$0</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; align-items: center;">
                            <span>Descuento (F4):</span>
                            <input type="number" id="cart-discount" placeholder="0" style="width: 100px; text-align: right; padding: 5px;">
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 24px; font-weight: bold; color: #2196f3;">
                            <span>TOTAL:</span>
                            <span id="cart-total">$0</span>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                                <button class="btn btn-primary" id="btn-metodo-efectivo" style="flex: 1; padding: 10px;">💵 Efectivo</button>
                                <button class="btn btn-outline" id="btn-metodo-trans" style="flex: 1; padding: 10px; background: #eee;">📱 Transf.</button>
                            </div>
                            
                            <div id="pago-efectivo-container" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                                <span style="width: 80px;">Pago con:</span>
                                <input type="number" id="pago-con-input" placeholder="0" style="flex: 1; padding: 8px;">
                            </div>
                            
                            <input type="text" id="client-name" placeholder="Cliente (opcional)" style="width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 15px;">
                        </div>
                        
                        <div style="display: flex; gap: 10px;">
                            <button id="btn-cancelar" class="btn btn-danger" style="padding: 15px 20px; font-weight: bold;">Cancelar (F9)</button>
                            <button id="btn-cobrar" class="btn btn-success" style="flex: 1; padding: 15px; font-size: 18px; font-weight: bold;" disabled>🛒 Cobrar</button>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                .cat-btn { padding: 6px 12px; border-radius: 15px; border: 1px solid #ccc; background: white; cursor: pointer; white-space: nowrap; }
                .cat-btn.active { background: #2196f3; color: white; border-color: #2196f3; }
            </style>
        `;
    },

    onMount: async () => {
        try {
            currentTurno = await CajaService.getTurnoActual();
            if (!currentTurno) {
                Modal.alert('Atención', 'No hay un turno de caja abierto. Debe abrir caja antes de registrar ventas.');
                window.location.hash = '#/caja';
                return;
            }

            allProducts = await db.productos.filter(p => p.activo === 1 || p.activo === true).toArray();
            allCategories = await db.categorias.filter(c => c.activo === 1 || c.activo === true).toArray();

            
            const catContainer = document.getElementById('pos-categories');
            catContainer.innerHTML = `
                <button class="cat-btn active" data-id="">Todas</button>
                ${allCategories.map(c => `<button class="cat-btn" data-id="${c.id}">${escapeHtml(c.nombre)}</button>`).join('')}
            `;

            catContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('cat-btn')) {
                    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    selectedCategory = e.target.getAttribute('data-id');
                    
                    let filtered = allProducts;
                    if (selectedCategory) {
                        filtered = filtered.filter(p => p.categoria_id === selectedCategory);
                    }
                    renderProducts(filtered);
                }
            });

            renderProducts(allProducts);

            let searchVal = '';
            const doSearch = debounce(() => {
                const term = searchVal.toLowerCase();
                let filtered = allProducts.filter(p => 
                    p.nombre.toLowerCase().includes(term) || 
                    (p.codigo_barras && p.codigo_barras.includes(term)) ||
                    (p.sku && p.sku.toLowerCase().includes(term))
                );
                if (selectedCategory) {
                    filtered = filtered.filter(p => p.categoria_id === selectedCategory);
                }
                renderProducts(filtered);
            }, 300);

            const searchInput = document.getElementById('pos-search');
            let lastKeyTime = 0;
            
            searchInputHandler = (e) => {
                searchVal = e.target.value;
                doSearch();
            };
            searchInput.addEventListener('input', searchInputHandler);

            searchInput.addEventListener('keydown', (e) => {
                const now = Date.now();
                if (e.key === 'Enter') {
                    if (now - lastKeyTime < 50) {
                        // Scanner detected
                        const term = searchInput.value.trim();
                        const p = allProducts.find(x => x.codigo_barras === term);
                        if (p) {
                            window.PosApp.addToCart(p.id);
                            searchInput.value = '';
                            searchVal = '';
                            doSearch();
                        }
                    } else {
                        // Manual Enter
                        const first = document.querySelector('.pos-product-card');
                        if (first) first.click();
                    }
                }
                lastKeyTime = now;
            });

            document.getElementById('btn-metodo-efectivo').addEventListener('click', (e) => {
                selectedPaymentMethod = 'efectivo';
                e.target.className = 'btn btn-primary';
                e.target.style.background = '';
                document.getElementById('btn-metodo-trans').className = 'btn btn-outline';
                document.getElementById('btn-metodo-trans').style.background = '#eee';
                document.getElementById('pago-efectivo-container').style.display = 'flex';
            });

            document.getElementById('btn-metodo-trans').addEventListener('click', (e) => {
                selectedPaymentMethod = 'transferencia';
                e.target.className = 'btn btn-primary';
                e.target.style.background = '';
                document.getElementById('btn-metodo-efectivo').className = 'btn btn-outline';
                document.getElementById('btn-metodo-efectivo').style.background = '#eee';
                document.getElementById('pago-efectivo-container').style.display = 'none';
            });

            document.getElementById('cart-discount').addEventListener('input', renderCart);

            document.getElementById('btn-cobrar').addEventListener('click', procesarVenta);

            document.getElementById('btn-cancelar').addEventListener('click', () => {
                if (cart.length > 0) {
                    Modal.confirm('Cancelar Venta', '¿Está seguro de limpiar el carrito?', () => {
                        cart = [];
                        document.getElementById('cart-discount').value = '';
                        document.getElementById('pago-con-input').value = '';
                        renderCart();
                    });
                }
            });

            keydownHandler = (e) => {
                if (e.key === 'F2') {
                    e.preventDefault();
                    document.getElementById('pos-search').focus();
                } else if (e.key === 'F4') {
                    e.preventDefault();
                    document.getElementById('cart-discount').focus();
                } else if (e.key === 'F9') {
                    e.preventDefault();
                    document.getElementById('btn-cancelar').click();
                }
            };
            document.addEventListener('keydown', keydownHandler);

        } catch (error) {
            console.error(error);
            Toast.error('Error al cargar POS');
        }
    },

    onUnmount: () => {
        if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
        cart = [];
        allProducts = [];
        allCategories = [];
    }
};
