import { InventarioService } from '../services/inventario.service.js';
import { ProductosService } from '../services/productos.service.js';
import { ProveedoresService } from '../services/proveedores.service.js';
import { Auth } from '../lib/auth.js';
import { Toast } from '../lib/toast.js';
import { formatDate } from '../lib/utils.js';

export class InventarioPage {
  constructor(container) {
    this.container = container;
  }

  async render() {
    if (!Auth.hasPermission('inventario')) {
      this.container.innerHTML = '<h2>Acceso Denegado</h2>';
      return;
    }

    this.container.innerHTML = `
      <div class="page-header">
        <h2>Control de Inventario</h2>
        <button id="btn-agregar-producto-inventario" class="btn btn-primary">+ Agregar producto al inventario</button>
      </div>

      <div class="row" id="stock-alerts">
        <!-- Stock alerts will be injected here -->
      </div>

      <div class="card mt-4">
        <h3>Ajuste Manual de Inventario</h3>
        <form id="form-ajuste" class="row">
          <div class="col-md-3 form-group">
            <label>Producto</label>
            <input type="text" id="ajuste-producto-search" class="form-control" placeholder="Buscar producto...">
            <input type="hidden" id="ajuste-producto-id" required>
            <div id="ajuste-producto-results" class="search-results"></div>
          </div>
          <div class="col-md-2 form-group">
            <label>Tipo</label>
            <select id="ajuste-tipo" class="form-control" required>
              <option value="entrada">Entrada (+)</option>
              <option value="salida">Salida (-)</option>
              <option value="ajuste">Ajustar a (=)</option>
            </select>
          </div>
          <div class="col-md-2 form-group">
            <label>Cantidad</label>
            <input type="number" id="ajuste-cantidad" class="form-control" required min="0">
          </div>
          <div class="col-md-3 form-group">
            <label>Notas</label>
            <input type="text" id="ajuste-notas" class="form-control">
          </div>
          <div class="col-md-2 form-group d-flex align-items-end">
            <button type="submit" class="btn btn-primary w-100">Registrar Movimiento</button>
          </div>
        </form>
      </div>

      <div class="card mt-4">
        <h3>Historial de Movimientos</h3>
        <div class="table-responsive">
          <table class="table table-striped" id="movimientos-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Stock Ant.</th>
                <th>Stock Nvo.</th>
                <th>Referencia</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="8">Cargando...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="modal-producto-inventario" class="modal" style="display: none; position: fixed; inset: 0; z-index: 100; align-items: center; justify-content: center; background: rgba(20, 30, 40, 0.48); padding: 16px; overflow-y: auto; max-width: none; max-height: none; border-radius: 0; box-shadow: none;">
        <div class="modal-content" style="width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; box-sizing: border-box; padding: 24px; border-radius: 8px; background: white;">
          <h3>Agregar producto al inventario</h3>
          <form id="form-producto-inventario">
            <div class="form-group">
              <label>Nombre *</label>
              <input type="text" id="inv-prod-nombre" required class="form-control">
            </div>
            <div class="form-group">
              <label>Código de barras</label>
              <input type="text" id="inv-prod-codigo" class="form-control">
            </div>
            <div class="form-group">
              <label>SKU</label>
              <input type="text" id="inv-prod-sku" class="form-control">
            </div>
            <div class="form-group">
              <label>Categoría</label>
              <select id="inv-prod-categoria" class="form-control"></select>
            </div>
            <div class="form-group">
              <label>Proveedor</label>
              <select id="inv-prod-proveedor" class="form-control"></select>
            </div>
            <div class="form-group">
              <label>Precio de venta</label>
              <input type="number" id="inv-prod-precio-venta" min="0" value="0" required class="form-control">
            </div>
            <div class="form-group">
              <label>Precio de costo</label>
              <input type="number" id="inv-prod-precio-costo" min="0" value="0" class="form-control">
            </div>
            <div class="form-group">
              <label>Stock inicial</label>
              <input type="number" id="inv-prod-stock" min="0" value="0" class="form-control">
            </div>
            <div class="form-group">
              <label>Stock mínimo</label>
              <input type="number" id="inv-prod-stock-minimo" min="0" value="5" class="form-control">
            </div>
            <div class="form-group">
              <label>Unidad de medida</label>
              <select id="inv-prod-unidad" class="form-control">
                <option value="unidad">Unidad</option>
                <option value="caja">Caja</option>
                <option value="resma">Resma</option>
                <option value="paquete">Paquete</option>
                <option value="metro">Metro</option>
                <option value="rollo">Rollo</option>
              </select>
            </div>
            <div class="form-group">
              <label><input type="checkbox" id="inv-prod-disponible-caja"> Disponible para vender en Caja</label>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
              <button type="button" class="btn btn-secondary" id="btn-cancelar-producto-inventario">Cancelar</button>
              <button type="submit" class="btn btn-primary">Guardar producto</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.bindEvents();
    this.loadProductOptions();
    this.loadAlerts();
    this.loadMovimientos();
  }

  async loadProductOptions() {
    try {
      const categories = await ProductosService.getCategories();
      const categorySelect = document.getElementById('inv-prod-categoria');
      categorySelect.replaceChildren(new Option('Sin categoría', ''));
      categories.forEach(category => categorySelect.add(new Option(category.nombre, category.id)));
    } catch (error) {
      console.error('Error cargando categorías:', error);
    }

    try {
      const { data: suppliers } = await ProveedoresService.getAll({ activo: true, pageSize: 100 });
      const supplierSelect = document.getElementById('inv-prod-proveedor');
      supplierSelect.replaceChildren(new Option('Sin proveedor', ''));
      suppliers.forEach(supplier => supplierSelect.add(new Option(supplier.nombre, supplier.id)));
    } catch (error) {
      console.error('Error cargando proveedores:', error);
    }
  }

  async loadAlerts() {
    const alertsContainer = document.getElementById('stock-alerts');
    try {
      const alertas = await InventarioService.getAlertasStock();
      alertsContainer.innerHTML = alertas.length ? '' : '<p class="p-3">No hay productos con stock bajo.</p>';
      
      alertas.forEach(p => {
        const div = document.createElement('div');
        div.className = 'col-md-3 mb-3';
        div.innerHTML = `
          <div class="card alert-card ${p.stock_actual === 0 ? 'bg-danger text-white' : 'bg-warning'}">
            <h4>${p.nombre}</h4>
            <p>Stock: ${p.stock_actual} (Mín: ${p.stock_minimo})</p>
            <button class="btn btn-sm btn-light btn-ajustar-rapido" data-id="${p.id}" data-name="${p.nombre}">Ajustar</button>
          </div>
        `;
        alertsContainer.appendChild(div);
      });
    } catch (e) {
      alertsContainer.innerHTML = '<p class="text-danger">Error cargando alertas</p>';
    }
  }

  async loadMovimientos() {
    const tbody = document.querySelector('#movimientos-table tbody');
    try {
      const res = await InventarioService.getMovimientos({ pageSize: 30 });
      tbody.innerHTML = '';
      if (!res.data || res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No hay movimientos recientes.</td></tr>';
        return;
      }

      res.data.forEach(m => {
        const prodName = m.productos?.nombre || m.producto_id;
        const color = m.tipo === 'entrada' ? 'badge-success' : 
                      m.tipo === 'salida' ? 'badge-danger' : 
                      m.tipo === 'ajuste' ? 'badge-warning' : 
                      m.tipo === 'venta' ? 'badge-info' : 'badge-primary';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${formatDate(m.fecha)}</td>
          <td>${prodName}</td>
          <td><span class="badge ${color}">${m.tipo.toUpperCase()}</span></td>
          <td>${m.cantidad}</td>
          <td>${m.stock_anterior}</td>
          <td>${m.stock_nuevo}</td>
          <td>${m.referencia || '-'}</td>
          <td>${m.notas || '-'}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="8">Error cargando movimientos. Requiere conexión.</td></tr>';
    }
  }

  bindEvents() {
    const productModal = document.getElementById('modal-producto-inventario');
    const productForm = document.getElementById('form-producto-inventario');

    document.getElementById('btn-agregar-producto-inventario').addEventListener('click', () => {
      productForm.reset();
      productModal.style.display = 'flex';
      document.getElementById('inv-prod-nombre').focus();
    });

    document.getElementById('btn-cancelar-producto-inventario').addEventListener('click', () => {
      productModal.style.display = 'none';
      productForm.reset();
    });

    productForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = {
        nombre: document.getElementById('inv-prod-nombre').value.trim(),
        codigo_barras: document.getElementById('inv-prod-codigo').value.trim() || null,
        sku: document.getElementById('inv-prod-sku').value.trim() || null,
        categoria_id: document.getElementById('inv-prod-categoria').value || null,
        proveedor_id: document.getElementById('inv-prod-proveedor').value || null,
        precio_venta: Number(document.getElementById('inv-prod-precio-venta').value),
        precio_costo: Number(document.getElementById('inv-prod-precio-costo').value) || 0,
        stock_actual: Number.parseInt(document.getElementById('inv-prod-stock').value, 10) || 0,
        stock_minimo: Number.parseInt(document.getElementById('inv-prod-stock-minimo').value, 10) || 0,
        unidad_medida: document.getElementById('inv-prod-unidad').value,
        activo: true,
        disponible_en_caja: document.getElementById('inv-prod-disponible-caja').checked
      };

      try {
        await ProductosService.create(data);
        productModal.style.display = 'none';
        productForm.reset();
        Toast.success(data.disponible_en_caja
          ? 'Producto agregado al inventario y disponible en Caja'
          : 'Producto agregado al inventario; no aparece en Caja');
        this.loadAlerts();
      } catch (error) {
        Toast.error(error.message || 'Error al agregar el producto');
      }
    });

    const searchInput = document.getElementById('ajuste-producto-search');
    const searchResults = document.getElementById('ajuste-producto-results');
    const idInput = document.getElementById('ajuste-producto-id');
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
            div.innerText = `${p.codigo_barras ? p.codigo_barras+' - ' : ''}${p.nombre}`;
            div.onclick = () => {
              idInput.value = p.id;
              searchInput.value = p.nombre;
              searchResults.style.display = 'none';
            };
            searchResults.appendChild(div);
          });
          searchResults.style.display = 'block';
        } else {
          searchResults.style.display = 'none';
        }
      }, 300);
    });

    document.getElementById('form-ajuste').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pId = idInput.value;
      const tipo = document.getElementById('ajuste-tipo').value;
      const cant = document.getElementById('ajuste-cantidad').value;
      const notas = document.getElementById('ajuste-notas').value;

      if (!pId) {
        Toast.error('Debe seleccionar un producto');
        return;
      }

      try {
        await InventarioService.registrarAjuste(pId, cant, tipo, notas);
        Toast.success('Inventario actualizado');
        document.getElementById('form-ajuste').reset();
        idInput.value = '';
        this.loadAlerts();
        this.loadMovimientos();
      } catch (err) {
        Toast.error(err.message || 'Error al ajustar inventario');
      }
    });

    document.getElementById('stock-alerts').addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-ajustar-rapido')) {
        const id = e.target.dataset.id;
        const name = e.target.dataset.name;
        idInput.value = id;
        searchInput.value = name;
        document.getElementById('ajuste-tipo').focus();
        // scroll to top
        window.scrollTo(0, 0);
      }
    });
  }
}
