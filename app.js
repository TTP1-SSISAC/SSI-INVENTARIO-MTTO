/* ============================================================
TMS SSI — Inventario & Mantenimiento
Consume el Google Sheet a través del Web App de Apps Script.
============================================================ */

const CONFIG = {
// Pega aquí la URL de tu implementación de Apps Script (termina en /exec)
API_URL: 'https://script.google.com/macros/s/AKfycbwcSuaUvR_k4ZVywU9DIApee4Jurx97dQBKMekljtcOOyDa0eqIB1nkqUH5KQOAM88Q/exec'
};

const state = {
productos: [], ingresos: [], salidas: [], kardex: [],
mantenimiento: [], catalogoFallas: [], fallas: [],
tracto: [], carretas: [], personal: [], conductores: [], proveedores: []
};

/* ---------------- API helpers ---------------- */

async function apiGet(action) {
const url = `${CONFIG.API_URL}?action=${action}`;
const res = await fetch(url);
const json = await res.json();
if (json && json.error) throw new Error(json.error);
return json;
}

async function apiPost(action, data) {
const res = await fetch(CONFIG.API_URL, {
method: 'POST',
headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
body: JSON.stringify({ action, data })
});
const json = await res.json();
if (json && json.error) throw new Error(json.error);
return json;
}

function isConfigured() {
return CONFIG.API_URL && CONFIG.API_URL.startsWith('http');
}

/* ---------------- Utilidad genérica: debounce ----------------
   Retrasa la ejecución de "fn" hasta que pasen "wait" ms sin que se
   vuelva a llamar. Se usa en filtros de texto para no re-renderizar
   la tabla en cada tecla, solo cuando el usuario hace una pausa.
------------------------------------------------------------------- */
function debounce(fn, wait) {
let t;
return function (...args) {
clearTimeout(t);
t = setTimeout(() => fn.apply(this, args), wait);
};
}

/* ---------------- Carga inicial ---------------- */

async function loadAll() {
if (!isConfigured()) {
setConnStatus(false, 'Falta configurar API_URL en app.js');
return;
}
try {
const all = await apiGet('all');
Object.assign(state, {
productos: all.PRODUCTOS || [],
ingresos: all.INGRESOS || [],
salidas: all.SALIDAS || [],
kardex: all.KARDEX || [],
mantenimiento: all.MANTENIMIENTO || [],
catalogoFallas: all.CATALOGO_FALLA || [],
fallas: all.REPORTES_FALLA || [],
tracto: all.TRACTO || [],
carretas: all.CARRETAS || [],
personal: all.PERSONAL || [],
conductores: all.CONDUCTORES || [],
proveedores: all.PROVEEDORES || []
});
_recalcStockMap();
setConnStatus(true, 'Conectado a Google Sheets');
renderAll();
} catch (err) {
setConnStatus(false, 'Error de conexión: ' + err.message);
}
}

function setConnStatus(ok, label) {
const el = document.getElementById('connStatus');
el.classList.toggle('connected', ok);
document.getElementById('connLabel').textContent = label;
}

/* ---------------- Stock helper (mismo criterio que el backend) ----------------
   OPTIMIZACIÓN: antes, getStockDe() recorría TODO el array de kardex
   con .filter() cada vez que se llamaba — y se llama muchas veces por
   render (una vez por cada producto en cada select, en cada fila de la
   factura de ingreso, etc.). Con un historial largo esto se sentía
   como el input lento/atascado tras cualquier acción.

   Ahora se calcula un Map "código -> stock final" UNA sola vez después
   de cada loadAll() (_recalcStockMap), y getStockDe() solo hace una
   consulta O(1) a ese mapa. El resultado es idéntico al anterior
   (mismo criterio: el "Stock Final" del último movimiento de ese
   producto en el Kardex, en el mismo orden en que ya venía el array).
------------------------------------------------------------------- */
let _stockMap = new Map();

function _recalcStockMap() {
_stockMap = new Map();
state.kardex.forEach(k => {
const codigo = String(k['Código Producto']);
_stockMap.set(codigo, Number(k['Stock Final']) || 0);
});
}

function getStockDe(codigo) {
return _stockMap.get(String(codigo)) || 0;
}

/* ---------------- Navegación ---------------- */

const VIEW_TITLES = {
'inv-dashboard': 'Panel general — Inventario',
'inv-productos': 'Productos — Inventario',
'inv-producto-form': 'Nuevo producto',
'inv-ingreso': 'Registrar ingreso — Inventario',
'inv-salida': 'Registrar salida — Inventario',
'inv-kardex': 'Kardex — Inventario',
'mnt-dashboard': 'Flota & vencimientos — Mantenimiento',
'cond-dashboard': 'Conductores — Documentos y vencimientos',
'mnt-registro': 'Registrar reparación — Mantenimiento',
'mnt-historial': 'Historial — Mantenimiento',
'mnt-falla': 'Reportar falla — Mantenimiento',
'mnt-fallas-lista': 'Fallas reportadas — Mantenimiento'
};

// Títulos cortos para el topbar en móvil
const VIEW_TITLES_SHORT = {
'inv-dashboard': 'Panel general',
'inv-productos': 'Productos',
'inv-producto-form': 'Nuevo producto',
'inv-ingreso': 'Registrar ingreso',
'inv-salida': 'Registrar salida',
'inv-kardex': 'Kardex',
'mnt-dashboard': 'Flota & vencimientos',
'cond-dashboard': 'Conductores',
'mnt-registro': 'Registrar reparación',
'mnt-historial': 'Historial',
'mnt-falla': 'Reportar falla',
'mnt-fallas-lista': 'Fallas reportadas'
};

function showView(view) {
document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
const target = document.getElementById('view-' + view);
if (target) target.classList.remove('hidden');
document.getElementById('viewTitle').textContent = VIEW_TITLES_SHORT[view] || 'TMS SSI';
document.querySelectorAll('.rail-btn, .rail-sub-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
// Sincronizar barra inferior
document.querySelectorAll('.bnav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
}

document.querySelectorAll('.rail-btn, .rail-sub-btn').forEach(btn => {
btn.addEventListener('click', () => showView(btn.dataset.view));
});

// Barra inferior
document.querySelectorAll('.bnav-btn[data-view]').forEach(btn => {
btn.addEventListener('click', () => showView(btn.dataset.view));
});
document.getElementById('btnNuevoProducto').addEventListener('click', () => showView('inv-producto-form'));
document.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => showView('inv-productos')));

