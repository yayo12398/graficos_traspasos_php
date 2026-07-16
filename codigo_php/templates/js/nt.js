// ── ORIGEN ────────────────────────────────────────────────────────────────
async function inicializarOrigenSelect() {
  spinner(true, "Cargando alimentadores...");
  try {
    const feeders = await apiFetch("/api/feeders");
    state.feedersData = feeders;

    if (ts.origen) ts.origen.destroy();
    ts.origen = new TomSelect("#sel-origen", {
      options: feeders.map(f => ({
        value:       String(f.numalim),
        text:        f.nombre,
        cn:          f.cn,
        nom_alim:    f.nom_alim,
        subestacion:  f.subestacion,
        barra_trafo:  f.barra_trafo,
        cn_trafo:     f.cn_trafo,
      })),
      valueField: "value",
      labelField: "text",
      searchField: ["text"],
      maxOptions: 60,
      placeholder: "Buscar alimentador...",
      onChange: seleccionarOrigen,
    });
  } finally {
    spinner(false);
  }
}

async function seleccionarOrigen(numalimStr) {
  if (!numalimStr) return;
  const numalim = parseInt(numalimStr);
  const feeder  = state.feedersData.find(f => f.numalim === numalim);

  state.origenNumalim = numalim;
  state.origenNomAlim = feeder?.nom_alim || null;
  dbg(`Origen: numalim=${numalim} nom_alim=${state.origenNomAlim || "SIN MATCH"} cn=${feeder?.cn}`, state.origenNomAlim ? "ok" : "warn");

  // Mostrar CN origen + subestación + barra + CN trafo
  const infoEl    = document.getElementById("orig-info");
  const atBadgeEl = document.getElementById("orig-at-badge");
  if (atBadgeEl) atBadgeEl.style.display = "none";
  if (feeder?.cn != null) {
    const parts = [`CN alimentador = ${feeder.cn.toFixed(0)} A`];
    if (feeder.subestacion)  parts.push(`Sub: ${feeder.subestacion}`);
    if (feeder.barra_trafo) parts.push(`Barra: ${feeder.barra_trafo}`);
    if (feeder.cn_trafo != null) parts.push(`CN trafo = ${feeder.cn_trafo.toFixed(0)} A`);
    document.getElementById("orig-cn-txt").textContent = parts.join("  |  ");
    infoEl.style.display = "";
  } else {
    infoEl.style.display = "none";
  }
  // Reset pasos siguientes
  document.getElementById("card-isla").style.display = "";
  document.getElementById("card-destino").style.display = "none";
  document.getElementById("card-simular").style.display = "none";
  const _panelB = document.getElementById("panel-equipos-b");
  if (_panelB) _panelB.style.display = "none";
  state.troncalBNomAlim = null; state.equiposConfigB = {}; state.alimConfigB = null;
  state.origenAlimConfig = null;
  ocultarPreviewIsla();
  ocultarPanelTDsEquipo();
  state.tdsData = [];

  // Filtrar destinos por LZ del origen seleccionado (siempre, incluso sin NOM_ALIM)
  actualizarDestinosLZ(numalim);

  if (!state.origenNomAlim) {
    // Sin correspondencia en aguas_abajo → no hay equipos/TDs
    renderEquipos([]);
    renderTDs([]);
    document.getElementById("tds-container").innerHTML =
      `<div class="alert alert-warning m-2 small">
        <i class="bi bi-exclamation-triangle me-1"></i>
        Este alimentador no tiene correspondencia en <em>aguas_abajo</em>.
        Agrega un mapeo en la pestaña <strong>Mapeos de Nombres</strong> para seleccionar isla.
      </div>`;
    return;
  }

  spinner(true, "Cargando equipos y TDs...");
  try {
    const nomEnc = encodeURIComponent(state.origenNomAlim);
    const [equipos, tds, alimCfg] = await Promise.all([
      apiFetch(`/api/feeder/${nomEnc}/equipos`),
      apiFetch(`/api/feeder/${nomEnc}/tds`),
      apiFetch(`/api/alimentadores/config/${nomEnc}`).catch(() => null),
    ]);
    state.origenAlimConfig = (alimCfg && !alimCfg.error) ? alimCfg : null;
    if (atBadgeEl) atBadgeEl.style.display = state.origenAlimConfig?.autotrafos?.length ? "" : "none";
    state.equiposData = equipos;
    state.tdsData = tds;
    renderEquipos(equipos);
    renderTDs(tds);
  } finally {
    spinner(false);
  }
}

// ── EQUIPOS ───────────────────────────────────────────────────────────────
function renderEquipos(equipos) {
  if (ts.equipo) ts.equipo.destroy();

  const _REC = new Set(['REC','RTS','RTB']);
  const _SUB = new Set(['DBC','ABB','ORM','SCH','CLB']);
  const _eqIcon = n => { const p = (n.match(/^([A-Za-z]+)/)?.[1] || '').toUpperCase(); return _REC.has(p) ? '🔴' : _SUB.has(p) ? '🔵' : '⚫'; };

  const autotrafos = state.origenAlimConfig?.autotrafos ?? [];

  // Mapas para badges y tiebreaker de sort (por tipo de ATR)
  const atAltaMap = {}, atBajaMap = {}, atPrioMap = {};
  for (const at of autotrafos) {
    const tipo = at.tipo ?? 'reductor';
    if (at.rec_alta) atAltaMap[at.rec_alta.trim().toUpperCase()] = at.tension_alta ?? 23;
    if (at.rec_baja) atBajaMap[at.rec_baja.trim().toUpperCase()] = true;
    if (tipo === 'elevador') {
      if (at.rec_baja) atPrioMap[at.rec_baja.trim().toUpperCase()] = 2;
      if (at.rec_alta) atPrioMap[at.rec_alta.trim().toUpperCase()] = 3;
    } else {
      if (at.rec_alta) atPrioMap[at.rec_alta.trim().toUpperCase()] = 2;
      if (at.rec_baja) atPrioMap[at.rec_baja.trim().toUpperCase()] = 3;
    }
  }
  const _atPrio = n => atPrioMap[n] ?? 1;
  const sorted  = [...equipos].sort((a, b) => {
    const diff = (b.pct_feeder ?? -1) - (a.pct_feeder ?? -1);
    return diff !== 0 ? diff : _atPrio(a.nombre.toUpperCase()) - _atPrio(b.nombre.toUpperCase());
  });

  const opts = sorted.map(e => {
    const nom    = e.nombre.trim().toUpperCase();
    const pctStr = e.pct_feeder != null ? ` (${e.pct_feeder.toFixed(1)}%)` : '';
    const atSfx  = atAltaMap[nom] != null ? ` · ⚡ ${atAltaMap[nom]}kV`
                 : atBajaMap[nom]          ? ` · ⚡ 12kV` : '';
    return { value: e.nombre, text: nom, label: `${_eqIcon(nom)} ${nom}${pctStr}${atSfx}` };
  });

  // Separadores: reductor → después de rec_alta; elevador → después de rec_baja
  const sepInserts = [];
  for (const at of autotrafos) {
    if (!at.rec_alta) continue;
    const tipo   = at.tipo ?? 'reductor';
    const alta   = at.rec_alta.trim().toUpperCase();
    const tens   = at.tension_alta ?? 23;
    const anchor = tipo === 'elevador' ? (at.rec_baja ?? '').trim().toUpperCase() : alta;
    const label  = tipo === 'elevador'
      ? `⚡ Autotrafo — 12kV arriba · ${tens}kV abajo`
      : `⚡ Autotrafo — ${tens}kV arriba · 12kV abajo`;
    if (!anchor) continue;
    const idx = opts.findIndex(o => o.text === anchor);
    if (idx >= 0) sepInserts.push({ idx, label, alta });
  }
  sepInserts.sort((a, b) => b.idx - a.idx);
  for (const { idx, label, alta } of sepInserts) {
    opts.splice(idx + 1, 0, {
      value: `__at_sep_${alta}__`, text: '', disabled: true, label,
    });
  }

  ts.equipo = new TomSelect("#sel-equipo", {
    options:       opts,
    valueField:    "value",
    labelField:    "label",
    searchField:   ["value", "text", "label"],
    disabledField: "disabled",
    maxOptions:    100,
    placeholder:   "Buscar equipo...",
    render: {
      option: (item) => item.disabled
        ? `<div style="font-size:.78rem;color:#f5a623;font-style:italic;cursor:default;padding:4px 10px;border-top:1px solid #f5a623;border-bottom:1px solid #f5a623">${item.label}</div>`
        : `<div style="font-size:.82rem">${item.label}</div>`,
      item: (item) => `<div>${item.label || item.value}</div>`,
    },
    onChange: val => {
      if (!val || val.startsWith('__at_sep_')) {
        ocultarPanelTDsEquipo();
        ocultarPreviewIsla();
        filtrarDestinosPorEquipo(null);
        return;
      }
      cargarTDsEquipo(val);
      actualizarPreviewIsla();
      filtrarDestinosPorEquipo(val);
    },
  });
}

