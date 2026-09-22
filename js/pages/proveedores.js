import { ProveedoresService } from '../services/proveedores.service.js';
import { Auth } from '../lib/auth.js';
import { Toast } from '../lib/toast.js';

export class ProveedoresPage {
  constructor(container) {
    this.container = container;
  }

  async render() {
    if (!Auth.hasPermission('proveedores')) {
      this.container.innerHTML = '<h2>Acceso Denegado</h2>';
      return;
    }

    this.container.innerHTML = `
      <div class="page-header">
        <h2>Gestión de Proveedores</h2>
        <button id="btn-nuevo-prov" class="btn btn-primary">+ Nuevo Proveedor</button>
      </div>
      <div class="filters-bar mb-3">
        <input type="text" id="search-prov" placeholder="Buscar por nombre o NIT..." class="form-control" style="max-width: 400px;">
      </div>
      <div class="table-responsive">
        <table class="table table-striped" id="prov-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>NIT</th>
              <th>Contacto</th>
              <th>Teléfono</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="6">Cargando...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Modal -->
      <div id="modal-prov" class="modal" style="display: none;">
        <div class="modal-content">
          <h3 id="modal-title-prov">Nuevo Proveedor</h3>
          <form id="form-prov">
            <input type="hidden" id="prov-id">
            <div class="form-group">
              <label>Nombre *</label>
              <input type="text" id="prov-nombre" required class="form-control">
            </div>
            <div class="form-group">
              <label>NIT</label>
              <input type="text" id="prov-nit" class="form-control">
            </div>
            <div class="form-group">
              <label>Contacto</label>
              <input type="text" id="prov-contacto" class="form-control">
            </div>
            <div class="form-group">
              <label>Teléfono</label>
              <input type="text" id="prov-telefono" class="form-control">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="prov-email" class="form-control">
            </div>
            <div class="form-group">
              <label>Dirección</label>
              <input type="text" id="prov-direccion" class="form-control">
            </div>
            <div class="form-group">
              <label><input type="checkbox" id="prov-activo" checked> Activo</label>
            </div>
            <div class="form-actions mt-3">
              <button type="button" class="btn btn-secondary btn-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.bindEvents();
    this.loadData();
  }

  async loadData(search = '') {
    const tbody = document.querySelector('#prov-table tbody');
    try {
      const res = await ProveedoresService.getAll({ search });
      tbody.innerHTML = '';
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No se encontraron proveedores.</td></tr>';
        return;
      }
      res.data.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.nombre}</td>
          <td>${p.nit || '-'}</td>
          <td>${p.contacto || '-'}</td>
          <td>${p.telefono || '-'}</td>
          <td><span class="badge ${p.activo ? 'badge-success' : 'badge-danger'}">${p.activo ? 'Activo' : 'Inactivo'}</span></td>
          <td>
            <button class="btn btn-sm btn-info btn-edit" data-id="\${p.id}">Editar</button>
            ${p.activo ? `<button class="btn btn-sm btn-danger btn-del" data-id="${p.id}">Desactivar</button>` : ''}
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      Toast.error('Error cargando proveedores');
    }
  }

  bindEvents() {
    document.getElementById('search-prov').addEventListener('input', (e) => {
      this.loadData(e.target.value);
    });
    
    document.getElementById('btn-nuevo-prov').addEventListener('click', () => this.openModal());
    
    document.querySelector('.btn-cancel').addEventListener('click', () => {
      document.getElementById('modal-prov').style.display = 'none';
    });

    document.getElementById('form-prov').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('prov-id').value;
      const data = {
        nombre: document.getElementById('prov-nombre').value,
        nit: document.getElementById('prov-nit').value,
        contacto: document.getElementById('prov-contacto').value,
        telefono: document.getElementById('prov-telefono').value,
        email: document.getElementById('prov-email').value,
        direccion: document.getElementById('prov-direccion').value,
        activo: document.getElementById('prov-activo').checked
      };

      try {
        if (id) await ProveedoresService.update(id, data);
        else await ProveedoresService.create(data);
        Toast.success('Proveedor guardado');
        document.getElementById('modal-prov').style.display = 'none';
        this.loadData();
      } catch (err) {
        Toast.error(err.message);
      }
    });

    document.querySelector('#prov-table').addEventListener('click', async (e) => {
      if (e.target.classList.contains('btn-edit')) {
        this.openModal(e.target.dataset.id);
      } else if (e.target.classList.contains('btn-del')) {
        if(confirm('¿Desactivar este proveedor?')) {
          await ProveedoresService.delete(e.target.dataset.id);
          Toast.success('Desactivado');
          this.loadData();
        }
      }
    });
  }

  async openModal(id = null) {
    const form = document.getElementById('form-prov');
    form.reset();
    document.getElementById('prov-id').value = '';
    document.getElementById('modal-title-prov').innerText = id ? 'Editar Proveedor' : 'Nuevo Proveedor';
    document.getElementById('prov-activo').checked = true;

    if (id) {
      const p = await ProveedoresService.getById(id);
      if (p) {
        document.getElementById('prov-id').value = p.id;
        document.getElementById('prov-nombre').value = p.nombre || '';
        document.getElementById('prov-nit').value = p.nit || '';
        document.getElementById('prov-contacto').value = p.contacto || '';
        document.getElementById('prov-telefono').value = p.telefono || '';
        document.getElementById('prov-email').value = p.email || '';
        document.getElementById('prov-direccion').value = p.direccion || '';
        document.getElementById('prov-activo').checked = p.activo !== false;
      }
    }
    document.getElementById('modal-prov').style.display = 'flex';
  }
}