/* ---------------- Render: Inventario ---------------- */

function renderAll() {
renderProductSelects();
renderSalidaSelects();
renderInvDashboard();
renderProductos();
renderKardex();
renderMntDashboard();
renderCondDashboard();
renderMantenimiento();
renderFallaCatalogo();
renderFallas();
renderMantenimientoForm();
}

function renderSalidaSelects() {
// Placas: tractos + carretas
const selPlaca = document.getElementById('salidaPlaca');
if (selPlaca) {
const placas = [
...state.tracto.map(t => ({ placa: t['PLACA'] || t['Placa'] || '', tipo: 'Tracto' })),
...state.carretas.map(c => ({ placa: c['PLACA'] || c['Placa'] || '', tipo: 'Carreta' }))
].filter(p => p.placa);
selPlaca.innerHTML = '<option value="">— Selecciona placa —</option>' +
placas.map(p => `<option value="${p.placa}">${p.placa} (${p.tipo})</option>`).join('');
}

// Personal: conductores + personal (nombre y apellidos)
const selPersonal = document.getElementById('salidaPersonal');
if (selPersonal) {
const personas = [
...state.conductores.map(c =>
[c['NOMBRES'], c['APELLIDOS']].filter(Boolean).join(' ') ||
[c['Nombres'], c['Apellidos']].filter(Boolean).join(' ') ||
c['CONDUCTOR'] || ''
),
...state.personal.map(p =>
[p['NOMBRES'], p['APELLIDOS']].filter(Boolean).join(' ') ||
[p['Nombres'], p['Apellidos']].filter(Boolean).join(' ')
)
].filter(n => n);
selPersonal.innerHTML = '<option value="">— Selecciona personal —</option>' +
personas.map(n => `<option value="${n}">${n}</option>`).join('');
}
}

function fmtMoney(n) { return 'S/ ' + (Number(n) || 0).toFixed(2); }

// Instancias Tom Select activas (para destroy/reinit en cada renderAll)
const _tsMap = new Map();

function _initTomSelect(sel) {
  if (_tsMap.has(sel)) {
    try { _tsMap.get(sel).destroy(); } catch(e) {}
    _tsMap.delete(sel);
  }
  const ts = new TomSelect(sel, {
    create: false,
    allowEmptyOption: false,
    placeholder: 'Escribe para buscar...',
    searchField: ['text'],
    render: {
      option: (data, escape) => `<div>${escape(data.text)}</div>`,
      item:   (data, escape) => `<div>${escape(data.text)}</div>`,
    }
  });
  _tsMap.set(sel, ts);
  return ts;
}

function renderProductSelects() {
const opts = '<option value="" disabled selected>— Selecciona producto —</option>' +
  state.productos.map(p =>
  `<option value="${p['Código Producto']}">${p['Código Producto']} — ${p['Producto']} (stock: ${getStockDe(p['Código Producto'])})</option>`
).join('');
document.querySelectorAll('select.prod-select').forEach(sel => {
  sel.innerHTML = opts;
  _initTomSelect(sel);
});

const kFilter = document.getElementById('kardexFiltro');
kFilter.innerHTML = '<option value="">Todos los productos</option>' +
state.productos.map(p => `<option value="${p['Código Producto']}">${p['Código Producto']} — ${p['Producto']}</option>`).join('');

const provOpts = '<option value="">—</option>' + state.proveedores.map(p =>
`<option value="${p['Razón Social']}" data-ruc="${p['RUC']}">${p['Razón Social']}</option>`).join('');
document.querySelectorAll('select.prov-select').forEach(sel => { sel.innerHTML = provOpts; });

// Refresca las previsualizaciones de stock de cada fila de la factura de
// ingreso, ya que los stocks pudieron cambiar tras recargar los datos.
document.querySelectorAll('#ingresoProductosList .ingreso-row').forEach(row => updateIngresoRowPreview(row));
}

function renderInvDashboard() {
document.getElementById('kpiTotalProductos').textContent = state.productos.length;

const bajos = state.productos.filter(p => getStockDe(p['Código Producto']) <= Number(p['Stock Mínimo'] || 0));
document.getElementById('kpiStockBajo').textContent = bajos.length;

const hoy = new Date().toDateString();
const movHoy = state.kardex.filter(k => new Date(k['Fecha']).toDateString() === hoy).length;
document.getElementById('kpiMovHoy').textContent = movHoy;

const valor = state.productos.reduce((sum, p) => sum + getStockDe(p['Código Producto']) * (Number(p['Total']) || 0), 0);
document.getElementById('kpiValorInv').textContent = fmtMoney(valor);

const tbody = document.querySelector('#tblStockBajo tbody');
tbody.innerHTML = bajos.length ? bajos.map(p => `
<tr>
<td class="mono">${p['Código Producto']}</td>
<td>${p['Producto']}</td>
<td>${p['Ubicación'] || '—'}</td>
<td><span class="tag ${getStockDe(p['Código Producto']) === 0 ? 'tag-alert' : 'tag-warn'}">${getStockDe(p['Código Producto'])}</span></td>
<td>${p['Stock Mínimo']}</td>
</tr>`).join('') : `<tr class="empty-row"><td colspan="5">Sin alertas de stock por el momento.</td></tr>`;
}

function renderProductos() {
const tbody = document.querySelector('#tblProductos tbody');
tbody.innerHTML = state.productos.length ? state.productos.map(p => `
<tr>
<td class="mono">${p['Código Producto']}</td>
<td>${p['Producto']}</td>
<td>${p['Marca'] || '—'}</td>
<td>${p['Categoría'] || '—'}</td>
<td>${p['Ubicación'] || '—'}</td>
<td>${getStockDe(p['Código Producto'])}</td>
<td>${p['Stock Mínimo']}</td>
<td>${p['Moneda'] || 'S/'}</td>
<td>${Number(p['Subtotal'] || 0).toFixed(2)}</td>
<td>${Number(p['IGV'] || 0).toFixed(2)}</td>
<td>${Number(p['Total'] || 0).toFixed(2)}</td>
</tr>`).join('') : `<tr class="empty-row"><td colspan="11">Aún no hay productos registrados.</td></tr>`;
}

