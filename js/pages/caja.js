import { Auth, getCurrentUser, requireAuth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { formatCOP, formatDate, isOnline } from '../lib/utils.js';
import { Toast } from '../lib/toast.js';
import { Modal } from '../components/modal.js';
import { CajaService } from '../services/caja.service.js';

let currentTurno = null;
let movimientos = [];
let arqueo = null;

const renderAbrirCaja = () => {
    return `
        <div style="max-width: 500px; margin: 40px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="margin-top: 0; margin-bottom: 20px; color: #2c3e50;">Abrir Turno de Caja</h2>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Número de Caja</label>
                <select id="caja-numero" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
                    <option value="1">Caja 1</option>
                    <option value="2">Caja 2</option>
                </select>
            </div>
            
            <div style="margin-bottom: 25px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Monto de Apertura (Base)</label>
                <input type="number" id="caja-monto" value="0" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
            </div>
            
            <button id="btn-abrir-turno" class="btn btn-primary" style="width: 100%; padding: 12px; font-size: 16px;">
                Abrir Turno
            </button>
        </div>
    `;
};

const renderCajaAbierta = () => {
    const totalEfectivo = arqueo ? arqueo.expected_total : 0;

    let movsHtml = '';
    if (movimientos.length === 0) {
        movsHtml = '<tr><td colspan="4" style="text-align: center; padding: 15px; color: #888;">No hay movimientos registrados</td></tr>';
    } else {
        movsHtml = movimientos.map(m => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${formatDate(m.fecha || m.timestamp, 'datetime')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">
                    <span style="background: ${m.tipo === 'entrada' ? '#e8f5e9' : '#ffebee'}; color: ${m.tipo === 'entrada' ? '#4caf50' : '#f44336'}; padding: 3px 8px; border-radius: 12px; font-size: 12px;">
                        ${m.tipo.toUpperCase()}
                    </span>
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${m.concepto}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: ${m.tipo === 'entrada' ? '#4caf50' : '#f44336'};">
                    ${m.tipo === 'entrada' ? '+' : '-'}${formatCOP(m.monto)}
                </td>
            </tr>
        `).join('');
    }

    return `
        <div style="padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #2c3e50;">Caja #${currentTurno.numero_caja} - Turno Abierto</h2>
                <div style="text-align: right;">
                    <div style="color: #666; font-size: 14px;">Abierto por: ${getCurrentUser().nombre}</div>
                    <div style="color: #666; font-size: 14px;">Desde: ${formatDate(currentTurno.fecha_apertura || currentTurno.timestamp, 'datetime')}</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px;">
                <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <div style="color: #888; font-size: 14px; margin-bottom: 5px;">Monto Apertura</div>
                    <div style="font-size: 24px; font-weight: bold; color: #333;">${formatCOP(arqueo?.apertura || 0)}</div>
                </div>
                <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <div style="color: #888; font-size: 14px; margin-bottom: 5px;">Ventas Efectivo</div>
                    <div style="font-size: 24px; font-weight: bold; color: #4caf50;">${formatCOP(arqueo?.ventas_efectivo || 0)}</div>
                </div>
                <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <div style="color: #888; font-size: 14px; margin-bottom: 5px;">Ventas Transf.</div>
                    <div style="font-size: 24px; font-weight: bold; color: #2196f3;">${formatCOP(arqueo?.ventas_transferencia || 0)}</div>
                </div>
                <div style="background: #2c3e50; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); color: white;">
                    <div style="font-size: 14px; margin-bottom: 5px;">Total Esperado en Caja</div>
                    <div style="font-size: 24px; font-weight: bold;">${formatCOP(totalEfectivo)}</div>
                </div>
            </div>

            <div style="display: flex; gap: 20px;">
                <div style="flex: 2; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0;">Movimientos de Caja</h3>
                        <button id="btn-nuevo-mov" class="btn btn-secondary">Registrar Movimiento</button>
                    </div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f9f9f9;">
                                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #eee;">Fecha/Hora</th>
                                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #eee;">Tipo</th>
                                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #eee;">Concepto</th>
                                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #eee;">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${movsHtml}
                        </tbody>
                    </table>
                </div>

                <div style="flex: 1; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 20px; display: flex; flex-direction: column;">
                    <h3 style="margin-top: 0; margin-bottom: 20px;">Cierre de Caja</h3>
                    
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; color: #666;">Total Esperado (Efectivo)</label>
                        <div style="font-size: 20px; font-weight: bold;">${formatCOP(totalEfectivo)}</div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Monto Real Contado</label>
                        <input type="number" id="monto-real" value="${totalEfectivo}" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 18px;">
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 5px; color: #666;">Diferencia</label>
                        <div id="diferencia-display" style="font-size: 18px; font-weight: bold; color: #4caf50;">$0</div>
                    </div>

                    <div style="flex-grow: 1;"></div>
                    
                    <button id="btn-cerrar-caja" class="btn btn-danger" style="width: 100%; padding: 15px; font-size: 16px; font-weight: bold;">
                        Cerrar Turno de Caja
                    </button>
                </div>
            </div>
        </div>
    `;
};

const updateDiferencia = () => {
    const input = document.getElementById('monto-real');
    if (!input) return;
    
    const real = parseInt(input.value) || 0;
    const expected = arqueo ? arqueo.expected_total : 0;
    const diff = real - expected;
    
    const diffEl = document.getElementById('diferencia-display');
    if (diffEl) {
        diffEl.textContent = formatCOP(diff);
        diffEl.style.color = diff === 0 ? '#4caf50' : '#f44336';
    }
};

const refreshData = async (container) => {
    currentTurno = await CajaService.getTurnoActual();
    if (currentTurno) {
        movimientos = await CajaService.getMovimientos(currentTurno.id);
        arqueo = await CajaService.getArqueo(currentTurno.id);
        container.innerHTML = renderCajaAbierta();
        
        document.getElementById('monto-real').addEventListener('input', updateDiferencia);
        
        document.getElementById('btn-nuevo-mov').addEventListener('click', () => {
            Modal.open({
                title: 'Registrar Movimiento',
                size: 'sm',
                content: `
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px;">Tipo</label>
                        <select id="mov-tipo" style="width: 100%; padding: 8px; border: 1px solid #ccc;">
                            <option value="entrada">Entrada</option>
                            <option value="salida">Salida</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px;">Concepto</label>
                        <input type="text" id="mov-concepto" style="width: 100%; padding: 8px; border: 1px solid #ccc;" required>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px;">Monto</label>
                        <input type="number" id="mov-monto" style="width: 100%; padding: 8px; border: 1px solid #ccc;" required>
                    </div>
                `,
                actions: [
                    { label: 'Cancelar', class: 'btn-secondary', onClick: (e, m) => m.close() },
                    { 
                        label: 'Guardar', class: 'btn-primary', 
                        onClick: async (e, m) => {
                            const tipo = document.getElementById('mov-tipo').value;
                            const concepto = document.getElementById('mov-concepto').value;
                            const monto = parseInt(document.getElementById('mov-monto').value);
                            
                            if (!concepto || !monto) {
                                Toast.error('Complete todos los campos');
                                return;
                            }
                            
                            try {
                                await CajaService.registrarMovimiento(currentTurno.id, tipo, monto, concepto);
                                Toast.success('Movimiento registrado');
                                m.close();
                                refreshData(container);
                            } catch (err) {
                                Toast.error(err.message);
                            }
                        }
                    }
                ]
            });
        });

        document.getElementById('btn-cerrar-caja').addEventListener('click', () => {
            const real = parseInt(document.getElementById('monto-real').value) || 0;
            const diff = real - arqueo.expected_total;
            
            Modal.confirm('Cerrar Caja', `¿Está seguro de cerrar el turno?<br><br>Total Esperado: ${formatCOP(arqueo.expected_total)}<br>Total Real: ${formatCOP(real)}<br>Diferencia: ${formatCOP(diff)}`, async () => {
                try {
                    await CajaService.cerrarTurno(currentTurno.id);
                    Toast.success('Caja cerrada exitosamente');
                    
                    // Show summary modal
                    Modal.alert('Resumen de Cierre', `Turno cerrado.<br>Diferencia final: ${formatCOP(diff)}`);
                    
                    refreshData(container);
                } catch (err) {
                    Toast.error(err.message);
                }
            });
        });

    } else {
        container.innerHTML = renderAbrirCaja();
        document.getElementById('btn-abrir-turno').addEventListener('click', async () => {
            const numeroCaja = document.getElementById('caja-numero').value;
            const monto = parseInt(document.getElementById('caja-monto').value) || 0;
            
            try {
                await CajaService.abrirTurno(numeroCaja, monto);
                Toast.success('Turno abierto exitosamente');
                refreshData(container);
            } catch (err) {
                Toast.error(err.message);
            }
        });
    }
};

export const CajaPage = {
    render: async (container) => {
        if (!requireAuth()) return;
        await refreshData(container);
    },
    onMount: () => {},
    onUnmount: () => {
        currentTurno = null;
        movimientos = [];
        arqueo = null;
    }
};
