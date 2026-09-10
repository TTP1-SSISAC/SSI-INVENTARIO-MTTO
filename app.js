/* ============================================================
TMS SSI — Inventario & Mantenimiento
Consume el Google Sheet a través del Web App de Apps Script.
============================================================ */

const CONFIG = {
// Pega aquí la URL de tu implementación de Apps Script (termina en /exec)
API_URL: 'https://script.google.com/macros/s/AKfycbx91TVMtUA4a9P5ekyhscuif_7HegdVUPeMnsecnr4NiHL6vuadwSiFlBfxJedsTtmr/exec'
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

/* ---------------- Stock helper (mismo criterio que el backend) ---------------- */

function getStockDe(codigo) {
const movs = state.kardex.filter(k => String(k['Código Producto']) === String(codigo));
if (movs.length === 0) return 0;
return Number(movs[movs.length - 1]['Stock Final']) || 0;
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
[c['Nombres'], c['Apellidos']].filter(Boolean).join(' ')
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
// Refresca el precio autocompletado del ingreso si ya hay un producto seleccionado por defecto
const selIngreso = document.querySelector('#formIngreso [name="Código Producto"]');
if (selIngreso && selIngreso.value) selIngreso.dispatchEvent(new Event('change'));

const kFilter = document.getElementById('kardexFiltro');
kFilter.innerHTML = '<option value="">Todos los productos</option>' +
state.productos.map(p => `<option value="${p['Código Producto']}">${p['Código Producto']} — ${p['Producto']}</option>`).join('');

const provOpts = '<option value="">—</option>' + state.proveedores.map(p =>
`<option value="${p['Razón Social']}" data-ruc="${p['RUC']}">${p['Razón Social']}</option>`).join('');
document.querySelectorAll('select.prov-select').forEach(sel => { sel.innerHTML = provOpts; });
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

function renderKardex(filtro = '') {
const rows = filtro ? state.kardex.filter(k => String(k['Código Producto']) === filtro) : state.kardex;
const tbody = document.querySelector('#tblKardex tbody');
tbody.innerHTML = rows.length ? rows.slice().reverse().map(k => `
<tr>
<td>${fmtFecha(k['Fecha'])}</td>
<td><span class="tag ${k['Tipo Movimiento'] === 'INGRESO' ? 'tag-ok' : 'tag-warn'}">${k['Tipo Movimiento']}</span></td>
<td>${k['Producto']}</td>
<td>${k['Entrada'] || '—'}</td>
<td>${k['Salida'] || '—'}</td>
<td><strong>${k['Stock Final']}</strong></td>
<td class="mono">${k['Referencia'] || '—'}</td>
<td>${k['Usuario'] || '—'}</td>
</tr>`).join('') : `<tr class="empty-row"><td colspan="8">Sin movimientos registrados.</td></tr>`;
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
<td>${fmtFecha(m['Fecha Inicial'])}</td>
<td>${fmtFecha(m['Fecha Final'])}</td>
<td>${m['Kilometraje'] || '—'}</td>
</tr>`).join('') : `<tr class="empty-row"><td colspan="8">Sin reparaciones registradas.</td></tr>`;
}
document.getElementById('historialFiltro').addEventListener('input', e => renderMantenimiento(e.target.value));

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
...state.conductores.map(c => {
const nom = [c['NOMBRES'], c['APELLIDOS']].filter(Boolean).join(' ') ||
[c['Nombres'], c['Apellidos']].filter(Boolean).join(' ') || '';
return nom;
}),
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
...state.conductores.map(c =>
([c['NOMBRES'], c['APELLIDOS']].filter(Boolean).join(' ') ||
[c['Nombres'], c['Apellidos']].filter(Boolean).join(' ')).trim()
)
].filter(n => n);
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

// --- Ingreso ---
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

const inpProdIngreso   = formIngreso.querySelector('[name="Código Producto"]');
const inpCantIngreso   = formIngreso.querySelector('[name="Cantidad Ingresada"]');
const inpSubtotalIngreso = document.getElementById('ingresoSubtotal');
const inpIGVIngreso    = document.getElementById('ingresoIGV');
const inpPrecioIngreso = document.getElementById('ingresoPrecioUnitario');
const inpCostoIngreso  = document.getElementById('ingresoCostoTotal');
const inpMarcaIngreso  = document.getElementById('ingresoMarca');
const inpCatIngreso    = document.getElementById('ingresoCategoría');
const inpUbicIngreso   = document.getElementById('ingresoUbicacion');
const inpFechaIngreso  = document.getElementById('ingresoFecha');

// Poner fecha/hora actual al cargar
function setFechaIngresoAhora() {
const now = new Date();
const pad = n => String(n).padStart(2, '0');
inpFechaIngreso.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
setFechaIngresoAhora();

inpProdIngreso.addEventListener('change', () => {
const prod = state.productos.find(p => String(p['Código Producto']) === String(inpProdIngreso.value));
inpMarcaIngreso.value  = prod ? (prod['Marca']     || '') : '';
inpCatIngreso.value    = prod ? (prod['Categoría'] || '') : '';
inpUbicIngreso.value   = prod ? (prod['Ubicación'] || '') : '';
inpSubtotalIngreso.value = getUltimoSubtotal(inpProdIngreso.value).toFixed(2);
recalcularCostoIngreso();
updateIngresoPreview();
});
inpCantIngreso.addEventListener('input', () => { recalcularCostoIngreso(); updateIngresoPreview(); });

let _recalcLock = false;

inpSubtotalIngreso.addEventListener('input', () => {
if (_recalcLock) return;
_recalcLock = true;
const subtotal = Number(inpSubtotalIngreso.value) || 0;
const igv = subtotal * 0.18;
const precio = subtotal + igv;
const cant = Number(inpCantIngreso.value) || 0;
inpIGVIngreso.value    = igv.toFixed(2);
inpPrecioIngreso.value = precio.toFixed(2);
inpCostoIngreso.value  = (precio * cant).toFixed(2);
_recalcLock = false;
});

inpPrecioIngreso.addEventListener('input', () => {
if (_recalcLock) return;
_recalcLock = true;
const precio = Number(inpPrecioIngreso.value) || 0;
const subtotal = precio / 1.18;
const igv = precio - subtotal;
const cant = Number(inpCantIngreso.value) || 0;
inpSubtotalIngreso.value = subtotal.toFixed(2);
inpIGVIngreso.value      = igv.toFixed(2);
inpCostoIngreso.value    = (precio * cant).toFixed(2);
_recalcLock = false;
});

function recalcularCostoIngreso() {
const subtotal = Number(inpSubtotalIngreso.value) || 0;
const igv      = subtotal * 0.18;
const precioUnit = subtotal + igv;
const cant     = Number(inpCantIngreso.value) || 0;
inpIGVIngreso.value    = igv.toFixed(2);
inpPrecioIngreso.value = precioUnit.toFixed(2);
inpCostoIngreso.value  = (precioUnit * cant).toFixed(2);
}

function updateIngresoPreview() {
const codigo = inpProdIngreso.value;
const cant = Number(inpCantIngreso.value) || 0;
const actual = getStockDe(codigo);
document.getElementById('ingresoPreview').innerHTML =
codigo ? `Stock actual: <strong>${actual}</strong> → nuevo stock: <strong>${actual + cant}</strong>` : '';
}

formIngreso.addEventListener('submit', async e => {
e.preventDefault();
const data = formToObject(e.target);
const prod = state.productos.find(p => p['Código Producto'] === data['Código Producto']);
data['Producto']  = prod ? prod['Producto']  : '';
data['Marca']     = prod ? prod['Marca']     : '';
data['Categoría'] = prod ? prod['Categoría'] : '';
data['Ubicación'] = prod ? prod['Ubicación'] : '';
// asegurar que IGV se envíe aunque sea campo readonly (no está en FormData)
data['IGV'] = inpIGVIngreso.value;
try {
const res = await apiPost('addIngreso', data);
toast(`Ingreso registrado. Nuevo stock: ${res.stockNuevo}`, 'ok');
e.target.reset();
recalcularCostoIngreso();
inpMarcaIngreso.value = ''; inpCatIngreso.value = ''; inpUbicIngreso.value = '';
setFechaIngresoAhora();
document.getElementById('ingresoPreview').innerHTML = '';
await loadAll();
} catch (err) { toast('Error: ' + err.message, 'error'); }
});

// --- Salida ---
const formSalida = document.getElementById('formSalida');
formSalida.addEventListener('input', updateSalidaPreview);
function updateSalidaPreview() {
const codigo = formSalida.querySelector('[name="Código Producto"]').value;
const cant = Number(formSalida.querySelector('[name="Cantidad Entregada"]').value) || 0;
const actual = getStockDe(codigo);
const insuficiente = cant > actual;
document.getElementById('salidaPreview').innerHTML =
codigo ? `Stock actual: <strong>${actual}</strong> → nuevo stock: <strong>${insuficiente ? '⚠ insuficiente' : actual - cant}</strong>` : '';
}
formSalida.addEventListener('submit', async e => {
e.preventDefault();
const data = formToObject(e.target);
const prod = state.productos.find(p => p['Código Producto'] === data['Código Producto']);
data['Producto']  = prod ? prod['Producto']  : '';
data['Marca']     = prod ? prod['Marca']     : '';
data['Categoría'] = prod ? prod['Categoría'] : '';
data['Ubicación'] = prod ? prod['Ubicación'] : '';
try {
const res = await apiPost('addSalida', data);
toast(`Salida registrada. Nuevo stock: ${res.stockNuevo}`, 'ok');
e.target.reset();
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

document.getElementById('formMantenimiento').addEventListener('submit', async e => {
e.preventDefault();
const data = formToObject(e.target);
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
