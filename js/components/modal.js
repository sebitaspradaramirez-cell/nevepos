import { escapeHtml } from '../lib/utils.js';

class ModalManager {
    constructor() {
        this.overlay = document.getElementById('modal-overlay');
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.id = 'modal-overlay';
            this.overlay.className = 'modal-overlay hidden';
            this.overlay.innerHTML = `<div class="modal-container" id="modal-container"></div>`;
            document.body.appendChild(this.overlay);
            
            // Add basic styles to head if not present
            if (!document.getElementById('modal-styles')) {
                const style = document.createElement('style');
                style.id = 'modal-styles';
                style.textContent = `
                    .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
                    .modal-overlay.hidden { display: none; }
                    .modal-container { background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: flex; flex-direction: column; max-height: 90vh; }
                    .modal-container.sm { width: 300px; }
                    .modal-container.md { width: 500px; }
                    .modal-container.lg { width: 800px; }
                    .modal-header { padding: 15px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
                    .modal-header h3 { margin: 0; font-size: 1.25rem; }
                    .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1; }
                    .modal-body { padding: 20px; overflow-y: auto; }
                    .modal-footer { padding: 15px 20px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 10px; }
                    .btn { padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer; font-size: 14px; }
                    .btn-primary { background: #2196f3; color: white; }
                    .btn-danger { background: #f44336; color: white; }
                    .btn-secondary { background: #e0e0e0; color: #333; }
                `;
                document.head.appendChild(style);
            }
        }
        this.container = document.getElementById('modal-container');
        this.currentOnClose = null;

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.overlay.classList.contains('hidden')) {
                this.close();
            }
        });
    }

    open({ title, content, size = 'md', onClose, actions = [] }) {
        this.currentOnClose = onClose;
        this.container.className = `modal-container ${size}`;
        
        let footerHtml = '';
        if (actions.length > 0) {
            footerHtml = `<div class="modal-footer" id="modal-footer"></div>`;
        }

        this.container.innerHTML = `
            <div class="modal-header">
                <h3>${escapeHtml(title)}</h3>
                <button class="modal-close" id="modal-close-btn">&times;</button>
            </div>
            <div class="modal-body">${content}</div>
            ${footerHtml}
        `;

        document.getElementById('modal-close-btn').addEventListener('click', () => this.close());

        if (actions.length > 0) {
            const footer = document.getElementById('modal-footer');
            actions.forEach(action => {
                const btn = document.createElement('button');
                btn.className = `btn ${action.class || 'btn-secondary'}`;
                btn.textContent = action.label;
                btn.addEventListener('click', (e) => {
                    if (action.onClick) action.onClick(e, this);
                });
                footer.appendChild(btn);
            });
        }

        this.overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.overlay.classList.add('hidden');
        document.body.style.overflow = '';
        if (this.currentOnClose) {
            this.currentOnClose();
            this.currentOnClose = null;
        }
    }

    confirm(title, message, onConfirm) {
        this.open({
            title,
            content: `<p>${escapeHtml(message)}</p>`,
            size: 'sm',
            actions: [
                {
                    label: 'Cancelar',
                    class: 'btn-secondary',
                    onClick: () => this.close()
                },
                {
                    label: 'Confirmar',
                    class: 'btn-primary',
                    onClick: () => {
                        if (onConfirm) onConfirm();
                        this.close();
                    }
                }
            ]
        });
    }

    alert(title, message) {
        this.open({
            title,
            content: `<p>${escapeHtml(message)}</p>`,
            size: 'sm',
            actions: [
                {
                    label: 'OK',
                    class: 'btn-primary',
                    onClick: () => this.close()
                }
            ]
        });
    }
}

export const Modal = new ModalManager();
