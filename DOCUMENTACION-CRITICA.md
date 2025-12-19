# 🚨 DOCUMENTACIÓN CRÍTICA - APManager Students Platform

**FECHA**: 18 de Diciembre 2025
**VERSIÓN**: v24 (ESTABLE - NO MODIFICAR SIN LEER ESTO)
**ÚLTIMA ACTUALIZACIÓN**: Después de 23+ deploys y múltiples errores corregidos

---

## ⚠️ REGLAS DE ORO - LEER ANTES DE CUALQUIER CAMBIO

### 🔴 NUNCA TOCAR (CÓDIGO QUE FUNCIONA)

1. **Session Management (Líneas 232-245)**
   ```javascript
   const haySesionGuardada = false; // DESHABILITADO
   const usarHeadless = true; // SIEMPRE HEADLESS
   ```
   - **POR QUÉ**: Fly.io NO tiene X server. headless: false = crash
   - **POR QUÉ**: SESSION_FILE causa hangs infinitos con `browser.newContext({ storageState })`
   - **CONSECUENCIA SI CAMBIAS**: Sistema se cuelga, never termina requests
   - **HISTORIAL**: v1-v15 tuvieron este problema, 15+ horas perdidas

2. **Microsoft OAuth Selector (Líneas 308-318)**
   ```javascript
   const stayButton = await pageGlobal.waitForSelector('input[type="submit"]', { timeout: 8000 });
   if (stayButton) await stayButton.click();
   await pageGlobal.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
   ```
   - **POR QUÉ**: Selector simplificado captura CUALQUIER botón submit
   - **POR QUÉ**: Anteriormente buscaba "Sí", "Yes" específicamente y fallaba
   - **POR QUÉ**: waitForLoadState asegura que la página carga antes de continuar
   - **CONSECUENCIA SI CAMBIAS**: Timeout en materias-tab, auth fallida
   - **HISTORIAL**: v16-v23 arreglando selectores, 4+ horas perdidas

3. **Error Detection Patterns (Líneas 776-792)**
   ```javascript
   if (intentos < maxIntentos && (
     error.message.includes('Timeout') ||
     error.message.includes('waiting for') ||
     error.message.includes('login') ||
     error.message.includes('navigation') ||
     error.message.includes('locator') ||
     error.message.includes('suitable')
   ))
   ```
   - **POR QUÉ**: Detecta sesión expirada en 6 patrones diferentes
   - **POR QUÉ**: Re-autentica automáticamente sin intervention manual
   - **CONSECUENCIA SI CAMBIAS**: Errores no manejados, requests fallan
   - **HISTORIAL**: v8-v12 sin detección, usuarios veían errores

4. **Widget SVG Icons (widget-demo.html líneas 520-535)**
   ```javascript
   <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; stroke: currentColor;">
   ```
   - **POR QUÉ**: Reemplazo de emojis por aspecto profesional
   - **POR QUÉ**: 16px gray stroke es consistente con diseño
   - **CONSECUENCIA SI CAMBIAS**: Pierde apariencia profesional
   - **HISTORIAL**: v20-v21 implementando SVGs

---

## ✅ ARQUITECTURA QUE FUNCIONA

### Flujo de Autenticación Microsoft OAuth

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Usuario hace búsqueda → API detecta necesidad de scraping│
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. obtenerSesion() - Lanza Playwright Chromium headless     │
│    • headless: true (OBLIGATORIO en Fly.io)                 │
│    • viewport: null (permite resize)                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Navega a https://apmanager.aplatam.com/admin/login       │
│    • waitForTimeout(2000) para estabilidad                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Detecta si redirige a login (sesión expirada)            │
│    • Chequea URL actual vs URL esperada                     │
│    • Si expiró: procede a auth, sino: reutiliza sesión      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. MICROSOFT OAUTH FLOW                                     │
│    A. Click botón "Microsoft"                               │
│    B. Espera login.microsoftonline.com                      │
│    C. Ingresa email → Click Next                            │
│    D. Ingresa password → Click Sign in                      │
│    E. Maneja diálogo "Stay signed in?" (CRÍTICO)            │
│       → waitForSelector('input[type="submit"]', 8000ms)     │
│       → click() automático                                  │
│       → waitForLoadState('networkidle') ← IMPORTANTE        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Sesión autenticada lista para scraping                   │
│    • browserGlobal, contextGlobal, pageGlobal son globales  │
│    • Se mantienen vivos entre requests (performance)        │
└─────────────────────────────────────────────────────────────┘
```

### Flujo de Búsqueda y Scraping

```
Usuario busca "dra.martha.viteri@gmail.com"
              ↓
