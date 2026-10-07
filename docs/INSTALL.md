# Manual de Instalación y Despliegue - NevePOS

Este documento describe paso a paso cómo instalar, configurar y desplegar el sistema NevePOS.

## Requisitos Previos
- Cuenta de Supabase (gratis en [supabase.com](https://supabase.com))
- Servidor web estático (Nginx, Apache, Netlify, Vercel, GitHub Pages, o cualquier hosting)
- Navegador web moderno (Google Chrome, Mozilla Firefox, Microsoft Edge)

---

## Paso 1: Crear Proyecto en Supabase
1. Inicia sesión en [app.supabase.com](https://app.supabase.com) y haz clic en **New Project**.
2. Asigna un nombre al proyecto (ej. `nevepos`), crea una contraseña segura para la base de datos y elige la región más cercana (ej. `South America (São Paulo)`).
3. Haz clic en **Create new project** y espera unos minutos hasta que se provisione la base de datos.
4. En el panel izquierdo, ve a **Settings** (Configuración) → **API**.
5. Copia la URL del proyecto (**Project URL**) y la clave pública (**anon public key**). Las necesitarás más adelante.

---

## Paso 2: Configurar la Base de Datos
1. En el panel de Supabase, ve a **SQL Editor**.
2. Haz clic en **New query** (Nueva consulta).
3. Ejecuta los scripts SQL del proyecto en este orden exacto:
   - Copia el contenido de `sql/001_schema.sql` y ejecútalo. (Crea las tablas)
   - Ejecuta `sql/002_rls_policies.sql`. (Configura la seguridad)
   - Ejecuta `sql/003_functions.sql`. (Funciones de negocio y RPC)
   - Ejecuta `sql/004_triggers.sql`. (Triggers automáticos)
   - Ejecuta `sql/005_seed.sql`. (Datos iniciales por defecto, como roles básicos)
    - En una base ya existente, ejecuta `sql/006_productos_disponibles_en_caja.sql` para agregar el control de disponibilidad en Caja.
    - Ejecuta `sql/007_ocultar_producto_en_caja.sql` para permitir ocultar productos desde la registradora sin conceder permisos generales de edición.
    - Ejecuta `sql/008_restringir_administrador_por_correo.sql` para reservar el rol administrador a `natalypradaramirez@gmail.com` y limitar las demás cuentas activas al rol cajero.
4. Para verificar, ve a la sección **Table Editor** y comprueba que todas las tablas existan (productos, ventas, usuarios, etc.).

---

## Paso 3: Crear las Cuentas de Acceso
La cuenta administradora autorizada es `natalypradaramirez@gmail.com`. Cualquier otra cuenta activa vinculada a `usuarios` queda limitada al rol cajero, aunque se le asigne otro rol en la tabla.

1. Ve a la sección **Authentication** → **Users** → **Add User** (Add new user).
2. Crea la cuenta con el correo correspondiente y una contraseña segura.
3. Una vez creado, copia el **User UID** (ID del usuario, formato UUID) que aparece en la lista.
4. Regresa al **SQL Editor**, crea una nueva consulta y vincula su perfil (reemplaza UID, nombre y correo):

```sql
INSERT INTO usuarios (auth_user_id, nombre, email, rol_id, activo)
VALUES (
    'TU-USER-UID-AQUI', -- Reemplazar por el User UID copiado en el paso anterior
    'Nombre de la persona',
    'correo@ejemplo.com',
    (SELECT id FROM roles WHERE nombre = CASE
        WHEN lower('correo@ejemplo.com') = 'natalypradaramirez@gmail.com' THEN 'administrador'
        ELSE 'cajero'
    END),
    true
);
```

Solo `natalypradaramirez@gmail.com` puede modificar productos, compras, usuarios, configuración y anular ventas. Las demás cuentas pueden usar el POS y su turno de Caja, pero no registrar compras ni hacer cambios administrativos.

Para crear la cuenta vendedora, repite esos pasos con su correo y User UID. La migración la reconocerá como cajero por no ser la cuenta propietaria; vincula el perfil activo en `usuarios` para habilitar su acceso al POS.

---

## Paso 4: Configurar la Aplicación
1. En el código fuente del proyecto, abre el archivo `js/config.js`.
2. Busca las variables de configuración y reemplaza los valores:
   - Reemplaza el valor de `SUPABASE_URL` con tu **Project URL** (Paso 1).
   - Reemplaza el valor de `SUPABASE_ANON_KEY` con tu **anon public key** (Paso 1).

Usa únicamente la clave `anon public`. Nunca pegues la clave `service_role` en este frontend.

---

## Paso 5: Desplegar
NevePOS es una aplicación Frontend (SPA), por lo que puede alojarse en cualquier servidor web estático.

### Opción A - Servidor local (Para pruebas)
Si tienes Node.js instalado:
```bash
npx serve .
```
O si tienes Python instalado:
```bash
python -m http.server 8080
```
Luego abre `http://localhost:8080` en tu navegador.

### Opción B - Netlify (Gratis y recomendado)
1. Sube el código del proyecto a un repositorio en GitHub.
2. Inicia sesión en [Netlify](https://www.netlify.com).
3. Haz clic en "Add new site" → "Import an existing project".
4. Conecta tu cuenta de GitHub, selecciona el repositorio y haz clic en "Deploy site".

### Opción C - Servidor propio con Nginx
Configuración básica para Nginx:
```nginx
server {
    listen 80;
    server_name tudominio.com;
    root /var/www/nevepos;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Paso 6: Verificar la Instalación
1. Abre la URL donde desplegaste la aplicación.
2. Inicia sesión con el correo y la contraseña del usuario administrador creado en el Paso 3.
3. Si el ingreso es exitoso, verás la pantalla de Punto de Venta.
4. Para validar que todo funciona: crea una categoría, un producto de prueba y realiza una venta.

---

## Solución de Problemas

- **Error de conexión o datos no cargan**: Verifica que `SUPABASE_URL` y `SUPABASE_ANON_KEY` estén correctos en `js/config.js`. Asegúrate de que no haya espacios en blanco extra.
- **Error de permisos al ocultar un producto en Caja**: Ejecuta `sql/007_ocultar_producto_en_caja.sql` en SQL Editor y verifica que el usuario autenticado tenga rol de administrador o cajero en `usuarios`.
- **Otros errores de permisos (Row Level Security)**: Verifica que hayas ejecutado el archivo `sql/002_rls_policies.sql` y que el usuario tenga el `rol_id` correspondiente en la tabla `usuarios`.
- **La PWA no se instala / No aparece el botón de instalar**: Para que una PWA funcione y se pueda instalar, el sitio DEBE servirse a través de **HTTPS** (o localhost para pruebas locales).

---

## Backups y Respaldos

- **Respaldos automáticos**: Supabase realiza copias de seguridad de la base de datos de forma automática diariamente (el plan gratuito mantiene un historial de 7 días).
- **Exportar datos manualmente desde la nube**: En Supabase, ve a Settings → Database → Backups para gestionar copias.
- **Exportar datos desde la App**: En NevePOS, ve a Configuración y usa el botón "Exportar base de datos local" para generar un archivo JSON con la información en caché de tu navegador.
