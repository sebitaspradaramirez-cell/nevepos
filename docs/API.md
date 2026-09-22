# Documentación de la API - NevePOS

NevePOS utiliza Supabase como backend, lo que significa que la API REST es generada automáticamente utilizando PostgREST.

## Autenticación
Todas las peticiones a la API requieren un token JWT válido. Supabase Auth se encarga de esto.

**Obtener Token (Login)**
```http
POST /auth/v1/token?grant_type=password
Content-Type: application/json
apikey: <SUPABASE_ANON_KEY>

{
  "email": "usuario@correo.com",
  "password": "contraseña_secreta"
}
```
**Respuesta exitosa (200 OK):**
```json
{
  "access_token": "eyJhbG...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "HjklM...",
  "user": {
    "id": "uuid-del-usuario",
    "email": "usuario@correo.com"
  }
}
```

Todas las llamadas posteriores a las tablas o funciones (RPC) deben incluir los siguientes headers:
- `apikey`: `<SUPABASE_ANON_KEY>`
- `Authorization`: `Bearer <access_token>`

---

## Tablas (REST API via PostgREST)

A continuación, se detalla la estructura para interactuar con las tablas principales.

### Productos (`/rest/v1/productos`)
Maneja el catálogo de productos de la papelería.

**GET /rest/v1/productos**
Obtener todos los productos.
*Respuesta:* Array de productos.

**POST /rest/v1/productos**
Crear un nuevo producto.
```json
{
  "nombre": "Cuaderno Profesional",
  "codigo_barras": "123456789",
  "precio_costo": 1500,
  "precio_venta": 3500,
  "stock": 50,
  "stock_minimo": 10,
  "categoria_id": "uuid-de-categoria"
}
```

### Categorías (`/rest/v1/categorias`)
Maneja las categorías de los productos.

**GET /rest/v1/categorias**
*Respuesta:*
```json
[
  {
    "id": "uuid",
    "nombre": "Cuadernos",
    "descripcion": "Todo tipo de libretas y cuadernos",
    "activo": true
  }
]
```

### Clientes (`/rest/v1/clientes`)
Registro de clientes para facturación.

### Proveedores (`/rest/v1/proveedores`)
Registro de proveedores de la tienda.

### Ventas (`/rest/v1/ventas`)
Cabecera de las ventas realizadas. Por lo general, se insertan utilizando la función RPC `registrar_venta` para mantener la integridad transaccional, pero se consultan vía GET.

### Detalle de Ventas (`/rest/v1/detalle_ventas`)
Items individuales de cada venta.

### Turnos de Caja (`/rest/v1/turnos_caja`)
Gestión de apertura y cierre de caja.

### Usuarios (`/rest/v1/usuarios`)
Gestión de usuarios y perfiles (solo accesible para administradores).

---

## Funciones RPC (Remote Procedure Calls)

Para ejecutar transacciones complejas, se utilizan las funciones almacenadas en PostgreSQL a través del endpoint `/rest/v1/rpc/<nombre_funcion>`.

### `registrar_venta`
Registra una venta completa (cabecera, detalles y descuentos) y actualiza el inventario de manera atómica.

**Endpoint:** `POST /rest/v1/rpc/registrar_venta`

**Parámetros del Body:**
```json
{
  "p_items": [
    { "producto_id": "uuid-1", "cantidad": 2, "precio_unitario": 3500 },
    { "producto_id": "uuid-2", "cantidad": 1, "precio_unitario": 1200 }
  ],
  "p_cliente_id": "uuid-del-cliente", 
  "p_metodo_pago": "efectivo",
  "p_descuento": 0,
  "p_notas": "Venta estándar",
  "p_turno_caja_id": "uuid-del-turno",
  "p_sync_id": "uuid-generado-en-cliente"
}
```
**Respuesta:** Devuelve el objeto de la venta creada, incluyendo el `numero_venta` generado por el servidor.

### `anular_venta`
Anula una venta y devuelve los productos al inventario.

**Endpoint:** `POST /rest/v1/rpc/anular_venta`
**Parámetros:** `{ "p_venta_id": "uuid-de-venta" }`

### `cerrar_turno`
Cierra un turno de caja calculando las diferencias.

**Endpoint:** `POST /rest/v1/rpc/cerrar_turno`
**Parámetros:** `{ "p_turno_id": "uuid-de-turno" }`

### `get_reporte_ventas`
Obtiene un resumen diario de ventas en un rango de fechas.

**Endpoint:** `POST /rest/v1/rpc/get_reporte_ventas`
**Parámetros:** `{ "p_fecha_inicio": "2023-01-01", "p_fecha_fin": "2023-01-31" }`
**Retorno:** Array de objetos `{ fecha, total, num_ventas, ticket_promedio }`.

### `get_productos_stock_bajo`
Obtiene la lista de productos que están por debajo de su stock mínimo.

**Endpoint:** `POST /rest/v1/rpc/get_productos_stock_bajo`
**Parámetros:** No requiere.

---

## Filtros y Paginación

PostgREST ofrece una sintaxis de consulta muy poderosa a través de la URL.

**Ejemplos de filtrado:**
- Buscar producto por nombre (Case insensitive): `GET /rest/v1/productos?nombre=ilike.*cuaderno*`
- Productos con precio mayor a 5000: `GET /rest/v1/productos?precio_venta=gt.5000`
- Productos de una categoría específica: `GET /rest/v1/productos?categoria_id=eq.123-uuid`

**Ordenamiento y Paginación:**
- Ordenar por nombre de forma ascendente: `?order=nombre.asc`
- Paginación (traer los primeros 20): `?limit=20&offset=0`
- Siguiente página: `?limit=20&offset=20`
