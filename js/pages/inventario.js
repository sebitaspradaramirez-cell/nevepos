import { InventarioService } from '../services/inventario.service.js';
import { ProductosService } from '../services/productos.service.js';
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
    `;

    this.bindEvents();
    this.loadAlerts();
    this.loadMovimientos();
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