/* ---------------- Formateadores de fecha/hora sin conversión de zona horaria ----------------
   Todas las fechas del Sheet se guardan y se leen como TEXTO PLANO
   ("yyyy-MM-dd" y "HH:mm", o combinadas "yyyy-MM-dd HH:mm"). Estos
   helpers NUNCA pasan ese texto por new Date() para mostrarlo, porque
   new Date("yyyy-MM-dd") lo interpreta como UTC medianoche y al
   convertirlo a hora local puede correr el día/hora — que es justo el
   bug que se corrigió en Ingreso y se replica aquí para Kardex y
   Mantenimiento. Solo se cae a new Date() como respaldo de
   compatibilidad con filas antiguas que ya se guardaron como Date real.
------------------------------------------------------------------- */

// "yyyy-MM-dd" -> "dd/mm/yyyy" (sin hora)
function fmtFechaKardex(v) {
if (!v) return '—';
const s = String(v).trim();
const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
if (m) return `${m[3]}/${m[2]}/${m[1]}`;
const d = new Date(s); // compatibilidad con filas antiguas guardadas como Date
return isNaN(d) ? s : d.toLocaleDateString('es-PE');
}

// "yyyy-MM-dd HH:mm" o "yyyy-MM-ddTHH:mm" -> "dd/mm/yyyy HH:mm"
function fmtFechaHoraTexto(v) {
if (!v) return '—';
const s = String(v).trim();
const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
return fmtFecha(s);
}

/**
 * Formatea la columna "Hora" del Kardex.
 *
 * Cuando una celda de Google Sheets está formateada como "Hora" (sin
 * fecha), Apps Script la lee como un objeto Date con fecha base
 * 1899-12-30. Al pasar por JSON, ese Date se convierte a texto ISO
 * completo en UTC, por ejemplo "1899-12-30T19:00:00.000Z". Antes ese
 * valor se imprimía tal cual en la tabla (de ahí el error visual que
 * reportaste). Esta función lo detecta y muestra solo la hora,
 * convertida a la hora local del navegador (mismo criterio que ya usa
 * fmtFecha() para el campo Fecha).
 *
 * También soporta, por si en el futuro se guarda como texto plano,
 * valores ya en formato "HH:mm" o "HH:mm:ss".
 */