// ── TDs (lista checkboxes) ────────────────────────────────────────────────
function renderTDs(tds) {
  const cont = document.getElementById("tds-container");
  if (!tds || tds.length === 0) {
    cont.innerHTML = '<div class="text-muted small p-2">Sin TDs disponibles</div>';
    return;
  }
  cont.innerHTML = tds.map(t => `
    <div class="td-item" data-numpos="${t.numpos}"
         data-nombre="${t.nombre.toLowerCase()}">
      <input type="checkbox" class="form-check-input td-chk" value="${t.numpos}"
             onchange="actualizarPreviewIsla()">
      <span class="flex-grow-1 small">${t.nombre}</span>
      <span class="text-muted small me-2">${t.kva?.toFixed(0) ?? "—"} kVA</span>
      <span class="text-muted small">${t.clientes ?? "—"} cli</span>
    </div>`).join("");
}

function filtrarTDs(texto) {
  const t = texto.toLowerCase();
  document.querySelectorAll("#tds-container .td-item").forEach(el => {
    const match = el.dataset.nombre.includes(t) || el.dataset.numpos.includes(t);
    el.style.display = match ? "" : "none";
  });
}

function seleccionarTodos() {
  document.querySelectorAll(".td-chk:not([style*='none'])").forEach(c => {
    const item = c.closest(".td-item");
    if (item.style.display !== "none") c.checked = true;
  });
  actualizarPreviewIsla();
}

function deseleccionarTodos() {
  document.querySelectorAll(".td-chk").forEach(c => c.checked = false);
  actualizarPreviewIsla();
}

// ── SUB-PANEL TDs EQUIPO ──────────────────────────────────────────────────

async function cargarTDsEquipo(equipoNombre) {
  if (!state.origenNomAlim || !equipoNombre) { ocultarPanelTDsEquipo(); return; }
  const panel  = document.getElementById("panel-tds-equipo");
  const lista  = document.getElementById("tds-equipo-lista");
  document.getElementById("tds-equipo-resumen").textContent = "Cargando…";
  panel.style.display = "";
  // Abrir lista por defecto
  lista.style.display = "";
  document.getElementById("tds-equipo-chevron").style.transform = "";
  lista.innerHTML = '<div class="text-muted small p-3">Cargando TDs…</div>';
  try {
    const url = `/api/feeder/${encodeURIComponent(state.origenNomAlim)}/tds?equipo=${encodeURIComponent(equipoNombre)}`;
    const tds = await apiFetch(url);
    if (tds.error) {
      lista.innerHTML = `<div class="text-danger small p-2">${tds.error}</div>`;
      return;
    }
    state.tdsEquipoData  = tds;
    state.tdsEquipoTotal = tds.length;
    lista.innerHTML = tds.map(td => {
      const grande = (td.kva ?? 0) >= TD_GRANDE_KVA;
      const badge  = grande
        ? `<span class="badge bg-warning text-dark ms-1" style="font-size:0.65em">⚡</span>`
        : "";
      return `<div style="display:flex;align-items:center;gap:8px;
                          padding:5px 10px;border-bottom:1px solid #eef0f5;
                          ${grande ? "background:#fffbf0" : ""}">
        <input type="checkbox" class="form-check-input flex-shrink-0 td-equipo-chk"
               value="${td.numpos}"
               data-kva="${td.kva ?? 0}" data-clientes="${td.clientes ?? 0}"
               checked onchange="updateEquipoTDsResumen()">
        <span class="flex-grow-1 small">${td.nombre}${badge}</span>
        <span class="text-muted small me-1">${td.kva?.toLocaleString("es-CL") ?? "—"} kVA</span>
        <span class="text-muted small">${td.clientes ?? "—"} cli</span>
      </div>`;
    }).join("") || '<div class="text-muted small p-2">Sin TDs.</div>';
    updateEquipoTDsResumen();
  } catch {
    lista.innerHTML = '<div class="text-danger small p-2">Error al cargar TDs del equipo.</div>';
  }
}

function togglePanelTDsEquipo() {
  const lista   = document.getElementById("tds-equipo-lista");
  const chevron = document.getElementById("tds-equipo-chevron");
  const open    = lista.style.display !== "none";
  lista.style.display        = open ? "none" : "";
  chevron.style.transform    = open ? "rotate(-90deg)" : "";
}

function selAllEquipoTDs(checked) {
  document.querySelectorAll(".td-equipo-chk").forEach(c => c.checked = checked);
  updateEquipoTDsResumen();
}

function updateEquipoTDsResumen() {
  const todos = [...document.querySelectorAll(".td-equipo-chk")];
  const sel   = todos.filter(c => c.checked);
  const nSel  = sel.length;
  const total = todos.length;
  const kva   = sel.reduce((s, c) => s + parseFloat(c.dataset.kva   || 0), 0);
  const cli   = sel.reduce((s, c) => s + parseInt(c.dataset.clientes || 0), 0);
  document.getElementById("tds-equipo-resumen").textContent =
    `${nSel}/${total} TDs seleccionados — ${kva.toLocaleString("es-CL")} kVA | ${cli.toLocaleString("es-CL")} clientes`;
  const noSel = nSel === 0;
  document.getElementById("alerta-sin-tds-equipo").style.display = noSel ? "" : "none";
  document.getElementById("btn-simular").disabled = noSel;
  // También actualizar el preview si hay selección
  if (nSel > 0) actualizarPreviewIsla();
  else ocultarPreviewIsla();
}

function getEquipoTDsExcluidos() {
  return [...document.querySelectorAll(".td-equipo-chk:not(:checked)")].map(c => c.value);
}

function ocultarPanelTDsEquipo() {
  document.getElementById("panel-tds-equipo").style.display = "none";
  document.getElementById("alerta-sin-tds-equipo").style.display = "none";
  document.getElementById("btn-simular").disabled = false;
  state.tdsEquipoData  = [];
  state.tdsEquipoTotal = 0;
}

// ── PREVIEW ISLA ──────────────────────────────────────────────────────────
let previewTimeout = null;
function actualizarPreviewIsla() {
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(_fetchPreview, 300);
  document.getElementById("card-destino").style.display = "";
  document.getElementById("card-meses").style.display   = "";
  document.getElementById("card-simular").style.display = "";
}

