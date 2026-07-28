// ── Captura global de errores JS ──────────────────────────────────────────
window.onerror = function(msg, src, line, col, err) {
  console.error(`[ERROR JS] ${msg}  (${src?.split("/").pop()}:${line}:${col})`);
  return false;
};

// ── Estado global ─────────────────────────────────────────────────────────
const state = {
  feedersData:          [],   // lista de feeders del Excel (origen)
  destinosData:         [],   // lista de feeders del Excel (destino)
  feedersNuevos:        [],   // feeders en comisionamiento
  pendingPreselectDest: null, // numalim a pre-seleccionar tras corrimiento
  esCorrimiento:        false,// true cuando viene de precargarCorrimiento
  esRecalculo:          false,// true cuando se recalcula por ajuste (no reiniciar cadena)
  numeroCaso:           0,    // caso actual (1-3)
  cadenaSimulaciones:   [],   // historial de simulaciones de la cadena
  cadenaReportCases:    [],   // por caso: {cfgs, node} para el informe interactivo
  lzVecinos:            [],   // vecinos LZ del origen actual [{numpos_lz, tipo, vecinos}]
  selectedNumposLZ:     null, // dispositivo LZ seleccionado por el usuario
  equiposData:     [],   // equipos del feeder origen
  tdsData:         [],   // TDs del feeder origen
  tdsEquipoData:   [],   // TDs del equipo seleccionado (sub-panel)
  tdsEquipoTotal:  0,    // total TDs del equipo antes de filtrar
  origenNumalim:   null, // NUMALIM del alimentador origen
  origenNomAlim:   null, // NOM_ALIM en aguas_abajo (puede ser null)
  origenAlimConfig: null, // config de conductores/autotrafos del origen
  mesesDisponibles:[],   // lista YYYY-MM del Excel
  ultimaSimulacion: null,
  sugerenciasTLC:   false, // switch NT: activa propuestas de traspaso/corrimiento TLC (persistido en localStorage)
  _sugTraspaso:     [],   // últimas maniobras sugeridas (para precargarTraspasoSugerido)
  _sugCorrimiento:  [],   // últimos candidatos de corrimiento (para precargarEquipoCorrimiento)
  // VCC
  vccAlimIdx:       null, // numalim del alimentador VCC
  vccAlimNom:       null, // nom_alim VCC
  vccEquipos:       [],   // lista upstream del punto de conexión (enriquecida)
  vccEquiposCache:  {},   // {numpos: equipo} — cargado una vez al elegir alimentador
  vccPuntoRef:      null, // {nombre_ref, tipo_ref, n_tds_aguas_abajo} del punto buscado
  vccUltimaEval:    null, // último resultado de /api/vcc/evaluar
  equiposConfig:    {},   // {numpos: entry} — cache de equipos_config.json
  alimConfig:       null, // config del alimentador activo (conductores intermedios)
  // traspaso simultáneo
  vccLzVecinos:     [],   // resultado de /api/vecinos_lz/{numalimA}
  vccAlimDestIdx:   null, // numalim del alimentador receptor (B)
  vccAlimDestNom:   null, // nom_alim del receptor
  vccNumposLz:      null, // NUMPOS_LZ seleccionado (equipo_cierra)
  vccEquiposTroncalB: [], // equipos_troncal del receptor para el LZ elegido
  vccKvaIsla:       null, // kVA isla calculada (de isla/preview)
  // config equipos receptor (traspaso tab)
  troncalBNomAlim:      null, // nom_alim del receptor activo en panel equipos B
  troncalBEnriquecido:  [],   // [{nombre, tipo, fraccion, cn, kva_down, ...}] — troncal B con fracciones
  equiposBDisponibles:  null, // catálogo de equipos del receptor para troncal manual (forzado)
  equiposConfigB:       {},   // {numpos: entry} — cache de equipos_config para alim B
  alimConfigB:          null, // config del receptor (conductores_intermedios)
};

// TomSelect instances
const ts = {};

// ── DEBUG PANEL ───────────────────────────────────────────────────────────
function dbg(msg, type="info") {
  const prefix = { info: "[i]", warn: "[!]", error: "[✗]", ok: "[✓]" };
  console.log(`[DBG${prefix[type]||""}] ${msg}`);
}

