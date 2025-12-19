# 🎓 APManager Students Platform

Sistema completo de búsqueda y tipificación de estudiantes en APManager con base de datos local.

## 📋 Requisitos

```bash
npm install playwright better-sqlite3
```

## 🔧 Configuración

Crear archivo `.credenciales.json` en la raíz:

```json
{
  "email": "tu.email@aplatam.com",
  "password": "TuPassword",
  "intervaloMinutos": 15
}
```

## 🚀 Scripts Disponibles

### 1. 🔍 Búsqueda Local (Instantánea)

Busca en la base de datos SQLite local sin conexión a internet.

```bash
node buscar-bd.js <email|telefono|nombre|leadID>
```

**Ejemplos:**
```bash
node buscar-bd.js astridjaramilloc@gmail.com
node buscar-bd.js 593998591791
node buscar-bd.js 3085991
node buscar-bd.js Astrid
```

**Características:**
- ⚡ Búsqueda instantánea
- 📱 Soporta múltiples formatos de teléfono (593XXX, +593XXX, XXX)
- 📧 Búsqueda por email (case-insensitive)
- 🆔 Búsqueda por Lead ID
- 👤 Búsqueda por nombre parcial

---

### 2. 🌐 Búsqueda en APManager (Con Sesión Persistente)

Busca directamente en APManager y guarda resultados en la BD local.

```bash
node sesion-persistente.js <email|telefono>
```

**Ejemplos:**
```bash
node sesion-persistente.js astridjaramilloc@gmail.com
node sesion-persistente.js 593998591791
node sesion-persistente.js 998591791
```

**Características:**
- 🔐 Autenticación con Microsoft OAuth (una sola vez)
- 💾 Sesión persistente (reutiliza sesión guardada)
- 🔄 Detección automática de email vs teléfono
- 📱 Prueba 3 variantes de teléfono automáticamente:
  - Sin código país: `998591791`
  - Con 593: `593998591791`
  - Con +593: `+593998591791`
- 🏫 Selecciona automáticamente institución UDLA Maestrías
- 💾 Guarda resultados en BD local
- 🚫 Evita duplicados por `lead_id + programa`
- 🔗 Genera URL del lead para tipificaciones

---

### 3. ✍️ Tipificación Automática

Rellena automáticamente el formulario de tipificación en APManager.

```bash
node tipificar-playwright.js <leadID> "<descripcion>"
```

**Ejemplo:**
```bash
node tipificar-playwright.js 3085991 "Estudiante interesado en inscripción"
```

**Características:**
- 🤖 Relleno automático del formulario
- 🏫 Selecciona institución UDLA Maestrías
- 💾 Guarda automáticamente
- 👻 Modo invisible (headless: false para ver el proceso)

---

### 4. 📊 Ver Base de Datos

Muestra estadísticas y contenido de la base de datos local.

```bash
node ver-bd.js
```

**Muestra:**
- 📊 Total de registros
- 📋 Estructura de la tabla
- 📝 Primeros 5 registros
- 🎓 Distribución por programa

---

### 5. 🔧 Actualizar Base de Datos

Actualiza la estructura de la BD agregando columnas faltantes.

```bash
node actualizar-bd.js
```

**Agrega:**
- `lead_url` - URL completa del lead
- `fecha_agregado` - Fecha de inserción
- Actualiza URLs de registros existentes

---

## 📁 Archivos del Sistema

```
apmanager-students-platform/
├── sesion-persistente.js      # Búsqueda con Playwright + BD
├── buscar-bd.js                # Búsqueda local instantánea
├── tipificar-playwright.js     # Tipificación automática
├── ver-bd.js                   # Ver contenido de BD
├── actualizar-bd.js            # Actualizar estructura BD
├── estudiantes.db              # Base de datos SQLite (2,458+ registros)
├── .credenciales.json          # Credenciales (no versionado)
├── .playwright-session.json    # Sesión guardada (no versionado)
└── README.md                   # Este archivo
```

## 🗃️ Estructura de la Base de Datos

```sql
CREATE TABLE estudiantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL,
  lead_url TEXT,
  nombre TEXT,
  email TEXT,
  telefono TEXT,
  programa TEXT,
  matricula TEXT,
  estado TEXT,
  fecha_agregado TEXT,
  UNIQUE(lead_id, programa)
);
```

**Clave única:** Combinación de `lead_id + programa` permite múltiples programas por lead.

## 🔄 Flujo de Trabajo Recomendado

1. **Búsqueda rápida local:**
   ```bash
   node buscar-bd.js <termino>
   ```

2. **Si no se encuentra, buscar en APManager:**
   ```bash
   node sesion-persistente.js <termino>
   ```

3. **Tipificar si es necesario:**
   ```bash
   node tipificar-playwright.js <leadID> "<nota>"
   ```

## 📊 Estadísticas Actuales

- **Total registros:** 2,458 estudiantes
- **Programas principales:**
  - MAESTRIA: 1,675 estudiantes
  - MASTER: 497 estudiantes
  - DIPLOMADO: 271 estudiantes
- **Institución:** UDLA Maestrías

## 🔐 Seguridad

- ✅ `.credenciales.json` debe estar en `.gitignore`
- ✅ `.playwright-session.json` debe estar en `.gitignore`
- ✅ Sesión expira automáticamente por seguridad
- ✅ Re-autenticación automática cuando expira

## 🐛 Troubleshooting

### Sesión expirada
```
⚠️ Sesión expirada, reautenticando...
```
**Solución:** El script re-autentica automáticamente.

### Error "better-sqlite3"
```bash
npm install better-sqlite3
```

### Error "playwright"
```bash
npm install playwright
npx playwright install chromium
```

## 📝 Notas

- La primera ejecución de `sesion-persistente.js` requiere autenticación manual
- Las siguientes ejecuciones reutilizan la sesión guardada
- La búsqueda por teléfono prueba 3 formatos automáticamente
- Los registros duplicados (mismo lead_id + programa) no se insertan

## 🎯 Código Limpio Aplicado

- ✅ Código modular y reutilizable
- ✅ Funciones con responsabilidad única
- ✅ Nombres descriptivos de variables y funciones
- ✅ Comentarios claros y concisos
- ✅ Manejo robusto de errores
- ✅ Logging con colores para mejor UX
- ✅ Validaciones de entrada
- ✅ Sin código duplicado

