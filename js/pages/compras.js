import { ComprasService } from '../services/compras.service.js';
import { ProveedoresService } from '../services/proveedores.service.js';
import { ProductosService } from '../services/productos.service.js';
import { CajaService } from '../services/caja.service.js';
import { Auth } from '../lib/auth.js';
import { Toast } from '../lib/toast.js';
import { Modal } from '../components/modal.js';
import { formatCOP, formatDate } from '../lib/utils.js';

export class ComprasPage {
  constructor(container) {
    this.container = container;
    this.cart = [];
  }

  async render() {
    if (!Auth.hasPermission('compras')) {
      this.container.innerHTML = '<h2>Acceso Denegado</h2>';
      return;
    }

    this.container.innerHTML = `
      <div class="page-header">
        <h2>Registro de Compras</h2>
        <button id="btn-nueva-compra" class="btn btn-primary">+ Nueva Compra</button>
      </div>
      
      <div class="card mt-3">
        <h3>Historial de Compras</h3>
        <div class="table-responsive">
          <table class="table table-striped" id="compras-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="6">Cargando...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal Form -->
      <div id="modal-compra" class="modal" style="display: none; position: fixed; inset: 0; z-index: 1000; align-items: center; justify-content: center; padding: 16px; overflow-y: auto; background: rgba(0, 0, 0, 0.5);">
        <div class="modal-content" style="width: 100%; max-width: 900px; max-height: 90vh; overflow-y: auto; padding: 24px; border-radius: var(--radius-xl); background: var(--color-white); box-shadow: var(--shadow-xl);">
          <h3>Registrar Nueva Compra</h3>
          <div class="row">
            <div class="col-md-6 form-group">
              <label for="compra-turno-caja">Pagar desde la caja abierta</label>
              <select id="compra-turno-caja" class="form-control" required>
                <option value="">Selecciona una caja abierta</option>
              </select>
              <small class="form-text">El total será una salida de efectivo. El monto de apertura y los cierres anteriores no se modifican.</small>
            </div>
            <div class="col-md-6 form-group">
              <label>Proveedor</label>
              <select id="compra-proveedor" class="form-control"></select>
            </div>
            <div class="col-md-6 form-group">
              <label>Buscar Producto</label>
              <input type="text" id="compra-producto-search" class="form-control" placeholder="Buscar por nombre o SKU...">
              <div id="compra-producto-results" class="search-results"></div>
            </div>
          </div>
          <div class="table-responsive mt-3">
            <table class="table" id="cart-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Costo Unit.</th>
                  <th>Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody></tbody>
              <tfoot>
                <tr>
                  <th colspan="3" class="text-right">Total:</th>
                  <th id="cart-total">$0</th>
                  <th></th>
                </tr>
              </tfoot>
            </table>
          </div>
          <div class="form-group mt-3">
            <label>Notas</label>
            <textarea id="compra-notas" class="form-control"></textarea>
          </div>
          <div class="form-actions mt-3">
            <button type="button" class="btn btn-secondary btn-cancel-compra">Cancelar</button>
            <button type="button" id="btn-guardar-compra" class="btn btn-primary">Registrar Compra</button>
          </div>
        </div>
      </div>
      
      <!-- Detalle Modal -->
      <div id="modal-detalle-compra" class="modal" style="display: none; position: fixed; inset: 0; z-index: 1000; align-items: center; justify-content: center; padding: 16px; overflow-y: auto; background: rgba(0, 0, 0, 0.5);">
        <div class="modal-content" style="width: 100%; max-width: 700px; max-height: 90vh; overflow-y: auto; padding: 24px; border-radius: var(--radius-xl); background: var(--color-white); box-shadow: var(--shadow-xl);">
          <h3>Detalle de Compra</h3>
          <div id="detalle-content"></div>
          <button type="button" class="btn btn-secondary btn-cancel-detalle mt-3">Cerrar</button>
        </div>
      </div>
    `;

    this.bindEvents();
    this.loadProveedores();
    this.loadData();
  }

  async loadProveedores() {
    const provs = await ProveedoresService.getAll({ activo: true, pageSize: 100 });
    const select = document.getElementById('compra-proveedor');
    let html = '<option value="">(Sin proveedor especificado)</option>';
    if (provs && provs.data) {
      provs.data.forEach(p => html += `<option value="${p.id}">${p.nombre}</option>`);
    }
    select.innerHTML = html;
  }

