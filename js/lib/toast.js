import { CONFIG } from '../config.js';
import { escapeHtml } from './utils.js';

class ToastManager {
    constructor() {
        this.container = null;
        this.toasts = [];
        this.maxToasts = 5;
        this.initContainer();
    }

    initContainer() {
        if (!document.getElementById('toast-container')) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            Object.assign(this.container.style, {
                position: 'fixed',
                top: '20px',
                right: '20px',
                zIndex: '10000',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                pointerEvents: 'none'
            });
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById('toast-container');
        }
    }

    show(message, type = 'info', duration = CONFIG.TOAST_DURATION_MS) {
        if (this.toasts.length >= this.maxToasts) {
            const oldest = this.toasts.shift();
            if (oldest && oldest.element && oldest.element.parentNode) {
                oldest.element.parentNode.removeChild(oldest.element);
            }
        }

        const toast = document.createElement('div');
        
        let bgColor, icon;
        switch (type) {
            case 'success':
                bgColor = '#4caf50';
                icon = '✓';
                break;
            case 'error':
                bgColor = '#f44336';
                icon = '✕';
                break;
            case 'warning':
                bgColor = '#ff9800';
                icon = '⚠';
                break;
            case 'info':
            default:
                bgColor = '#2196f3';
                icon = 'ℹ';
                break;
        }

        Object.assign(toast.style, {
            backgroundColor: bgColor,
            color: 'white',
            padding: '12px 20px',
            borderRadius: '4px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '14px',
            transform: 'translateX(100%)',
            opacity: '0',
            transition: 'transform 0.3s ease, opacity 0.3s ease',
            pointerEvents: 'auto'
        });

        toast.innerHTML = `<span style="font-weight: bold; font-size: 16px;">${icon}</span> <span>${escapeHtml(message)}</span>`;
        
        this.container.appendChild(toast);
        
        const toastObj = { element: toast };
        this.toasts.push(toastObj);

        // Animate in
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });

        // Auto dismiss
        if (duration > 0) {
            setTimeout(() => {
                this.removeToast(toastObj);
            }, duration);
        }
    }

    removeToast(toastObj) {
        const index = this.toasts.indexOf(toastObj);
        if (index > -1) {
            this.toasts.splice(index, 1);
        }
        
        const el = toastObj.element;
        if (el && el.parentNode) {
            el.style.transform = 'translateX(100%)';
            el.style.opacity = '0';
            setTimeout(() => {
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            }, 300);
        }
    }

    success(msg) { this.show(msg, 'success'); }
    error(msg) { this.show(msg, 'error'); }
    warning(msg) { this.show(msg, 'warning'); }
    info(msg) { this.show(msg, 'info'); }
}

export const Toast = new ToastManager();
