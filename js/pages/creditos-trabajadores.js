import { Auth } from '../lib/auth.js';
import { CreditosTrabajadoresService } from '../services/creditos-trabajadores.service.js';
import { ProductosService } from '../services/productos.service.js';
import { Toast } from '../lib/toast.js';
import { escapeHtml, formatCOP, formatDate } from '../lib/utils.js';

export class CreditosTrabajadoresPage {
  constructor(container) {
    this.container = container;
    this.records = [];
    this.products = [];
    this.filter = 'pendiente';
  }

  async render() {
    if (!Auth.hasPermission('creditos_trabajadores')) {
      this.container.innerHTML = '<h2>Acceso Denegado</h2>';
      return;
    }

    this.container.innerHTML = `
      <div class="page-header">
        <h2>Créditos a trabajadores</h2>
        <button id="btn-nuevo-credito" class="btn btn-primary">+ Registrar crédito</button>
      </div>
      <p class="text-muted">Registro de productos entregados a crédito. No modifica las existencias del inventario.</p>

      <div class="form-row mt-4">
        <div class="card card-body">
          <span class="text-muted">Saldo pendiente</span>
          <strong id="creditos-saldo" class="stat-value">$0</strong>
        </div>
        <div class="card card-body">
          <span class="text-muted">Créditos pendientes</span>
          <strong id="creditos-pendientes" class="stat-value">0</strong>
        </div>
        <div class="card card-body">
          <span class="text-muted">Total liquidado</span>
          <strong id="creditos-liquidado" class="stat-value">$0</strong>
        </div>
      </div>

      <div class="btn-group mt-4" role="group" aria-label="Filtrar créditos">
        <button type="button" class="btn btn-outline credit-filter active" data-filter="pendiente">Pendientes</button>
        <button type="button" class="btn btn-outline credit-filter" data-filter="liquidado">Liquidados</button>
      </div>

      <div class="table-responsive mt-3">
        <table class="table table-striped" id="creditos-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Trabajador</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Precio unitario</th>
              <th>Total</th>
              <th>Saldo</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody><tr><td colspan="9">Cargando créditos...</td></tr></tbody>
        </table>
      </div>

      <div id="modal-credito" class="modal" style="display:none;">
        <div class="modal-content">
          <h3>Registrar producto a crédito</h3>
          <form id="form-credito">
            <div class="form-group">
              <label class="form-label" for="credito-trabajador">Nombre del trabajador</label>
              <input id="credito-trabajador" class="form-control" type="text" maxlength="160" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="credito-producto">Producto</label>
              <select id="credito-producto" class="form-control" required>
                <option value="">Cargando productos...</option>
              </select>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="credito-cantidad">Cantidad</label>
                <input id="credito-cantidad" class="form-control" type="number" min="1" step="1" value="1" required>
              </div>
              <div class="form-group">
                <label class="form-label" for="credito-precio">Precio unitario acordado</label>
                <input id="credito-precio" class="form-control" type="number" min="1" step="1" required>
              </div>
            </div>
            <p id="credito-total-preview" class="text-right"><strong>Total: $0</strong></p>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" id="btn-cancelar-credito">Cancelar</button>
              <button type="submit" class="btn btn-primary">Guardar deuda</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.bindEvents();
    await Promise.all([this.loadProducts(), this.loadData()]);
  }

  async loadProducts() {
    const select = document.getElementById('credito-producto');
    try {
      const result = await ProductosService.getAll({ activo: true, pageSize: 1000 });
      this.products = result.data || [];
      select.innerHTML = '<option value="">Selecciona un producto...</option>' + this.products
        .map(product => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.nombre)} - ${formatCOP(product.precio_venta)}</option>`)
        .join('');
    } catch (error) {
      select.innerHTML = '<option value="">No se pudieron cargar los productos</option>';
      Toast.error(error.message || 'No se pudieron cargar los productos');
    }
  }

  async loadData() {
    const tbody = document.querySelector('#creditos-table tbody');
    try {
      this.records = await CreditosTrabajadoresService.getAll();
      this.renderSummary();
      this.renderTable();
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="9">${escapeHtml(error.message || 'Error cargando créditos.')}</td></tr>`;
      Toast.error(error.message || 'Error cargando créditos');
    }
  }

  renderSummary() {
    const pending = this.records.filter(record => record.estado === 'pendiente');
    const settled = this.records.filter(record => record.estado === 'liquidado');
    document.getElementById('creditos-saldo').textContent = formatCOP(
      pending.reduce((sum, record) => sum + Number(record.saldo), 0)
    );
    document.getElementById('creditos-pendientes').textContent = String(pending.length);
    document.getElementById('creditos-liquidado').textContent = formatCOP(
      settled.reduce((sum, record) => sum + Number(record.total), 0)
    );
  }

  renderTable() {
    const tbody = document.querySelector('#creditos-table tbody');
    const records = this.records.filter(record => record.estado === this.filter);
    if (!records.length) {
      tbody.innerHTML = `<tr><td colspan="9">No hay créditos ${this.filter === 'pendiente' ? 'pendientes' : 'liquidados'}.</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(record => `
      <tr>
        <td>${formatDate(record.created_at)}</td>
        <td>${escapeHtml(record.trabajador_nombre)}</td>
        <td>${escapeHtml(record.producto_nombre)}</td>
        <td>${Number(record.cantidad)}</td>
        <td>${formatCOP(record.precio_unitario)}</td>
        <td>${formatCOP(record.total)}</td>
        <td>${formatCOP(record.saldo)}</td>
        <td><span class="badge ${record.estado === 'pendiente' ? 'badge-warning' : 'badge-success'}">${record.estado === 'pendiente' ? 'Pendiente' : 'Liquidado'}</span></td>
        <td>${record.estado === 'pendiente' ? `<button type="button" class="btn btn-sm btn-success btn-liquidar" data-id="${escapeHtml(record.id)}">Liquidar</button>` : 'Pagado'}</td>
      </tr>
    `).join('');
  }

  updateTotalPreview() {
    const quantity = Number(document.getElementById('credito-cantidad').value) || 0;
    const price = Number(document.getElementById('credito-precio').value) || 0;
    document.getElementById('credito-total-preview').innerHTML = `<strong>Total: ${formatCOP(quantity * price)}</strong>`;
  }

  bindEvents() {
    document.getElementById('btn-nuevo-credito').addEventListener('click', () => {
      document.getElementById('form-credito').reset();
      document.getElementById('credito-cantidad').value = '1';
      document.getElementById('credito-precio').value = '';
      this.updateTotalPreview();
      document.getElementById('modal-credito').style.display = 'flex';
    });

    document.getElementById('btn-cancelar-credito').addEventListener('click', () => {
      document.getElementById('modal-credito').style.display = 'none';
    });

    document.getElementById('credito-producto').addEventListener('change', event => {
      const product = this.products.find(item => item.id === event.target.value);
      document.getElementById('credito-precio').value = product ? product.precio_venta : '';
      this.updateTotalPreview();
    });

    ['credito-cantidad', 'credito-precio'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => this.updateTotalPreview());
    });

    document.getElementById('form-credito').addEventListener('submit', async event => {
      event.preventDefault();
      const product = this.products.find(item => item.id === document.getElementById('credito-producto').value);
      if (!product) {
        Toast.error('Selecciona un producto válido');
        return;
      }

      try {
        await CreditosTrabajadoresService.create({
          trabajador_nombre: document.getElementById('credito-trabajador').value,
          producto_id: product.id,
          producto_nombre: product.nombre,
          cantidad: document.getElementById('credito-cantidad').value,
          precio_unitario: document.getElementById('credito-precio').value,
          created_by: Auth.getCurrentUser().id
        });
        document.getElementById('modal-credito').style.display = 'none';
        Toast.success('Crédito registrado');
        await this.loadData();
      } catch (error) {
        Toast.error(error.message || 'No se pudo registrar el crédito');
      }
    });

    document.querySelectorAll('.credit-filter').forEach(button => {
      button.addEventListener('click', () => {
        this.filter = button.dataset.filter;
        document.querySelectorAll('.credit-filter').forEach(item => item.classList.toggle('active', item === button));
        this.renderTable();
      });
    });

    document.querySelector('#creditos-table').addEventListener('click', async event => {
      const button = event.target.closest('.btn-liquidar');
      if (!button) return;
      const record = this.records.find(item => item.id === button.dataset.id);
      if (!record || !confirm(`¿Confirmas que ${record.trabajador_nombre} pagó ${formatCOP(record.saldo)}?`)) return;

      try {
        await CreditosTrabajadoresService.settle(record.id, Auth.getCurrentUser().id);
        Toast.success('Crédito liquidado');
        await this.loadData();
      } catch (error) {
        Toast.error(error.message || 'No se pudo liquidar el crédito');
      }
    });
  }
}