// ── Inicialización ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  dbg("✓ Script cargado y DOM listo", "ok");
  document.getElementById("lbl-fecha").textContent =
    new Date().toLocaleDateString("es-CL", {weekday:"long", year:"numeric", month:"long", day:"numeric"});

  inicializarOrigenSelect();
  cargarDestinos();
  cargarFeedersNuevos();
  cargarMeses();
  cargarEquiposConfig();
  cargarEstadoCache();
  try {
    registrarEventos();
    dbg("✓ Eventos registrados", "ok");
  } catch(e) {
    dbg("✗ Error en registrarEventos: " + e.message, "error");
  }
});

// ── Estado del caché de datos ─────────────────────────────────────────────
async function cargarEstadoCache() {
  // Restaurar preferencia del switch "Sugerencias TLC" (por navegador, no compartido)
  if (localStorage.getItem("sugerenciasTLC") === "1") {
    const chk = document.getElementById("chk-sugerencias-tlc");
    if (chk) chk.checked = true;
    if (typeof toggleSugerenciasTLC === "function") toggleSugerenciasTLC(true);
  }
  try {
    const d = await apiFetch('/api/debug/status');
    actualizarLabelesCache(d);
  } catch(e) { /* silencioso en carga inicial */ }
  try {
    const t = await apiFetch('/api/telecontrol/status');
    actualizarLabelTlc(t.data ?? t);
  } catch(e) { /* silencioso */ }
}

function actualizarLabelTlc(d) {
  const fmt = s => {
    if (!s) return '—';
    const dt = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
    return dt.toLocaleDateString('es-CL', {day:'2-digit', month:'2-digit', year:'2-digit'})
           + ' ' + dt.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'});
  };
  const lbl = document.getElementById('lbl-cache-tlc');
  if (!lbl) return;
  if (!d?.existe) {
    lbl.textContent = 'TLC: —';
    lbl.style.color = 'var(--enel-amber, #f5a623)';
    lbl.title = 'Caché TLC no generado — haz clic en ↺ para generar';
  } else {
    lbl.textContent = 'TLC: ' + fmt(d.mtime);
    lbl.title = `Telecontrol: ${d.n_equipos} equipos, ${d.n_frg_alim} alim. FRG — actualizado: ${d.mtime}`;
    lbl.style.color = '';
  }
}

function actualizarLabelesCache(d) {
  const fmt = s => {
    if (!s) return '—';
    const dt = new Date(s.replace(' ', 'T'));
    return dt.toLocaleDateString('es-CL', {day:'2-digit', month:'2-digit', year:'2-digit'})
           + ' ' + dt.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'});
  };
  const lblT = document.getElementById('lbl-cache-topo');
  const lblD = document.getElementById('lbl-cache-dem');
  const lblL = document.getElementById('lbl-cache-lz');
  const topoStr = d.cache_ab_mtime  || null;
  const demStr  = d.cache_dem_mtime || null;
  const lzStr   = d.cache_lz_mtime  || null;
  lblT.textContent = 'Topol: ' + fmt(topoStr);
  lblT.title = 'Topología (aguas abajo) — actualizado: ' + (topoStr || '—');
  lblD.textContent = 'Dem: ' + fmt(demStr);
  lblD.title = 'Demandas (alimentadores y trafos) — actualizado: ' + (demStr || '—');
  if (lblL) {
    lblL.textContent = 'LZ: ' + fmt(lzStr);
    lblL.title = 'Límite de zona — actualizado: ' + (lzStr || '—');
  }
  // Resaltar en ámbar si la topología tiene más de 3 días
  if (topoStr) {
    const dias = (Date.now() - new Date(topoStr.replace(' ', 'T'))) / 86400000;
    lblT.style.color = dias > 3 ? 'var(--enel-amber)' : '';
  }
  // LZ en ámbar si supera su TTL (7 días)
  if (lblL && lzStr) {
    const diasLz = (Date.now() - new Date(lzStr.replace(' ', 'T'))) / 86400000;
    lblL.style.color = diasLz > 7 ? 'var(--enel-amber)' : '';
  }
}