async function _fetchPreview() {
  if (!state.origenNomAlim) { ocultarPreviewIsla(); return; }
  const modo = document.querySelector('input[name="tipo-isla"]:checked').value;
  const body = {
    nom_alim_orig: state.origenNomAlim,
    tipo_isla:     modo,
    equipo_nombre: modo === "equipo" ? (ts.equipo?.getValue() || "") : "",
    tds_numpos:    modo === "tds"
      ? [...document.querySelectorAll(".td-chk:checked")].map(c => c.value)
      : [],
  };

  if (modo === "equipo" && !body.equipo_nombre) { ocultarPreviewIsla(); return; }
  // Si el sub-panel está activo y hay exclusiones, pasar lista explícita al preview
  if (modo === "equipo" && document.getElementById("panel-tds-equipo").style.display !== "none") {
    const included = [...document.querySelectorAll(".td-equipo-chk:checked")].map(c => c.value);
    if (included.length === 0) { ocultarPreviewIsla(); return; }
    const hayExcl = document.querySelectorAll(".td-equipo-chk:not(:checked)").length > 0;
    if (hayExcl) { body.tipo_isla = "tds"; body.tds_numpos = included; }
  }
  if (modo === "tds" && body.tds_numpos.length === 0) { ocultarPreviewIsla(); return; }

  try {
    const data = await apiFetch("/api/isla/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (data.error) { ocultarPreviewIsla(); return; }
    document.getElementById("prev-tds").textContent = data.n_td;
    document.getElementById("prev-kva").textContent = data.kva_isla?.toLocaleString("es-CL") ?? "—";
    document.getElementById("prev-cli").textContent = data.clientes ?? "—";
    document.getElementById("prev-pct").textContent = data.p_pct != null ? `${data.p_pct.toFixed(1)}%` : "—";
    document.getElementById("isla-preview").style.display = "";
    _mostrarAlertaInversion(data.equipos_traspasados || []);
  } catch { ocultarPreviewIsla(); }
}

function ocultarPreviewIsla() {
  document.getElementById("isla-preview").style.display = "none";
  _mostrarAlertaInversion([]);
}

function _mostrarAlertaInversion(equipos) {
  const alerta = document.getElementById("alerta-inversion-flujo");
  if (!equipos?.length) { alerta.style.display = "none"; return; }
  const badges = equipos.map(e =>
    `<span class="badge bg-warning text-dark me-1">${e.tipo}</span><code>${e.nombre}</code>`
  ).join("  ");
  document.getElementById("alerta-inversion-equipos").innerHTML = " " + badges;
  alerta.style.display = "";
}

// ── DESTINOS ─────────────────────────────────────────────────────────────
async function cargarDestinos() {
  const destinos = await apiFetch("/api/destinos/existentes");
  state.destinosData = destinos;

  if (ts.destino) ts.destino.destroy();
  ts.destino = new TomSelect("#sel-destino", {
    options: destinos.map(d => ({
      value: d.numalim,
      text: `${d.nombre}  (CN=${d.cn?.toFixed(0) ?? "?"} A)`,
    })),
    valueField: "value",
    labelField: "text",
    searchField: ["text"],
    maxOptions: 50,
    placeholder: "Buscar alimentador destino...",
  });

  const feedersNuevos = await apiFetch("/api/destinos/nuevos");
  state.feedersNuevos = feedersNuevos;
  if (ts.feederNuevo) ts.feederNuevo.destroy();
  ts.feederNuevo = new TomSelect("#sel-feeder-nuevo", {
    options: feedersNuevos.map(f => ({
      value: f.nombre,
      text: `${f.nombre}  (CN=${f.cn} A · acum=${f.acumulado.toFixed(1)} A · ${f.uso_pct?.toFixed(1) ?? "?"}%)`,
    })),
    valueField: "value",
    labelField: "text",
    searchField: ["text"],
    maxOptions: 30,
    placeholder: "Seleccionar alimentador...",
  });
}

// ── FILTRO LZ DESTINO ─────────────────────────────────────────────────────
async function actualizarDestinosLZ(numalim) {
  const lzInfoEl     = document.getElementById("lz-dest-info");
  const equipoCierra = document.getElementById("lz-equipo-cierra");
  if (equipoCierra) equipoCierra.style.display = "none";
  state.lzVecinos       = [];
  state.selectedNumposLZ = null;

  let vecinos = [];
  try {
    vecinos = await apiFetch(`/api/vecinos_lz/${numalim}`);
  } catch (e) {
    console.warn("[LZ] No se pudo obtener vecinos:", e);
  }
  state.lzVecinos = vecinos;

  const numalimSet = new Set(vecinos.flatMap(v => v.vecinos.map(x => x.numalim)));
  const filtrados  = state.destinosData.filter(d => numalimSet.has(d.numalim));

  if (ts.destino) ts.destino.destroy();
  ts.destino = new TomSelect("#sel-destino", {
    options: filtrados.map(d => ({
      value: d.numalim,
      text: `${d.nombre}  (CN=${d.cn?.toFixed(0) ?? "?"} A)`,
    })),
    valueField: "value",
    labelField: "text",
    searchField: ["text"],
    maxOptions: 50,
    placeholder: "Buscar alimentador destino...",
    onChange: v => mostrarEquipoCierra(v ? parseInt(v) : null),
  });

  if (lzInfoEl) {
    if (filtrados.length) {
      lzInfoEl.innerHTML = `<i class="bi bi-geo-alt-fill me-1 text-success"></i>${filtrados.length} alimentador(es) con LZ disponible`;
      lzInfoEl.className = "small text-success mt-1";
    } else {
      lzInfoEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Sin vecinos LZ — este alimentador no puede traspasar`;
      lzInfoEl.className = "small text-danger mt-1";
    }
    lzInfoEl.style.display = "";
  }

  if (state.pendingPreselectDest != null) {
    const pd = state.pendingPreselectDest;
    state.pendingPreselectDest = null;
    ts.destino.setValue(String(pd));
  }
}

// Filtra el TomSelect de destino según equipo que abre (null = restaurar todos)
function filtrarDestinosPorEquipo(equipoAbre) {
  if (!state.lzVecinos?.length) return;
  const lzInfoEl = document.getElementById("lz-dest-info");

  let filtrados;
  if (!equipoAbre) {
    // Sin equipo seleccionado: mostrar todos los vecinos viables
    const numalimSet = new Set(state.lzVecinos.flatMap(v => v.vecinos.map(x => x.numalim)));
    filtrados = state.destinosData.filter(d => numalimSet.has(d.numalim));
  } else {
    const eqUp = equipoAbre.toUpperCase().trim();
    const lzValidos = state.lzVecinos.filter(lz =>
      lz.equipos_troncal_orig?.some(e => e.toUpperCase().trim() === eqUp)
    );
    const numalimSet = new Set(
      lzValidos.flatMap(lz => lz.vecinos.filter(v => v.viable !== false).map(v => v.numalim))
    );
    filtrados = state.destinosData.filter(d => numalimSet.has(d.numalim));
  }

  // Preservar selección actual si sigue siendo válida
  const selActual = ts.destino?.getValue() ? parseInt(ts.destino.getValue()) : null;
  const sigueValida = selActual != null && filtrados.some(d => d.numalim === selActual);

  if (ts.destino) ts.destino.destroy();
  ts.destino = new TomSelect("#sel-destino", {
    options: filtrados.map(d => ({
      value: d.numalim,
      text: `${d.nombre}  (CN=${d.cn?.toFixed(0) ?? "?"} A)`,
    })),
    valueField: "value",
    labelField: "text",
    searchField: ["text"],
    maxOptions: 50,
    placeholder: "Buscar alimentador destino...",
    onChange: v => mostrarEquipoCierra(v ? parseInt(v) : null),
  });

  const ecuacion = equipoAbre ? ` para equipo <code>${equipoAbre.toUpperCase()}</code>` : "";
  if (lzInfoEl) {
    lzInfoEl.innerHTML = filtrados.length
      ? `<i class="bi bi-funnel-fill me-1 text-${equipoAbre ? "primary" : "success"}"></i>${filtrados.length} alimentador(es) con LZ válido${ecuacion}`
      : `<i class="bi bi-x-circle me-1"></i>Sin destinos LZ válidos${ecuacion}`;
    lzInfoEl.className = filtrados.length ? "small text-success mt-1" : "small text-danger mt-1";
    lzInfoEl.style.display = "";
  }

  if (sigueValida) {
    ts.destino.setValue(String(selActual));
  } else {
    if (selActual != null) mostrarEquipoCierra(null); // destino cayó del filtro → limpiar equipo cierra
  }
}

// ── CLASIFICACIÓN EQUIPOS TRONCALES ───────────────────────────────────────
const _PREFIJOS_SUBT = ["ABB","G33","ORM","SCH","GMT","VIS","CGP","GLT"];
const _esTroncalRelevante = eq => {
  const p = (eq || "").slice(0, 3).toUpperCase();
  return _PREFIJOS_SUBT.includes(p) || p === "PPF" || p === "REC";
};

function _tipoEquipoTroncal(numpos) {
  const p = (numpos || "").slice(0, 3).toUpperCase();
  if (p === "REG") return { label: "Regulador",  color: "danger",    msg: "No maniobrable" };
  if (["ABB","G33","ORM","SCH","GMT","VIS","CGP","GLT"].includes(p))
    return { label: "Subt.",    color: "warning",  msg: "3 ramas — verificar cuál operar" };
  if (["DBC","REC","PPF","CLB"].includes(p))
    return { label: "Aéreo",    color: "secondary", msg: null };
  return   { label: "—",        color: "secondary", msg: null };
}

// Lista compacta usada en el panel de selección de equipo LZ
function _htmlEquiposTroncal(equipos) {
  if (!equipos?.length) return "";
  const tieneReg = equipos.some(eq => eq.slice(0,3).toUpperCase() === "REG");
  const items = equipos.map(eq => {
    const t = _tipoEquipoTroncal(eq);
    const warnTxt = t.msg ? `<span class="text-${t.color}" style="font-size:.75rem">${t.msg}</span>` : "";
    return `<li class="d-flex align-items-center gap-1 mb-1">
      <code class="small">${eq}</code>
      <span class="badge bg-${t.color} text-${t.color === "warning" ? "dark" : "white"}" style="font-size:.7rem">${t.label}</span>
      ${warnTxt}
    </li>`;
  }).join("");
  const regWarn = tieneReg
    ? `<div class="text-danger small mt-1"><i class="bi bi-exclamation-triangle-fill me-1"></i>Hay reguladores de tensión en el troncal — no son maniobrables.</div>`
    : "";
  return `<details class="mt-1">
    <summary class="small text-muted" style="cursor:pointer">
      <i class="bi bi-list-ul me-1"></i>${equipos.length} equipo(s) troncales en alimentador receptor
    </summary>
    <ul class="list-unstyled ms-2 mt-1 mb-0">${items}</ul>
    ${regWarn}
  </details>`;
}

// ── EQUIPO QUE CIERRA (selector LZ) ───────────────────────────────────────
function mostrarEquipoCierra(numalimDest) {
  const el = document.getElementById("lz-equipo-cierra");
  if (!el) return;
  if (!numalimDest || !state.lzVecinos?.length) {
    el.style.display = "none";
    state.selectedNumposLZ = null;
    tspCargarEquiposB(null, null, []);
    return;
  }

  const TIPO_LABEL = {
    bilateral:          "Bilateral",
    subterraneo_3ramas: "Equipo subterráneo de 3 ramas",
  };
  const dispositivos = state.lzVecinos.filter(v =>
    v.vecinos.some(x => x.numalim === numalimDest)
  );
  if (!dispositivos.length) {
    el.style.display = "none";
    state.selectedNumposLZ = null;
    tspCargarEquiposB(null, null, []);
    return;
  }

  const tipoIsla   = document.querySelector('input[name="tipo-isla"]:checked')?.value;
  const equipoAbre = (tipoIsla === "equipo" && ts.equipo?.getValue())
    ? ts.equipo.getValue().toUpperCase().trim() : null;

  const devs = dispositivos.map(d => {
    const vi = d.vecinos.find(x => x.numalim === numalimDest);
    let enIsla = null;
    if (equipoAbre) {
      if (d.equipos_troncal_orig?.length) {
        enIsla = d.equipos_troncal_orig.some(eq => eq.toUpperCase().trim() === equipoAbre);
      } else {
        enIsla = false; // sin datos de troncal desde origen → no se puede confirmar
      }
    }
    return {
      ...d,
      _viable:          vi?.viable ?? true,
      _equipos_troncal: vi?.equipos_troncal ?? [],
      _nom_alim:        vi?.nom_alim ?? '',
      _enIsla:          enIsla,
    };
  });

  const _score = d => {
    if (!d._viable)         return 3;
    if (d._enIsla === true) return 0;
    if (d._enIsla === null) return 1;
    return 2;
  };
  devs.sort((a, b) => _score(a) - _score(b));

  const primerOk = devs.find(d => d._viable && d._enIsla !== false)
                || devs.find(d => d._viable);
  state.selectedNumposLZ = primerOk?.numpos_lz || null;

  const _badge = d => {
    const tipo  = TIPO_LABEL[d.tipo] || d.tipo;
    const color = d._viable ? (d.tipo === "subterraneo_3ramas" ? "warning" : "success") : "secondary";
    const exc   = d.excepcion
      ? ` <span class="badge bg-secondary" title="Registro corregido respecto a BD">BD corr.</span>`
      : "";
    return `<span class="badge bg-${color} text-${color === "warning" ? "dark" : "white"} me-1">${tipo}</span>${exc}`;
  };

  const _islaBadge = d => {
    if (d._enIsla === true)
      return ` <span class="badge bg-info text-dark" title="LZ encontrado en camino troncal aguas abajo del equipo que abre">En isla ✓</span>`;
    if (d._enIsla === false)
      return ` <span class="badge bg-warning text-dark" title="No encontrado en camino troncal — verificar si pertenece a la isla">Verificar</span>`;
    return "";
  };

  const _islaWarnTxt = d => d._enIsla === false
    ? `<div class="small text-warning-emphasis mt-1">
        <i class="bi bi-exclamation-triangle me-1"></i>No encontrado en el camino troncal de la isla — verificar si este LZ pertenece al segmento a traspasar.
       </div>`
    : "";

  if (devs.length === 1) {
    const d = devs[0];
    if (!d._viable) {
      el.innerHTML = `<div class="d-flex align-items-center gap-1" style="opacity:.6">
        <i class="bi bi-toggle-off me-1 text-danger"></i>
        <span class="text-muted">Equipo que cierra:</span>
        <code class="ms-1 me-1 text-muted">${d.numpos_lz}</code>${_badge(d)}
        <span class="badge bg-danger text-white">No viable</span>
      </div>
      <div class="small text-danger mt-1">
        <i class="bi bi-info-circle me-1"></i>LZ conecta directamente en cabecera — no permite aislar una isla en el alimentador receptor.
      </div>`;
    } else {
      el.innerHTML = `<i class="bi bi-toggle-on me-1 text-primary"></i>
        <span class="text-muted">Equipo que cierra:</span>
        <code class="ms-1 me-1">${d.numpos_lz}</code>${_badge(d)}${_islaBadge(d)}
        ${_islaWarnTxt(d)}
        ${_htmlEquiposTroncal(d._equipos_troncal)}`;
    }
  } else {
    const opciones = devs.map(d => {
      if (!d._viable) {
        return `<div class="form-check form-check-inline mb-0" style="opacity:.55" title="No viable — LZ en cabecera del receptor">
          <input class="form-check-input" type="radio" name="sel-numpos-lz"
                 id="lz-radio-${d.numpos_lz}" value="${d.numpos_lz}" disabled>
          <label class="form-check-label small text-muted" for="lz-radio-${d.numpos_lz}">
            <code>${d.numpos_lz}</code> ${_badge(d)}
            <span class="badge bg-danger text-white">No viable</span>
          </label>
        </div>`;
      }
      const checked = d.numpos_lz === state.selectedNumposLZ ? "checked" : "";
      return `<div class="form-check form-check-inline mb-0">
        <input class="form-check-input" type="radio" name="sel-numpos-lz"
               id="lz-radio-${d.numpos_lz}" value="${d.numpos_lz}" ${checked}
               onchange="state.selectedNumposLZ = this.value">
        <label class="form-check-label small" for="lz-radio-${d.numpos_lz}">
          <code>${d.numpos_lz}</code> ${_badge(d)}${_islaBadge(d)}
        </label>
      </div>`;
    }).join("");
    const selDev = devs.find(d => d.numpos_lz === state.selectedNumposLZ);
    el.innerHTML = `<div class="text-muted small mb-1">
      <i class="bi bi-toggle-on me-1 text-primary"></i>Equipo que cierra — selecciona:
    </div>${opciones}
    ${selDev ? _islaWarnTxt(selDev) : ""}
    ${selDev ? _htmlEquiposTroncal(selDev._equipos_troncal) : ""}`;
  }
  el.style.display = "";

  // Cargar panel de configuración de equipos del receptor
  // Preferir nom_alim del LZ (vi.nom_alim), fallback a destinosData
  const feederB  = state.destinosData.find(d => d.numalim === numalimDest);
  const nomAlimB = primerOk?._nom_alim || feederB?.nom_alim || feederB?.nombre || '';
  const troncalB = primerOk?._equipos_troncal ?? [];
  tspCargarEquiposB(numalimDest, nomAlimB, troncalB);
}

// ── RESULTADOS LZ: TABLAS Y PANELES ───────────────────────────────────────
// Tabla de equipos troncales usada en el panel de resultados
function _vccReceptorBlock(equipos) {
  if (!equipos?.length) return "";
  const BADGE_CLS = { viable:"badge-viable", prealerta:"badge-prealerta", critico:"badge-critico", sin_cn:"bg-secondary" };
  const BADGE_LBL = { viable:"Viable", prealerta:"Prealerta", critico:"Crítico", sin_cn:"Sin ajuste" };
  const estadoGlobal = equipos.reduce((worst, e) => {
    const ord = { critico:3, prealerta:2, viable:1, sin_cn:0 };
    return (ord[e.estado] ?? 0) > (ord[worst] ?? 0) ? e.estado : worst;
  }, "sin_cn");
  return `<details class="mt-1">
    <summary class="d-flex align-items-center gap-2 py-1" style="cursor:pointer;list-style:none;font-size:.9rem">
      <i class="bi bi-diagram-3 text-warning"></i>
      <span class="fw-semibold">Equipos troncales del receptor</span>
      <span class="badge ${BADGE_CLS[estadoGlobal] || "bg-secondary"} ms-1">${BADGE_LBL[estadoGlobal] || estadoGlobal}</span>
    </summary>
    <div class="mt-1">
      <p class="small text-muted mb-1">
        <i class="bi bi-info-circle me-1"></i>
        I<sub>eq</sub>[mes] = I<sub>alim B</sub>[mes] × fracción + I<sub>isla</sub>[mes]
      </p>
      ${vccTablaEquipos(equipos, null)}
    </div>
  </details>`;
}

function _htmlTablaEquiposTroncal(equipos) {
  if (!equipos?.length) return "";
  const filas = equipos.map(eq => {
    const t = _tipoEquipoTroncal(eq);
    const esRec = eq.slice(0,3).toUpperCase() === "REC";
    const label = esRec ? "Reconectador" : t.label;
    const color = esRec ? "danger"        : t.color;
    const nota  = esRec
      ? `<span class="text-danger small"><i class="bi bi-exclamation-triangle-fill me-1"></i>Equipo de protección — puede disparar ante sobrecarga</span>`
      : (t.msg ? `<span class="text-${t.color} small">${t.msg}</span>` : "");
    return `<tr>
      <td><code>${eq}</code></td>
      <td><span class="badge bg-${color} text-${color === "warning" ? "dark" : "white"}">${label}</span></td>
      <td>${nota}</td>
    </tr>`;
  }).join("");
  return `<table class="table table-sm mb-0 small">
    <thead class="table-light"><tr><th>Equipo</th><th>Tipo</th><th>Observación</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>`;
}

function renderSecEquiposInvolucrados(data) {
  const el = document.getElementById("sec-equipos-involucrados");
  if (!el) return;

  const selDev = data.lz_info?.dispositivos?.find(d => d.seleccionado)
              || data.lz_info?.dispositivos?.[0];
  const troncal = ((selDev?.viable !== false) ? (selDev?.equipos_troncal || []) : [])
                  .filter(_esTroncalRelevante);
  const eqTsp   = data.equipos_traspasados || [];
  const camTopo = (data._extras?.cambio_topologico || "").trim();

  const partes = [];

  if (troncal.length) {
    const tieneRec = troncal.some(eq => eq.slice(0,3).toUpperCase() === "REC");
    const tieneReg = troncal.some(eq => eq.slice(0,3).toUpperCase() === "REG");
    const iconoTroncal = (tieneRec || tieneReg) ? "bi-exclamation-triangle text-warning" : "bi-diagram-3 text-muted";
    const numposLZ = selDev?.numpos_lz || "";
    partes.push(`<details class="card step-card mb-2" open>
      <summary class="step-header d-flex align-items-center gap-2" style="cursor:pointer;list-style:none">
        <i class="bi ${iconoTroncal}"></i>
        <span>Equipos troncales en alimentador receptor</span>
        <span class="badge bg-secondary ms-1">${troncal.length}</span>
        ${numposLZ ? `<span class="text-white-50 small ms-auto">vía ${numposLZ}</span>` : ""}
      </summary>
      <div class="step-body p-2">
        <p class="small text-muted mb-2">Equipos en el camino troncal entre el LZ y la cabecera del alimentador receptor. La carga traspasada circulará a través de ellos.</p>
        ${_htmlTablaEquiposTroncal(troncal)}
      </div>
    </details>`);
  }

  if (eqTsp.length || camTopo) {
    const nItems  = eqTsp.length + (camTopo ? 1 : 0);
    const invHtml = eqTsp.length ? `
      <div class="mb-2">
        <div class="fw-semibold small mb-1 text-info">
          <i class="bi bi-arrow-left-right me-1"></i>Posible inversión de flujo
        </div>
        <table class="table table-sm mb-0 small">
          <thead class="table-light"><tr><th>Equipo</th><th>Tipo</th></tr></thead>
          <tbody>${eqTsp.map(e => `<tr>
            <td><code>${e.nombre}</code></td>
            <td><span class="badge bg-warning text-dark">${e.tipo}</span></td>
          </tr>`).join("")}</tbody>
        </table>
        <p class="small text-muted mt-1 mb-0">Estos equipos quedan dentro de la isla y recibirán corriente desde la dirección opuesta a la habitual.</p>
      </div>` : "";
    const topoHtml = camTopo ? `
      <div>
        <div class="fw-semibold small mb-1 text-warning-emphasis">
          <i class="bi bi-diagram-2 me-1"></i>Cambio topológico previo
        </div>
        <p class="small mb-0">${camTopo}</p>
      </div>` : "";
    partes.push(`<details class="card step-card mb-2" open>
      <summary class="step-header d-flex align-items-center gap-2" style="cursor:pointer;list-style:none">
        <i class="bi bi-exclamation-triangle text-warning"></i>
        <span>Equipos en isla a vigilar</span>
        <span class="badge bg-warning text-dark ms-1">${nItems}</span>
      </summary>
      <div class="step-body p-2">${invHtml}${topoHtml}</div>
    </details>`);
  }

  el.innerHTML = partes.join("");
}

function renderPanelLZ(lz, nombreOrig, nombreDest) {
  const el = document.getElementById("panel-lz");
  if (!el) return;
  if (!lz || lz.tiene_lz === null) { el.style.display = "none"; return; }

  const TIPO_LABEL = {
    bilateral:          "Bilateral",
    subterraneo_3ramas: "Equipo subterráneo de 3 ramas",
  };

  if (!lz.tiene_lz) {
    el.innerHTML = `<div class="alert alert-danger py-2 mb-0 small">
      <i class="bi bi-x-circle me-1"></i>
      <strong>Sin límite de zona físico</strong> entre <em>${nombreOrig}</em> y <em>${nombreDest}</em> —
      no existe un dispositivo operable entre estos alimentadores.
    </div>`;
    el.style.display = "";
    return;
  }

  const _brSim = state.ultimaSimulacion?.body_request || {};
  const _eqAbre = (_brSim.tipo_isla === "equipo" && _brSim.equipo_nombre)
    ? _brSim.equipo_nombre.toUpperCase().trim() : null;

  const _islaB = d => {
    if (!_eqAbre) return "";
    if (!d.equipos_troncal_orig?.length) {
      return ` <span class="badge bg-secondary text-white" title="Sin datos de troncal origen — verificar manualmente si este LZ pertenece a la isla">Verificar</span>`;
    }
    const enIsla = d.equipos_troncal_orig.some(eq => eq.toUpperCase().trim() === _eqAbre);
    return enIsla
      ? ` <span class="badge bg-info text-dark" title="LZ encontrado en camino troncal aguas abajo del equipo que abre">En isla ✓</span>`
      : ` <span class="badge bg-warning text-dark" title="No encontrado en camino troncal — verificar si pertenece a la isla">Verificar</span>`;
  };

  // Dispositivo seleccionado al frente; el resto en detalle colapsado
  const selDev = lz.dispositivos.find(d => d.seleccionado) || lz.dispositivos[0];
  const otros  = lz.dispositivos.filter(d => d !== selDev);

  // Color/icono/título según el dispositivo seleccionado
  let colorBase, icono, titulo;
  if (selDev.viable === false) {
    colorBase = "danger";  icono = "bi-x-circle";
    titulo = "Límite de zona — No viable";
  } else if (selDev.tipo === "subterraneo_3ramas") {
    colorBase = "warning"; icono = "bi-exclamation-triangle";
    titulo = "Límite de zona disponible — Equipo subterráneo de 3 ramas";
  } else {
    colorBase = "success"; icono = "bi-check-circle";
    titulo = "Límite de zona disponible";
  }

  const _renderDev = (d, compact = false) => {
    const tipoLabel = TIPO_LABEL[d.tipo] || d.tipo;
    const devColor  = d.viable === false ? "danger" : (d.tipo === "subterraneo_3ramas" ? "warning" : "success");
    const exceLabel = d.excepcion
      ? ` <span class="badge bg-secondary ms-1" style="font-size:.65rem" title="Registro corregido respecto a BD">BD corr.</span>` : "";

    if (compact) {
      const vl = d.viable === false
        ? ` <span class="badge bg-danger text-white" style="font-size:.65rem">No viable</span>` : "";
      return `<div class="d-flex align-items-center gap-1 py-1" style="border-top:1px solid rgba(0,0,0,.1)">
        <code class="text-body-secondary">${d.numpos_lz}</code>
        <span class="badge bg-${devColor} text-${devColor === "warning" ? "dark" : "white"}" style="font-size:.65rem">${tipoLabel}</span>
        ${exceLabel}${_islaB(d)}${vl}
      </div>`;
    }

    let viableHtml = "";
    if (d.viable === false) {
      viableHtml = `<div class="small text-danger mt-1">
        <i class="bi bi-info-circle me-1"></i>Conecta en cabecera del alimentador receptor — sin punto de aislamiento.
      </div>`;
    }
    let extra = "";
    if (d.tipo === "subterraneo_3ramas" && d.tercero && d.viable !== false) {
      extra = `<div class="text-warning-emphasis small mt-1">
        <i class="bi bi-exclamation-triangle me-1"></i>
        También conecta con <strong>${d.tercero.nombre}</strong> — verificar disponibilidad operacional.
      </div>`;
    }
    const troncalHtml = (d.viable !== false && d.equipos_troncal?.length)
      ? _htmlEquiposTroncal(d.equipos_troncal) : "";

    return `<div class="d-flex align-items-center gap-1 flex-wrap">
        <code class="fw-bold">${d.numpos_lz}</code>
        <span class="badge bg-${devColor} text-${devColor === "warning" ? "dark" : "white"}">${tipoLabel}</span>
        ${exceLabel}${_islaB(d)}
      </div>
      ${viableHtml}${extra}${troncalHtml}`;
  };

  const otrosHtml = otros.length
    ? `<details class="mt-2">
        <summary class="small text-muted" style="cursor:pointer">
          <i class="bi bi-list-ul me-1"></i>Ver todos los LZ disponibles (${lz.dispositivos.length})
        </summary>
        <div class="ms-1 mt-1">${otros.map(d => _renderDev(d, true)).join("")}</div>
      </details>` : "";

  el.innerHTML = `<div class="alert alert-${colorBase} py-2 mb-0 small">
    <div class="fw-semibold mb-1"><i class="bi ${icono} me-1"></i>${titulo}</div>
    ${_renderDev(selDev)}
    ${otrosHtml}
  </div>`;
  el.style.display = "";
}

// ── TRAFOS DISPONIBLES ────────────────────────────────────────────────────
let _trafosData = [];  // [{numalim, nombre, cn, subestacion}]

async function cargarTrafos() {
  try {
    _trafosData = await apiFetch("/api/subestaciones");
    const sel = document.getElementById("nuevo-numalim-trafo");
    if (!sel) return;
    sel.innerHTML = `<option value="">Transformador de potencia asociado (opcional)</option>` +
      _trafosData.map(t => {
        const cnStr = t.cn != null ? ` — CN: ${t.cn.toFixed(0)} A` : "";
        const subStr = t.subestacion ? ` [${t.subestacion}]` : "";
        return `<option value="${t.numalim}">${t.nombre}${subStr}${cnStr}</option>`;
      }).join("");
  } catch (e) {
    console.warn("[trafos] No se pudieron cargar:", e);
  }
}

function toggleCrearFeeder(e) {
  e.preventDefault();
  const el = document.getElementById("form-crear-feeder");
  const abriendo = el.style.display === "none";
  el.style.display = abriendo ? "" : "none";
  if (abriendo && _trafosData.length === 0) cargarTrafos();
}

// ── SIMULACIÓN ────────────────────────────────────────────────────────────
async function ejecutarSimulacion() {
  ocultarErrorSim();
  const modo     = document.querySelector('input[name="tipo-isla"]:checked').value;
  const tipoDest = document.querySelector('input[name="tipo-dest"]:checked').value;
  const mesesSel = mesesSeleccionados();

  dbg("▶ Simulación iniciada");
  dbg(`  origen numalim=${state.origenNumalim} nom_alim=${state.origenNomAlim}`);
  dbg(`  modo=${modo} dest=${tipoDest} meses=${mesesSel.length}`);

  if (mesesSel.length === 0) {
    dbg("✗ Sin meses seleccionados", "error");
    return mostrarErrorSim("Selecciona al menos un mes para el análisis.");
  }

  // Armar body
  const body = {
    numalim_orig:  state.origenNumalim,
    nom_alim_orig: state.origenNomAlim,
    tipo_isla:      modo,
    equipo_nombre:  modo === "equipo" ? (ts.equipo?.getValue() || "") : "",
    tds_numpos:     modo === "tds"
      ? [...document.querySelectorAll(".td-chk:checked")].map(c => c.value)
      : [],
    tipo_dest:     tipoDest,
    meses_sel:     mesesSel,
    descripcion:   document.getElementById("inp-descripcion").value.trim(),
    escenario:     document.querySelector('input[name="escenario-op"]:checked')?.value || "normal",
    equipo_cierra: document.getElementById("inp-equipo-cierra").value.trim(),
    numpos_lz_sel:  state.selectedNumposLZ || null,
  };

  // TDs excluidos en modo equipo (sub-panel activo)
  if (modo === "equipo" && document.getElementById("panel-tds-equipo").style.display !== "none") {
    const excluidos = getEquipoTDsExcluidos();
    if (excluidos.length > 0) body.tds_excluidos = excluidos;
  }

  if (tipoDest === "excel") {
    body.numalim_dest = parseInt(ts.destino?.getValue());
    const equiposB = tspLeerEquiposB();
    if (equiposB.length) body.equipos_b = equiposB;
  } else {
    const selNuevo    = ts.feederNuevo?.getValue();
    const formVisible = document.getElementById("form-crear-feeder").style.display !== "none";
    if (formVisible) {
      body.tipo_dest                    = "nuevo_crear";
      body.feeder_nuevo_nombre          = document.getElementById("nuevo-nombre").value.trim().toUpperCase();
      body.feeder_nuevo_cn              = parseFloat(document.getElementById("nuevo-cn").value);
      const numalimTrafoEl              = document.getElementById("nuevo-numalim-trafo");
      body.feeder_nuevo_numalim_trafo   = numalimTrafoEl ? parseInt(numalimTrafoEl.value) || null : null;
    } else {
      body.feeder_nuevo_nombre = selNuevo || "";
    }
  }

  // Validaciones básicas
  if (body.numalim_orig == null) return mostrarErrorSim("Selecciona un alimentador origen.");
  if (modo === "equipo" && !body.equipo_nombre) return mostrarErrorSim("Selecciona un equipo.");
  if (modo === "tds" && body.tds_numpos.length === 0) return mostrarErrorSim("Selecciona al menos un TD.");
  if (tipoDest === "excel" && isNaN(body.numalim_dest)) return mostrarErrorSim("Selecciona el alimentador destino.");
  if (tipoDest === "nuevo" && !body.feeder_nuevo_nombre) return mostrarErrorSim("Selecciona o crea un alimentador en comisionamiento.");

  // P2: en corrimiento adjuntar delta acumulado del caso anterior como baseline del origen
  if (state.esCorrimiento && state.cadenaSimulaciones.length > 0) {
    const prevSim    = state.cadenaSimulaciones[state.cadenaSimulaciones.length - 1];
    const prevDeltas = prevSim?.delta?.serie_deltas;
    if (prevDeltas && Object.keys(prevDeltas).length > 0) {
      body.delta_acum_orig = prevDeltas;
    }
    // Indicar si caso anterior era misma barra (para omitir delta en trafo del origen)
    body.delta_acum_orig_misma_barra = prevSim?.misma_barra_se ?? false;
  }

  dbg(`  body: numalim_orig=${body.numalim_orig} tipo_isla=${body.tipo_isla} equipo="${body.equipo_nombre}" numalim_dest=${body.numalim_dest}`);
  spinner(true, "Calculando traspaso...");
  try {
    dbg("  → POST /api/simular ...");
    const resp = await fetch("/api/simular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    dbg(`  ← HTTP ${resp.status} ${resp.ok ? "OK" : "ERROR"}`, resp.ok ? "info" : "warn");
    const data = await resp.json();
    if (data.error) {
      dbg(`✗ Error servidor: ${data.error}`, "error");
      mostrarErrorSim(data.error);
      return;
    }
    dbg(`✓ Respuesta OK — delta_max=${data.delta?.delta_max?.toFixed(1)}A meses=${data.tabla?.length}`, "ok");
    data._extras = {
      descripcion:       document.getElementById("inp-descripcion")?.value.trim() || "",
      cambio_topologico: document.getElementById("inp-cambio-topo")?.value.trim() || "",
      equipo_cierra:     body.equipo_cierra || "",
    };

    // Cadena de corrimiento
    if (!state.esCorrimiento && !state.esRecalculo) {
      limpiarCadena();
      state.numeroCaso = 1;
    }
    // Si esCorrimiento: colapsarCasoActual() y numeroCaso++ ya se hicieron en precargarCorrimiento
    // Si esRecalculo: numeroCaso y cadena ya fueron preparados por recalcularConAjuste()
    state.esCorrimiento  = false;
    state.esRecalculo    = false;
    data._numero_caso    = state.numeroCaso;
    state.cadenaSimulaciones.push({ ...data, body_request: body });

    state.ultimaSimulacion = { ...data, body_request: body };
    mostrarResultados(data);

    // Banner caso actual
    const _banner = document.getElementById("caso-banner");
    if (_banner) {
      const _bc = _CASO_COLORS[(state.numeroCaso - 1) % _CASO_COLORS.length];
      _banner.innerHTML = `<div style="background:${_bc};color:#fff;padding:10px 18px;border-radius:6px;font-weight:700;font-size:1.05em">
        Caso ${state.numeroCaso}: ${data.nombre_orig} → ${data.nombre_dest}
      </div>`;
      _banner.style.display = "";
    }

    // Restablecer origen al terminar cada simulación
    if (ts.origen) ts.origen.enable();
    const _oN = document.getElementById("corrimiento-origen-notice");
    if (_oN) { _oN.innerHTML = ""; _oN.style.display = "none"; }
    const _iN = document.getElementById("corrimiento-isla-notice");
    if (_iN) { _iN.innerHTML = ""; _iN.style.display = "none"; }
  } catch (e) {
    dbg(`✗ Excepción fetch: ${e.message}`, "error");
    mostrarErrorSim("Error de conexión: " + e.message);
  } finally {
    spinner(false);
  }
}

// ── CORRIMIENTOS DE CARGA ─────────────────────────────────────────────────
const _CASO_COLORS = ["#1565c0", "#e65100", "#1b5e20"];

async function renderPanelCorrimiento(numalimDest, nombreDest) {
  const el    = document.getElementById("panel-corrimiento");
  const detEl = document.getElementById("det-corrimiento");
  const _hide = () => { if (detEl) detEl.style.display = "none"; };
  if (!el || numalimDest == null) { _hide(); return; }

  if (state.numeroCaso >= 3) { _hide(); return; }

  const candidatos = await apiFetch(`/api/corrimiento_candidatos/${numalimDest}`);
  if (!candidatos?.length) { _hide(); return; }

  const filas = candidatos.map(c => {
    const rem    = c.remanente_A;
    const pct    = c.remanente_pct;
    const remTxt = rem != null ? `${rem.toFixed(1)} A` : "—";
    const pctTxt = pct != null ? `${pct.toFixed(1)}%` : "—";
    const colorBg = pct == null ? "secondary" : pct >= 20 ? "success" : pct >= 5 ? "warning" : "danger";
    const cxBadge = c.tiene_vecinos_lz
      ? `<span class="badge bg-info text-dark ms-1" title="${c.n_vecinos_lz} vecino(s) disponibles para corrimiento posterior">→ C→X</span>`
      : "";
    return `<tr style="cursor:pointer" title="Clic para precargar corrimiento hacia ${c.nombre}"
              onclick="precargarCorrimiento(${numalimDest}, ${c.numalim}, ${c.remanente_pct ?? null}, ${c.remanente_A ?? null})">
      <td><span class="fw-semibold">${c.nombre}</span>${cxBadge}</td>
      <td class="text-end"><span class="badge bg-${colorBg} text-${colorBg === 'warning' ? 'dark' : 'white'}">${remTxt}</span></td>
      <td class="text-end text-muted small">${pctTxt}</td>
    </tr>`;
  }).join("");

  el.innerHTML = `<div class="card step-card">
    <div class="step-header">
      <i class="bi bi-arrow-repeat me-1" style="color:#1565c0"></i>
      <span class="fw-semibold">Corrimiento de carga — candidatos desde ${nombreDest}</span>
    </div>
    <div class="step-body p-2">
      <p class="small text-muted mb-2">Selecciona un alimentador destino para continuar la cadena de corrimiento:</p>
      <table class="table table-sm table-hover mb-0" style="font-size:.85rem">
        <thead><tr><th>Alimentador</th><th class="text-end">Remanente</th><th class="text-end">%</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  </div>`;
  if (detEl) detEl.style.display = "";
}

async function precargarCorrimiento(numalimB, numalimC, remanenteC, remanenteA) {
  state.pendingPreselectDest = numalimC;
  state.esCorrimiento        = true;

  if (state.cadenaSimulaciones.length > 0) {
    colapsarCasoActual();
    state.numeroCaso++;
  }

  const feederB = state.feedersData.find(f => f.numalim == numalimB);
  const nombreB = feederB?.nombre || String(numalimB);
  const nombreC = state.feedersData.find(f => f.numalim == numalimC)?.nombre || String(numalimC);
  const nCaso   = state.numeroCaso;
  const bc      = _CASO_COLORS[(nCaso - 1) % _CASO_COLORS.length];

  const origNotice = document.getElementById("corrimiento-origen-notice");
  if (origNotice) {
    origNotice.innerHTML = `<div class="alert py-2 px-3 mb-0 mt-2 small" style="background:${bc}18;border-left:4px solid ${bc};border-radius:4px">
      <i class="bi bi-arrow-repeat me-1" style="color:${bc}"></i>
      <strong style="color:${bc}">Caso ${nCaso} — Corrimiento de carga</strong><br>
      <span class="text-muted">Origen fijado en <strong>${nombreB}</strong>. No se puede cambiar durante el corrimiento.</span>
    </div>`;
    origNotice.style.display = "";
  }

  // Mostrar aviso de isla inmediatamente con spinner de sugerencia
  const islaNotice = document.getElementById("corrimiento-isla-notice");
  if (islaNotice) {
    islaNotice.innerHTML = `<div class="alert py-2 px-3 mb-0 small" style="background:${bc}18;border-left:4px solid ${bc};border-radius:4px">
      <i class="bi bi-arrow-right me-1" style="color:${bc}"></i>
      <strong style="color:${bc}">Corrimiento:</strong>
      <span class="text-muted"> ${nombreB} → <strong>${nombreC}</strong></span>
      ${remanenteC != null
        ? `<div id="corrimiento-equipo-sugerido" class="mt-1 text-muted">
             <i class="bi bi-hourglass-split me-1"></i>Calculando equipo sugerido...
           </div>`
        : ""}
    </div>`;
    islaNotice.style.display = "";
  }

  if (ts.origen) {
    ts.origen.setValue(String(numalimB));
    ts.origen.disable();
  }

  const tabSimular = document.getElementById("tab-simular");
  if (tabSimular) bootstrap.Tab.getOrCreateInstance(tabSimular).show();

  // Fetch async de equipos de B para calcular sugerencia
  const nomAlimB = feederB?.nom_alim || feederB?.nombre;
  if (remanenteC != null && nomAlimB) {
    try {
      const equipos = await apiFetch(`/api/feeder/${encodeURIComponent(nomAlimB)}/equipos`);
      // Demanda efectiva máx de B: si viene de un caso anterior, usar I_dest_despues de esa sim.
      // Eso captura el delta acumulado de A→B ya incorporado en B.
      const prevSim = state.cadenaSimulaciones.length > 0
        ? state.cadenaSimulaciones[state.cadenaSimulaciones.length - 1] : null;
      let maxDemandB = null;
      if (prevSim?.tabla?.length) {
        const vals = prevSim.tabla.map(r => r.I_dest_despues ?? r.I_dest_antes).filter(v => v != null);
        if (vals.length) maxDemandB = Math.max(...vals);
      }
      const sug = _sugerirEquipoCorrimiento(equipos, remanenteC, remanenteA, maxDemandB);
      const elSug = document.getElementById("corrimiento-equipo-sugerido");
      if (elSug) {
        if (sug) {
          const prevSim2 = state.cadenaSimulaciones.length > 0
            ? state.cadenaSimulaciones[state.cadenaSimulaciones.length - 1] : null;
          let maxDemB2 = null;
          if (prevSim2?.tabla?.length) {
            const vs = prevSim2.tabla.map(r => r.I_dest_despues ?? r.I_dest_antes).filter(v => v != null);
            if (vs.length) maxDemB2 = Math.max(...vs);
          }
          const deltaEst = (maxDemB2 != null)
            ? ` ≈ ${(maxDemB2 * sug.pct_feeder / 100).toFixed(1)} A estimado`
            : "";
          elSug.innerHTML = `<i class="bi bi-lightbulb-fill text-warning me-1"></i>
            Sugerido abrir <strong><code>${sug.nombre}</code></strong>
            <span class="badge bg-secondary ms-1">${sug.pct_feeder.toFixed(1)}% de ${nombreB}${deltaEst}</span>
            <span class="text-muted ms-1">— remanente ${nombreC}: ${remanenteA != null ? remanenteA.toFixed(1)+' A' : remanenteC.toFixed(1)+'%'}</span>`;
        } else {
          elSug.innerHTML = `<span class="text-muted"><i class="bi bi-dash me-1"></i>Sin equipo sugerido para este rango de carga</span>`;
        }
      }
    } catch (_) {
      const elSug = document.getElementById("corrimiento-equipo-sugerido");
      if (elSug) elSug.remove();
    }
  }
}

function _sugerirEquipoCorrimiento(equipos, remanenteC, remanenteA, maxDemandB) {
  if (!equipos?.length || remanenteC == null) return null;

  const validos = equipos.filter(e => e.pct_feeder != null && e.pct_feeder > 0);
  if (!validos.length) return null;

  let candidatos;
  if (remanenteA != null && maxDemandB != null && maxDemandB > 0) {
    // Comparación en amperes: delta_estimado = maxDemandB × p ≤ remanenteA
    candidatos = validos.filter(e => (maxDemandB * e.pct_feeder / 100) <= remanenteA);
  } else {
    // Fallback: comparación porcentual (solo válida si CN_B ≈ CN_C)
    candidatos = validos.filter(e => e.pct_feeder <= remanenteC);
  }

  if (!candidatos.length) return null;
  return candidatos.reduce((best, e) => e.pct_feeder > best.pct_feeder ? e : best);
}

function limpiarCadena() {
  state.cadenaSimulaciones = [];
  state.numeroCaso = 0;
  const el = document.getElementById("cadena-casos");
  if (el) el.innerHTML = "";
  const banner = document.getElementById("caso-banner");
  if (banner) { banner.innerHTML = ""; banner.style.display = "none"; }
  if (ts.origen) ts.origen.enable();
  const origNotice = document.getElementById("corrimiento-origen-notice");
  if (origNotice) { origNotice.innerHTML = ""; origNotice.style.display = "none"; }
  const islaNotice = document.getElementById("corrimiento-isla-notice");
  if (islaNotice) { islaNotice.innerHTML = ""; islaNotice.style.display = "none"; }
}

function colapsarCasoActual() {
  const contenido = document.getElementById("resultado-contenido");
  const sim       = state.cadenaSimulaciones[state.cadenaSimulaciones.length - 1];
  if (!contenido || contenido.style.display === "none" || !sim) return;

  const n        = state.numeroCaso;
  const pct      = sim.isla?.p_pct?.toFixed(1) ?? "—";
  const _cnt     = sim.resumen?.conteo || {};
  const estado   = _cnt.critico > 0 ? "critico" : _cnt.prealerta > 0 ? "prealerta" : "viable";
  const colorEst = estado === "critico" ? "danger" : estado === "prealerta" ? "warning" : "success";
  const labelEst = estado === "critico" ? "Crítico" : estado === "prealerta" ? "Prealerta" : "Viable";
  const numpos   = sim.lz_info?.numpos_lz_sel ? ` · Equipo: <code>${sim.lz_info.numpos_lz_sel}</code>` : "";
  const bc       = _CASO_COLORS[(n - 1) % _CASO_COLORS.length];

  // Clonar DOM y convertir canvas a imágenes estáticas (innerHTML no preserva canvas pintado)
  const clone = contenido.cloneNode(true);
  clone.removeAttribute("id");
  clone.style.removeProperty("display");

  const canvasesOrig  = contenido.querySelectorAll("canvas");
  const canvasesClone = clone.querySelectorAll("canvas");
  canvasesOrig.forEach((cv, idx) => {
    const cloneCV = canvasesClone[idx];
    if (!cloneCV) return;
    try {
      const img = document.createElement("img");
      img.src   = cv.toDataURL("image/png");
      img.style.maxWidth = "100%";
      img.style.display  = "block";
      cloneCV.replaceWith(img);
    } catch (e) { cloneCV.remove(); }
  });

  // Renombrar IDs para evitar duplicados en el DOM
  clone.querySelectorAll("[id]").forEach(el => { el.id = `_c${n}_${el.id}`; });

  const details = document.createElement("details");
  details.className = "card step-card mb-2";
  details.style.borderLeft   = `4px solid ${bc}`;
  details.style.borderRadius = "6px";

  const summary = document.createElement("summary");
  summary.className = "step-header d-flex align-items-center gap-2";
  summary.style.cssText = `cursor:pointer;list-style:none;background:${bc}18;border-radius:6px`;
  summary.innerHTML = `
    <i class="bi bi-chevron-right" style="font-size:.75em;transition:transform .2s" id="_chev-c${n}"></i>
    <span class="fw-semibold" style="color:${bc}">Caso ${n}: ${sim.nombre_orig} → ${sim.nombre_dest}</span>
    <span class="badge bg-${colorEst} text-${colorEst === 'warning' ? 'dark' : 'white'}">${labelEst}</span>
    <span class="small text-muted">${pct}% traspasado${numpos}</span>`;

  const bodyDiv = document.createElement("div");
  bodyDiv.className = "step-body p-0";
  bodyDiv.appendChild(clone);

  details.appendChild(summary);
  details.appendChild(bodyDiv);

  details.addEventListener("toggle", () => {
    const chev = details.querySelector(`#_chev-c${n}`);
    if (chev) chev.style.transform = details.open ? "rotate(90deg)" : "";
  });

  document.getElementById("cadena-casos").appendChild(details);
  contenido.style.display = "none";
}