function fmtHoraKardex(v) {
if (v === undefined || v === null || v === '') return '—';
const s = String(v).trim();

// Texto plano "HH:mm" o "HH:mm:ss" (sin fecha, sin "T", sin "Z")
const soloHora = s.match(/^(\d{1,2}):(\d{2})(:\d{2})?$/);
if (soloHora) {
return `${soloHora[1].padStart(2, '0')}:${soloHora[2]}`;
}

// Celda "Hora" de Sheets (Date con fecha base 1899-12-30/31) u otra fecha/hora completa
const d = new Date(s);
if (!isNaN(d)) {
return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

return s; // último recurso: mostrar el valor tal cual llegó
}

function renderKardex(filtro = '') {
const rows = filtro ? state.kardex.filter(k => String(k['Código Producto']) === filtro) : state.kardex;
const tbody = document.querySelector('#tblKardex tbody');
tbody.innerHTML = rows.length ? rows.slice().reverse().map(k => `
<tr>
<td>${fmtFechaKardex(k['Fecha'])}</td>
<td class="mono">${fmtHoraKardex(k['Hora'])}</td>
<td><span class="tag ${k['Tipo Movimiento'] === 'INGRESO' ? 'tag-ok' : 'tag-warn'}">${k['Tipo Movimiento']}</span></td>
<td>${k['Producto']}</td>
<td>${k['Entrada'] || '—'}</td>
<td>${k['Salida'] || '—'}</td>
<td><strong>${k['Stock Final']}</strong></td>
<td class="mono">${k['Referencia'] || '—'}</td>
<td>${k['Usuario'] || '—'}</td>
</tr>`).join('') : `<tr class="empty-row"><td colspan="9">Sin movimientos registrados.</td></tr>`;
}
document.getElementById('kardexFiltro').addEventListener('change', e => renderKardex(e.target.value));

function fmtFecha(v) {
if (!v) return '—';
const d = new Date(v);
if (isNaN(d)) return v;
return d.toLocaleDateString('es-PE') + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

/* ---------------- Render: Mantenimiento ---------------- */

function diasHasta(fecha) {
if (!fecha) return null;
const d = new Date(fecha);
if (isNaN(d)) return null;
return Math.ceil((d - new Date()) / 86400000);
}

const DOCS_TRACTO = [
['Póliza de Resp. Contra Terceros', 'Póliza resp. terceros'],
['SOAT Venc.', 'SOAT'],
['Rev. Tec. Venc.', 'Revisión técnica'],
['MTC Venc.', 'MTC']
];
const DOCS_CARRETA = [
['Rev. Tec. Venc', 'Revisión técnica'],
['MTC Venc.', 'MTC']
];

function renderMntDashboard() {
const flota = state.tracto.length + state.carretas.length;
document.getElementById('kpiFlota').textContent = flota;

const filas = [];
state.tracto.forEach(v => DOCS_TRACTO.forEach(([campo, label]) => {
const dias = diasHasta(v[campo]);
if (dias !== null) filas.push({ placa: v['Placa'], tipo: 'TRACTO', doc: label, fecha: v[campo], dias });
}));
state.carretas.forEach(v => DOCS_CARRETA.forEach(([campo, label]) => {
const dias = diasHasta(v[campo]);
if (dias !== null) filas.push({ placa: v['Placa'], tipo: 'CARRETA', doc: label, fecha: v[campo], dias });
}));

const vencidos = filas.filter(f => f.dias < 0);
const porVencer = filas.filter(f => f.dias >= 0 && f.dias <= 30);

document.getElementById('kpiVencProx').textContent = porVencer.length;
document.getElementById('kpiVencidos').textContent = vencidos.length;

const mesActual = new Date().getMonth();
const mntMes = state.mantenimiento.filter(m => {
const d = new Date(m['Fecha Inicial']);
return !isNaN(d) && d.getMonth() === mesActual;
}).length;
document.getElementById('kpiMntMes').textContent = mntMes;

const relevantes = filas.filter(f => f.dias <= 30).sort((a, b) => a.dias - b.dias);
const tbody = document.querySelector('#tblVencimientos tbody');
tbody.innerHTML = relevantes.length ? relevantes.map(f => `
<tr>
<td class="mono">${f.placa}</td>
<td>${f.tipo}</td>
<td>${f.doc}</td>
<td>${fmtFechaSolo(f.fecha)}</td>
<td><span class="tag ${f.dias < 0 ? 'tag-alert' : 'tag-warn'}">${f.dias < 0 ? `Vencido hace ${Math.abs(f.dias)} días` : `Vence en ${f.dias} días`}</span></td>
</tr>`).join('') : `<tr class="empty-row"><td colspan="5">No hay vencimientos próximos en los siguientes 30 días.</td></tr>`;
}

/* ---------------- Render: Conductores (documentos y vencimientos) ----------------
   Mismo criterio que Flota (DOCS_TRACTO/DOCS_CARRETA): se recorre una
   lista de [nombreColumna, etiqueta] y se calculan los días restantes
   con diasHasta(), que ya soporta tanto fechas de Sheets como texto.

   Nota sobre la hoja CONDUCTORES: la columna "DNI" (columna C) no
   contiene el número de documento (ese está en "N° DNI") sino la
   FECHA DE VENCIMIENTO del DNI, así que también se trata como un
   documento más a controlar.
------------------------------------------------------------------- */
const DOCS_CONDUCTOR = [
['DNI', 'DNI (vencimiento)'],
['LICENCIA DE CONDUCIR', 'Licencia de conducir'],
['CERTIFICADO DE ANTECEDENTES POLICIALES', 'Cert. antecedentes policiales'],
['CERTIFICADO DE ANTECEDENTES PENALES', 'Cert. antecedentes penales'],
['CURSO BÁSICO I - PBIP', 'Curso básico I - PBIP'],
['SCTR', 'SCTR'],
['BÁSICO DE SEGURIDAD PORTUARIA', 'Básico seguridad portuaria'],
['BASICO DE MERCANCIAS PELIGROSAS', 'Básico mercancías peligrosas'],
['EXAMEN DE DPWL', 'Examen DPWL'],
['CURSO DE RANSA', 'Curso RANSA'],
['CURSO DE DEMARES', 'Curso DEMARES'],
['CURSO DE IMUPESA', 'Curso IMUPESA']
];

// Nombre del conductor: la hoja lo trae directo en la columna "CONDUCTOR".
function nombreConductor(c) {
return c['CONDUCTOR'] ||
[c['NOMBRES'], c['APELLIDOS']].filter(Boolean).join(' ') ||
[c['Nombres'], c['Apellidos']].filter(Boolean).join(' ') || '—';
}

function renderCondDashboard() {
const tblExiste = document.getElementById('tblVencConductores');
if (!tblExiste) return; // por si el HTML aún no tiene esta sección

document.getElementById('kpiTotalConductores').textContent = state.conductores.length;

const filas = [];
state.conductores.forEach(c => DOCS_CONDUCTOR.forEach(([campo, label]) => {
const dias = diasHasta(c[campo]);
if (dias !== null) {
filas.push({
conductor: nombreConductor(c),
dni: c['N° DNI'] || c['DNI'] || '—',
doc: label,
fecha: c[campo],
dias: dias
});
}
}));

const vencidos = filas.filter(f => f.dias < 0);
const porVencer = filas.filter(f => f.dias >= 0 && f.dias <= 30);

document.getElementById('kpiCondVencProx').textContent = porVencer.length;
document.getElementById('kpiCondVencidos').textContent = vencidos.length;

const relevantes = filas.filter(f => f.dias <= 30).sort((a, b) => a.dias - b.dias);
const tbody = tblExiste.querySelector('tbody');
tbody.innerHTML = relevantes.length ? relevantes.map(f => `
<tr>
<td>${f.conductor}</td>
<td class="mono">${f.dni}</td>
<td>${f.doc}</td>
<td>${fmtFechaSolo(f.fecha)}</td>
<td><span class="tag ${f.dias < 0 ? 'tag-alert' : 'tag-warn'}">${f.dias < 0 ? `Vencido hace ${Math.abs(f.dias)} días` : `Vence en ${f.dias} días`}</span></td>
</tr>`).join('') : `<tr class="empty-row"><td colspan="5">No hay vencimientos próximos en los siguientes 30 días.</td></tr>`;
}

function fmtFechaSolo(v) {
const d = new Date(v);
return isNaN(d) ? '—' : d.toLocaleDateString('es-PE');
}

function renderMantenimiento(filtro = '') {
let rows = state.mantenimiento;
if (filtro) rows = rows.filter(m => String(m['Placa'] || '').toUpperCase().includes(filtro.toUpperCase()));
const tbody = document.querySelector('#tblMantenimiento tbody');
tbody.innerHTML = rows.length ? rows.slice().reverse().map(m => `
<tr>
<td>${m['Nombre Reparación']}</td>
<td class="mono">${m['Placa']}</td>
<td><span class="tag tag-warn">${m['Tipo Mantenimiento'] || '—'}</span></td>
<td>${m['Sistema Reparado'] || '—'}</td>
<td>${m['Técnico'] || '—'}</td>
<td>${fmtFechaHoraTexto(m['Fecha Inicial'])}</td>
<td>${fmtFechaHoraTexto(m['Fecha Final'])}</td>
<td>${m['Kilometraje'] || '—'}</td>
</tr>`).join('') : `<tr class="empty-row"><td colspan="8">Sin reparaciones registradas.</td></tr>`;
}
// OPTIMIZACIÓN: debounce de 200ms — evita re-renderizar toda la tabla
// en cada tecla; solo redibuja cuando el usuario hace una pausa breve.
document.getElementById('historialFiltro').addEventListener('input', debounce(e => renderMantenimiento(e.target.value), 200));

function renderFallaCatalogo() {
// Poblar selector de Placas (tractos + carretas)
const selPlaca = document.getElementById('fallaPlaca');
const placas = [
...state.tracto.map(t => ({ placa: t['PLACA'] || t['Placa'] || '', tipo: 'Tracto' })),
...state.carretas.map(c => ({ placa: c['PLACA'] || c['Placa'] || '', tipo: 'Carreta' }))
].filter(p => p.placa);
selPlaca.innerHTML = '<option value="">— Selecciona placa —</option>' +
placas.map(p => `<option value="${p.placa}">${p.placa} (${p.tipo})</option>`).join('');

// Poblar selector de Personal (conductores + personal)
const selPersonal = document.getElementById('fallaPersonal');
const personas = [
...state.conductores.map(c => nombreConductor(c) !== '—' ? nombreConductor(c) : ''),
...state.personal.map(p => {
const nom = [p['NOMBRES'], p['APELLIDOS']].filter(Boolean).join(' ') ||
[p['Nombres'], p['Apellidos']].filter(Boolean).join(' ') || '';
return nom;
})
].filter(n => n);
selPersonal.innerHTML = '<option value="">— Selecciona personal —</option>' +
personas.map(n => `<option value="${n}">${n}</option>`).join('');

// Poblar selector de Sistema
const sistemas = [...new Set(state.catalogoFallas.map(c => c['SISTEMA']))];
const selSistema = document.getElementById('fallaSistema');
selSistema.innerHTML = sistemas.map(s => `<option value="${s}">${s}</option>`).join('');
updateComponentes();
selSistema.addEventListener('change', updateComponentes);
document.getElementById('fallaComponente').addEventListener('change', updateCodigo);
}

function updateComponentes() {
const sistema = document.getElementById('fallaSistema').value;
const componentes = state.catalogoFallas.filter(c => c['SISTEMA'] === sistema);
document.getElementById('fallaComponente').innerHTML =
componentes.map(c => `<option value="${c['COMPONENTE']}" data-codigo="${c['CÓDIGO']}">${c['COMPONENTE']}</option>`).join('');
updateCodigo();
}

function updateCodigo() {
const compSel = document.getElementById('fallaComponente');
const codigo = compSel.selectedOptions[0] ? compSel.selectedOptions[0].dataset.codigo || '' : '';
document.getElementById('fallaCodigo').value = codigo;
}

// Nombres y métodos de reparación predeterminados (se amplían con el botón +)
const _repNombresDefault = [
'Cambio de aceite y filtros', 'Mantenimiento preventivo', 'Cambio de frenos',
'Reparación de motor', 'Cambio de llantas', 'Revisión eléctrica',
'Cambio de correa de distribución', 'Reparación de caja de cambios',
'Cambio de amortiguadores', 'Reparación de sistema de refrigeración'
];
const _repMetodosDefault = [
'MECÁNICO', 'ELÉCTRICO', 'HIDRÁULICO', 'NEUMÁTICO', 'ELECTRÓNICO'
];

function _addOpcionSelect(selId, promptMsg) {
const val = window.prompt(promptMsg);
if (!val || !val.trim()) return;
const sel = document.getElementById(selId);
const opt = document.createElement('option');
opt.value = val.trim();
opt.textContent = val.trim();
sel.appendChild(opt);
sel.value = val.trim();
}

function renderMantenimientoForm() {
// ---- Placa ----
const selPlaca = document.getElementById('repPlaca');
if (selPlaca) {
const placas = [
...state.tracto.map(t => ({ placa: t['PLACA'] || t['Placa'] || '', tipo: 'Tracto' })),
...state.carretas.map(c => ({ placa: c['PLACA'] || c['Placa'] || '', tipo: 'Carreta' }))
].filter(p => p.placa);
selPlaca.innerHTML = '<option value="">— Selecciona placa —</option>' +
placas.map(p => `<option value="${p.placa}">${p.placa} (${p.tipo})</option>`).join('');
}

// ---- Técnico ----
const selTecnico = document.getElementById('repTecnico');
if (selTecnico) {
const personas = [
...state.personal.map(p =>
([p['NOMBRES'], p['APELLIDOS']].filter(Boolean).join(' ') ||
[p['Nombres'], p['Apellidos']].filter(Boolean).join(' ')).trim()
),
...state.conductores.map(c => nombreConductor(c))
].filter(n => n && n !== '—');
selTecnico.innerHTML = '<option value="">— Selecciona técnico —</option>' +
personas.map(n => `<option value="${n}">${n}</option>`).join('');
}

// ---- Nombre de reparación ----
const selNombre = document.getElementById('repNombre');
if (selNombre && selNombre.options.length === 0) {
selNombre.innerHTML = _repNombresDefault
.map(n => `<option value="${n}">${n}</option>`).join('');
}

// ---- Método de reparación ----
const selMetodo = document.getElementById('repMetodo');
if (selMetodo && selMetodo.options.length === 0) {
selMetodo.innerHTML = _repMetodosDefault
.map(m => `<option value="${m}">${m}</option>`).join('');
}

// ---- Botones + ----
const btnNombre = document.getElementById('btnAddNombre');
if (btnNombre && !btnNombre._bound) {
btnNombre._bound = true;
btnNombre.addEventListener('click', () =>
_addOpcionSelect('repNombre', 'Nombre de la nueva reparación:'));
}
const btnMetodo = document.getElementById('btnAddMetodo');
if (btnMetodo && !btnMetodo._bound) {
btnMetodo._bound = true;
btnMetodo.addEventListener('click', () =>
_addOpcionSelect('repMetodo', 'Nuevo método de reparación:'));
}
}

function renderFallas() {
const tbody = document.querySelector('#tblFallas tbody');
tbody.innerHTML = state.fallas.length ? state.fallas.slice().reverse().map(f => `
<tr>
<td>${fmtFechaSolo(f['FECHA'])}</td>
<td class="mono">${f['PLACA']}</td>
<td>${f['SISTEMA']}</td>
<td>${f['COMPONENTE']}</td>
<td>${f['DETALLE/OCURRENCIA']}</td>
<td>${f['PERSONAL QUE REPORTA'] || '—'}</td>
<td><span class="tag ${f['ESTADO'] === 'RESUELTO' ? 'tag-ok' : 'tag-warn'}">${f['ESTADO'] || 'PENDIENTE'}</span></td>
</tr>`).join('') : `<tr class="empty-row"><td colspan="7">No hay fallas reportadas.</td></tr>`;
}

/* ---------------- Formularios ---------------- */

function formToObject(form, excludeNames = []) {
const obj = {};
new FormData(form).forEach((v, k) => { if (!excludeNames.includes(k)) obj[k] = v; });
return obj;
}

function toast(msg, type = '') {
const el = document.getElementById('toast');
el.textContent = msg;
el.className = 'toast show ' + type;
setTimeout(() => el.classList.remove('show'), 3200);
}

// --- Nuevo producto — cálculo bidireccional IGV ---
const prodSubtotalEl = document.getElementById('prodSubtotal');
const prodIGVEl      = document.getElementById('prodIGV');
const prodPrecioEl   = document.getElementById('prodPrecio');

let _prodRecalcLock = false;

prodSubtotalEl.addEventListener('input', () => {
if (_prodRecalcLock) return;
_prodRecalcLock = true;
const sub  = Number(prodSubtotalEl.value) || 0;
const igv  = sub * 0.18;
prodIGVEl.value    = igv.toFixed(2);
prodPrecioEl.value = (sub + igv).toFixed(2);
_prodRecalcLock = false;
});

prodPrecioEl.addEventListener('input', () => {
if (_prodRecalcLock) return;
_prodRecalcLock = true;
const precio = Number(prodPrecioEl.value) || 0;
const sub    = precio / 1.18;
const igv    = precio - sub;
prodSubtotalEl.value = sub.toFixed(2);
prodIGVEl.value      = igv.toFixed(2);
_prodRecalcLock = false;
});

document.getElementById('formProducto').addEventListener('submit', async e => {
e.preventDefault();
try {
await apiPost('addProducto', formToObject(e.target));
toast('Producto guardado correctamente', 'ok');
e.target.reset();
await loadAll();
showView('inv-productos');
} catch (err) { toast('Error: ' + err.message, 'error'); }
});

/* ---------------- Ingreso: factura con uno o varios productos ----------------
   El formulario ya no representa un único producto: representa una
   FACTURA. Los datos comunes (N° Documento, Fecha/Hora, Proveedor,
   Observación, Usuario) se llenan una sola vez; cada producto de la
   factura se agrega como una fila independiente (Producto, Cantidad,
   Subtotal/IGV/Precio, Costo total), calculada automáticamente igual
   que antes. Al guardar, se envía una llamada addIngreso por cada fila
   (una por producto), en orden, para que el stock y el kardex se
   actualicen correctamente aunque se repita el mismo producto en dos
   filas de la misma factura.
------------------------------------------------------------------- */

const formIngreso = document.getElementById('formIngreso');
formIngreso.querySelector('.prov-select').addEventListener('change', e => {
const opt = e.target.selectedOptions[0];
formIngreso.querySelector('.prov-ruc').value = opt ? (opt.dataset.ruc || '') : '';
});

// Retorna el subtotal (precio neto sin IGV) del último ingreso del producto,
// o el Subtotal del catálogo, o deriva del Total del catálogo dividido entre 1.18.
function getUltimoSubtotal(codigo) {
const previos = state.ingresos.filter(i => String(i['Código Producto']) === String(codigo));
if (previos.length) {
const ult = previos[previos.length - 1];
const sub = Number(ult['Subtotal']);
if (!isNaN(sub) && sub > 0) return sub;
// compatibilidad con ingresos anteriores: deriva del precio total
const precio = Number(ult['Precio Unitario']);
if (!isNaN(precio) && precio > 0) return precio / 1.18;
}
const prod = state.productos.find(p => String(p['Código Producto']) === String(codigo));
if (prod) {
const sub = Number(prod['Subtotal']);
if (!isNaN(sub) && sub > 0) return sub;
const total = Number(prod['Total']);
if (!isNaN(total) && total > 0) return total / 1.18;
}
return 0;
}

// Fecha/hora del documento (una sola vez para toda la factura). Se
// llenan como texto plano "YYYY-MM-DD" y "HH:MM" para que el backend
// los escriba tal cual en el Sheet sin pasar por new Date().
const inpFechaIngreso = document.getElementById('ingresoFecha');
const inpHoraIngreso  = document.getElementById('ingresoHora');

function setFechaIngresoAhora() {
const now = new Date();
const pad = n => String(n).padStart(2, '0');
inpFechaIngreso.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
inpHoraIngreso.value  = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
setFechaIngresoAhora();

const ingresoProductosList = document.getElementById('ingresoProductosList');

function renumberIngresoRows() {
ingresoProductosList.querySelectorAll('.ingreso-row').forEach((row, i) => {
row.querySelector('.ingreso-row-num').textContent = `Producto ${i + 1}`;
});
}

// Suma el costo total de todas las filas y lo muestra como total de la factura.
function updateIngresoTotalGeneral() {
const total = [...ingresoProductosList.querySelectorAll('.ingreso-row-costo')]
.reduce((sum, el) => sum + (Number(el.value) || 0), 0);
const preview = document.getElementById('ingresoPreview');
if (preview) preview.innerHTML = total > 0 ? `Total de la factura: <strong>${fmtMoney(total)}</strong>` : '';
}

// Muestra "stock actual → nuevo stock" para el producto elegido en esa fila.
function updateIngresoRowPreview(row) {
const codigo = row.querySelector('.ingreso-row-producto').value;
const cant = Number(row.querySelector('.ingreso-row-cantidad').value) || 0;
const previewEl = row.querySelector('.ingreso-row-preview');
if (!previewEl) return;
if (!codigo) { previewEl.innerHTML = ''; return; }
const actual = getStockDe(codigo);
previewEl.innerHTML = `Stock actual: <strong>${actual}</strong> → nuevo stock: <strong>${actual + cant}</strong>`;
}

// Recalcula IGV/Precio/Costo de una fila. source indica qué campo
// disparó el cambio ('subtotal' o 'precio') para saber la dirección
// del cálculo bidireccional (igual criterio que en Nuevo producto).
function recalcIngresoRow(row, source) {
const subtotalEl = row.querySelector('.ingreso-row-subtotal');
const igvEl      = row.querySelector('.ingreso-row-igv');
const precioEl   = row.querySelector('.ingreso-row-precio');
const costoEl    = row.querySelector('.ingreso-row-costo');
const cantEl     = row.querySelector('.ingreso-row-cantidad');
const cant = Number(cantEl.value) || 0;

if (source === 'precio') {
const precio = Number(precioEl.value) || 0;
const subtotal = precio / 1.18;
const igv = precio - subtotal;
subtotalEl.value = subtotal.toFixed(2);
igvEl.value = igv.toFixed(2);
costoEl.value = (precio * cant).toFixed(2);
} else {
const subtotal = Number(subtotalEl.value) || 0;
const igv = subtotal * 0.18;
const precio = subtotal + igv;
igvEl.value = igv.toFixed(2);
precioEl.value = precio.toFixed(2);
costoEl.value = (precio * cant).toFixed(2);
}
updateIngresoTotalGeneral();
updateIngresoRowPreview(row);
}

// Agrega una nueva fila de producto a la factura de ingreso.
function addIngresoRow() {
const tpl = document.getElementById('ingresoRowTemplate').content.cloneNode(true);
const row = tpl.querySelector('.ingreso-row');
ingresoProductosList.appendChild(row);
renumberIngresoRows();

const selProd = row.querySelector('.ingreso-row-producto');
selProd.innerHTML = '<option value="" disabled selected>— Selecciona producto —</option>' +
state.productos.map(p =>
`<option value="${p['Código Producto']}">${p['Código Producto']} — ${p['Producto']} (stock: ${getStockDe(p['Código Producto'])})</option>`
).join('');
_initTomSelect(selProd);

const cantEl     = row.querySelector('.ingreso-row-cantidad');
const subtotalEl = row.querySelector('.ingreso-row-subtotal');
const precioEl   = row.querySelector('.ingreso-row-precio');

// Al elegir producto: autocompleta el precio con el último subtotal
// usado para ese producto (o el del catálogo) y recalcula todo.
selProd.addEventListener('change', () => {
subtotalEl.value = getUltimoSubtotal(selProd.value).toFixed(2);
recalcIngresoRow(row, 'subtotal');
});

// Al cambiar la cantidad: solo se recalcula el costo total de la fila
// (el precio unitario ya está resuelto por subtotal/precio).
cantEl.addEventListener('input', () => {
const precio = Number(precioEl.value) || 0;
const cant = Number(cantEl.value) || 0;
row.querySelector('.ingreso-row-costo').value = (precio * cant).toFixed(2);
updateIngresoTotalGeneral();
updateIngresoRowPreview(row);
});

subtotalEl.addEventListener('input', () => recalcIngresoRow(row, 'subtotal'));
precioEl.addEventListener('input', () => recalcIngresoRow(row, 'precio'));

row.querySelector('.btn-remove-ingreso-row').addEventListener('click', () => {
const ts = _tsMap.get(selProd);
if (ts) { try { ts.destroy(); } catch (e) {} _tsMap.delete(selProd); }
row.remove();
renumberIngresoRows();
updateIngresoTotalGeneral();
// Siempre debe quedar al menos una fila disponible para cargar.
if (!ingresoProductosList.querySelector('.ingreso-row')) addIngresoRow();
});
}

document.getElementById('btnAddIngresoProducto').addEventListener('click', () => addIngresoRow());
addIngresoRow(); // primera fila disponible al cargar la página

formIngreso.addEventListener('submit', async e => {
e.preventDefault();

const filas = [...ingresoProductosList.querySelectorAll('.ingreso-row')].map(row => ({
codigo: row.querySelector('.ingreso-row-producto').value,
cantidad: Number(row.querySelector('.ingreso-row-cantidad').value) || 0,
subtotal: row.querySelector('.ingreso-row-subtotal').value,
igv: row.querySelector('.ingreso-row-igv').value,
precio: row.querySelector('.ingreso-row-precio').value,
costo: row.querySelector('.ingreso-row-costo').value
})).filter(f => f.codigo && f.cantidad > 0);

if (!filas.length) {
toast('Agrega al menos un producto con cantidad válida', 'error');
return;
}

// Campos comunes de la factura (los únicos con "name" en el formulario:
// N° Documento, Fecha/Hora Ingreso, Razón Social, RUC, Observación, Usuario).
const comunes = formToObject(e.target);

const btnSubmit = e.target.querySelector('button[type="submit"]');
btnSubmit.disabled = true;

let ok = 0;
const errores = [];

// Se envía una llamada addIngreso por cada producto, EN ORDEN (await
// dentro del for), para que el stock/kardex de cada fila se calcule
// correctamente incluso si dos filas comparten el mismo producto.
for (const f of filas) {
const prod = state.productos.find(p => String(p['Código Producto']) === String(f.codigo));
const data = Object.assign({}, comunes, {
'Código Producto': f.codigo,
'Producto': prod ? prod['Producto'] : '',
'Marca': prod ? prod['Marca'] : '',
'Categoría': prod ? prod['Categoría'] : '',
'Ubicación': prod ? prod['Ubicación'] : '',
'Cantidad Ingresada': f.cantidad,
'Subtotal': f.subtotal,
'IGV': f.igv,
'Precio Unitario': f.precio,
'Costo total de Compra': f.costo
});
try {
await apiPost('addIngreso', data);
ok++;
} catch (err) {
errores.push(`${f.codigo}: ${err.message}`);
}
}

btnSubmit.disabled = false;

if (errores.length) {
toast(`${ok} producto(s) registrados. Con errores: ${errores.join(' | ')}`, ok ? '' : 'error');
} else {
toast(`Ingreso registrado correctamente (${ok} producto${ok > 1 ? 's' : ''})`, 'ok');
}

e.target.reset();
ingresoProductosList.innerHTML = '';
addIngresoRow();
setFechaIngresoAhora();
updateIngresoTotalGeneral();
await loadAll();
});

// --- Salida ---
const formSalida = document.getElementById('formSalida');

// OPTIMIZACIÓN: antes se escuchaba el "input" de TODO el formulario
// (formSalida.addEventListener('input', ...)), así que escribir en
// campos que no afectan el cálculo (como Observación) también disparaba
// getStockDe() innecesariamente en cada tecla. Ahora solo se escucha en
// los dos campos que realmente afectan la previsualización de stock.
function updateSalidaPreview() {
const codigo = formSalida.querySelector('[name="Código Producto"]').value;
const cant = Number(formSalida.querySelector('[name="Cantidad Entregada"]').value) || 0;
const actual = getStockDe(codigo);
const insuficiente = cant > actual;
document.getElementById('salidaPreview').innerHTML =
codigo ? `Stock actual: <strong>${actual}</strong> → nuevo stock: <strong>${insuficiente ? '⚠ insuficiente' : actual - cant}</strong>` : '';
}
formSalida.querySelector('[name="Código Producto"]').addEventListener('input', updateSalidaPreview);
formSalida.querySelector('[name="Cantidad Entregada"]').addEventListener('input', updateSalidaPreview);

// NUEVO: fecha y hora de salida, mismo criterio que Ingreso — texto plano
// "YYYY-MM-DD" / "HH:MM", sin pasar por new Date(), para que el backend
// lo escriba tal cual en el Sheet sin desfase de zona horaria.
const inpFechaSalida = document.getElementById('salidaFecha');
const inpHoraSalida  = document.getElementById('salidaHora');

function setFechaSalidaAhora() {
const now = new Date();
const pad = n => String(n).padStart(2, '0');
inpFechaSalida.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
inpHoraSalida.value  = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
setFechaSalidaAhora();

formSalida.addEventListener('submit', async e => {
e.preventDefault();
const data = formToObject(e.target);
const prod = state.productos.find(p => p['Código Producto'] === data['Código Producto']);
data['Producto']  = prod ? prod['Producto']  : '';
data['Marca']     = prod ? prod['Marca']     : '';
data['Categoría'] = prod ? prod['Categoría'] : '';
data['Ubicación'] = prod ? prod['Ubicación'] : '';
// data['Fecha Salida'] y data['Hora Salida'] ya vienen incluidos por formToObject
// gracias a los atributos name="Fecha Salida" / name="Hora Salida" en el HTML.
try {
const res = await apiPost('addSalida', data);
toast(`Salida registrada. Nuevo stock: ${res.stockNuevo}`, 'ok');
e.target.reset();
setFechaSalidaAhora();
document.getElementById('salidaPreview').innerHTML = '';
await loadAll();
} catch (err) { toast('Error: ' + err.message, 'error'); }
});

// --- Mantenimiento: repuestos dinámicos ---
document.getElementById('btnAddRepuesto').addEventListener('click', () => {
const tpl = document.getElementById('repuestoRowTemplate').content.cloneNode(true);
const row = tpl.querySelector('.repuesto-row');
const sel = row.querySelector('.repuesto-select');
sel.innerHTML = state.productos.map(p =>
`<option value="${p['Código Producto']}" data-nombre="${p['Producto']}">${p['Código Producto']} — ${p['Producto']} (stock: ${getStockDe(p['Código Producto'])})</option>`
).join('');
row.querySelector('.btn-remove-repuesto').addEventListener('click', () => row.remove());
document.getElementById('repuestosList').appendChild(row);
});

// NUEVO: fecha y hora de inicio/fin de la reparación, separadas en el
// formulario (sin atributo name: se combinan a mano antes de enviar)
// y precargadas con el momento actual, editable por el usuario.
const inpFechaInicial = document.getElementById('repFechaInicial');
const inpHoraInicial  = document.getElementById('repHoraInicial');
const inpFechaFinal   = document.getElementById('repFechaFinal');
const inpHoraFinal    = document.getElementById('repHoraFinal');

function setFechasMantenimientoAhora() {
const now = new Date();
const pad = n => String(n).padStart(2, '0');
const f = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
const h = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
inpFechaInicial.value = f; inpHoraInicial.value = h;
inpFechaFinal.value   = f; inpHoraFinal.value   = h;
}
setFechasMantenimientoAhora();

// Combina fecha+hora como texto plano "yyyy-MM-dd HH:mm", sin new Date(),
// para que el backend lo escriba tal cual en "Fecha Inicial"/"Fecha Final".
function combinarFechaHora(fecha, hora) {
if (!fecha) return '';
return hora ? `${fecha} ${hora}` : fecha;
}

document.getElementById('formMantenimiento').addEventListener('submit', async e => {
e.preventDefault();
const data = formToObject(e.target);

// Fecha/hora tal cual las ingresó el usuario, como texto plano.
data['Fecha Inicial'] = combinarFechaHora(inpFechaInicial.value, inpHoraInicial.value);
data['Fecha Final']   = combinarFechaHora(inpFechaFinal.value, inpHoraFinal.value);

const repuestos = [...document.querySelectorAll('#repuestosList .repuesto-row')].map(row => {
const sel = row.querySelector('.repuesto-select');
const opt = sel.selectedOptions[0];
return {
codigo: sel.value,
producto: opt ? opt.dataset.nombre : '',
cantidad: row.querySelector('.repuesto-cantidad').value
};
}).filter(r => r.codigo && Number(r.cantidad) > 0);
data['_repuestos'] = repuestos;
data['Repuesto Utilizado'] = repuestos.map(r => r.producto).join(', ') || '-';

try {
await apiPost('addMantenimiento', data);
toast('Reparación registrada correctamente', 'ok');
e.target.reset();
setFechasMantenimientoAhora();
document.getElementById('repuestosList').innerHTML = '';
await loadAll();
showView('mnt-historial');
} catch (err) { toast('Error: ' + err.message, 'error'); }
});

// --- Reportar falla ---
document.getElementById('formFalla').addEventListener('submit', async e => {
e.preventDefault();
const data = formToObject(e.target);
data['SISTEMA'] = document.getElementById('fallaSistema').value;
data['COMPONENTE'] = document.getElementById('fallaComponente').value;
try {
await apiPost('addFalla', data);
toast('Falla reportada correctamente', 'ok');
e.target.reset();
await loadAll();
showView('mnt-fallas-lista');
} catch (err) { toast('Error: ' + err.message, 'error'); }
});

/* ---------------- Reloj + arranque ---------------- */

function tickClock() {
document.getElementById('clock').textContent = new Date().toLocaleString('es-PE', {
weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
});
}
tickClock();
setInterval(tickClock, 30000);

/* ---------------- Menú hamburguesa (móvil) ---------------- */
const railToggle  = document.getElementById('railToggle');
const railSidebar = document.getElementById('railSidebar');
const railOverlay = document.getElementById('railOverlay');

function openRail() {
  railSidebar.classList.add('open');
  railOverlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeRail() {
  railSidebar.classList.remove('open');
  railOverlay.classList.remove('show');
  document.body.style.overflow = '';
}

railToggle.addEventListener('click', () =>
  railSidebar.classList.contains('open') ? closeRail() : openRail()
);
railOverlay.addEventListener('click', closeRail);

// Botón "Más" de la barra inferior abre el menú
const bnavMore = document.getElementById('bnavMore');
if (bnavMore) bnavMore.addEventListener('click', openRail);

// Cerrar al cambiar de vista en móvil
document.querySelectorAll('.rail-btn, .rail-sub-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (window.innerWidth <= 900) closeRail();
  });
});

loadAll();
