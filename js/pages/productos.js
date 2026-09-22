import { ProductosService } from '../services/productos.service.js';
import { ProveedoresService } from '../services/proveedores.service.js';
import { Auth } from '../lib/auth.js';
import { Toast } from '../lib/toast.js';
import { formatCOP } from '../lib/utils.js';

export class ProductosPage {
  constructor(container) {
    this.container = container;
    this.currentPage = 1;
    this.pageSize = 15;
    this.searchQuery = '';
    this.categoriaId = '';
  }

  async render() {
    if (!Auth.hasPermission('productos')) {
      this.container.innerHTML = '<h2>Acceso Denegado</h2>';
      return;
    }

    this.container.innerHTML = `
      <div class="page-header">
        <h2>Gestión de Productos</h2>
        <button id="btn-nuevo-producto" class="btn btn-primary">+ Nuevo Producto</button>
      </div>
      <div class="filters-bar">
        <input type="text" id="search-producto" placeholder="Buscar por código, nombre o SKU..." class="form-control">
        <select id="filter-categoria" class="form-control">
          <option value="">Todas las Categorías</option>
        </select>
      </div>
      <div class="table-responsive">
        <table class="table table-striped" id="productos-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Precio Venta</th>
              <th>Precio Costo</th>
              <th>Stock</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="8">Cargando...</td></tr>
          </tbody>
        </table>
      </div>
      
      <!-- Modal Nuevo/Editar Producto -->
      <div id="modal-producto" class="modal" style="display: none;">
        <div class="modal-content">
          <h3 id="modal-title">Nuevo Producto</h3>
          <form id="form-producto">
            <input type="hidden" id="prod-id">
            <div class="form-group">
              <label>Nombre *</label>
              <input type="text" id="prod-nombre" required class="form-control">
            </div>
            <div class="form-group">
              <label>Código de Barras</label>
              <input type="text" id="prod-codigo" class="form-control">
            </div>
            <div class="form-group">
              <label>SKU</label>
              <input type="text" id="prod-sku" class="form-control">
            </div>
            <div class="form-group">
              <label>Categoría</label>
              <select id="prod-categoria" class="form-control"></select>
            </div>
            <div class="form-group">
              <label>Proveedor</label>
              <select id="prod-proveedor" class="form-control"></select>
            </div>
            <div class="form-group">
              <label>Precio de Venta *</label>
              <input type="number" id="prod-precio-venta" required min="0" class="form-control">
            </div>
            <div class="form-group">
              <label>Precio de Costo</label>
              <input type="number" id="prod-precio-costo" min="0" value="0" class="form-control">
            </div>
            <div class="form-group">
              <label>Stock Actual</label>
              <input type="number" id="prod-stock" value="0" class="form-control">
            </div>
            <div class="form-group">
              <label>Stock Mínimo</label>
              <input type="number" id="prod-stock-minimo" value="5" class="form-control">
            </div>
            <div class="form-group">
              <label>Unidad de Medida</label>
              <select id="prod-unidad" class="form-control">
                <option value="unidad">Unidad</option>
                <option value="caja">Caja</option>
                <option value="resma">Resma</option>
                <option value="paquete">Paquete</option>
                <option value="metro">Metro</option>
                <option value="rollo">Rollo</option>
              </select>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="prod-activo" checked> Activo
              </label>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" id="btn-cancel-modal">Cancelar</button>
              <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.bindEvents();
    await this.loadSelects();
    this.loadData();
  }

  async loadSelects() {
    try {
      const categorias = await ProductosService.getCategories();
      const catSelects = [document.getElementById('filter-categoria'), document.getElementById('prod-categoria')];
      let catHtml = '<option value="">Seleccione Categoría...</option>';
      categorias.forEach(c => {
        catHtml += `<option value="${c.id}">${c.nombre}</option>`;
      });
      catSelects.forEach(sel => { if(sel) sel.innerHTML = catHtml; });

      const proveedores = await ProveedoresService.getAll({activo: true, pageSize: 100});
      const provSelect = document.getElementById('prod-proveedor');
      if (provSelect && proveedores.data) {
        let provHtml = '<option value="">Seleccione Proveedor...</option>';
        proveedores.data.forEach(p => {
          provHtml += `<option value="${p.id}">${p.nombre}</option>`;
        });
        provSelect.innerHTML = provHtml;
      }
    } catch (e) {
      console.error(e);
    }
  }

  async loadData() {
    const tbody = document.querySelector('#productos-table tbody');
    try {
      const res = await ProductosService.getAll({
        search: this.searchQuery,
        categoria_id: this.categoriaId,
        page: this.currentPage,
        pageSize: this.pageSize
      });
      
      tbody.innerHTML = '';
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No se encontraron productos.</td></tr>';
        return;
      }

      res.data.forEach(p => {
        const catName = p.categorias?.nombre || p.categoria_id || '-';
        const stockClass = p.stock_actual > p.stock_minimo ? 'badge-success' : (p.stock_actual === p.stock_minimo ? 'badge-warning' : 'badge-danger');
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.codigo_barras || '-'}</td>
          <td>${p.nombre}</td>
          <td>${catName}</td>
          <td>${formatCOP(p.precio_venta)}</td>
          <td>${formatCOP(p.precio_costo)}</td>
          <td><span class="badge ${stockClass}">${p.stock_actual}</span></td>
          <td><span class="badge ${p.activo ? 'badge-success' : 'badge-danger'}">${p.activo ? 'Activo' : 'Inactivo'}</span></td>
          <td>
            <button class="btn btn-sm btn-info btn-edit" data-id="\${p.id}">Editar</button>
            ${p.activo ? `<button class="btn btn-sm btn-danger btn-disable" data-id="${p.id}">Desactivar</button>` : ''}
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (error) {
      console.error(error);
      Toast.error('Error cargando productos');
      tbody.innerHTML = '<tr><td colspan="8">Error cargando datos.</td></tr>';
    }
  }

  bindEvents() {
    const searchInput = document.getElementById('search-producto');
    let timeout = null;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        this.searchQuery = e.target.value;
        this.currentPage = 1;
        this.loadData();
      }, 300);
    });

    document.getElementById('filter-categoria').addEventListener('change', (e) => {
      this.categoriaId = e.target.value;
      this.currentPage = 1;
      this.loadData();
    });

    document.getElementById('btn-nuevo-producto').addEventListener('click', () => {
      this.openModal();
    });

    document.getElementById('btn-cancel-modal').addEventListener('click', () => {
      document.getElementById('modal-producto').style.display = 'none';
    });

    document.getElementById('form-producto').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveProduct();
    });

    document.querySelector('#productos-table').addEventListener('click', async (e) => {
      if (e.target.classList.contains('btn-edit')) {
        const id = e.target.dataset.id;
        this.openModal(id);
      } else if (e.target.classList.contains('btn-disable')) {
        const id = e.target.dataset.id;
        if (confirm('¿Seguro que desea desactivar este producto?')) {
          try {
            await ProductosService.delete(id);
            Toast.success('Producto desactivado');
            this.loadData();
          } catch (err) {
            Toast.error('Error al desactivar');
          }
        }
      }
    });
  }

  async openModal(id = null) {
    const modal = document.getElementById('modal-producto');
    const form = document.getElementById('form-producto');
    form.reset();
    document.getElementById('prod-id').value = '';

    if (id) {
      document.getElementById('modal-title').innerText = 'Editar Producto';
      try {
        const p = await ProductosService.getById(id);
        document.getElementById('prod-id').value = p.id;
        document.getElementById('prod-nombre').value = p.nombre || '';
        document.getElementById('prod-codigo').value = p.codigo_barras || '';
        document.getElementById('prod-sku').value = p.sku || '';
        document.getElementById('prod-categoria').value = p.categoria_id || '';
        document.getElementById('prod-proveedor').value = p.proveedor_id || '';
        document.getElementById('prod-precio-venta').value = p.precio_venta || 0;
        document.getElementById('prod-precio-costo').value = p.precio_costo || 0;
        document.getElementById('prod-stock').value = p.stock_actual || 0;
        document.getElementById('prod-stock-minimo').value = p.stock_minimo || 5;
        document.getElementById('prod-unidad').value = p.unidad_medida || 'unidad';
        document.getElementById('prod-activo').checked = p.activo !== false;
      } catch (e) {
        Toast.error('Error cargando el producto');
        return;
      }
    } else {
      document.getElementById('modal-title').innerText = 'Nuevo Producto';
      document.getElementById('prod-activo').checked = true;
    }
    
    modal.style.display = 'flex';
  }

  async saveProduct() {
    const id = document.getElementById('prod-id').value;
    const data = {
      nombre: document.getElementById('prod-nombre').value,
      codigo_barras: document.getElementById('prod-codigo').value || null,
      sku: document.getElementById('prod-sku').value || null,
      categoria_id: document.getElementById('prod-categoria').value || null,
      proveedor_id: document.getElementById('prod-proveedor').value || null,
      precio_venta: parseFloat(document.getElementById('prod-precio-venta').value),
      precio_costo: parseFloat(document.getElementById('prod-precio-costo').value),
      stock_actual: parseInt(document.getElementById('prod-stock').value, 10),
      stock_minimo: parseInt(document.getElementById('prod-stock-minimo').value, 10),
      unidad_medida: document.getElementById('prod-unidad').value,
      activo: document.getElementById('prod-activo').checked
    };

    try {
      if (id) {
        await ProductosService.update(id, data);
        Toast.success('Producto actualizado exitosamente');
      } else {
        await ProductosService.create(data);
        Toast.success('Producto creado exitosamente');
      }
      document.getElementById('modal-producto').style.display = 'none';
      this.loadData();
    } catch (e) {
      Toast.error(e.message || 'Error guardando producto');
    }
  }
}
