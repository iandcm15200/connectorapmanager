const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');
const playwright = require('playwright');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, 'estudiantes.db');
const USERS_DB_PATH = path.join(__dirname, 'usuarios.db');
const SESSION_FILE = '.playwright-session.json';
const CREDENTIALS_FILE = '.credenciales.json';
const SECRET_KEY = 'aplatam-secret-key-2025';

// Variables globales para mantener sesiÃ³n abierta entre bÃºsquedas
let browserGlobal = null;
let contextGlobal = null;
let pageGlobal = null;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ============================================
// INICIALIZAR BASE DE DATOS DE USUARIOS
// ============================================

function initUsersDB() {
  const db = new Database(USERS_DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      registro_codigo TEXT NOT NULL,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.close();
}

initUsersDB();

// ============================================
// FUNCIONES DE AUTENTICACIÃ“N
// ============================================

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + SECRET_KEY).digest('hex');
}

function generateToken(email) {
  const payload = JSON.stringify({ email, timestamp: Date.now() });
  return Buffer.from(payload).toString('base64');
}

function verifyToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());
    return payload.email;
  } catch {
    return null;
  }
}

// ============================================
// ENDPOINTS DE AUTENTICACIÃ“N
// ============================================

app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, code } = req.body;

    if (code !== 'Aplatam10') {
      return res.status(400).json({ error: 'CÃ³digo de registro invÃ¡lido' });
    }

    const db = new Database(USERS_DB_PATH);
    
    const existing = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
    if (existing) {
      db.close();
      return res.status(400).json({ error: 'El correo ya estÃ¡ registrado' });
    }

    const hashedPassword = hashPassword(password);
    db.prepare('INSERT INTO usuarios (email, password, registro_codigo) VALUES (?, ?, ?)').run(email, hashedPassword, code);
    db.close();

    res.json({ success: true, message: 'Usuario registrado exitosamente' });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = hashPassword(password);

    const db = new Database(USERS_DB_PATH);
    const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND password = ?').get(email, hashedPassword);
    db.close();

    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = generateToken(email);
    res.json({ 
      success: true, 
      token, 
      user: { email: user.email, fecha_registro: user.fecha_registro } 
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesiÃ³n' });
  }
});

app.post('/api/auth/verify', (req, res) => {
  try {
    const { token } = req.body;
    const email = verifyToken(token);

    if (!email) {
      return res.status(401).json({ valid: false });
    }

    const db = new Database(USERS_DB_PATH);
    const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
    db.close();

    if (!user) {
      return res.status(401).json({ valid: false });
    }

    res.json({ valid: true, user: { email: user.email } });
  } catch (error) {
    res.status(401).json({ valid: false });
  }
});

// ============================================
// RUTA RAÃZ - SIRVE EL LOGIN
// ============================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// ============================================
// ENDPOINT DE BÃšSQUEDA LOCAL EN DB
// ============================================