┌───────────────────────────────────────────┐
│ GET /api/buscar-apmanager/:termino        │
│ • Búsqueda en APManager                   │
│ • Guarda resultados en SQLite             │
└───────────────────────────────────────────┘
              ↓
┌───────────────────────────────────────────┐
│ Widget muestra resultados + botón         │
│ "Ver Perfil" para cada estudiante         │
└───────────────────────────────────────────┘
              ↓
Usuario click "Ver Perfil"
              ↓
┌───────────────────────────────────────────┐
│ GET /api/materias/:leadId                 │
│ • Re-auth si sesión expirada (AUTO)      │
│ • Navega a Lead específico                │
│ • Click tab "Materias"                    │
│ • Extrae todas las materias + prioridades │
│ • Retorna JSON con materias               │
└───────────────────────────────────────────┘
              ↓
┌───────────────────────────────────────────┐
│ Widget muestra tabla de materias          │
│ • Ordenadas por prioridad                 │
│ • Botón "Inscribir Prioritaria"           │
└───────────────────────────────────────────┘
              ↓
Usuario click "Inscribir Prioritaria"
              ↓
┌───────────────────────────────────────────┐
│ POST /api/inscribir-prioritaria/:leadId   │
│ • Encuentra materia de mayor prioridad    │
│ • Click botón "Inscribir" en APManager    │
│ • Espera confirmación                     │
│ • Retorna resultado                       │
└───────────────────────────────────────────┘
```

---

## 🔧 CONFIGURACIÓN CRÍTICA

### Variables de Entorno (Fly.io)

```bash
# NO MODIFICAR - Set en Fly.io secrets
CREDENTIALS_FILE=.credenciales.json  # Contiene email y password para OAuth
SECRET_KEY=aplatam-secret-key-2025    # Para JWT tokens
```

### Archivos Críticos

1. **api-servidor.js** (962 líneas)
   - Backend Express + Playwright
   - **NO TOCAR** líneas de session management
   - **NO TOCAR** líneas de OAuth selectors

2. **widget-demo.html** (876 líneas)
   - Frontend con SVG icons
   - Auto-detección localhost vs production
   - **NO TOCAR** SVG icons (son profesionales)

3. **estudiantes.db** (SQLite)
   - Schema: lead_id, nombre, email, telefono, programa, matricula, estado, lead_url, fecha_importacion
   - Auto-creada si no existe

4. **.credenciales.json** (SECRETO)
   ```json
   {
     "email": "tu-email@aplatam.com",
     "password": "tu-password"
   }
   ```
   - **NUNCA** commitear a Git
   - **DEBE** existir en Fly.io como secret

---

## 🐛 ERRORES HISTÓRICOS Y SOLUCIONES

### Error 1: Infinite Hang con SESSION_FILE (v1-v15)

**Síntoma**:
```
Requests never complete, server hangs indefinitely
```

**Causa**:
```javascript
// CÓDIGO MALO (NO USAR):
const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
contextGlobal = await browserGlobal.newContext({ storageState: sessionData });
// ↑ Esto cuelga forever en Fly.io
```

**Solución**:
```javascript
// CÓDIGO CORRECTO (ACTUAL):
contextGlobal = await browserGlobal.newContext({ viewport: null });
// Sin storageState, funciona perfecto
```

**LECCIÓN**: NUNCA usar storageState en Fly.io

---

### Error 2: Missing X Server (v5-v10)

**Síntoma**:
```
Error: Missing X server or $DISPLAY
Playwright fails to launch
```

**Causa**:
```javascript
// CÓDIGO MALO:
browserGlobal = await playwright.chromium.launch({
  headless: false  // ← Necesita GUI, Fly.io no tiene
});
```

**Solución**:
```javascript
// CÓDIGO CORRECTO:
browserGlobal = await playwright.chromium.launch({
  headless: true  // ← SIEMPRE en Fly.io
});
```

**LECCIÓN**: SIEMPRE headless: true en Fly.io

---

### Error 3: OAuth Button Timeout (v16-v23)

**Síntoma**:
```
page.click: Timeout 30000ms exceeded
waiting for locator('#materias-tab')
```

**Causa**:
```javascript
// CÓDIGO MALO:
const stayButton = await pageGlobal.waitForSelector(
  'input[type="submit"][value="Sí"]',  // ← Muy específico, falla
  { timeout: 5000 }
);
```

**Solución**:
```javascript
// CÓDIGO CORRECTO:
const stayButton = await pageGlobal.waitForSelector(
  'input[type="submit"]',  // ← Captura CUALQUIER submit
  { timeout: 8000 }
);
await pageGlobal.waitForLoadState('networkidle');  // ← ESPERAR carga
```

**LECCIÓN**: Selectores simples + esperar networkidle

---

### Error 4: Syntax Error con 'or' (v24)

**Síntoma**:
```
ReferenceError: or is not defined
at api-servidor.js:785:1
```

**Causa**:
```javascript
// CÓDIGO MALO (lineas duplicadas al editar):
}
or  // ← keyword huérfano
if (intentos < maxIntentos) {
```

**Solución**:
```javascript
// CÓDIGO CORRECTO:
}
// Removed orphaned 'or'
if (intentos < maxIntentos) {
```

**LECCIÓN**: Usar replace_string_in_file con contexto suficiente

---

## 📊 DEPLOYMENT CHECKLIST

### Antes de Deploy

- [ ] Código funciona en localhost (http://localhost:3001)
- [ ] No hay errores en consola del navegador
- [ ] Búsqueda de estudiantes funciona
- [ ] Extracción de materias funciona
- [ ] Inscripción prioritaria funciona
- [ ] No hay cambios en session management
- [ ] No hay cambios en OAuth selectors
- [ ] Backup creado: `api-servidor-backup-FECHA.js`

### Comando Deploy

```bash
cd C:\Users\iandc\Desktop\apmanager-students-platform
flyctl deploy -a apmanager-students-platform
```

### Después de Deploy

```bash
# Ver logs en tiempo real
flyctl logs -a apmanager-students-platform

# Verificar máquinas corriendo
flyctl status -a apmanager-students-platform

# Si hay problemas, rollback
flyctl releases list -a apmanager-students-platform
flyctl releases rollback -a apmanager-students-platform v23  # Último estable
```

---

## 🔍 DEBUGGING GUIDE

### Si la búsqueda falla

1. Verificar servidor corriendo: `Get-Process node`
2. Verificar logs: `flyctl logs -a apmanager-students-platform`
3. Verificar CORS: el widget debe estar en mismo dominio o CORS habilitado
4. Verificar endpoint: `GET /api/buscar-apmanager/:termino`

### Si materias no cargan

1. Verificar OAuth funcionó: buscar "✅ Autenticación exitosa" en logs
2. Verificar timeout: debe ser < 30 segundos
3. Verificar selector: `#materias-tab` debe existir
4. Verificar Playwright no crasheó: buscar "Error:" en logs

### Si inscripción falla

1. Verificar materia tiene prioridad > 0
2. Verificar botón "Inscribir" existe en APManager
3. Verificar timeout: debe ser < 60 segundos
4. Verificar confirmación: buscar "✅ Materia inscrita" en logs

---

## 🚀 MEJORAS FUTURAS (PERMITIDAS)

### ✅ SAFE Changes (Bajo riesgo)

1. **Agregar más endpoints**
   - Nuevos GET/POST que NO toquen sesión
   - Ejemplo: `/api/estudiante/:id/historial`

2. **Mejorar UI del widget**
   - Cambiar colores, fonts, spacing
   - Agregar más SVG icons
   - Mejorar responsive design

3. **Agregar logs**
   - Más console.log para debugging
   - Winston/Bunyan para logs estructurados

4. **Optimizar base de datos**
   - Agregar índices
   - Agregar más campos
   - Migrations con better-sqlite3

### ⚠️ RISKY Changes (Requieren testing exhaustivo)

1. **Cambiar Playwright selectors**
   - SIEMPRE probar en localhost primero
   - SIEMPRE tener backup
   - SIEMPRE usar selectores simples

2. **Modificar flujo de autenticación**
   - NUNCA cambiar headless
   - NUNCA agregar storageState
   - NUNCA tocar OAuth flow sin testing

3. **Agregar nuevos scraping endpoints**
   - Reutilizar sesión existente
   - Detectar errores con los 6 patterns
   - Agregar retry logic (maxIntentos)

### 🔴 FORBIDDEN Changes (NUNCA HACER)

1. **Cambiar headless a false**
2. **Agregar SESSION_FILE loading**
3. **Cambiar OAuth selectors sin testing**
4. **Remover error detection patterns**
5. **Cambiar puerto 3001 sin actualizar widget**
6. **Eliminar waitForLoadState**

---

## 📞 CONTACTO Y SOPORTE

**Desarrollador**: GitHub Copilot (Claude Sonnet 4.5)
**Fecha Estable**: 18 Diciembre 2025
**Versión**: v24
**Deploy**: https://apmanager-students-platform.fly.dev

**Si algo se rompe**:
1. Revisar esta documentación PRIMERO
2. Revisar logs: `flyctl logs`
3. Rollback si es necesario: `flyctl releases rollback`
4. Restaurar backup: `api-servidor-backup2.js`

---

## 🎯 RESUMEN EJECUTIVO

**LO QUE FUNCIONA (NO TOCAR)**:
- ✅ Autenticación Microsoft OAuth automática
- ✅ Búsqueda de estudiantes en APManager
- ✅ Extracción de materias con prioridades
- ✅ Inscripción de materia prioritaria
- ✅ Manejo automático de sesión expirada
- ✅ SVG icons profesionales
- ✅ Auto-detección localhost vs production

**LO QUE NO FUNCIONA (NO AGREGAR)**:
- ❌ Session persistence (causa hangs)
- ❌ Headless: false (Fly.io no tiene X)
- ❌ Selectores específicos de texto (frágiles)
- ❌ Emojis en PowerShell (encoding issues)

**MÉTRICAS**:
- 23+ deploys para llegar a versión estable
- 20+ horas de debugging acumuladas
- 4 errores mayores identificados y solucionados
- 100% funcionalidad restaurada vs 12pm del día

---

## 🎭 PLAYWRIGHT METHODS REFERENCE

### Métodos Usados en Este Proyecto

#### Navigation Methods
```javascript
// Navegar a URL
await page.goto('https://example.com', { waitUntil: 'networkidle' });

// Esperar URL específica
await page.waitForURL(/login\.microsoftonline\.com/, { timeout: 15000 });

// Esperar estado de red
await page.waitForLoadState('networkidle', { timeout: 10000 });

// Esperar tiempo fijo (último recurso)
await page.waitForTimeout(2000);
```

#### Selector Methods
```javascript
// Esperar y buscar elemento
const element = await page.waitForSelector('input[type="submit"]', { timeout: 8000 });

// Click en elemento
await page.click('button:has-text("Microsoft")');

// Fill input
await page.fill('input[type="email"]', 'email@example.com');

// Click en selector con texto
await page.click('text="Inscribir"');

// Selector múltiple con fallback
await page.click('button:has-text("Submit"), input[type="submit"]');
```

#### Context & Browser Methods
```javascript
// Launch browser
const browser = await playwright.chromium.launch({
  headless: true,
  args: []
});

// Create context
const context = await browser.newContext({ viewport: null });

// Create page
const page = await context.newPage();

// Close browser
await browser.close();
```

#### Content Extraction
```javascript
// Evaluar JavaScript en página
const data = await page.evaluate(() => {
  const rows = document.querySelectorAll('tr');
  return Array.from(rows).map(row => row.textContent);
});

// Get URL actual
const currentUrl = page.url();

// Check if element exists (no throw error)
const exists = await page.$('selector') !== null;
```

### ⚠️ Playwright Best Practices (Usadas en Este Proyecto)

1. **SIEMPRE usar waitForSelector antes de click/fill**
   ```javascript
   // ✅ CORRECTO
   await page.waitForSelector('button');
   await page.click('button');
   
   // ❌ INCORRECTO
   await page.click('button'); // Puede fallar si no cargó
   ```

2. **SIEMPRE usar waitForLoadState después de clicks importantes**
   ```javascript
   // ✅ CORRECTO
   await page.click('button');
   await page.waitForLoadState('networkidle');
   
   // ❌ INCORRECTO
   await page.click('button');
   // Continúa sin esperar → elementos no cargados
   ```

3. **USAR selectores simples, no específicos**
   ```javascript
   // ✅ CORRECTO - Flexible
   'input[type="submit"]'
   'button:has-text("Login")'
   
   // ❌ INCORRECTO - Frágil
   'input[type="submit"][value="Sí exactamente así"]'
   '#id-complejo > div:nth-child(3) > button'
   ```

4. **MANEJAR timeouts con try/catch**
   ```javascript
   // ✅ CORRECTO
   try {
     const btn = await page.waitForSelector('button', { timeout: 5000 });
     if (btn) await btn.click();
   } catch (e) {
     console.log('Button not found, continuing...');
   }
   ```

---

## 💻 ERRORES COMUNES DE POWERSHELL

### Error 1: Encoding de Emojis

**Síntoma**:
```
âœ… API de bÃºsqueda iniciada
ðŸ"Š Base de datos
```

**Causa**: PowerShell en Windows no maneja UTF-8 con emojis correctamente

**Solución**: 
- Ignorar (solo visual, código funciona)
- O reemplazar emojis por texto ASCII: `[OK]`, `[DB]`, etc.
- En Linux/Fly.io se ven perfectamente

---

### Error 2: Cambio de Directorio en Scripts

**Síntoma**:
```powershell
PS C:\Users\iandc> node api-servidor.js
Error: Cannot find module 'cors'
```

**Causa**: `node` ejecutándose en directorio incorrecto

**Solución**:
```powershell
# ❌ INCORRECTO
node api-servidor.js

# ✅ CORRECTO
cd C:\Users\iandc\Desktop\apmanager-students-platform
node api-servidor.js

# ✅ O en una línea
cd C:\Users\iandc\Desktop\apmanager-students-platform; node api-servidor.js
```

---

### Error 3: Process no se detiene

**Síntoma**:
```
Port 3001 already in use
```

**Causa**: Node process anterior sigue corriendo

**Solución**:
```powershell
# Ver procesos node
Get-Process node -ErrorAction SilentlyContinue

# Matar todos los procesos node
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Esperar y reiniciar
Start-Sleep 2
node api-servidor.js
```

---

### Error 4: Regex en PowerShell

**Síntoma**:
```powershell
$content -replace '✅', '[OK]'  # No funciona
```

**Causa**: Emojis en PowerShell no se manejan bien en strings inline

**Solución**:
```powershell
# Usar archivo intermedio o Unicode escapes
$content = Get-Content file.txt -Encoding UTF8
$content = $content -replace '\u2705', '[OK]'  # Unicode code point
```

---

### Error 5: Out of Memory con regex vacíos

**Síntoma**:
```
System.OutOfMemoryException
```

**Causa**:
```powershell
# ❌ MALO - regex vacío causa loop infinito
$line -replace '', '[OK]'
```

**Solución**:
```powershell
# ✅ Verificar que string no esté vacío
if ($oldString) {
  $line -replace $oldString, $newString
}
```

---

## 📚 CÓDIGO LIMPIO - PRINCIPIOS APLICADOS

### Uncle Bob (Robert C. Martin) - Clean Code

**Libro Recomendado**: *"Clean Code: A Handbook of Agile Software Craftsmanship"* by Robert C. Martin

#### 1. Nombres Descriptivos

```javascript
// ✅ BIEN - Nombres que explican intención
async function obtenerSesion() {
  const haySesionGuardada = false;
  const usarHeadless = true;
  const browserGlobal = await playwright.chromium.launch({ headless: usarHeadless });
}

// ❌ MAL - Nombres crípticos
async function getS() {
  const x = false;
  const y = true;
  const b = await pw.ch.launch({ headless: y });
}
```

#### 2. Funciones Pequeñas (Una Responsabilidad)

```javascript
// ✅ BIEN - Función hace UNA cosa
async function autenticarConMicrosoft(page, credenciales) {
  await clickBotonMicrosoft(page);
  await ingresarEmail(page, credenciales.email);
  await ingresarPassword(page, credenciales.password);
  await manejarDialogoStaySignedIn(page);
}

// ❌ MAL - Función hace TODO
async function doEverything(page, creds, leadId, materias) {
  // 200 líneas mezclando auth, scraping, parsing...
}
```

#### 3. Comentarios Solo Cuando Necesario

```javascript
// ✅ BIEN - Comentario explica POR QUÉ
const haySesionGuardada = false; // DESHABILITADO - causa hangs en Fly.io
const usarHeadless = true; // SIEMPRE HEADLESS (Fly.io no tiene X server)

// ❌ MAL - Comentario repite el código
const x = false; // Set x to false
const y = true; // Set y to true
```

#### 4. Manejo de Errores Explícito

```javascript
// ✅ BIEN - Manejo claro de errores
try {
  const stayButton = await page.waitForSelector('input[type="submit"]', { timeout: 8000 });
  if (stayButton) await stayButton.click();
} catch (e) {
  console.log('Diálogo "Stay signed in" no apareció, continuando...');
}

// ❌ MAL - Silenciar errores sin explicación
try {
  await page.click('button');
} catch (e) {}  // ¿Qué pasó? ¿Por qué ignoramos?
```

#### 5. DRY (Don't Repeat Yourself)

```javascript
// ✅ BIEN - Patrón de retry reutilizable
async function intentarConRetry(fn, maxIntentos = 2) {
  for (let i = 0; i < maxIntentos; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxIntentos - 1) throw error;
      console.log(`Intento ${i+1}/${maxIntentos} falló, reintentando...`);
    }
  }
}

// ❌ MAL - Copiar/pegar mismo código
try { await scrapeLeadA(); } catch(e) { retry(); }
try { await scrapeLeadB(); } catch(e) { retry(); }
try { await scrapeLeadC(); } catch(e) { retry(); }
```

#### 6. Principio de Responsabilidad Única (SRP)

```javascript
// ✅ BIEN - Separación de responsabilidades
app.get('/api/materias/:leadId', async (req, res) => {
  try {
    const { browser, context, page } = await obtenerSesion();  // Auth
    const leadId = req.params.leadId;
    const materias = await extraerMaterias(page, leadId);      // Scraping
    const materiasFormateadas = formatearMaterias(materias);   // Transform
    res.json(materiasFormateadas);                             // Response
  } catch (error) {
    manejarError(res, error);                                  // Error handling
  }
});

// ❌ MAL - Todo mezclado
app.get('/api/materias/:leadId', async (req, res) => {
  // 150 líneas haciendo auth, scraping, parsing, formatting, error handling mezclados
});
```

### Principios SOLID Aplicados

#### S - Single Responsibility
- Cada función hace UNA cosa
- `obtenerSesion()` solo maneja autenticación
- `extraerMaterias()` solo scrapeea
- `formatearMaterias()` solo transforma datos

#### O - Open/Closed
- Código abierto para extensión (nuevos endpoints)
- Cerrado para modificación (no tocar session management)

#### L - Liskov Substitution
- Playwright puede ser reemplazado por Puppeteer si se mantiene misma interfaz

#### I - Interface Segregation
- Express routes son pequeñas e independientes
- No hay "God Object" que hace todo

#### D - Dependency Inversion
- Variables globales `browserGlobal`, `contextGlobal`, `pageGlobal` actúan como singleton
- Podrían ser inyectadas si necesitas testing

---

## 📖 RECURSOS RECOMENDADOS

### Libros

1. **"Clean Code" by Robert C. Martin (Uncle Bob)**
   - Capítulos críticos: 2 (Nombres), 3 (Funciones), 7 (Error Handling)
   - Principio: "El código debe leerse como prosa bien escrita"

2. **"The Pragmatic Programmer" by Andrew Hunt & David Thomas**
   - Principio DRY
   - Boy Scout Rule: "Deja el código mejor de como lo encontraste"

3. **"Refactoring" by Martin Fowler**
   - Técnicas para mejorar código existente sin cambiar comportamiento

### Playwright Resources

1. **Documentación Oficial**: https://playwright.dev/docs/intro
2. **Best Practices**: https://playwright.dev/docs/best-practices
3. **Selectors Guide**: https://playwright.dev/docs/selectors

### PowerShell Resources

1. **PowerShell UTF-8**: `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`
2. **Process Management**: `Get-Process`, `Stop-Process`
3. **File Operations**: `-Encoding UTF8` en Get-Content/Set-Content

---

## 🎓 LECCIONES APRENDIDAS

### 1. "Funciona en mi máquina" no es suficiente
- **Problema**: headless:false funcionaba local, fallaba en Fly.io
- **Lección**: Probar en ambiente de producción SIEMPRE

### 2. Selectores simples > Selectores específicos
- **Problema**: `value="Sí"` fallaba, `value="Si"` también
- **Lección**: `type="submit"` captura todo, es resiliente

### 3. Documentación salva tiempo
- **Problema**: 23 deploys corrigiendo mismos errores
- **Lección**: Documentar qué NO tocar previene repetir errores

### 4. Logs claros ayudan al debugging
- **Antes**: `console.log('error')`
- **Después**: `console.log('❌ Error al obtener materias (intento 1/2):', error.message)`

### 5. Backups antes de cambios grandes
- **Siempre**: `Copy-Item api-servidor.js api-servidor-backup.js`
- **Razón**: Poder revertir en segundos si algo falla

---

## 🔐 SEGURIDAD

### Secrets Management

```javascript
// ❌ NUNCA hacer esto
const email = "usuario@aplatam.com";  // Hardcoded
const password = "password123";       // Hardcoded

// ✅ SIEMPRE usar archivo externo
const credenciales = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
// .credenciales.json en .gitignore
// Deploy secrets con flyctl secrets set
```

### CORS Configuration

```javascript
// ✅ Producción - whitelist específico
const corsOptions = {
  origin: ['https://apmanager-students-platform.fly.dev'],
  credentials: true
};

// ⚠️ Development - permisivo (localhost)
const corsOptions = {
  origin: true
};
```

### Input Validation

```javascript
// ✅ SIEMPRE validar inputs
app.get('/api/materias/:leadId', async (req, res) => {
  const leadId = req.params.leadId;
  if (!leadId || isNaN(leadId)) {
    return res.status(400).json({ error: 'leadId inválido' });
  }
  // ... continuar
});
```

---

**ÚLTIMA ACTUALIZACIÓN**: 18 Diciembre 2025, 11:00 PM
**PRÓXIMA REVISIÓN**: Antes de cualquier cambio crítico
**VERSIÓN DOCUMENTACIÓN**: v2.0

