import { login, isAuthenticated, verifyMfaLogin } from '../lib/auth.js';
import { Toast } from '../lib/toast.js';

export const LoginPage = {
    render: async (container) => {
        if (isAuthenticated()) {
            window.location.hash = '#/pos';
            return;
        }

        container.innerHTML = `
            <div style="
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh; 
                background-color: #f0f2f5;
            ">
                <div style="
                    background: white; 
                    padding: 40px; 
                    border-radius: 8px; 
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1); 
                    width: 100%; 
                    max-width: 400px;
                ">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #2c3e50; margin: 0; font-size: 2rem;">NevePOS</h1>
                        <p style="color: #7f8c8d; margin-top: 5px;">Sistema de Punto de Venta</p>
                    </div>

                    <form id="login-form">
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; color: #34495e;">Correo Electrónico</label>
                            <input type="email" id="login-email" required style="
                                width: 100%; 
                                padding: 10px; 
                                border: 1px solid #ccc; 
                                border-radius: 4px; 
                                box-sizing: border-box;
                            ">
                        </div>
                        
                        <div style="margin-bottom: 25px;">
                            <label style="display: block; margin-bottom: 8px; color: #34495e;">Contraseña</label>
                            <input type="password" id="login-password" required style="
                                width: 100%; 
                                padding: 10px; 
                                border: 1px solid #ccc; 
                                border-radius: 4px; 
                                box-sizing: border-box;
                            ">
                        </div>

                        <button type="submit" id="login-btn" style="
                            width: 100%; 
                            padding: 12px; 
                            background-color: #3498db; 
                            color: white; 
                            border: none; 
                            border-radius: 4px; 
                            font-size: 16px; 
                            cursor: pointer;
                            transition: background 0.3s;
                        ">Iniciar Sesión</button>
                    </form>

                    <div id="mfa-form-container" style="display: none; margin-top: 20px; border-top: 1px dashed #ddd; padding-top: 15px;">
                        <label style="display: block; margin-bottom: 8px; color: #34495e;">Código de autenticación</label>
                        <input type="text" id="mfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;">
                        <button type="button" id="mfa-verify-btn" style="width: 100%; margin-top: 12px; padding: 12px; background: #3498db; color: white; border: none; border-radius: 4px;">Verificar código</button>
                    </div>

                    ${window.location.hostname === 'localhost' ? `<div style="margin-top: 20px; border-top: 1px dashed #ddd; padding-top: 15px; text-align: center;">
                        <button type="button" id="btn-demo-login" style="
                            width: 100%;
                            padding: 10px;
                            background: #27ae60;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            font-size: 14px;
                            font-weight: 500;
                            cursor: pointer;
                        ">⚡ Acceso Rápido Modo Demostración</button>
                        <small style="display: block; margin-top: 6px; color: #7f8c8d; font-size: 12px;">Prueba el punto de venta inmediatamente sin configurar Supabase</small>
                    </div>` : ''}
                    
                    ${!navigator.onLine ? `<div style="margin-top: 15px; text-align: center; color: #f39c12; font-size: 14px;">Modo Offline Activo - Use sesión en caché</div>` : ''}
                </div>
            </div>
        `;
    },

    onMount: () => {
        const form = document.getElementById('login-form');
        const btn = document.getElementById('login-btn');
        const btnDemo = document.getElementById('btn-demo-login');
        const mfaContainer = document.getElementById('mfa-form-container');
        const mfaCode = document.getElementById('mfa-code');
        const mfaButton = document.getElementById('mfa-verify-btn');
        
        if (btnDemo) {
            btnDemo.addEventListener('click', async () => {
                const { setDemoUser } = await import('../lib/auth.js');
                setDemoUser('administrador');
                Toast.success('Bienvenido a NevePOS (Modo Demostración)');
                window.location.hash = '#/pos';
            });
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;
                
                btn.disabled = true;
                btn.textContent = 'Iniciando...';
                
                try {
                    const result = await login(email, password);
                    if (result?.requiresMfa) {
                        form.style.display = 'none';
                        mfaContainer.style.display = 'block';
                        mfaCode.focus();
                        return;
                    }
                    Toast.success('Inicio de sesión exitoso');
                    window.location.hash = '#/pos';
                } catch (error) {
                    Toast.error(error.message || 'Error al iniciar sesión');
                    btn.disabled = false;
                    btn.textContent = 'Iniciar Sesión';
                }
            });
        }

        mfaButton?.addEventListener('click', async () => {
            mfaButton.disabled = true;
            try {
                await verifyMfaLogin(mfaCode.value);
                Toast.success('Verificación 2FA correcta');
                window.location.hash = '#/pos';
            } catch (error) {
                Toast.error(error.message || 'Código 2FA inválido');
                mfaButton.disabled = false;
            }
        });
    },

    
    onUnmount: () => {}
};