app.get('/api/buscar/:termino', (req, res) => {
  try {
    const termino = req.params.termino;
    const db = new Database(DB_PATH, { readonly: true });
    
    const esEmail = termino.includes('@');
    const esTelefono = /^\+?[0-9]+$/.test(termino);
    const esLeadId = /^\d+$/.test(termino) && termino.length < 10;
    
    let query;
    let params;
    
    if (esEmail) {
      query = 'SELECT * FROM estudiantes WHERE email LIKE ? COLLATE NOCASE LIMIT 10';
      params = [`%${termino}%`];
    } else if (esTelefono) {
      const telefonoLimpio = termino.replace(/\+/g, '');
      const variantes = [
        `%${telefonoLimpio}%`,
        `%${telefonoLimpio.replace(/^593/, '')}%`,
        `%593${telefonoLimpio}%`
      ];
      query = 'SELECT * FROM estudiantes WHERE telefono LIKE ? OR telefono LIKE ? OR telefono LIKE ? LIMIT 10';
      params = variantes;
    } else if (esLeadId) {
      query = 'SELECT * FROM estudiantes WHERE lead_id = ? LIMIT 10';
      params = [termino];
    } else {
      query = 'SELECT * FROM estudiantes WHERE nombre LIKE ? COLLATE NOCASE LIMIT 10';
      params = [`%${termino}%`];
    }
    
    const stmt = db.prepare(query);
    const resultados = stmt.all(...params);
    
    db.close();
    
    res.json({
      success: true,
      count: resultados.length,
      resultados: resultados
    });
    
  } catch (error) {
    console.error('Error en bÃºsqueda:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// FUNCIONES DE BÃšSQUEDA EN APMANAGER
// ============================================

async function obtenerSesion() {
  try {
    // Si ya tenemos browser/context/page abiertos y vÃ¡lidos, reutilizarlos
    if (browserGlobal && contextGlobal && pageGlobal) {
      try {
        // Verificar que la pÃ¡gina sigue activa
        await pageGlobal.evaluate(() => true);
        console.log('   â™»ï¸  Reutilizando sesiÃ³n existente...');
        return { browser: browserGlobal, context: contextGlobal, page: pageGlobal };
      } catch (e) {
        console.log('   âš ï¸  SesiÃ³n anterior cerrada, creando nueva...');
        browserGlobal = null;
        contextGlobal = null;
        pageGlobal = null;
      }
    }
    
    // Determinar si usar headless (invisible) - solo mostrar ventana si no hay sesiÃ³n guardada
    const haySesionGuardada = false; // DESHABILITADO - causa hangs en Fly.io
    const usarHeadless = true; // SIEMPRE HEADLESS (Fly.io no tiene X server)
    
    console.log(usarHeadless ? '   ðŸ‘» Modo invisible (headless)' : '   ðŸ‘ï¸  Modo visible para autenticaciÃ³n');
    
    browserGlobal = await playwright.chromium.launch({ 
      headless: usarHeadless,
      args: usarHeadless ? [] : ['--start-maximized']
    });
    
    console.log('    Creando nueva sesión...');
    contextGlobal = await browserGlobal.newContext({ viewport: null });
    
    pageGlobal = await contextGlobal.newPage();
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 1: VERIFICAR AUTENTICACIÃ“N
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // Ir directamente a la pÃ¡gina de login para verificar si necesita autenticarse
    await pageGlobal.goto('https://apmanager.aplatam.com/admin/account/login', { 
      waitUntil: 'networkidle' 
    });
    
    await pageGlobal.waitForTimeout(2000);
    
    // Verificar si necesita autenticaciÃ³n
    const url = pageGlobal.url();
    
    if (url.includes('/login') || url.includes('/Login')) {
      console.log('   ðŸ” SesiÃ³n expirada, re-autenticando automÃ¡ticamente...');
      
      // Si habÃ­a sesiÃ³n guardada pero expirÃ³, eliminarla
      if (haySesionGuardada) {
        console.log('   ðŸ—‘ï¸  Eliminando sesiÃ³n expirada...');
        
        // Cerrar browser y reintentar con ventana visible
        await browserGlobal.close();
        browserGlobal = null;
        contextGlobal = null;
        pageGlobal = null;
        
        console.log('   ðŸ”„ Reintentando login con ventana visible...');
        browserGlobal = await playwright.chromium.launch({ 
          headless: false,
          args: ['--start-maximized']
        });
        contextGlobal = await browserGlobal.newContext({ viewport: null });
        pageGlobal = await contextGlobal.newPage();
        
        await pageGlobal.goto('https://apmanager.aplatam.com/admin/account/login', { 
          waitUntil: 'networkidle' 
        });
        await pageGlobal.waitForTimeout(2000);
      }
      
      console.log('   ðŸ” Autenticando con Microsoft OAuth...');
      const credenciales = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
      
      // PASO 1.1: Click en botÃ³n Microsoft
      await pageGlobal.click('button:has-text("Microsoft"), a:has-text("Microsoft")');
      await pageGlobal.waitForURL(/login\.microsoftonline\.com/, { timeout: 15000 });
      
      // PASO 1.2: Ingresar Email
      await pageGlobal.waitForSelector('input[type="email"]', { timeout: 10000 });
      await pageGlobal.fill('input[type="email"]', credenciales.email);
      await pageGlobal.click('input[type="submit"]');
      await pageGlobal.waitForTimeout(2000);
      
      // PASO 1.3: Ingresar Password
      await pageGlobal.waitForSelector('input[type="password"]', { timeout: 10000 });
      await pageGlobal.fill('input[type="password"]', credenciales.password);
      await pageGlobal.click('input[type="submit"]');
      await pageGlobal.waitForTimeout(3000);
      
      // PASO 1.4: Mantener sesiÃ³n iniciada (importante para persistencia)
      try {
        const stayButton = await pageGlobal.waitForSelector('input[type="submit"]', { timeout: 8000 });
        if (stayButton) await stayButton.click();
      } catch (e) {
        // No hay problema si no aparece este diÃ¡logo
      }

      await pageGlobal.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await pageGlobal.waitForTimeout(2000);
      
      await pageGlobal.waitForTimeout(3000);
      
      console.log('   âœ… AutenticaciÃ³n exitosa con Microsoft');
    } else {
      console.log('   âœ… SesiÃ³n vÃ¡lida reutilizada');
    }
    
    return { browser: browserGlobal, context: contextGlobal, page: pageGlobal };
  } catch (error) {
    // Si hay error de autenticaciÃ³n, cerrar todo y resetear
    console.error('   âŒ Error en obtenerSesion:', error.message);
    if (browserGlobal) {
      try {
        await browserGlobal.close();
      } catch (e) {}
    }
    browserGlobal = null;
    contextGlobal = null;
    pageGlobal = null;
    throw error;
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FUNCIÃ“N: buscarConFiltro
// Realiza bÃºsqueda en APManager usando los filtros de la pÃ¡gina
// Valores de filtro disponibles:
//   - 'searchEmail'    : BÃºsqueda por email
//   - 'searchPhone'    : BÃºsqueda por telÃ©fono
//   - 'searchLeadId'   : BÃºsqueda por Lead ID
//   - 'searchName'     : BÃºsqueda por nombre
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function buscarConFiltro(page, filtroValue, valorBusqueda, tipoLabel) {
  try {
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 1: Abrir el dropdown de filtros de bÃºsqueda
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    await page.click('#busquedabtn');
    await page.waitForTimeout(1500);
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 2: Activar el radio button correspondiente al tipo de bÃºsqueda
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // IMPORTANTE: Usar page.evaluate() para manipular el DOM directamente
    // porque los radio buttons tienen eventos personalizados que no se 
    // activan con .click() normal
    await page.evaluate((valor) => {
      const radio = document.querySelector(`input[value="${valor}"]`);
      if (radio) {
        radio.checked = true;
        if (radio.onclick) radio.onclick.call(radio);
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, filtroValue);
    await page.waitForTimeout(1000);
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 3: Ingresar el valor de bÃºsqueda en el campo de texto
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    await page.waitForSelector('input#search-field', { timeout: 5000 });
    await page.fill('input#search-field', valorBusqueda);
    await page.waitForTimeout(500);
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 4: Click en el botÃ³n "Buscar" para ejecutar la bÃºsqueda
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    await page.click('button.btn.btn-primary:has-text("Buscar")');
    await page.waitForTimeout(2000);
    
    const hayTabla = await page.locator('table tbody tr').count();
    if (hayTabla === 0) {
      console.log(`   âš ï¸ No se encontraron resultados`);
      return [];
    }
    
    await page.waitForTimeout(1000);
    
    const resultados = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const results = [];
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
          let leadId = 'N/A';
          const consultaLink = row.querySelector('a[id^="consulta"]');
          
          if (consultaLink) {
            const idMatch = consultaLink.id.match(/consulta(\d+)/);
            if (idMatch) {
              leadId = idMatch[1];
            } else {
              const onclickMatch = consultaLink.getAttribute('onclick')?.match(/redirectConsultaLead\((\d+)\)/);
              if (onclickMatch) leadId = onclickMatch[1];
            }
          }
          
          let emailText = cells[1]?.textContent?.trim() || 'N/A';
          let telefono = 'N/A';
          
          if (consultaLink) {
            const innerHTML = consultaLink.innerHTML;
            const parts = innerHTML.split('<br>');
            if (parts.length >= 2) {
              emailText = parts[0].trim();
              telefono = parts[1].trim();
            }
          }
          
          results.push({
            lead_id: leadId,
            lead_url: leadId !== 'N/A' ? `https://apmanager.aplatam.com/admin/Ventas/Consulta/Lead/${leadId}` : 'N/A',
            nombre: cells[0]?.textContent?.trim() || 'N/A',
            email: emailText,
            telefono: telefono,
            programa: cells[2]?.textContent?.trim() || 'N/A',
            matricula: cells[3]?.textContent?.trim() || 'N/A',
            estado: cells[cells.length - 2]?.textContent?.trim() || 'N/A'
          });
        }
      });
      
      return results;
    });
    
    console.log(`   âœ… Encontrados ${resultados.length} resultado(s)`);
    return resultados;
  } catch (error) {
    console.error('   âŒ Error en bÃºsqueda con filtro:', error.message);
    return [];
  }
}

function guardarEnBaseDatos(resultados) {
  if (resultados.length === 0) return 0;
  
  const db = new Database(DB_PATH);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO estudiantes (lead_id, lead_url, nombre, email, telefono, programa, matricula, estado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let nuevos = 0;
  resultados.forEach(r => {
    const info = insert.run(r.lead_id, r.lead_url, r.nombre, r.email, r.telefono, r.programa, r.matricula, r.estado);
    if (info.changes > 0) nuevos++;
  });
  
  db.close();
  console.log(`   ðŸ’¾ Guardados ${nuevos} registro(s) nuevos en DB`);
  return nuevos;
}

// ============================================
// ENDPOINT DE BÃšSQUEDA EN APMANAGER
// ============================================

app.get('/api/buscar-apmanager/:termino', async (req, res) => {
  let browser, context, page;
  let intentos = 0;
  const maxIntentos = 2; // MÃ¡ximo 2 intentos (primero con sesiÃ³n guardada, luego con nueva)
  
  while (intentos < maxIntentos) {
    try {
      intentos++;
      const termino = req.params.termino;
      console.log(`\nðŸ” Buscando en APManager (intento ${intentos}/${maxIntentos}): ${termino}`);
      
      const sesion = await obtenerSesion();
      browser = sesion.browser;
      context = sesion.context;
      page = sesion.page;
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 2: VERIFICAR Y SELECCIONAR INSTITUCIÃ“N
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // APManager permite gestionar mÃºltiples instituciones. Debemos asegurarnos
    // de estar en "UDLA MaestrÃ­as" (ID: 24) antes de buscar alumnos
    console.log('ðŸ« Verificando instituciÃ³n...');
    await page.goto('https://apmanager.aplatam.com/admin/Retencion/lead/agente', {
      waitUntil: 'networkidle',
      timeout: 10000
    });
    await page.waitForTimeout(500);
    
    const institucionActual = await page.evaluate(() => {
      return document.querySelector('#txtInstitucion')?.textContent?.trim();
    });
    
    if (!institucionActual?.includes('UDLA MaestrÃ­as')) {
      console.log('   Seleccionando UDLA MaestrÃ­as...');
      await page.click('#txtInstitucion');
      await page.waitForTimeout(500);
      // IMPORTANTE: data-id="24" es el ID de UDLA MaestrÃ­as
      await page.evaluate(() => {
        document.querySelector('a[data-id="24"]')?.click();
      });
      await page.waitForNavigation({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      console.log('   âœ“ InstituciÃ³n cambiada');
    } else {
      console.log('   âœ“ Ya estÃ¡ en UDLA MaestrÃ­as');
    }
    
    console.log('âœ… InstituciÃ³n configurada');
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 3: NAVEGAR A LA PÃGINA DE CONSULTA DE ALUMNOS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    console.log('ðŸ“ Navegando a consulta de alumnos...');
    await page.goto('https://apmanager.aplatam.com/admin/Alumno/Consulta/Index', {
      waitUntil: 'networkidle'
    });
    await page.waitForTimeout(1500);
    console.log('âœ… En pÃ¡gina de consulta');
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 4: CONFIGURAR FECHA DE BÃšSQUEDA
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // APManager requiere una fecha de inicio para las bÃºsquedas
    console.log('ðŸ” Buscando estudiante...');
    await page.fill('#FechaHoraInicio', '16/09/2024');
    await page.waitForTimeout(500);
    console.log('   âœ“ Fecha configurada');
    
    const esEmail = termino.includes('@');
    const esTelefono = /^\+?[0-9]+$/.test(termino);
    const esLeadId = /^\d+$/.test(termino) && termino.length < 10;
    
    let todosResultados = [];
    
    if (esEmail) {
      console.log('   ðŸ“§ Modo: BÃºsqueda por email');
      const results = await buscarConFiltro(page, 'searchEmail', termino, 'Email');
      todosResultados.push(...results);
    } else if (esTelefono) {
      console.log('   ðŸ“± Modo: BÃºsqueda por telÃ©fono');
      // Buscar con 3 variantes de telÃ©fono
      const telefonoLimpio = termino.replace(/\+/g, '');
      const variantes = [
        telefonoLimpio.replace(/^593/, ''),
        telefonoLimpio.startsWith('593') ? telefonoLimpio : `593${telefonoLimpio}`,
        `+${telefonoLimpio.startsWith('593') ? telefonoLimpio : `593${telefonoLimpio}`}`
      ];
      
      for (let i = 0; i < variantes.length; i++) {
        const tel = variantes[i];
        console.log(`   Intento ${i + 1}/${variantes.length}: ${tel}`);
        const results = await buscarConFiltro(page, 'searchPhone', tel, 'TelÃ©fono');
        todosResultados.push(...results);
        if (results.length > 0) {
          console.log(`   âœ… Encontrado con formato: ${tel}`);
          break;
        } else {
          console.log(`   âš ï¸  No encontrado con: ${tel}`);
        }
      }
    } else if (esLeadId) {
      console.log('   ðŸ”¢ Modo: BÃºsqueda por Lead ID');
      const results = await buscarConFiltro(page, 'searchLeadId', termino, 'Lead ID');
      todosResultados.push(...results);
    } else {
      console.log('   ðŸ‘¤ Modo: BÃºsqueda por Nombre');
      const results = await buscarConFiltro(page, 'searchName', termino, 'Nombre');
      todosResultados.push(...results);
    }
    
    // Eliminar duplicados por lead_id
    const unicos = Array.from(new Map(todosResultados.map(r => [r.lead_id, r])).values());
    
    // Guardar en base de datos (enriquece BD local con resultados de APManager)
      const nuevos = guardarEnBaseDatos(unicos);
      
      // NO cerrar browser - mantenerlo abierto para prÃ³ximas bÃºsquedas
      // await browser.close(); // âŒ COMENTADO - mantener sesiÃ³n abierta
      
      console.log(`âœ… BÃºsqueda completada: ${unicos.length} encontrados, ${nuevos} nuevos en DB\n`);
      
      res.json({
        success: true,
        count: unicos.length,
        nuevosEnDB: nuevos,
        resultados: unicos
      });
      
      // Salir del while loop si la bÃºsqueda fue exitosa
      break;
      
    } catch (error) {
      console.error(`âŒ Error en bÃºsqueda APManager (intento ${intentos}/${maxIntentos}):`, error.message);
      
      // Si el error es de sesiÃ³n expirada y aÃºn quedan intentos
      if (intentos < maxIntentos && (
        error.message.includes('Timeout') ||
        error.message.includes('waiting for') ||
        error.message.includes('login') ||
        error.message.includes('navigation') ||
        error.message.includes('locator') ||
        error.message.includes('suitable')
      )) {
        console.log('   ðŸ”„ Detectada posible sesiÃ³n expirada, eliminando sesiÃ³n y reintentando...');
        
        // Cerrar browser actual
        if (browserGlobal) {
          try {
            await browserGlobal.close();
          } catch (e) {}
        }
        browserGlobal = null;
        contextGlobal = null;
        pageGlobal = null;
        
        // Eliminar archivo de sesiÃ³n
        if (fs.existsSync(SESSION_FILE)) {
          console.log('   ðŸ—‘ï¸  SesiÃ³n eliminada, siguiente intento serÃ¡ con nueva autenticaciÃ³n');
        }
        
        // Continuar al siguiente intento del while loop
        continue;
      }
      
      // Si no quedan mÃ¡s intentos o es otro tipo de error
      if (intentos >= maxIntentos) {
        console.error('âŒ Se agotaron los intentos de bÃºsqueda');
      }
      
      res.status(500).json({
        success: false,
        error: error.message,
        intentos: intentos
      });
      
      break; // Salir del while loop
    }
  }
});

// ============================================
// ENDPOINT DE MATERIAS DEL ESTUDIANTE
// ============================================

app.get('/api/materias/:leadId', async (req, res) => {
  let intentos = 0;
  const maxIntentos = 2;
  
  while (intentos < maxIntentos) {
    try {
      intentos++;
      const leadId = req.params.leadId;
      console.log(`\nðŸ“š Obteniendo materias del Lead ${leadId} (intento ${intentos}/${maxIntentos})`);
      
      const sesion = await obtenerSesion();
      const page = sesion.page;
      
      // Navegar a la pÃ¡gina del Lead
      console.log(`ðŸ“ Navegando al Lead ${leadId}...`);
      await page.goto(`https://apmanager.aplatam.com/admin/Ventas/Consulta/Lead/${leadId}`, {
        waitUntil: 'networkidle',
        timeout: 15000
      });
      await page.waitForTimeout(2000);
      
      // Click en el tab de Materias
      console.log('ðŸ“– Abriendo tab de Materias...');
      await page.click('#materias-tab');
      await page.waitForTimeout(2000);
      
      // Extraer informaciÃ³n adicional y materias de la tabla
      console.log('ðŸ“Š Extrayendo informaciÃ³n de materias...');
      const dataMaterias = await page.evaluate(() => {
        // Extraer materias pagadas disponibles
        const lblDisponiblilidad = document.querySelector('#lblDisponiblilidad');
        const materiasPagadas = lblDisponiblilidad ? lblDisponiblilidad.textContent.trim() : 'No disponible';
        
        const rows = document.querySelectorAll('#periodoMat tbody tr');
        const results = [];
        
        rows.forEach((row, idx) => {
          const cells = row.querySelectorAll('td');
          
          if (cells.length >= 8) {
            // Detectar estado verificando el botón #inscritoX por índice de fila
            let estadoInscripcion = 'No inscrito';
            let puedeInscribir = false;
            
            const botonInscrito = document.querySelector(`#inscrito${idx}`);
            if (botonInscrito) {
              const btnClass = botonInscrito.className || '';
              const btnText = botonInscrito.textContent.trim();
              
              // Si el botón tiene clase btn-success (verde), ya está inscrito
              if (btnClass.includes('btn-success')) {
                estadoInscripcion = 'Inscrito';
                puedeInscribir = false;
              }
              // Si el botón tiene clase btn-danger (rojo), NO está inscrito y puede inscribirse
              else if (btnClass.includes('btn-danger')) {
                estadoInscripcion = 'No inscrito';
                puedeInscribir = true;
              }
            }
            
            // Extraer requisitos desde cells[8]
            let requisitosTexto = 'Sin requisitos';
            if (cells[8]) {
              const labels = cells[8].querySelectorAll('label');
              if (labels.length > 0) {
                const reqs = Array.from(labels)
                  .map(l => l.textContent.trim())
                  .filter(t => t && t !== 'N/A');
                if (reqs.length > 0) {
                  requisitosTexto = reqs.join(', ');
                }
              }
            }
            
            results.push({
              indice_fila: idx,
              prioridad: cells[1] ? cells[1].textContent.trim() : 'N/A',
              insignias: cells[2] ? cells[2].textContent.trim() : '',
              materia: cells[3] ? cells[3].textContent.trim() : 'Sin nombre',
              codigo: cells[4] ? cells[4].textContent.trim() : 'N/A',
              tipo: cells[5] ? cells[5].textContent.trim() : 'N/A',
              periodo_inicio: cells[6] ? cells[6].textContent.trim() : 'N/A',
              creditos: cells[7] ? cells[7].textContent.trim() : 'N/A',
              requisitos: requisitosTexto,
              estado_inscripcion: estadoInscripcion,
              puede_inscribir: puedeInscribir
            });
          }
        });
        
        return {
          materias_pagadas: materiasPagadas,
          materias: results
        };
      });
      
      console.log(`âœ… ExtraÃ­das ${dataMaterias.materias.length} materias del Lead ${leadId}`);
      console.log(`ðŸ“‹ ${dataMaterias.materias_pagadas}`);
      
      res.json({
        success: true,
        lead_id: leadId,
        materias_pagadas: dataMaterias.materias_pagadas,
        count: dataMaterias.materias.length,
        materias: dataMaterias.materias
      });
      
      break; // Salir del while loop si fue exitoso
      
    } catch (error) {
      console.error(`âŒ Error al obtener materias (intento ${intentos}/${maxIntentos}):`, error.message);
      
      if (intentos < maxIntentos && (
        error.message.includes('Timeout') || 
        error.message.includes('waiting for') ||
        error.message.includes('login') ||
        error.message.includes('navigation') ||
        error.message.includes('locator') ||
        error.message.includes('suitable')
      )) {
        if (browserGlobal) {
          try {
            await browserGlobal.close();
          } catch (e) {}
        }
        browserGlobal = null;
        contextGlobal = null;
        pageGlobal = null;
        
        if (fs.existsSync(SESSION_FILE)) {
          console.log('   ðŸ—‘ï¸  SesiÃ³n eliminada, siguiente intento serÃ¡ con nueva autenticaciÃ³n');
        }
        
        continue;
      }
      
      if (intentos >= maxIntentos) {
        console.error('âŒ Se agotaron los intentos para obtener materias');
      }
      
      res.status(500).json({
        success: false,
        error: error.message,
        intentos: intentos
      });
      
      break;
    }
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ENDPOINT: Inscribir materia específica por código
// Recibe el código de materia desde el frontend (quien elige la prioritaria)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
app.post('/api/inscribir-prioritaria/:leadId', async (req, res) => {
  const leadId = req.params.leadId;
  
  console.log(`\nðŸ" Inscribiendo materia de MAYOR PRIORIDAD del Lead ${leadId}`);
  console.log(`ðŸŽ¯ El sistema elegirá automáticamente la materia con el número de prioridad más BAJO`);

  try {
    // Reutilizar sesiÃ³n existente o crear nueva
    let page = pageGlobal;
    
    if (!page) {
      console.log('   ðŸŒ Iniciando navegador...');
      const browser = await playwright.chromium.launch({ headless: true });
      const context = await browser.newContext();
      page = await context.newPage();
      browserGlobal = browser;
      contextGlobal = context;
      pageGlobal = page;
      
      // Cargar sesiÃ³n si existe
      if (fs.existsSync(SESSION_FILE)) {
        const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
        await context.addCookies(sessionData.cookies);
        await context.addInitScript(() => {
          const storageData = JSON.parse('${JSON.stringify(sessionData.localStorage)}');
          Object.entries(storageData).forEach(([key, value]) => {
            localStorage.setItem(key, value);
          });
        });
      }
    } else {
      console.log('   â™»ï¸  Reutilizando sesiÃ³n existente...');
    }
    
    // Navegar al Lead
    console.log('ðŸ“ Navegando al Lead...');
    await page.goto(`https://apmanager.aplatam.com/admin/Ventas/Consulta/Lead/${leadId}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Abrir tab de materias
    console.log('ðŸ“– Abriendo tab de Materias...');
    await page.click('#materias-tab');
    await page.waitForTimeout(2000);
    
    // Inyectar código JavaScript que encuentra y hace click en la materia prioritaria
    const resultado = await page.evaluate(() => {
      const rows = document.querySelectorAll('#periodoMat tbody tr');
      let mejorPrioridad = 999;
      let materiaInfo = null;
      
      // Recorrer todas las filas
      rows.forEach((row, idx) => {
        const cells = row.querySelectorAll('td');
        
        if (cells.length >= 5) {
          // cells[0] = # (número visual)
          // cells[1] = Prioridad 
          // cells[3] = Materia
          // cells[4] = Código
          
          const numeroFila = cells[0]?.textContent.trim() || '';
          const prioridad = parseInt(cells[1]?.textContent.trim()) || 999;
          const materia = cells[3]?.textContent.trim() || 'Sin nombre';
          const codigo = cells[4]?.textContent.trim() || 'N/A';
          
          console.log(`Analizando fila ${idx} (#${numeroFila}): Prioridad=${prioridad}, Materia="${materia.substring(0,30)}", Código=${codigo}`);
          
          // Guardar si es mejor prioridad
          if (prioridad < mejorPrioridad) {
            mejorPrioridad = prioridad;
            materiaInfo = {
              indice: idx,
              numeroFila: numeroFila,
              prioridad: prioridad,
              materia: materia,
              codigo: codigo,
              botonId: `inscrito${idx}`
            };
          }
        }
      });
      
      if (!materiaInfo) {
        return { success: false, error: 'No se encontraron materias' };
      }
      
      console.log(`🎯 Materia elegida: Prioridad ${materiaInfo.prioridad}, Botón: #${materiaInfo.botonId}`);
      
      // Hacer click DESDE JAVASCRIPT
      const boton = document.querySelector(`#${materiaInfo.botonId}`);
      if (!boton) {
        return { success: false, error: `No se encontró el botón #${materiaInfo.botonId}` };
      }
      
      boton.click();
      console.log(`✅ Click ejecutado en #${materiaInfo.botonId}`);
      
      return { success: true, materia: materiaInfo };
    });
    
    if (!resultado.success) {
      throw new Error(resultado.error);
    }
    
    const materiaEncontrada = resultado.materia;
    
    console.log(`\n📋 MATERIA INSCRITA:`);
    console.log(`   - Prioridad: ${materiaEncontrada.prioridad}`);
    console.log(`   - Materia: ${materiaEncontrada.materia}`);
    console.log(`   - Código: ${materiaEncontrada.codigo}`);
    console.log(`   - Fila visual: #${materiaEncontrada.numeroFila}`);
    console.log(`   - Botón: #${materiaEncontrada.botonId}`);
    await page.waitForTimeout(2000);
    
    // Paso 1: Click en botón "Guardar"
    console.log('   Guardando inscripcion...');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForTimeout(2000);
    
    // Paso 2: Aceptar confirmación final
    console.log('   Confirmando inscripcion...');
    await page.getByRole('button', { name: 'Aceptar' }).click();
    await page.waitForTimeout(2000);
    
    console.log(`Materia inscrita exitosamente\n`);
    
    res.json({
      success: true,
      materia: materiaEncontrada.materia,
      codigo: materiaEncontrada.codigo,
      prioridad: materiaEncontrada.prioridad,
      mensaje: `Materia ${materiaEncontrada.materia} inscrita correctamente`
    });
    
  } catch (error) {
    console.error('âŒ Error al inscribir:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nâœ… API de bÃºsqueda iniciada en http://localhost:${PORT}`);
  console.log(`ðŸ“Š Base de datos: ${DB_PATH}`);
  console.log(`ðŸ” Endpoints disponibles:`);
  console.log(`   â€¢ GET /api/buscar/:termino (bÃºsqueda local en DB)`);
  console.log(`   â€¢ GET /api/buscar-apmanager/:termino (bÃºsqueda en APManager + guarda en DB)`);
  console.log(`   â€¢ GET /api/materias/:leadId (obtiene materias del estudiante)`);
  console.log(`   â€¢ POST /api/inscribir-prioritaria/:leadId { "codigoMateria": "MNDL-XXXX" } (inscribe materia específica)`);
  console.log(`\nðŸ’¡ El servidor mantiene la sesiÃ³n abierta entre bÃºsquedas para mayor velocidad`);
  console.log(`ðŸ”’ Presiona Ctrl+C para detener el servidor\n`);
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MANEJO DE CIERRE GRACEFUL
// Cerrar browser correctamente cuando se detiene el servidor
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
process.on('SIGINT', async () => {
  console.log('\n\nðŸ›‘ Deteniendo servidor...');
  if (browserGlobal) {
    console.log('ðŸ”’ Cerrando navegador...');
    try {
      await browserGlobal.close();
    } catch (e) {}
  }
  console.log('âœ… Servidor detenido correctamente\n');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\nðŸ›‘ Deteniendo servidor...');
  if (browserGlobal) {
    console.log('ðŸ”’ Cerrando navegador...');
    try {
      await browserGlobal.close();
    } catch (e) {}
  }
  console.log('âœ… Servidor detenido correctamente\n');
  process.exit(0);
});








