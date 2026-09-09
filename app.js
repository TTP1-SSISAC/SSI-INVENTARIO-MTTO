/* ============================================================
   TMS SSI — Inventario & Mantenimiento
   Consume el Google Sheet a través del Web App de Apps Script.
   ============================================================ */

const CONFIG = {
  // Pega aquí la URL de tu implementación de Apps Script (termina en /exec)
  API_URL: 'PEGA_AQUI_TU_URL_DE_APPS_SCRIPT'
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

function showView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById('view-' + view);
  if (target) target.classList.remove('hidden');
  document.getElementById('viewTitle').textContent = VIEW_TITLES[view] || 'TMS SSI';
  document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
}

document.querySelectorAll('.rail-btn').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});
document.getElementById('btnNuevoProducto').addEventListener('click', () => showView('inv-producto-form'));
document.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => showView('inv-productos')));

/* ---------------- Render: Inventario ---------------- */

function renderAll() {
  renderProductSelects();
  renderInvDashboard();
  renderProductos();
  renderKardex();
  renderMntDashboard();
  renderMantenimiento();
  renderFallaCatalogo();
  renderFallas();
}

function fmtMoney(n) { return 'S/ ' + (Number(n) || 0).toFixed(2); }

function renderProductSelects() {
  const opts = state.productos.map(p =>
    `<option value="${p['Código Producto']}">${p['Código Producto']} — ${p['Producto']} (stock: ${getStockDe(p['Código Producto'])})</option>`
  ).join('');
  document.querySelectorAll('select.prod-select').forEach(sel => { sel.innerHTML = opts; });

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
      <td>${p['Moneda'] || 'S/'} ${Number(p['Total'] || 0).toFixed(2)}</td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="8">Aún no hay productos registrados.</td></tr>`;
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
  const sistemas = [...new Set(state.catalogoFallas.map(c => c['SISTEMA']))];
  const selSistema = document.getElementById('fallaSistema');
  selSistema.innerHTML = sistemas.map(s => `<option value="${s}">${s}</option>`).join('');
  updateComponentes();
  selSistema.addEventListener('change', updateComponentes);
}

function updateComponentes() {
  const sistema = document.getElementById('fallaSistema').value;
  const componentes = state.catalogoFallas.filter(c => c['SISTEMA'] === sistema);
  document.getElementById('fallaComponente').innerHTML =
    componentes.map(c => `<option value="${c['COMPONENTE']}" data-codigo="${c['CÓDIGO']}">${c['COMPONENTE']}</option>`).join('');
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

// --- Nuevo producto ---
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
formIngreso.addEventListener('input', updateIngresoPreview);
function updateIngresoPreview() {
  const codigo = formIngreso.querySelector('[name="Código Producto"]').value;
  const cant = Number(formIngreso.querySelector('[name="Cantidad Ingresada"]').value) || 0;
  const actual = getStockDe(codigo);
  document.getElementById('ingresoPreview').innerHTML =
    codigo ? `Stock actual: <strong>${actual}</strong> → nuevo stock: <strong>${actual + cant}</strong>` : '';
}
formIngreso.addEventListener('submit', async e => {
  e.preventDefault();
  const data = formToObject(e.target);
  const prod = state.productos.find(p => p['Código Producto'] === data['Código Producto']);
  data['Producto'] = prod ? prod['Producto'] : '';
  data['Marca'] = prod ? prod['Marca'] : '';
  data['Categoría'] = prod ? prod['Categoría'] : '';
  data['Ubicación'] = prod ? prod['Ubicación'] : '';
  try {
    const res = await apiPost('addIngreso', data);
    toast(`Ingreso registrado. Nuevo stock: ${res.stockNuevo}`, 'ok');
    e.target.reset();
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
  data['Producto'] = prod ? prod['Producto'] : '';
  data['Marca'] = prod ? prod['Marca'] : '';
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
  const compSel = document.getElementById('fallaComponente');
  data['COMPONENTE'] = compSel.value;
  data['CÓDIGO'] = compSel.selectedOptions[0] ? compSel.selectedOptions[0].dataset.codigo : '';
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

loadAll();
