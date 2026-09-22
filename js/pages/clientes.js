import { ClientesService } from '../services/clientes.service.js';
import { Auth } from '../lib/auth.js';
import { Toast } from '../lib/toast.js';
import { formatCOP, formatDate } from '../lib/utils.js';

export class ClientesPage {
  constructor(container) {
    this.container = container;
    this.currentPage = 1;
    this.pageSize = 15;
    this.searchQuery = '';
  }

  async render() {
    if (!Auth.hasPermission('clientes')) {
      this.container.innerHTML = '<h2>Acceso Denegado</h2>';
      return;
    }

    this.container.innerHTML = `
      <div class="page-header">
        <h2>Gestión de Clientes</h2>
        <button id="btn-nuevo-cliente" class="btn btn-primary">+ Nuevo Cliente</button>
      </div>
      <div class="filters-bar mb-3">
        <input type="text" id="search-cliente" placeholder="Buscar por nombre o documento..." class="form-control" style="max-width: 400px;">
      </div>
      <div class="table-responsive">
        <table class="table table-striped" id="clientes-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Documento</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="5">Cargando...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Modal Form -->
      <div id="modal-cliente" class="modal" style="display: none;">
        <div class="modal-content">
          <h3 id="modal-title-cliente">Nuevo Cliente</h3>
          <form id="form-cliente">
            <input type="hidden" id="cli-id">
            <div class="form-group">
              <label>Nombre *</label>
              <input type="text" id="cli-nombre" required class="form-control">
            </div>
            <div class="form-group">
              <label>Documento</label>
              <input type="text" id="cli-documento" class="form-control">
            </div>
            <div class="form-group">
              <label>Teléfono</label>
              <input type="text" id="cli-telefono" class="form-control">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="cli-email" class="form-control">
            </div>
            <div class="form-group">
              <label>Dirección</label>
              <input type="text" id="cli-direccion" class="form-control">
            </div>
            <div class="form-actions mt-3">
              <button type="button" class="btn btn-secondary btn-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal Historial -->
      <div id="modal-historial" class="modal" style="display: none;">
        <div class="modal-content" style="max-width: 800px;">
          <h3>Historial de Compras - <span id="historial-cliente-nombre"></span></h3>
          <div class="table-responsive">
            <table class="table" id="historial-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Nro. Venta</th>
                  <th>Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
          <button type="button" class="btn btn-secondary btn-cancel mt-3">Cerrar</button>
        </div>
      </div>
    `;

    this.bindEvents();
    this.loadData();
  }

  async loadData() {
    const tbody = document.querySelector('#clientes-table tbody');
    try {
      const res = await ClientesService.getAll({
        search: this.searchQuery,
        page: this.currentPage,
        pageSize: this.pageSize
      });
      
      tbody.innerHTML = '';
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No se encontraron clientes.</td></tr>';
        return;
      }

      res.data.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${c.nombre}</td>
          <td>${c.documento || '-'}</td>
          <td>${c.telefono || '-'}</td>
          <td>${c.email || '-'}</td>
          <td>
            <button class="btn btn-sm btn-info btn-edit" data-id="${c.id}">Editar</button>
            <button class="btn btn-sm btn-secondary btn-history" data-id="${c.id}" data-name="${c.nombre}">Historial</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (error) {
      Toast.error('Error cargando clientes');
    }
  }

  bindEvents() {
    document.getElementById('search-cliente').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.loadData();
    });

    document.getElementById('btn-nuevo-cliente').addEventListener('click', () => this.openModal());

    document.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('modal-cliente').style.display = 'none';
        document.getElementById('modal-historial').style.display = 'none';
      });
    });

    document.getElementById('form-cliente').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('cli-id').value;
      const data = {
        nombre: document.getElementById('cli-nombre').value,
        documento: document.getElementById('cli-documento').value,
        telefono: document.getElementById('cli-telefono').value,
        email: document.getElementById('cli-email').value,
        direccion: document.getElementById('cli-direccion').value
      };

      try {
        if (id) await ClientesService.update(id, data);
        else await ClientesService.create(data);
        Toast.success('Cliente guardado');
        document.getElementById('modal-cliente').style.display = 'none';
        this.loadData();
      } catch (err) {
        Toast.error(err.message);
      }
    });

    document.querySelector('#clientes-table').addEventListener('click', async (e) => {
      if (e.target.classList.contains('btn-edit')) {
        const id = e.target.dataset.id;
        this.openModal(id);
      } else if (e.target.classList.contains('btn-history')) {
        const id = e.target.dataset.id;
        const name = e.target.dataset.name;
        this.showHistory(id, name);
      }
    });
  }

  async openModal(id = null) {
    const form = document.getElementById('form-cliente');
    form.reset();
    document.getElementById('cli-id').value = '';
    document.getElementById('modal-title-cliente').innerText = id ? 'Editar Cliente' : 'Nuevo Cliente';

    if (id) {
      const c = await ClientesService.getById(id);
      if (c) {
        document.getElementById('cli-id').value = c.id;
        document.getElementById('cli-nombre').value = c.nombre || '';
        document.getElementById('cli-documento').value = c.documento || '';
        document.getElementById('cli-telefono').value = c.telefono || '';
        document.getElementById('cli-email').value = c.email || '';
        document.getElementById('cli-direccion').value = c.direccion || '';
      }
    }
    document.getElementById('modal-cliente').style.display = 'flex';
  }

  async showHistory(id, name) {
    document.getElementById('historial-cliente-nombre').innerText = name;
    const tbody = document.querySelector('#historial-table tbody');
    tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
    document.getElementById('modal-historial').style.display = 'flex';

    try {
      const history = await ClientesService.getHistorial(id);
      tbody.innerHTML = '';
      if (!history || history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">No hay compras registradas</td></tr>';
        return;
      }
      history.forEach(v => {
        tbody.innerHTML += `
          <tr>
            <td>${formatDate(v.fecha)}</td>
            <td>${v.numero_venta}</td>
            <td>${formatCOP(v.total)}</td>
            <td>${v.estado}</td>
          </tr>
        `;
      });
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="4">Error al cargar historial (Requiere conexión)</td></tr>';
    }
  }
}
