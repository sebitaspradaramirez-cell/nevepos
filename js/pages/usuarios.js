import { usuariosService } from '../services/usuarios.service.js';

export class UsuariosPage {
    constructor() {
        this.container = document.getElementById('app-content');
    }

    async render() {
        this.container.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">Gestión de Usuarios</h1>
                <button class="btn btn-primary" id="btn-nuevo-usuario">+ Nuevo Usuario</button>
            </div>
            
            <div class="card mb-6">
                <div class="card-body table-responsive">
                    <table class="table table-hover" id="users-table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Rol</th>
                                <th>Estado</th>
                                <th>Último Acceso</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Data injected here -->
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        await this.loadData();
    }
    
    async loadData() {
        try {
            const users = await usuariosService.getAll();
            const tbody = document.querySelector('#users-table tbody');
            tbody.innerHTML = users.map(u => `
                <tr>
                    <td>${u.nombre}</td>
                    <td><span class="badge ${u.roles?.nombre === 'admin' ? 'role-admin' : 'role-cajero'}">${u.roles?.nombre || 'N/A'}</span></td>
                    <td><span class="badge ${u.activo ? 'badge-success' : 'badge-danger'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
                    <td>${u.ultimo_acceso || 'Nunca'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline btn-edit" data-id="${u.id}">Editar</button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }
}
