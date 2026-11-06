const cashierSections = [
    {
        title: 'Punto de Venta',
        route: '/pos',
        icon: '🛒',
        description: 'Registra las ventas del día.',
        steps: [
            'Busca productos por nombre o código y selecciónalos para agregarlos al carrito.',
            'Ajusta las cantidades, elimina artículos si hace falta y aplica el descuento correspondiente.',
            'Comprueba el total, añade un nombre de cliente si lo necesitas y selecciona efectivo o transferencia.',
            'Pulsa Cobrar para registrar la venta. Desde el recibo puedes revisar e imprimir el comprobante.'
        ]
    },
    {
        title: 'Caja',
        route: '/caja',
        icon: '💰',
        description: 'Controla el efectivo y el turno de trabajo.',
        steps: [
            'Al comenzar, selecciona el número de caja e indica el monto de apertura.',
            'Registra cada entrada o salida de dinero con su concepto y monto.',
            'Al finalizar, cuenta el efectivo, compara el monto real con el esperado y cierra el turno.'
        ]
    }
];

const adminSections = [
    {
        title: 'Productos',
        route: '/productos',
        icon: '📦',
        description: 'Mantén actualizado el catálogo que se usa en las ventas.',
        steps: [
            'Crea productos con sus datos, precios y código/SKU.',
            'Busca, edita o desactiva productos que ya no se venden.'
        ]
    },
    {
        title: 'Inventario',
        route: '/inventario',
        icon: '📊',
        description: 'Consulta existencias y registra movimientos de stock.',
        steps: [
            'Revisa alertas de productos con stock bajo.',
            'Registra entradas, salidas o ajustes e incluye notas para dejar constancia.',
            'Consulta el historial para ver cantidades anteriores y nuevas.'
        ]
    },
    {
        title: 'Proveedores',
        route: '/proveedores',
        icon: '🏢',
        description: 'Mantén organizado el directorio de proveedores.',
        steps: [
            'Busca proveedores por nombre o NIT.',
            'Crea, edita o desactiva sus fichas.'
        ]
    },
    {
        title: 'Compras',
        route: '/compras',
        icon: '🛍️',
        description: 'Registra el abastecimiento y revisa compras anteriores.',
        steps: [
            'Selecciona un proveedor y agrega productos con sus cantidades y costos.',
            'Consulta el historial y abre el detalle de una compra.',
            'Si una compra está recibida, puedes anularla cuando corresponda.'
        ]
    },
    {
        title: 'Reportes',
        route: '/reportes',
        icon: '📈',
        description: 'Revisa el comportamiento de las ventas en un periodo.',
        steps: [
            'Elige las fechas y aplica el filtro.',
            'Consulta ventas totales, transacciones, ticket promedio y artículos vendidos.',
            'Compara las ventas por día y los productos más vendidos; exporta a Excel o imprime.'
        ]
    },
    {
        title: 'Usuarios',
        route: '/usuarios',
        icon: '👤',
        description: 'Administra quién puede entrar y qué funciones tiene habilitadas.',
        steps: [
            'Vincula una cuenta ya creada en Supabase Auth con sus datos.',
            'Asigna un rol, activa o desactiva el usuario y consulta su último acceso.',
            'Los permisos del rol determinan qué apartados aparecen y están disponibles.'
        ]
    },
    {
        title: 'Configuración',
        route: '/configuracion',
        icon: '⚙️',
        description: 'Configura datos del negocio, sincronización y seguridad.',
        steps: [
            'Actualiza el nombre del negocio que se guarda en este dispositivo.',
            'Inicia una sincronización manual o descarga una copia local de la base de datos.',
            'Configura la verificación en dos pasos con una app autenticadora.'
        ]
    }
];

const renderSection = section => `
    <article class="guide-card">
        <div class="guide-card-heading">
            <span class="guide-icon" aria-hidden="true">${section.icon}</span>
            <div>
                <h3>${section.title}</h3>
                <p>${section.description}</p>
            </div>
        </div>
        <ol>${section.steps.map(step => `<li>${step}</li>`).join('')}</ol>
        <a class="guide-link" href="#${section.route}">Ir a ${section.title} <span aria-hidden="true">→</span></a>
    </article>
`;

export class GuiaPage {
    constructor(container) {
        this.container = container || document.getElementById('app-content');
    }

    render() {
        this.container.innerHTML = `
            <section class="guide-page">
                <header class="page-header guide-header">
                    <div>
                        <p class="guide-eyebrow">AYUDA NEVEPOS</p>
                        <h1 class="page-title">Guía de uso</h1>
                        <p class="guide-intro">Encuentra para qué sirve cada apartado y cómo empezar. Las opciones visibles dependen de los permisos asignados a tu cuenta.</p>
                    </div>
                </header>

                <div class="guide-notice">
                    <strong>Antes de empezar:</strong> inicia sesión con tu usuario. Si no ves una opción descrita aquí, solicita al administrador que revise tus permisos.
                </div>

                <aside class="guide-status">
                    <strong>Acceso y conexión</strong>
                    <p>Entra con tu correo y contraseña. El indicador de la parte superior muestra si estás en línea o sin conexión; cuando vuelva internet, NevePOS sincroniza los cambios pendientes. El administrador también puede iniciar la sincronización desde Configuración.</p>
                </aside>

                <section class="guide-audience" aria-labelledby="guide-cashier-title">
                    <div class="guide-section-heading">
                        <span class="guide-role-badge guide-role-cashier">Cajero</span>
                        <h2 id="guide-cashier-title">Ventas y caja</h2>
                    </div>
                    <div class="guide-grid">${cashierSections.map(renderSection).join('')}</div>
                </section>

                <section class="guide-audience" aria-labelledby="guide-admin-title">
                    <div class="guide-section-heading">
                        <span class="guide-role-badge guide-role-admin">Administrador</span>
                        <h2 id="guide-admin-title">Gestión del negocio</h2>
                    </div>
                    <p class="guide-intro">Además de las tareas de venta y caja, el administrador puede gestionar los apartados habilitados para su cuenta:</p>
                    <div class="guide-grid">${adminSections.map(renderSection).join('')}</div>
                </section>

                <footer class="guide-footer">
                    <h2>¿No encuentras una función?</h2>
                    <p>Comprueba tu conexión y tus permisos. Para cerrar la aplicación de forma segura, usa <strong>Cerrar Sesión</strong> en el menú lateral.</p>
                </footer>
            </section>
        `;
    }
}
