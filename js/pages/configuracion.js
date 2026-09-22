import { SyncManager } from '../lib/sync.js';
import { enrollMfa, verifyMfaEnrollment, listMfaFactors, unenrollMfa } from '../lib/auth.js';

export class ConfiguracionPage {
    constructor() {
        this.container = document.getElementById('app-content');
    }

    async render() {
        this.container.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">Configuración</h1>
            </div>
            
            <div class="card mb-6">
                <div class="card-header"><h3 class="card-title">Información del Negocio</h3></div>
                <div class="card-body">
                    <div class="form-group">
                        <label class="form-label">Nombre del Negocio</label>
                        <input type="text" class="form-control" id="conf-nombre" value="NevePOS Papelería">
                    </div>
                </div>
                <div class="card-footer">
                    <button class="btn btn-primary" id="btn-save-biz">Guardar</button>
                </div>
            </div>

            <div class="card mb-6">
                <div class="card-header"><h3 class="card-title">Gestión de Datos y Sincronización</h3></div>
                <div class="card-body flex gap-4">
                    <button class="btn btn-outline" id="btn-sync-now">Sincronizar Ahora</button>
                    <button class="btn btn-outline" id="btn-export-db">Exportar Base de Datos Local</button>
                </div>
            </div>

            <div class="card mb-6">
                <div class="card-header"><h3 class="card-title">Seguridad de acceso</h3></div>
                <div class="card-body">
                    <p id="mfa-status">Cargando estado de autenticación de dos factores...</p>
                    <div id="mfa-setup" class="hidden"></div>
                    <button class="btn btn-primary" id="btn-mfa-setup">Configurar autenticador</button>
                </div>
            </div>
        `;
        
        this.attachEvents();
    }
    
    async attachEvents() {
        document.getElementById('btn-sync-now')?.addEventListener('click', () => {
            SyncManager.fullSync();
        });

        const status = document.getElementById('mfa-status');
        const setup = document.getElementById('mfa-setup');
        const button = document.getElementById('btn-mfa-setup');
        const factors = await listMfaFactors();
        const verified = factors.find(factor => factor.status === 'verified');
        if (verified) {
            status.textContent = '2FA activo. Se solicitará un código al iniciar sesión.';
            button.textContent = 'Desactivar 2FA';
            button.className = 'btn btn-danger';
            button.onclick = async () => {
                await unenrollMfa(verified.id);
                status.textContent = '2FA desactivado.';
                button.textContent = 'Configurar autenticador';
                button.className = 'btn btn-primary';
            };
            return;
        }
        status.textContent = '2FA no está configurado.';
        button.onclick = async () => {
            button.disabled = true;
            const data = await enrollMfa();
            setup.classList.remove('hidden');
            setup.innerHTML = `<p>Escanea este QR con Google Authenticator, Microsoft Authenticator o Authy:</p><img src="${data.totp.qr_code}" alt="Código QR para configurar 2FA" style="max-width: 220px;"><p>Si no puedes escanearlo, usa esta clave: <strong>${data.totp.secret}</strong></p><input id="mfa-setup-code" inputmode="numeric" maxlength="6" placeholder="Código de 6 dígitos" class="form-control"><button id="btn-mfa-confirm" class="btn btn-primary mt-4">Confirmar 2FA</button>`;
            document.getElementById('btn-mfa-confirm').onclick = async () => {
                await verifyMfaEnrollment(data.id, document.getElementById('mfa-setup-code').value);
                status.textContent = '2FA activo. Se solicitará un código al iniciar sesión.';
                setup.classList.add('hidden');
                button.remove();
            };
        };
    }
}