async function recargarCache() {
  const btn = document.getElementById('btn-reload-cache');
  const ico = document.getElementById('ico-reload-cache');
  btn.disabled = true;
  ico.classList.add('spin-anim');
  spinner(true, 'Actualizando datos desde la base de datos...');
  try {
    await apiFetch('/api/reload', {method: 'POST'});
    spinner(false);
    const status = await apiFetch('/api/debug/status');
    actualizarLabelesCache(status);
    // Recargar dropdowns con los datos nuevos
    await inicializarOrigenSelect();
    await cargarDestinos();
    await cargarMeses();
    dbg('✓ Caché actualizado correctamente', 'ok');
  } catch(e) {
    spinner(false);
    dbg('✗ Error al actualizar caché: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    ico.classList.remove('spin-anim');
  }
}

async function recargarTlc() {
  const btn = document.getElementById('btn-reload-tlc');
  const ico = document.getElementById('ico-reload-tlc');
  if (btn) btn.disabled = true;
  if (ico) ico.classList.add('spin-anim');
  spinner(true, 'Actualizando datos de telecontrol...');
  try {
    const r = await apiFetch('/api/telecontrol/refresh', {method: 'POST'});
    spinner(false);
    const data = r.data ?? r;
    actualizarLabelTlc({ existe: true, mtime: data.generado, n_equipos: data.n_equipos, n_frg_alim: data.n_frg_alim });
    // Recargar dropdowns para reflejar nuevos flags FRG/TLC
    await inicializarOrigenSelect();
    await cargarDestinos();
    dbg(`✓ TLC actualizado: ${data.n_equipos} equipos, ${data.n_frg_alim} alim. FRG`, 'ok');
  } catch(e) {
    spinner(false);
    dbg('✗ Error al actualizar TLC: ' + e.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (ico) ico.classList.remove('spin-anim');
  }
}

function registrarEventos() {
  // Toggle tipo isla
  document.querySelectorAll('input[name="tipo-isla"]').forEach(r =>
    r.addEventListener("change", () => {
      const modo = document.querySelector('input[name="tipo-isla"]:checked').value;
      document.getElementById("sec-equipo").style.display = modo === "equipo" ? "" : "none";
      document.getElementById("sec-tds").style.display    = modo === "tds"    ? "" : "none";
      ocultarPreviewIsla();
      if (modo === "tds") {
        ocultarPanelTDsEquipo();
        if (state.tdsData.length === 0 && state.origenNomAlim) cargarTDs(state.origenNomAlim);
        filtrarDestinosPorEquipo(null); // restaurar todos los destinos LZ
      }
    })
  );

  // Toggle tipo destino
  document.querySelectorAll('input[name="tipo-dest"]').forEach(r =>
    r.addEventListener("change", () => {
      const tipo = document.querySelector('input[name="tipo-dest"]:checked').value;
      document.getElementById("sec-dest-excel").style.display = tipo === "excel" ? "" : "none";
      document.getElementById("sec-dest-nuevo").style.display = tipo === "nuevo" ? "" : "none";
    })
  );

  // Toggle equipo-cierra según escenario
  document.querySelectorAll('input[name="escenario-op"]').forEach(r =>
    r.addEventListener("change", () => {
      const corte = document.querySelector('input[name="escenario-op"]:checked').value === "corte_circuito";
      document.getElementById("sec-equipo-cierra").style.display = corte ? "none" : "";
    })
  );

  // Filtro TDs
  document.getElementById("buscador-tds").addEventListener("input", e =>
    filtrarTDs(e.target.value)
  );

  // Tabs: cargar datos al activar
  document.querySelector('[data-bs-target="#tab-feeders"]').addEventListener("click", cargarFeedersNuevos);
  document.querySelector('[data-bs-target="#tab-config"]').addEventListener("click", () => cfgMostrar("equipos"));
  document.querySelector('[data-bs-target="#tab-vcc"]').addEventListener("click", () => {
    vccInicializarSelect();
  });
}

// ── Helpers fetch ──────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const r = await fetch(url, opts);
  return r.json();
}

function spinner(show, msg = "Procesando...") {
  const el = document.getElementById("spinner-overlay");
  el.style.display = show ? "flex" : "none";
  document.getElementById("spinner-msg").textContent = msg;
}

// ── MESES ─────────────────────────────────────────────────────────────────
const MESES_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function fmtMes(yyyymm) {
  const [y, m] = yyyymm.split("-");
  return `${MESES_ES[parseInt(m,10)-1]} ${y}`;
}

function _limiteAnioCorrido(meses) {
  // Mismo criterio que el backend: desde el mismo mes del año anterior al último disponible
  if (!meses.length) return null;
  const max = meses[meses.length - 1];
  return `${parseInt(max.slice(0, 4)) - 1}-${max.slice(5, 7)}`;
}

async function cargarEquiposConfig() {
  try {
    const data = await apiFetch("/api/equipos/config");
    state.equiposConfig = (data && !Array.isArray(data)) ? data : {};
  } catch(e) { console.warn("[equiposConfig] No se pudo cargar:", e); }
}

async function cargarConfigAlim(nom) {
  state.alimConfig = null;
  const atBadge = document.getElementById("vcc-alim-at-badge");
  if (atBadge) atBadge.style.display = "none";
  if (!nom) return;
  try {
    const r = await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nom)}`);
    if (!r.error) {
      state.alimConfig = r;
      if (atBadge && r.autotrafos?.length) atBadge.style.display = "";
    }
  } catch(e) { /* sin config guardada — normal */ }
}

async function cargarMeses() {
  try {
    dbg("Cargando meses desde /api/meses...");
    const meses = await apiFetch("/api/meses");
    state.mesesDisponibles = meses;
    dbg(`✓ Meses cargados: ${meses.length} (${meses[0] || "?"} → ${meses[meses.length-1] || "?"})`, "ok");
    // Resetear toggle a modo año corrido
    const tog = document.getElementById("toggle-historico");
    if (tog) tog.checked = false;
    _renderMeses(false);
  } catch (e) {
    dbg("✗ Error cargando meses: " + e.message, "error");
    console.warn("[meses] No se pudieron cargar los meses:", e);
  }
}

function _renderMeses(historico) {
  const meses  = state.mesesDisponibles;
  const limite = _limiteAnioCorrido(meses);
  const cont   = document.getElementById("meses-checklist");

  cont.innerHTML = meses.map(m => {
    const ac      = !limite || m >= limite;
    const checked = ac;
    const bg      = ac ? "#6c757d" : "#3a3a3a";
    const color   = ac ? "#fff"    : "#ccc";
    // display en style (no clase d-flex) para que el JS pueda sobreescribir sin luchar con !important
    const disp    = (!ac && !historico) ? "none" : "flex";
    return `<label class="badge mes-label"
                   style="display:${disp};align-items:center;gap:4px;cursor:pointer;font-weight:normal;padding:4px 8px;background:${bg};color:${color}"
                   data-ac="${ac ? "1" : "0"}">
              <input type="checkbox" class="mes-chk" value="${m}" ${checked ? "checked" : ""}
                     style="cursor:pointer" onchange="actualizarLblMeses()">
              ${fmtMes(m)}
            </label>`;
  }).join("");

  actualizarLblMeses();
}

function _aplicarVisibilidadMeses(historico) {
  document.querySelectorAll(".mes-label[data-ac='0']").forEach(lbl => {
    lbl.style.display = historico ? "flex" : "none";
  });
}

function toggleHistorico(activo) {
  _aplicarVisibilidadMeses(activo);
  if (!activo) {
    // Al desactivar: desmarcar meses históricos que pudieran estar seleccionados
    document.querySelectorAll(".mes-label[data-ac='0'] .mes-chk").forEach(chk => {
      chk.checked = false;
    });
  }
  actualizarLblMeses();
}

function seleccionarTodosMeses(checked) {
  // Solo actúa sobre los meses visibles
  document.querySelectorAll(".mes-label").forEach(lbl => {
    if (lbl.style.display !== "none") {
      lbl.querySelector(".mes-chk").checked = checked;
    }
  });
  actualizarLblMeses();
}

function mesesSeleccionados() {
  return [...document.querySelectorAll(".mes-chk:checked")].map(c => c.value);
}

function actualizarLblMeses() {
  const n = mesesSeleccionados().length;
  document.getElementById("lbl-n-meses").textContent =
    `${n} mes${n !== 1 ? "es" : ""} seleccionado${n !== 1 ? "s" : ""}`;
}

// ── ERROR SIMULACIÓN (panel persistente) ──────────────────────────────────
function mostrarErrorSim(msg) {
  spinner(false);
  const el  = document.getElementById("error-simulacion");
  const msg_el = document.getElementById("error-simulacion-msg");
  if (el && msg_el) { msg_el.textContent = msg; el.style.display = ""; }
  console.error("[simulacion] Error:", msg);
}

function ocultarErrorSim() {
  const el = document.getElementById("error-simulacion");
  if (el) el.style.display = "none";
}

// ── COPIAR TABLAS AL PORTAPAPELES (Excel / correo) ─────────────────────────
// Serializa una <table> del DOM a text/html (con formato) + text/plain (TSV).
// Excel y Outlook toman el HTML; cualquier otro destino recibe el TSV.
async function copiarTablaEl(tabla, btn) {
  if (!tabla) return;

  // Clon limpio: quita botones/controles inyectados, conserva estilos inline.
  const clon = tabla.cloneNode(true);
  clon.querySelectorAll(".no-copy, .btn-copiar-tabla, button, input").forEach(e => e.remove());
  const html = `<table style="border-collapse:collapse" border="1" cellpadding="4">${clon.innerHTML}</table>`;

  // TSV desde las filas visibles (para pegado en columnas).
  const tsv = [...clon.querySelectorAll("tr")].map(tr =>
    [...tr.querySelectorAll("th,td")]
      .map(c => (c.innerText || c.textContent || "").replace(/\s+/g, " ").trim())
      .join("\t")
  ).join("\n");

  const feedback = ok => {
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = ok ? '<i class="bi bi-check2"></i> Copiada' : '<i class="bi bi-x"></i>';
      setTimeout(() => { btn.innerHTML = orig; }, 1600);
    }
    if (ok) mostrarToast("Tabla copiada — pégala en Excel o el correo");
  };

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html":  new Blob([html], { type: "text/html"  }),
        "text/plain": new Blob([tsv],  { type: "text/plain" }),
      }),
    ]);
    feedback(true);
  } catch (e) {
    // Fallback: solo texto plano (navegadores sin ClipboardItem o sin permiso).
    try {
      await navigator.clipboard.writeText(tsv);
      feedback(true);
    } catch (_) {
      feedback(false);
      if (typeof mostrarError === "function") mostrarError("No se pudo copiar la tabla.");
    }
  }
}

// Inyecta una barra con botón "Copiar" encima de cada <table> con datos
// dentro de `container`. Idempotente: no duplica si ya se agregó.
function agregarBotonesCopia(container) {
  if (!container) return;
  container.querySelectorAll("table").forEach(tabla => {
    if (tabla.dataset.copiaLista) return;      // ya tiene botón
    if (!tabla.querySelector("tbody td, td")) return;  // tabla vacía → omitir
    tabla.dataset.copiaLista = "1";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-outline-secondary btn-copiar-tabla no-copy py-0 px-2";
    btn.style.fontSize = ".72rem";
    btn.title = "Copiar tabla al portapapeles (Excel / correo)";
    btn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copiar';
    btn.onclick = () => copiarTablaEl(tabla, btn);

    const bar = document.createElement("div");
    bar.className = "d-flex justify-content-end mb-1 no-copy";
    bar.appendChild(btn);
    tabla.parentNode.insertBefore(bar, tabla);
  });
}

// ── EQUIPOS DE BORDE DE ATR ────────────────────────────────────────────────
// Prefijos de equipos que pueden delimitar un autotransformador, en orden de
// prioridad (para el selector de config y el botón rápido de registro).
const AT_PREFIJOS = ["REC", "CLB", "DBC", "ABB", "ORM", "SCH", "VIS"];
function _atBordePrio(numpos) {
  const u = (numpos || "").toUpperCase();
  const i = AT_PREFIJOS.findIndex(p => u.startsWith(p));
  return i < 0 ? 99 : i;
}
function _esBordeATR(numpos) { return _atBordePrio(numpos) < 99; }

// Escapa texto libre del usuario para insertarlo como HTML.
function _escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// FRG: consulta si un alimentador participa en esquema FRG (por numalim o nom_alim)
// y badge canónico para tablas. El dato viene de state.feedersData (/api/feeders).
function esAlimFrg(key) {
  if (key == null || !state.feedersData?.length) return false;
  const f = state.feedersData.find(x => x.numalim == key || (x.nom_alim && x.nom_alim === key));
  return !!(f && f.frg);
}
function frgBadge() {
  return '<span class="badge bg-warning text-dark ms-1" style="font-size:.65rem"'
       + ' title="Participa en esquema FRG">FRG</span>';
}
