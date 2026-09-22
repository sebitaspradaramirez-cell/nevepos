export const formatCOP = (number) => {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(number);
};

export const formatDate = (dateInput, format = 'short') => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    
    if (isNaN(date.getTime())) return '';

    const options = {};
    if (format === 'short') {
        options.day = '2-digit';
        options.month = '2-digit';
        options.year = 'numeric';
    } else if (format === 'long') {
        options.day = 'numeric';
        options.month = 'long';
        options.year = 'numeric';
    } else if (format === 'datetime') {
        options.day = '2-digit';
        options.month = '2-digit';
        options.year = 'numeric';
        options.hour = 'numeric';
        options.minute = '2-digit';
        options.hour12 = true;
    } else if (format === 'time') {
        options.hour = 'numeric';
        options.minute = '2-digit';
        options.hour12 = true;
    }
    
    return new Intl.DateTimeFormat('es-CO', options).format(date);
};

export const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const generateSyncId = () => {
    return 'sync_' + generateUUID();
};

export const debounce = (fn, ms) => {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
};

export const throttle = (fn, ms) => {
    let lastTime = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastTime >= ms) {
            fn.apply(this, args);
            lastTime = now;
        }
    };
};

export const escapeHtml = (str) => {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
};

export const slugify = (str) => {
    return String(str)
        .normalize('NFKD') // split accented characters into their base characters and diacritical marks
        .replace(/[\u0300-\u036f]/g, '') // remove all the accents
        .trim() // trim leading or trailing whitespace
        .toLowerCase() // convert to lowercase
        .replace(/[^a-z0-9 -]/g, '') // remove non-alphanumeric characters
        .replace(/\s+/g, '-') // replace spaces with hyphens
        .replace(/-+/g, '-'); // remove consecutive hyphens
};

export const truncate = (str, maxLength) => {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength) + '...';
};

export const isOnline = () => {
    return navigator.onLine;
};

export const generateNumeroVenta = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `V-${yyyy}${mm}${dd}-${random}`;
};

export const parseBarcode = (input) => {
    if (!input) return '';
    return input.toString().trim().replace(/[^a-zA-Z0-9-]/g, '');
};

export const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const printElement = (elementId) => {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`Element with id ${elementId} not found`);
        return;
    }
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Print</title>
                <style>
                    body { font-family: Arial, sans-serif; }
                    /* Add specific print styles here if needed */
                </style>
            </head>
            <body>
                ${element.innerHTML}
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(function() { window.close(); }, 500);
                    }
                </script>
            </body>
        </html>
    `);
    printWindow.document.close();
};