  async loadData() {
    const tbody = document.querySelector('#compras-table tbody');
    try {
      const res = await ComprasService.getAll();
      tbody.innerHTML = '';
      if (!res.data || res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No hay compras registradas.</td></tr>';
        return;
      }
      res.data.forEach(c => {
        const provName = c.proveedores?.nombre || '-';
        const badge = c.estado === 'recibida' ? 'badge-success' : 'badge-danger';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${c.numero_compra}</td>
          <td>${formatDate(c.fecha)}</td>
          <td>${provName}</td>
          <td>${formatCOP(c.total)}</td>
          <td><span class="badge ${badge}">${c.estado}</span></td>
          <td>
            <button class="btn btn-sm btn-info btn-detalle" data-id="${c.id}">Ver</button>
            ${c.estado === 'recibida' ? `<button class="btn btn-sm btn-danger btn-anular" data-id="${c.id}">Anular</button>` : ''}
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6">Error cargando compras (Requiere conexión)</td></tr>';
    }
  }

  bindEvents() {
    document.getElementById('btn-nueva-compra').addEventListener('click', () => {
      this.cart = [];
      this.renderCart();
      document.getElementById('compra-notas').value = '';
      document.getElementById('modal-compra').style.display = 'flex';
      this.loadTurnosCaja();
    });

    document.querySelector('.btn-cancel-compra').addEventListener('click', () => {
      document.getElementById('modal-compra').style.display = 'none';
    });
    
    document.querySelector('.btn-cancel-detalle').addEventListener('click', () => {
      document.getElementById('modal-detalle-compra').style.display = 'none';
    });

    const searchInput = document.getElementById('compra-producto-search');
    const searchResults = document.getElementById('compra-producto-results');
    let timeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        const q = e.target.value;
        if (q.length < 2) { searchResults.style.display = 'none'; return; }
        const res = await ProductosService.search(q);
        searchResults.innerHTML = '';
        if (res.length > 0) {
          res.forEach(p => {
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerText = `${p.nombre} (${formatCOP(p.precio_costo)})`;
            div.onclick = () => {
              this.addToCart(p);
              searchInput.value = '';
              searchResults.style.display = 'none';
            };
            searchResults.appendChild(div);
          });
          searchResults.style.display = 'block';
        }
      }, 300);
    });

    document.getElementById('btn-guardar-compra').addEventListener('click', async () => {
      if (this.cart.length === 0) {
        Toast.error('La compra debe tener al menos un producto');
        return;
      }
      const turnoCajaId = document.getElementById('compra-turno-caja').value;
      if (!turnoCajaId) {
        Toast.error('Selecciona la caja abierta que pagará esta compra');
        return;
      }

      const saveButton = document.getElementById('btn-guardar-compra');
      saveButton.disabled = true;
      const pId = document.getElementById('compra-proveedor').value;
      const notas = document.getElementById('compra-notas').value;
      const items = this.cart.map(c => ({
        producto_id: c.id,
        cantidad: c.qty,
        precio_unitario: c.cost
      }));
      try {
        await ComprasService.registrar(pId || null, items, notas, turnoCajaId);
        Toast.success('Compra registrada');
        document.getElementById('modal-compra').style.display = 'none';
        await this.loadData();
      } catch (err) {
        Toast.error(err.message || 'No se pudo registrar la compra.');
      } finally {
        saveButton.disabled = false;
      }
    });

    document.querySelector('#compras-table').addEventListener('click', async (e) => {
      if (e.target.classList.contains('btn-detalle')) {
        this.showDetalle(e.target.dataset.id);
      } else if (e.target.classList.contains('btn-anular')) {
        this.confirmarAnulacion(e.target.dataset.id);
      }
    });
  }

  async loadTurnosCaja() {
    const select = document.getElementById('compra-turno-caja');
    const saveButton = document.getElementById('btn-guardar-compra');
    select.disabled = true;
    saveButton.disabled = true;
    select.innerHTML = '<option value="">Cargando cajas abiertas...</option>';

    try {
      const turnos = await CajaService.getTurnosAbiertos();
      if (turnos.length === 0) {
        select.innerHTML = '<option value="">No hay cajas abiertas</option>';
        Toast.error('Abre un turno de caja antes de registrar una compra en efectivo.');
        return;
      }

      select.innerHTML = '<option value="">Selecciona una caja abierta</option>' +
        turnos.map(turno => `<option value="${turno.id}">Caja ${turno.numero_caja} · ${formatDate(turno.apertura, 'datetime')}</option>`).join('');
      select.disabled = false;
      saveButton.disabled = false;
    } catch (error) {
      select.innerHTML = '<option value="">No se pudieron cargar las cajas</option>';
      Toast.error(error.message || 'No se pudieron consultar las cajas abiertas.');
    }
  }

  async confirmarAnulacion(compraId) {
    try {
      const movimientoCaja = await ComprasService.getMovimientoCaja(compraId);
      const turnos = movimientoCaja ? await CajaService.getTurnosAbiertos() : [];
      if (movimientoCaja && turnos.length === 0) {
        Toast.error('Abre una caja para registrar el reembolso antes de anular esta compra.');
        return;
      }

      const selector = movimientoCaja
        ? `<label class="form-label" for="compra-turno-reembolso">Caja que recibe el reembolso (${formatCOP(movimientoCaja.monto)})</label>
           <select id="compra-turno-reembolso" class="form-control" required>
             <option value="">Selecciona una caja abierta</option>
             ${turnos.map(turno => `<option value="${turno.id}">Caja ${turno.numero_caja} · ${formatDate(turno.apertura, 'datetime')}</option>`).join('')}
           </select>`
        : '<p>Se revertirá el inventario. Esta compra anterior no tiene un egreso de caja vinculado, por lo que el saldo actual no cambiará.</p>';

      Modal.open({
        title: 'Anular compra',
        size: 'md',
        content: `<p>¿Confirmas anular esta compra y revertir sus existencias?</p>${selector}`,
        actions: [
          { label: 'Cancelar', class: 'btn-secondary', onClick: (event, modal) => modal.close() },
          {
            label: 'Anular compra',
            class: 'btn-danger',
            onClick: async (event, modal) => {
              const turnoReembolsoId = movimientoCaja
                ? document.getElementById('compra-turno-reembolso').value
                : null;
              if (movimientoCaja && !turnoReembolsoId) {
                Toast.error('Selecciona la caja que recibirá el reembolso.');
                return;
              }

              try {
                await ComprasService.anular(compraId, turnoReembolsoId);
                Toast.success('Compra anulada');
                modal.close();
                await this.loadData();
              } catch (error) {
                Toast.error(error.message || 'No se pudo anular la compra.');
              }
            }
          }
        ]
      });
    } catch (error) {
      Toast.error(error.message || 'No se pudo preparar la anulación de la compra.');
    }
  }

  addToCart(prod) {
    const ex = this.cart.find(c => c.id === prod.id);
    if (ex) {
      ex.qty += 1;
    } else {
      this.cart.push({
        id: prod.id,
        nombre: prod.nombre,
        qty: 1,
        cost: prod.precio_costo || 0
      });
    }
    this.renderCart();
  }

  renderCart() {
    const tbody = document.querySelector('#cart-table tbody');
    tbody.innerHTML = '';
    let total = 0;
    this.cart.forEach((c, i) => {
      const sub = c.qty * c.cost;
      total += sub;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.nombre}</td>
        <td><input type="number" min="1" class="form-control qty-input" data-index="${i}" value="${c.qty}" style="width:70px"></td>
        <td><input type="number" min="0" class="form-control cost-input" data-index="${i}" value="${c.cost}" style="width:100px"></td>
        <td>${formatCOP(sub)}</td>
        <td><button class="btn btn-sm btn-danger btn-remove-cart" data-index="${i}">X</button></td>
      `;
      tbody.appendChild(tr);
    });
    document.getElementById('cart-total').innerText = formatCOP(total);

    document.querySelectorAll('.qty-input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        this.cart[e.target.dataset.index].qty = parseInt(e.target.value, 10);
        this.renderCart();
      });
    });
    document.querySelectorAll('.cost-input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        this.cart[e.target.dataset.index].cost = parseFloat(e.target.value);
        this.renderCart();
      });
    });
    document.querySelectorAll('.btn-remove-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.cart.splice(e.target.dataset.index, 1);
        this.renderCart();
      });
    });
  }

  async showDetalle(id) {
    const content = document.getElementById('detalle-content');
    content.innerHTML = '<p>Cargando...</p>';
    document.getElementById('modal-detalle-compra').style.display = 'flex';
    try {
      const detalles = await ComprasService.getDetalle(id);
      if (!detalles || detalles.length === 0) {
        content.innerHTML = '<p>Esta compra no tiene productos registrados.</p>';
        return;
      }

      let html = '<table class="table"><thead><tr><th>Producto</th><th>Cant.</th><th>Costo Unit.</th><th>Subtotal</th></tr></thead><tbody>';
      detalles.forEach(d => {
        const prod = d.productos?.nombre || '-';
        html += `<tr>
          <td>${prod}</td>
          <td>${d.cantidad}</td>
          <td>${formatCOP(d.precio_unitario)}</td>
          <td>${formatCOP(d.subtotal)}</td>
        </tr>`;
      });
      html += '</tbody></table>';
      content.innerHTML = html;
    } catch(e) {
      content.innerHTML = '<p class="text-danger">Error cargando detalles.</p>';
    }
  }
}
