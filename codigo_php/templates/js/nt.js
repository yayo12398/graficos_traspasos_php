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
        text:        (f.frg ? '[FRG] ' : '') + f.nombre,
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
  const frgBadgeEl = document.getElementById("orig-frg-badge");
  if (frgBadgeEl) frgBadgeEl.style.display = feeder?.frg ? "" : "none";
  // Reset pasos siguientes
  document.getElementById("card-isla").style.display = "";
  document.getElementById("card-destino").style.display = "none";
  document.getElementById("card-simular").style.display = "none";
  // Limpiar campos de texto del caso anterior (no arrastrar descripción / cambio
  // topológico / equipo que cierra entre casos de un corrimiento).
  ["inp-descripcion", "inp-cambio-topo", "inp-equipo-cierra"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  // Limpiar sugerencias TLC previas (el switch conserva su estado)
  state._sugTraspaso = [];
  const _sugCont = document.getElementById("sugerencias-traspaso");
  if (_sugCont) _sugCont.innerHTML = "";
  const _panelB = document.getElementById("panel-equipos-b");
  if (_panelB) _panelB.style.display = "none";
  state.troncalBNomAlim = null; state.troncalBEnriquecido = []; state.equiposConfigB = {}; state.alimConfigB = null;
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
        Agrega un mapeo en la pestaña <strong>Mapeos de Nombres</strong> para seleccionar el segmento.
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

  // Mapa de prioridad para el tiebreaker de sort (por tipo de ATR).
  // El flag de tensión por equipo viene del backend (e.tension_kv).
  const atPrioMap = {};
  for (const at of autotrafos) {
    const tipo = at.tipo ?? 'reductor';
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
    // Flag de tensión por equipo (segmento del ATR, incluye PPF y todos los tipos).
    const atSfx  = e.tension_kv != null ? ` · ⚡ ${e.tension_kv}kV` : '';
    const tlcSfx = e.tlc ? ' <span style="font-size:.68rem;color:#198754;font-weight:700">[TLC]</span>' : '';
    return { value: e.nombre, text: nom, label: `${_eqIcon(nom)} ${nom}${pctStr}${atSfx}${tlcSfx}` };
  });

  // Separadores: reductor → después de rec_alta (o antes de rec_baja si sin alta); elevador → después de rec_baja
  const sepInserts = [];
  for (const at of autotrafos) {
    const tipo  = at.tipo ?? 'reductor';
    const tens  = at.tension_alta ?? 23;
    const label = tipo === 'elevador'
      ? `⚡ Autotrafo — 12kV arriba · ${tens}kV abajo`
      : `⚡ Autotrafo — ${tens}kV arriba · 12kV abajo`;
    if (at.rec_alta) {
      const alta   = at.rec_alta.trim().toUpperCase();
      const anchor = tipo === 'elevador' ? (at.rec_baja ?? '').trim().toUpperCase() : alta;
      if (!anchor) continue;
      const idx = opts.findIndex(o => o.text === anchor);
      if (idx >= 0) sepInserts.push({ idx, label, alta });
    } else if (at.rec_baja && tipo === 'reductor') {
      // Sin rec_alta: feeder nace en alta — separador justo antes de rec_baja
      const bajaKey = at.rec_baja.trim().toUpperCase();
      const bajaIdx = opts.findIndex(o => o.text === bajaKey);
      if (bajaIdx > 0) sepInserts.push({ idx: bajaIdx - 1, label, alta: bajaKey });
    }
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
  // Lista colapsada por defecto — el resumen muestra el conteo; se expande con clic
  lista.style.display = "none";
  document.getElementById("tds-equipo-chevron").style.transform = "rotate(-90deg)";
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
    _mostrarAlertaZonaATR(data.v_lz, data.atr_boundary);
  } catch { ocultarPreviewIsla(); }
}

function ocultarPreviewIsla() {
  document.getElementById("isla-preview").style.display = "none";
  _mostrarAlertaInversion([]);
  _mostrarAlertaZonaATR(23, null);
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

function _mostrarAlertaZonaATR(vLz, boundary) {
  const alerta = document.getElementById("alerta-zona-atr");
  if (!alerta) return;
  if (!vLz || vLz >= 23) { alerta.style.display = "none"; return; }
  document.getElementById("alerta-zona-atr-equipo").textContent = boundary ? `(${boundary})` : "";
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
      text: `${d.frg ? '[FRG] ' : ''}${d.nombre}  (CN=${d.cn?.toFixed(0) ?? "?"} A)`,
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
// Clasifica destinos según su relación LZ con el origen.
// equipoAbre (opcional): solo cuentan LZ cuyo troncal-origen incluye ese equipo.
// Retorna { viable:[], noViable:[] } con objetos de state.destinosData.
// - viable   : al menos un LZ hacia ese destino tiene troncal (viable) en el receptor.
// - noViable : hay LZ hacia el destino pero ninguno viable (sin troncal en BD) → forzable.
function _clasificarDestinosLZ(equipoAbre = null) {
  const eqUp = equipoAbre ? equipoAbre.toUpperCase().trim() : null;
  const lzRelevantes = eqUp
    ? state.lzVecinos.filter(lz =>
        lz.equipos_troncal_orig?.some(e => e.toUpperCase().trim() === eqUp))
    : state.lzVecinos;

  const estado = new Map(); // numalim → 'viable' | 'no_viable'  (LZ ligados al segmento)
  lzRelevantes.forEach(lz => (lz.vecinos || []).forEach(v => {
    if (v.viable !== false) estado.set(v.numalim, 'viable');
    else if (estado.get(v.numalim) !== 'viable') estado.set(v.numalim, 'no_viable');
  }));

  // Todos los vecinos LZ del origen (sin filtrar por equipo) → para el grupo forzable.
  const neighborsAll = new Set();
  state.lzVecinos.forEach(lz => (lz.vecinos || []).forEach(v => neighborsAll.add(v.numalim)));

  const g = { viable: [], noViable: [], sinSegmento: [] };
  state.destinosData.forEach(d => {
    const st = estado.get(d.numalim);
    if (st === 'viable')            g.viable.push(d);
    else if (st === 'no_viable')    g.noViable.push(d);
    else if (neighborsAll.has(d.numalim)) g.sinSegmento.push(d); // vecino LZ, no en este segmento
  });
  return g;
}

// (Re)construye el TomSelect de destino con grupos: viables primero, sin-troncal al final.
// Devuelve { grupos, selActual, sigueValida } para que el llamador arme el mensaje.
function _rebuildDropdownDestinos(equipoAbre = null) {
  state._ultimoEquipoAbre = equipoAbre;   // recordado para re-togglear la vista simple
  const g = _clasificarDestinosLZ(equipoAbre);
  const _txt = d => `${d.frg ? '[FRG] ' : ''}${d.nombre}  (CN=${d.cn?.toFixed(0) ?? "?"} A)`;
  const simple = !!state.modoSimple;   // en simple solo se ofrecen destinos con LZ viable (sin forzados)
  const options = [];
  g.viable.forEach(d      => options.push({ value: d.numalim, text: _txt(d), grupo: 'viable' }));
  if (!simple) {
    g.noViable.forEach(d    => options.push({ value: d.numalim, text: _txt(d), grupo: 'no_viable' }));
    g.sinSegmento.forEach(d => options.push({ value: d.numalim, text: _txt(d), grupo: 'sin_segmento' }));
  }

  // Vecinos LZ del origen no ligados al segmento → forzables con troncal manual.
  // En simple no se exponen: el set se vacía para no habilitar un forzado por otra vía.
  state.destinosSinSegmento = simple ? new Set() : new Set(g.sinSegmento.map(d => d.numalim));

  const selActual = ts.destino?.getValue() ? parseInt(ts.destino.getValue()) : null;
  if (ts.destino) ts.destino.destroy();
  ts.destino = new TomSelect("#sel-destino", {
    options,
    optgroups: [
      { value: 'viable',       label: 'Con LZ viable' },
      { value: 'no_viable',    label: 'Con LZ · sin troncal (forzar)' },
      { value: 'sin_segmento', label: 'Sin LZ en el segmento (forzar)' },
    ],
    optgroupField: 'grupo',
    lockOptgroupOrder: true,
    valueField: "value",
    labelField: "text",
    searchField: ["text"],
    maxOptions: 50,
    placeholder: "Buscar alimentador destino...",
    onChange: v => mostrarEquipoCierra(v ? parseInt(v) : null),
  });

  const sigueValida = selActual != null && options.some(o => o.value === selActual);
  if (sigueValida) ts.destino.setValue(String(selActual));
  return { grupos: g, selActual, sigueValida };
}

// Mensaje de estado bajo el selector de destino.
function _mensajeDestinosLZ(lzInfoEl, grupos, equipoAbre) {
  if (!lzInfoEl) return;
  const simple = !!state.modoSimple;
  const nV = grupos.viable.length, nNV = grupos.noViable.length, nSS = grupos.sinSegmento.length;
  const ecuacion = equipoAbre ? ` para equipo <code>${equipoAbre.toUpperCase()}</code>` : "";
  if (nV) {
    const icon    = equipoAbre ? "bi-funnel-fill text-primary" : "bi-geo-alt-fill text-success";
    const extra   = (!simple && nNV) ? ` · <span class="text-warning-emphasis">${nNV} sin troncal (forzar)</span>` : "";
    const extraSS = (!simple && nSS) ? ` · <span class="text-warning-emphasis">${nSS} sin LZ en el segmento (forzar)</span>` : "";
    lzInfoEl.innerHTML = `<i class="bi ${icon} me-1"></i>${nV} con LZ viable${extra}${extraSS}${ecuacion}`;
    lzInfoEl.className = "small text-success mt-1";
  } else if (simple && (nNV + nSS)) {
    // En simple hay caminos posibles pero solo forzados → no seleccionables aquí.
    lzInfoEl.innerHTML = `<i class="bi bi-lock me-1"></i>Sin LZ viable${ecuacion} — este traspaso `
      + `requiere <a href="#" onclick="toggleModoSimple(false);return false;">modo avanzado</a>`;
    lzInfoEl.className = "small text-warning-emphasis mt-1";
  } else {
    lzInfoEl.innerHTML = `<i class="bi bi-x-circle me-1"></i>Sin vecinos LZ${ecuacion} — este alimentador no puede traspasar`;
    lzInfoEl.className = "small text-danger mt-1";
  }
  lzInfoEl.style.display = "";
}

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

  const { grupos } = _rebuildDropdownDestinos(null);
  _mensajeDestinosLZ(lzInfoEl, grupos, null);

  if (state.pendingPreselectDest != null) {
    const pd = state.pendingPreselectDest;
    state.pendingPreselectDest = null;
    ts.destino.setValue(String(pd));
  }
}

// Reagrupa el TomSelect de destino según equipo que abre (null = todos los vecinos)
function filtrarDestinosPorEquipo(equipoAbre) {
  if (!state.lzVecinos?.length) return;
  const lzInfoEl = document.getElementById("lz-dest-info");

  const { grupos, selActual, sigueValida } = _rebuildDropdownDestinos(equipoAbre);
  _mensajeDestinosLZ(lzInfoEl, grupos, equipoAbre);

  if (!sigueValida && selActual != null) mostrarEquipoCierra(null); // destino cayó del filtro
}

// ── CLASIFICACIÓN EQUIPOS TRONCALES ───────────────────────────────────────
const _PREFIJOS_SUBT = ["ABB","G33","ORM","SCH","GMT","VIS","CGP","GLT"];
const _esTroncalRelevante = eq => {
  const p = (eq || "").slice(0, 3).toUpperCase();
  return _PREFIJOS_SUBT.includes(p) || ["PPF","REC","DBC","CLB","RTS"].includes(p);
};

// Badge de tipo por prefijo del nombre. El 'tipo' del backend agrupa aéreos y
// subterráneos como 'equipo_sub'; aquí se distingue por prefijo para etiquetar
// correctamente (p. ej. DBC/PPF/CLB/RTS = Aéreo, no Sub).
function _badgeTipoEquipo(nombre) {
  const p = (nombre || "").slice(0, 3).toUpperCase();
  if (p === "REC") return `<span class="badge bg-danger">REC</span>`;
  if (["DBC","PPF","CLB","RTS","VRS"].includes(p))
    return `<span class="badge bg-warning text-dark">Aéreo</span>`;
  if (_PREFIJOS_SUBT.includes(p)) return `<span class="badge bg-primary">Sub</span>`;
  return `<span class="badge bg-secondary">Otro</span>`;
}

// Versión texto (misma clasificación por prefijo).
function _labelTipoEquipo(nombre) {
  const p = (nombre || "").slice(0, 3).toUpperCase();
  if (p === "REC") return "Reconectador";
  if (["DBC","PPF","CLB","RTS","VRS"].includes(p)) return "Aéreo";
  if (_PREFIJOS_SUBT.includes(p)) return "Subterráneo";
  return "Otro";
}

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

// Badge TLC para límites de zona (telecontrol → maniobrable remotamente)
const _lzTlcBadge = d => d?.tlc
  ? ` <span class="badge bg-success" style="font-size:.65rem" title="Límite de zona telecontrolado — maniobrable remotamente"><i class="bi bi-broadcast me-1"></i>TLC</span>`
  : "";

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

  // Vecino LZ no ligado al segmento abierto → forzar con troncal manual (aunque el LZ
  // físico sea viable, el vínculo LZ↔segmento no está validado para este equipo).
  const sinSeg = state.destinosSinSegmento?.has(numalimDest) ?? false;

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

  // Preselección: conservar la elección actual si sigue siendo válida;
  // si no, preferir un LZ viable; y si ninguno es viable, forzar el primero.
  const yaSel = devs.find(d => d.numpos_lz === state.selectedNumposLZ);
  const primerOk = yaSel
                || devs.find(d => d._viable && d._enIsla !== false)
                || devs.find(d => d._viable)
                || devs[0];
  state.selectedNumposLZ = primerOk?.numpos_lz || null;

  const _badge = d => {
    const exc = d.excepcion
      ? ` <span class="badge bg-secondary" title="Registro corregido respecto a BD">BD corr.</span>`
      : "";
    // Solo se etiqueta el subterráneo de 3 ramas (verificar cuál operar);
    // "bilateral" es el caso por defecto y no aporta como badge.
    if (d.tipo !== "subterraneo_3ramas") return exc;
    return `<span class="badge bg-warning text-dark me-1">${TIPO_LABEL[d.tipo]}</span>${exc}`;
  };

  const _islaBadge = d => {
    if (d._enIsla === true)
      return ` <span class="badge bg-info text-dark" title="LZ encontrado en camino troncal aguas abajo del equipo que abre">En segmento ✓</span>`;
    if (d._enIsla === false)
      return ` <span class="badge bg-warning text-dark" title="No encontrado en camino troncal — verificar si pertenece al segmento">Verificar</span>`;
    return "";
  };

  // LZ sin troncal en BD → traspaso forzable sin validación topológica.
  const _forzarBadge = d => !d._viable
    ? ` <span class="badge bg-warning text-dark" title="La base no registra troncal en el receptor — traspaso forzable"><i class="bi bi-exclamation-triangle me-1"></i>Sin troncal · forzar</span>`
    : "";

  const _islaWarnTxt = d => d._enIsla === false
    ? `<div class="small text-warning-emphasis mt-1">
        <i class="bi bi-exclamation-triangle me-1"></i>No encontrado en el camino troncal del segmento — verificar si este LZ pertenece al segmento a traspasar.
       </div>`
    : "";

  // Aviso de traspaso forzado (LZ seleccionado sin troncal en BD).
  const _forzarWarn = d => (d && !d._viable)
    ? `<div class="alert alert-warning py-2 px-3 small mt-2 mb-0">
        <i class="bi bi-exclamation-triangle-fill me-1"></i>
        <strong>Traspaso forzado</strong> — la base no registra el troncal del receptor para este LZ.
        La simulación corre igual (impacto en alimentador y transformador), pero
        <strong>no se evalúan los equipos del receptor</strong> salvo que los ingreses manualmente en el panel del receptor.
       </div>`
    : "";

  if (devs.length === 1) {
    const d = devs[0];
    const icon = d._viable ? "bi-toggle-on text-primary" : "bi-toggle-on text-warning";
    el.innerHTML = `<i class="bi ${icon} me-1"></i>
      <span class="text-muted">Equipo que cierra:</span>
      <code class="ms-1 me-1">${d.numpos_lz}</code>${_badge(d)}${_islaBadge(d)}${_forzarBadge(d)}${_lzTlcBadge(d)}
      ${_islaWarnTxt(d)}
      ${_forzarWarn(d)}
      ${_htmlEquiposTroncal(d._equipos_troncal)}`;
  } else {
    const opciones = devs.map(d => {
      const checked    = d.numpos_lz === state.selectedNumposLZ ? "checked" : "";
      const extraBadge = d._viable ? _islaBadge(d) : _forzarBadge(d);
      return `<div class="form-check form-check-inline mb-0">
        <input class="form-check-input" type="radio" name="sel-numpos-lz"
               id="lz-radio-${d.numpos_lz}" value="${d.numpos_lz}" ${checked}
               onchange="state.selectedNumposLZ = this.value; mostrarEquipoCierra(${numalimDest})">
        <label class="form-check-label small" for="lz-radio-${d.numpos_lz}">
          <code>${d.numpos_lz}</code> ${_badge(d)}${extraBadge}${_lzTlcBadge(d)}
        </label>
      </div>`;
    }).join("");
    const selDev = devs.find(d => d.numpos_lz === state.selectedNumposLZ);
    el.innerHTML = `<div class="text-muted small mb-1">
      <i class="bi bi-toggle-on me-1 text-primary"></i>Equipo que cierra — selecciona:
    </div>${opciones}
    ${selDev ? _islaWarnTxt(selDev) : ""}
    ${selDev ? _forzarWarn(selDev) : ""}
    ${selDev ? _htmlEquiposTroncal(selDev._equipos_troncal) : ""}`;
  }
  // Aviso: vecino LZ forzado fuera del segmento (troncal manual obligatorio).
  if (sinSeg) {
    el.innerHTML += `<div class="alert alert-warning py-2 px-3 small mt-2 mb-0">
      <i class="bi bi-exclamation-triangle-fill me-1"></i>
      <strong>Traspaso forzado — sin LZ en el segmento.</strong> Este receptor es vecino LZ
      del origen pero <strong>no está ligado al segmento</strong> que abriste. Arma el
      troncal del receptor a mano en el panel de abajo (la composición no se guarda).
    </div>`;
  }
  el.style.display = "";

  // Cargar panel de configuración de equipos del receptor (según LZ seleccionado)
  // Preferir nom_alim del LZ (vi.nom_alim), fallback a destinosData
  const feederB  = state.destinosData.find(d => d.numalim === numalimDest);
  const nomAlimB = primerOk?._nom_alim || feederB?.nom_alim || feederB?.nombre || '';
  // sinSeg → troncal manual (vacío) aunque el LZ sea viable; el operador arma el camino.
  const troncalB = sinSeg ? [] : (primerOk?._equipos_troncal ?? []);
  tspCargarEquiposB(numalimDest, nomAlimB, troncalB);
}

// ── RESULTADOS LZ: TABLAS Y PANELES ───────────────────────────────────────
// Tabla de equipos troncales usada en el panel de resultados
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

  // FRG: flags calculados por el backend con el caché TLC
  const frgOrig = data.frg_orig ?? false;
  const frgDest = data.frg_dest ?? false;

  const partes = [];
  const vccB   = data.vcc_alim_b_equipos || [];

  // ── Aviso de traspaso forzado (LZ sin troncal en BD) ─────────────────────
  if (data.traspaso_forzado) {
    const conTroncal = vccB.length
      ? `Se evaluó el troncal del receptor con los equipos <strong>ingresados manualmente</strong>.`
      : `<strong>Sin evaluación de troncal del receptor</strong> — solo se validó el impacto en alimentador y transformador.`;
    partes.push(`<div class="alert alert-warning py-2 px-3 small mb-2">
      <i class="bi bi-exclamation-triangle-fill me-1"></i>
      <strong>Traspaso forzado</strong> — la base no registra el límite de zona como topológicamente viable.
      ${conTroncal}
    </div>`);
  }

  // ── Aviso: corrección de tensión ATR del receptor no aplicada ────────────
  if (data.atr_omitido) {
    const o     = data.atr_omitido;
    const eqs   = (o.equipos || []).map(e => `<code>${e}</code>`).join(", ");
    const borde = o.tipo === "elevador"
      ? (o.eq_baja || "borde 12 kV")
      : (o.eq_alta || o.eq_baja || "borde 23 kV");
    partes.push(`<div class="alert alert-warning py-2 px-3 small mb-2">
      <i class="bi bi-lightning-charge-fill me-1"></i>
      <strong>Corrección de tensión ATR no aplicada</strong> — el receptor
      <strong>${data.nombre_dest}</strong> tiene un autotransformador (${o.tipo}) y estos
      equipos del troncal quedan bajo el ATR (12 kV): ${eqs}. No se detectó el recloser de
      borde (<code>${borde}</code>) en el troncal, así que sus corrientes se muestran a
      23 kV (podrían estar subestimadas). Agrega el recloser de borde al troncal del
      receptor para aplicar la corrección.
    </div>`);
  }

  // ── Card 1: Equipos troncales ────────────────────────────────────────────
  // Bloque plano (sin <details> propio): la sección padre "det-equipos-lz" ya es
  // el colapsable; anidar otro creaba dos barras de título seguidas.
  if (troncal.length || vccB.length) {
    const tieneRec = troncal.some(eq => eq.slice(0,3).toUpperCase() === "REC")
                   || vccB.some(e => (e.nombre||"").slice(0,3).toUpperCase() === "REC");
    const tieneReg = troncal.some(eq => eq.slice(0,3).toUpperCase() === "REG")
                   || vccB.some(e => (e.nombre||"").slice(0,3).toUpperCase() === "REG");
    const iconoTroncal = (tieneRec || tieneReg) ? "bi-exclamation-triangle text-warning" : "bi-diagram-3 text-muted";
    const numposLZ = selDev?.numpos_lz || "";

    // Cuerpo = solo la tabla de equipos (evaluados con CN o, si no hay, lista simple).
    let tablaBody, estadoBadge = "";
    if (vccB.length) {
      const _ord = { critico: 3, prealerta: 2, viable: 1, sin_cn: 0 };
      const estadoGlobal = vccB.reduce((worst, e) =>
        (_ord[e.estado] ?? 0) > (_ord[worst] ?? 0) ? e.estado : worst, "sin_cn");
      const BADGE_CLS = { viable:"badge-viable", prealerta:"badge-prealerta", critico:"badge-critico", sin_cn:"bg-secondary" };
      const BADGE_LBL = { viable:"Viable", prealerta:"Prealerta", critico:"Crítico", sin_cn:"Sin ajuste" };
      estadoBadge = `<span class="badge ${BADGE_CLS[estadoGlobal] || "bg-secondary"} ms-1">${BADGE_LBL[estadoGlobal] || estadoGlobal}</span>`;
      // Sin notas de ajuste; si no hay equipos evaluados, fallback a lista simple.
      tablaBody = vccTablaEquipos(vccB, null, { notasAjuste: false }) || _htmlTablaEquiposTroncal(troncal);
    } else {
      tablaBody = _htmlTablaEquiposTroncal(troncal);
    }
    const countEq = vccB.length || troncal.length;

    partes.push(`<div class="mb-2">
      <div class="fw-semibold small mb-1 d-flex align-items-center gap-2">
        <i class="bi ${iconoTroncal}"></i>
        <span>Equipos troncales en alimentador receptor</span>
        <span class="badge bg-secondary ms-1">${countEq}</span>${estadoBadge}
        ${numposLZ ? `<span class="text-muted small ms-auto">vía ${numposLZ}</span>` : ""}
      </div>
      ${tablaBody}
    </div>`);
  }

  // ── Card 2: Equipos en isla a vigilar (inversión + FRG) ─────────────────
  // Bloque plano y sin título: va directo el contenido (inversión de flujo / FRG).
  if (eqTsp.length || frgOrig || frgDest) {
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
        <p class="small text-muted mt-1 mb-0">Estos equipos quedan dentro del segmento y recibirán corriente desde la dirección opuesta a la habitual.</p>
      </div>` : "";
    const frgItems = [];
    if (frgOrig) frgItems.push(`alimentador <strong>origen</strong>`);
    if (frgDest) frgItems.push(`alimentador <strong>receptor</strong>`);
    const frgHtml = frgItems.length ? `
      <div>
        <div class="fw-semibold small mb-1" style="color:#7ecfff">
          <i class="bi bi-broadcast me-1"></i>FRG activo en ${frgItems.join(" y ")}
        </div>
        <p class="small text-muted mb-0">Verificar condiciones de reconexión automática post-traspaso.</p>
      </div>` : "";
    partes.push(`<div class="mb-2">${invHtml}${frgHtml}</div>`);
  }

  el.innerHTML = partes.join("");
  // Inicializar tooltips Bootstrap (ⓘ de "Enfoque A/B"): en este panel no se
  // corren de otro modo (a diferencia del tab VCC). Idempotente y no-op si no hay.
  initTooltips(el);
}

function renderPanelLZ(lz, nombreOrig, nombreDest) {
  // Panel LZ retirado por completo del panel de resultados: era redundante con
  // el "vía <numpos>" de la card de equipos troncales. Se deja la función como
  // no-op (oculta el contenedor) para no tocar el resto del flujo de render.
  const el = document.getElementById("panel-lz");
  if (el) { el.innerHTML = ""; el.style.display = "none"; }
  return;

  // eslint-disable-next-line no-unreachable
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
      return ` <span class="badge bg-secondary text-white" title="Sin datos de troncal origen — verificar manualmente si este LZ pertenece al segmento">Verificar</span>`;
    }
    const enIsla = d.equipos_troncal_orig.some(eq => eq.toUpperCase().trim() === _eqAbre);
    return enIsla
      ? ` <span class="badge bg-info text-dark" title="LZ encontrado en camino troncal aguas abajo del equipo que abre">En segmento ✓</span>`
      : ` <span class="badge bg-warning text-dark" title="No encontrado en camino troncal — verificar si pertenece al segmento">Verificar</span>`;
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
    const es3ramas  = d.tipo === "subterraneo_3ramas";
    const exceLabel = d.excepcion
      ? ` <span class="badge bg-secondary ms-1" style="font-size:.65rem" title="Registro corregido respecto a BD">BD corr.</span>` : "";
    // Solo se etiqueta el subterráneo de 3 ramas; "bilateral" (por defecto) se omite.
    const tipoBadge = es3ramas
      ? ` <span class="badge bg-warning text-dark"${compact ? ' style="font-size:.65rem"' : ''}>${TIPO_LABEL[d.tipo]}</span>`
      : "";

    if (compact) {
      const vl = d.viable === false
        ? ` <span class="badge bg-danger text-white" style="font-size:.65rem">No viable</span>` : "";
      return `<div class="d-flex align-items-center gap-1 py-1" style="border-top:1px solid rgba(0,0,0,.1)">
        <code class="text-body-secondary">${d.numpos_lz}</code>${tipoBadge}
        ${exceLabel}${_islaB(d)}${_lzTlcBadge(d)}${vl}
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
    // El listado de equipos troncales se muestra en la card
    // "Equipos troncales en alimentador receptor" (renderSecEquiposInvolucrados).

    return `<div class="d-flex align-items-center gap-1 flex-wrap">
        <code class="fw-bold">${d.numpos_lz}</code>${tipoBadge}
        ${exceLabel}${_islaB(d)}${_lzTlcBadge(d)}
      </div>
      ${viableHtml}${extra}`;
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

    // Caso actual — <summary> retraible (título único, reemplaza al banner oscuro),
    // con el mismo estilo que los casos colapsados.
    const _det    = document.getElementById("det-caso-actual");
    const _banner = document.getElementById("caso-banner");
    const _bc     = _CASO_COLORS[(state.numeroCaso - 1) % _CASO_COLORS.length];
    if (_det) {
      _det.style.display    = "";
      _det.style.borderLeft = `4px solid ${_bc}`;
      _det.style.borderRadius = "6px";
      _det.open = true;
    }
    if (_banner) {
      const _cnt    = data.resumen?.conteo || {};
      const _est    = _cnt.critico > 0 ? "critico" : _cnt.prealerta > 0 ? "prealerta" : "viable";
      const _colEst = _est === "critico" ? "danger" : _est === "prealerta" ? "warning" : "success";
      const _lblEst = _est === "critico" ? "Crítico" : _est === "prealerta" ? "Prealerta" : "Viable";
      const _pct    = data.isla?.p_pct?.toFixed(1) ?? "—";
      const _np     = data.lz_info?.numpos_lz_sel ? ` · Equipo: <code>${data.lz_info.numpos_lz_sel}</code>` : "";
      _banner.style.cssText = `cursor:pointer;list-style:none;background:${_bc}18;border-radius:6px`;
      _banner.innerHTML =
        `<i class="bi bi-chevron-down" style="font-size:.8rem"></i>` +
        `<span class="fw-semibold" style="color:${_bc}">Caso ${state.numeroCaso}: ${data.nombre_orig} → ${data.nombre_dest}</span>` +
        `<span class="badge bg-${_colEst} text-${_colEst === 'warning' ? 'dark' : 'white'}">${_lblEst}</span>` +
        `<span class="small text-muted">${_pct}% traspasado${_np}</span>`;
    }
    // Acciones (descargar / guardar) — fuera de los casos, siempre visible.
    const _acc = document.getElementById("acciones-resultado");
    if (_acc) _acc.style.display = "";
    // Resumen de la cadena en vivo (arriba de los casos)
    renderCadenaResumen();

    // Restablecer origen solo si NO hay cadena de corrimiento activa (2+ casos):
    // durante una cadena el origen queda fijo hasta reiniciar (botón Reiniciar).
    if (ts.origen && state.cadenaSimulaciones.length <= 1) ts.origen.enable();
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

// Badge de veredicto compartido por las sugerencias (TLC y corrimiento): compara
// lo que el origen entrega en el peor mes del receptor contra su remanente.
function _badgeFactible(holguraA, transferA, remanenteA, mesLbl) {
  if (holguraA == null) return "";
  const ok  = holguraA >= 0;
  const mes = mesLbl ? ` en ${mesLbl}` : "";
  const t   = v => (v != null ? Number(v).toFixed(0) : "—");
  const tip = ok
    ? `Factible${mes}: el origen entrega ≈${t(transferA)} A y el destino tiene ${t(remanenteA)} A de remanente → holgura +${t(holguraA)} A.`
    : `No factible${mes}: el origen entrega ≈${t(transferA)} A pero el destino solo tiene ${t(remanenteA)} A de remanente → excede en ${t(Math.abs(holguraA))} A.`;
  return ok
    ? ` <span class="badge bg-success" style="font-size:.6rem" title="${tip}">Factible +${t(holguraA)} A</span>`
    : ` <span class="badge bg-warning text-dark" style="font-size:.6rem" title="${tip}">No factible −${t(Math.abs(holguraA))} A</span>`;
}

async function renderPanelCorrimiento(numalimDest, nombreDest) {
  const el    = document.getElementById("panel-corrimiento");
  const detEl = document.getElementById("det-corrimiento");
  const _hide = () => { if (detEl) detEl.style.display = "none"; };
  if (!el || numalimDest == null) { _hide(); return; }

  if (state.numeroCaso >= 3) { _hide(); return; }

  const _meses = encodeURIComponent(mesesSeleccionados().join(","));
  const candidatos = await apiFetch(`/api/corrimiento_candidatos/${numalimDest}?meses=${_meses}`);
  if (!candidatos?.length) { _hide(); return; }

  const filas = candidatos.map(c => {
    const rem    = c.remanente_A;
    const pct    = c.remanente_pct;
    const remTxt = rem != null ? `${rem.toFixed(1)} A` : "—";
    const pctTxt = pct != null ? `${pct.toFixed(1)}%` : "—";
    const mesTxt = c.mes_dem_max ? _mesLabel(c.mes_dem_max) : "—";
    const colorBg = pct == null ? "secondary" : pct >= 20 ? "success" : pct >= 5 ? "warning" : "danger";
    const cxBadge = c.tiene_vecinos_lz
      ? `<span class="badge bg-info text-dark ms-1" title="${c.n_vecinos_lz} vecino(s) disponibles para corrimiento posterior">→ C→X</span>`
      : "";
    return `<tr style="cursor:pointer" title="Clic para precargar corrimiento hacia ${c.nombre}"
              onclick="precargarCorrimiento(${numalimDest}, ${c.numalim}, ${c.remanente_pct ?? null}, ${c.remanente_A ?? null}, ${c.mes_dem_max ? `'${c.mes_dem_max}'` : null})">
      <td><span class="fw-semibold">${c.nombre}</span>${esAlimFrg(c.numalim) ? frgBadge() : ''}${cxBadge}</td>
      <td class="text-end"><span class="badge bg-${colorBg} text-${colorBg === 'warning' ? 'dark' : 'white'}">${remTxt}</span></td>
      <td class="text-end text-muted small">${pctTxt}</td>
      <td class="text-end text-muted small">${mesTxt}</td>
    </tr>`;
  }).join("");

  // Contenido plano: la sección padre "det-corrimiento" ya es el colapsable con
  // su título; el "desde ${nombreDest}" se conserva en la línea de intro.
  el.innerHTML = `
    <p class="small text-muted mb-2">Selecciona un alimentador destino para continuar la cadena de corrimiento desde <strong>${nombreDest}</strong>:</p>
    <table class="table table-sm table-hover mb-0" style="font-size:.85rem">
      <thead><tr>
        <th>Alimentador</th>
        <th class="text-end" title="CN − demanda máxima del periodo de estudio (holgura en el mes de mayor carga)">Remanente</th>
        <th class="text-end">%</th>
        <th class="text-end">Peor mes</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p class="small text-muted mt-2 mb-0">
      <i class="bi bi-info-circle me-1"></i>Remanente = CN − demanda máxima del periodo de estudio;
      holgura disponible en el «peor mes» (mes de mayor carga de cada alimentador).
    </p>`;
  if (detEl) detEl.style.display = "";
}

async function precargarCorrimiento(numalimB, numalimC, remanenteC, remanenteA, mesPeorC = null) {
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
    ts.origen.enable();  // por si venía bloqueado del caso previo → permite el setValue
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
      // Demanda de B en el peor mes de C (consistente con el remanente del receptor);
      // si ese mes no está en la tabla, se usa el pico de B como respaldo.
      let maxDemandB = null;
      if (prevSim?.tabla?.length) {
        const filaMes = mesPeorC ? prevSim.tabla.find(r => r.mes === mesPeorC) : null;
        const valMes  = filaMes ? (filaMes.I_dest_despues ?? filaMes.I_dest_antes) : null;
        if (valMes != null) {
          maxDemandB = valMes;
        } else {
          const vals = prevSim.tabla.map(r => r.I_dest_despues ?? r.I_dest_antes).filter(v => v != null);
          if (vals.length) maxDemandB = Math.max(...vals);
        }
      }
      // Mapa equipo → {numpos_lz, tlc_lz} del LZ que une B→C (para maniobra completa).
      // Reusa /api/vecinos_lz: cruza equipos_troncal_orig × vecinos (igual que el backend).
      const lzMap = await _mapaLzCorrimiento(numalimB, numalimC);
      const ranking = _rankearEquiposCorrimiento(equipos, remanenteC, remanenteA, maxDemandB, lzMap);
      state._sugCorrimiento = ranking;
      const elSug = document.getElementById("corrimiento-equipo-sugerido");
      if (elSug) {
        if (ranking.length) {
          const remTxt = remanenteA != null ? remanenteA.toFixed(1) + ' A' : remanenteC.toFixed(1) + '%';
          const NUM = ["①", "②", "③"];
          // Badge TLC/terreno o manual, gated por el switch de sugerencias.
          const _tlcBadge = (ok, txtNo) => state.sugerenciasTLC
            ? (ok
                ? ` <span class="badge bg-success" style="font-size:.6rem"><i class="bi bi-broadcast me-1"></i>TLC</span>`
                : ` <span class="badge bg-secondary" style="font-size:.6rem" title="Sin telecontrol">${txtNo}</span>`)
            : "";
          const filas = ranking.map((e, i) => {
            const transfTxt = (e.transfer != null)
              ? ` · <span class="text-muted">transfiere ≈ ${e.transfer.toFixed(1)} A</span>`
              : "";
            const factBadge = _badgeFactible(e.holgura, e.transfer, remanenteA, mesPeorC ? _mesLabel(mesPeorC) : null);
            const lzTxt = e.numpos_lz
              ? ` <span class="text-muted">→ cierra</span> <code>${e.numpos_lz}</code>${_tlcBadge(e.tlc_lz, 'manual')}`
              : "";
            return `<div class="d-flex align-items-center flex-wrap gap-1 py-1" data-sug-idx="${i}"
                         style="border-top:${i > 0 ? '1px solid rgba(0,0,0,.06)' : 'none'}">
                <span class="text-muted">${NUM[i] || ('#' + (i + 1))}</span>
                <strong><code>${e.nombre}</code></strong>${_tlcBadge(e.tlc, 'terreno')}${lzTxt}
                <span class="badge bg-secondary ms-1">${e.pct_feeder.toFixed(1)}% de ${nombreB}</span>${transfTxt}${factBadge}
                <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 ms-auto" style="font-size:.72rem"
                        title="Precargar esta maniobra (equipo + LZ)" onclick="precargarEquipoCorrimiento(${i})">
                  <i class="bi bi-play-fill"></i>
                </button>
              </div>`;
          }).join("");
          const mesPeorTxt = mesPeorC ? ` (peor mes ${_mesLabel(mesPeorC)})` : "";
          elSug.innerHTML = `<div class="mb-1"><i class="bi bi-lightbulb-fill text-warning me-1"></i>
            <strong>Candidatos para el corrimiento</strong>
            <span class="text-muted ms-1">— remanente ${nombreC}: ${remTxt}${mesPeorTxt}</span></div>${filas}`;
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

// Construye el mapa equipo→{numpos_lz, tlc_lz} del LZ que une el origen B con el
// destino C, reusando /api/vecinos_lz (mismo cruce equipos_troncal × vecinos que el
// backend de sugerencias_traspaso). Prefiere LZ viable hacia C; si solo hay no-viable,
// lo incluye igual (respeta el traspaso forzado). Prefiere el LZ telecontrolado.
async function _mapaLzCorrimiento(numalimB, numalimC) {
  const map = {};
  let lzs;
  try { lzs = await apiFetch(`/api/vecinos_lz/${numalimB}`); }
  catch (_) { return map; }
  if (!Array.isArray(lzs)) return map;
  // Preferir ties viables; recolectar no-viables como respaldo.
  for (const pref of [true, false]) {
    for (const lz of lzs) {
      const haciaC = (lz.vecinos || []).some(v => v.numalim == numalimC && !!v.viable === pref);
      if (!haciaC) continue;
      for (const eq of (lz.equipos_troncal_orig || [])) {
        const key = String(eq).toUpperCase().trim();
        // No sobreescribir un tie ya fijado, salvo para preferir el telecontrolado.
        if (!(key in map) || (lz.tlc && !map[key].tlc_lz)) {
          map[key] = { numpos_lz: lz.numpos_lz, tlc_lz: !!lz.tlc };
        }
      }
    }
    if (Object.keys(map).length) break; // ya hay ties viables → no bajar a no-viables
  }
  return map;
}

// Devuelve los candidatos de corrimiento como maniobras completas rankeadas (top-3):
// solo equipos que unen B→C vía un LZ (lzMap), anexando el LZ que cierra, el monto a
// transferir y el estado cabe/excede. Con sugerencias TLC activas, los telecontrolados
// (equipo o LZ) quedan primero. Los no-factibles se incluyen marcados (no se ocultan).
function _rankearEquiposCorrimiento(equipos, remanenteC, remanenteA, maxDemandB, lzMap) {
  if (!equipos?.length || remanenteC == null) return [];
  lzMap = lzMap || {};

  const cand = [];
  for (const e of equipos) {
    if (e.pct_feeder == null || e.pct_feeder <= 0) continue;
    const key = String(e.nombre || "").toUpperCase().trim();
    const tie = lzMap[key];
    if (!tie) continue; // sin LZ hacia C → no es candidato de corrimiento
    const transfer = (maxDemandB != null && maxDemandB > 0) ? maxDemandB * e.pct_feeder / 100 : null;
    const holgura  = (transfer != null && remanenteA != null) ? remanenteA - transfer : null;
    cand.push({
      ...e,
      numpos_lz: tie.numpos_lz,
      tlc_lz:    tie.tlc_lz,
      transfer,
      holgura,
      factible:  holgura != null ? holgura >= 0 : null,
    });
  }
  if (!cand.length) return [];
  // Orden: TLC primero (equipo o LZ) con el switch; factibles antes; luego mayor %.
  const cmp = (a, b) => {
    if (state.sugerenciasTLC) {
      const at = (a.tlc || a.tlc_lz) ? 1 : 0, bt = (b.tlc || b.tlc_lz) ? 1 : 0;
      if (at !== bt) return bt - at;
    }
    const af = a.factible === false ? 0 : 1, bf = b.factible === false ? 0 : 1;
    if (af !== bf) return bf - af;
    return b.pct_feeder - a.pct_feeder;
  };
  return cand.sort(cmp).slice(0, 3);
}

// Precarga un candidato de corrimiento como el equipo que abre en el caso actual.
// El destino ya quedó fijado por precargarCorrimiento (state.pendingPreselectDest).
function precargarEquipoCorrimiento(idx) {
  const e = (state._sugCorrimiento || [])[idx];
  if (!e) return;

  // 1. Modo "por equipo"
  const rEq = document.getElementById("modo-equipo");
  if (rEq) { rEq.checked = true; rEq.dispatchEvent(new Event("change", { bubbles: true })); }

  // 1b. LZ que cierra preseleccionado antes del setValue → mostrarEquipoCierra lo marca
  if (e.numpos_lz) state.selectedNumposLZ = e.numpos_lz;

  // 2. Equipo que abre → dispara filtrado de destinos + preview de isla + reveal de cards
  if (ts.equipo) {
    const val = e.nombre;
    if (!ts.equipo.options[val]) {
      ts.equipo.addOption({ value: val, text: (val || '').toUpperCase(), label: (val || '').toUpperCase() });
    }
    ts.equipo.setValue(val);
  }

  // Feedback visual: resaltar el candidato elegido
  const cont = document.getElementById("corrimiento-equipo-sugerido");
  if (cont) cont.querySelectorAll("[data-sug-idx]").forEach(el =>
    el.style.background = (+el.dataset.sugIdx === idx) ? "rgba(25,135,84,.12)" : "");
}

// ── SUGERIDOR DE PRIMER TRASPASO (TLC) ────────────────────────────────────
// Interruptor opcional: activa/desactiva el modo sugerencias sin cambiar el
// flujo manual. Con OFF, todo queda idéntico al comportamiento por defecto.
function toggleSugerenciasTLC(on) {
  state.sugerenciasTLC = !!on;
  const wrap = document.getElementById("sugerencias-traspaso-wrap");
  if (wrap) wrap.style.display = on ? "" : "none";
  const banner = document.getElementById("sugerencias-traspaso");
  if (!on && banner) banner.innerHTML = "";
  // Persistir preferencia (localStorage: por navegador, no se comparte entre usuarios)
  try { localStorage.setItem("sugerenciasTLC", on ? "1" : "0"); } catch (_) {}
}

// Vista "simple" (light): oculta secciones de trabajo vía la clase body.modo-simple
// (reglas CSS en index.html) y gatea los destinos forzados. Ocultar ≠ apagar cálculo:
// el troncal receptor y la tensión por-equipo se siguen calculando. Default ON,
// persistido en localStorage (por navegador). Sincroniza ambos switches (Paso 1 + pie).
function toggleModoSimple(on) {
  state.modoSimple = !!on;
  document.body.classList.toggle("modo-simple", state.modoSimple);
  document.querySelectorAll("#chk-modo-simple, #chk-modo-simple-pie").forEach(chk => {
    if (chk) chk.checked = state.modoSimple;
  });
  // Al reconstruir el dropdown de destino se aplica/retira el gateo de forzados
  // (si hay un origen ya seleccionado con vecinos LZ cargados).
  if (state.lzVecinos?.length && typeof _rebuildDropdownDestinos === "function") {
    _rebuildDropdownDestinos(state._ultimoEquipoAbre ?? null);
  }
  try { localStorage.setItem("modoSimple", state.modoSimple ? "1" : "0"); } catch (_) {}
}

// Consulta el backend y muestra las mejores maniobras TLC (top-3) como banner.
async function sugerirTraspasoTLC() {
  const cont = document.getElementById("sugerencias-traspaso");
  if (!cont) return;
  if (state.origenNumalim == null) {
    cont.innerHTML = `<div class="alert alert-warning py-2 px-3 small mb-0">
      <i class="bi bi-exclamation-triangle me-1"></i>Selecciona un alimentador de origen primero.</div>`;
    return;
  }
  cont.innerHTML = `<div class="text-muted small">
    <span class="spinner-border spinner-border-sm me-2" role="status"></span>Buscando maniobras TLC…</div>`;
  try {
    const maniobras = await apiFetch(`/api/sugerencias_traspaso/${state.origenNumalim}?meses=${encodeURIComponent(mesesSeleccionados().join(","))}`);
    state._sugTraspaso = Array.isArray(maniobras) ? maniobras : [];
    if (!state._sugTraspaso.length) {
      cont.innerHTML = `<div class="alert alert-secondary py-2 px-3 small mb-0">
        <i class="bi bi-info-circle me-1"></i>Sin maniobra TLC viable para este origen (sin vecinos LZ o sin datos).</div>`;
      return;
    }
    const _tlcB = (ok, txtNo) => ok
      ? ` <span class="badge bg-success" style="font-size:.6rem"><i class="bi bi-broadcast me-1"></i>TLC</span>`
      : ` <span class="badge bg-secondary" style="font-size:.6rem">${txtNo}</span>`;
    const filas = state._sugTraspaso.slice(0, 3).map((m, i) => {
      const mesLbl = m.mes_ref ? _mesLabel(m.mes_ref) : null;
      const factB  = _badgeFactible(m.holgura_A, m.transfer_A, m.remanente_A, mesLbl);
      const mesTxt = mesLbl ? ` <span class="text-muted">(peor mes ${mesLbl})</span>` : "";
      return `<div class="border rounded p-2 mb-1" style="cursor:pointer;background:#f6fff6"
                   onclick="precargarTraspasoSugerido(${i})" title="Clic para precargar esta maniobra">
        <div class="small">
          <span class="text-muted">Abre</span> <code>${(m.equipo_abre||'').toUpperCase()}</code>${_tlcB(m.tlc_abre, 'terreno')}
          <span class="text-muted mx-1">→ cierra</span> <code>${m.numpos_lz}</code>${_tlcB(m.tlc_lz, 'manual')}
          <span class="text-muted mx-1">→</span> <strong>${m.dest_nom}</strong>
        </div>
        <div class="small text-muted mt-1">
          transfiere ≈ <strong>${m.transfer_A.toFixed(0)} A</strong> · remanente destino ${m.remanente_A.toFixed(0)} A${mesTxt}${factB}
        </div>
      </div>`;
    }).join("");
    cont.innerHTML = `<div class="small fw-semibold mb-1" style="color:#198754">
      <i class="bi bi-magic me-1"></i>Mejores maniobras TLC — clic para precargar</div>${filas}`;
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger py-2 px-3 small mb-0">Error al sugerir: ${e.message}</div>`;
  }
}

// Precarga una maniobra sugerida en el formulario (espejo de precargarCorrimiento):
// modo equipo → equipo que abre → destino existente → LZ que cierra.
function precargarTraspasoSugerido(idx) {
  const m = (state._sugTraspaso || [])[idx];
  if (!m) return;

  // 1. Modo "por equipo"
  const rEq = document.getElementById("modo-equipo");
  if (rEq) { rEq.checked = true; rEq.dispatchEvent(new Event("change", { bubbles: true })); }

  // 2. LZ preseleccionado antes de disparar mostrarEquipoCierra
  state.selectedNumposLZ = m.numpos_lz;

  // 3. Equipo que abre → dispara filtrado de destinos + preview + reveal de cards
  if (ts.equipo) {
    if (!ts.equipo.options[m.equipo_abre]) {
      ts.equipo.addOption({ value: m.equipo_abre, text: (m.equipo_abre||'').toUpperCase(), label: (m.equipo_abre||'').toUpperCase() });
    }
    ts.equipo.setValue(m.equipo_abre);
  }

  // 4. Destino existente (excel)
  const rDest = document.getElementById("dest-excel");
  if (rDest) { rDest.checked = true; rDest.dispatchEvent(new Event("change", { bubbles: true })); }
  if (ts.destino) {
    if (!ts.destino.options[String(m.dest_numalim)]) {
      ts.destino.addOption({ value: String(m.dest_numalim), text: m.dest_nom });
    }
    ts.destino.setValue(String(m.dest_numalim)); // onChange → mostrarEquipoCierra
  }

  // 5. Equipo que cierra + refuerzo de la selección LZ
  const inpCierra = document.getElementById("inp-equipo-cierra");
  if (inpCierra) inpCierra.value = m.numpos_lz;
  mostrarEquipoCierra(m.dest_numalim);

  // Feedback visual: resaltar la maniobra elegida
  const cont = document.getElementById("sugerencias-traspaso");
  if (cont) cont.querySelectorAll(".border").forEach((el, j) => el.style.outline = j === idx ? "2px solid #198754" : "");
}

// Resumen del corrimiento en vivo (arriba de los casos), reusando las tablas del
// informe. Visible solo con cadena (≥2 casos).
function renderCadenaResumen() {
  const cont = document.getElementById("cadena-resumen");
  if (!cont) return;
  const cadena = state.cadenaSimulaciones || [];
  if (cadena.length < 2) { cont.innerHTML = ""; return; }
  cont.innerHTML =
    `<div class="card step-card mb-2">` +
    `<div class="step-header"><i class="bi bi-table me-1"></i><span class="fw-semibold">Resumen del corrimiento</span></div>` +
    `<div class="step-body p-2">` +
    _cadenaIntroHTML(cadena) + _cadenaTablaAlimHTML(cadena) +
    _cadenaTablaTrafosHTML(cadena) + _cadenaTablaFUFinal(cadena) +
    `</div></div>`;
}

function limpiarCadena() {
  state.cadenaSimulaciones = [];
  state.cadenaReportCases = [];
  state.numeroCaso = 0;
  const el = document.getElementById("cadena-casos");
  if (el) el.innerHTML = "";
  const res = document.getElementById("cadena-resumen");
  if (res) res.innerHTML = "";
  const banner = document.getElementById("caso-banner");
  if (banner) { banner.innerHTML = ""; banner.style.display = "none"; }
  if (ts.origen) ts.origen.enable();
  const origNotice = document.getElementById("corrimiento-origen-notice");
  if (origNotice) { origNotice.innerHTML = ""; origNotice.style.display = "none"; }
  const islaNotice = document.getElementById("corrimiento-isla-notice");
  if (islaNotice) { islaNotice.innerHTML = ""; islaNotice.style.display = "none"; }
}

// Reinicia el Nuevo Traspaso desde cero: limpia la cadena, deselecciona el origen,
// oculta resultados/pasos y vacía los campos. Vía limpia para abandonar un corrimiento.
function reiniciarTraspaso() {
  limpiarCadena();                       // cadena, banner, avisos, ts.origen.enable()
  if (ts.origen) ts.origen.clear();      // deseleccionar origen
  const _hide = id => { const el = document.getElementById(id); if (el) el.style.display = "none"; };
  ["det-caso-actual", "acciones-resultado", "resultado-contenido", "card-isla", "card-destino", "card-meses", "card-simular", "orig-info"].forEach(_hide);
  const _cc = document.getElementById("cadena-casos"); if (_cc) _cc.innerHTML = "";
  ["inp-descripcion", "inp-cambio-topo", "inp-equipo-cierra"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  const _sug = document.getElementById("sugerencias-traspaso"); if (_sug) _sug.innerHTML = "";
  state.origenNumalim = null; state.origenNomAlim = null; state.selectedNumposLZ = null;
  state.esCorrimiento = false; state.esRecalculo = false; state._sugTraspaso = [];
  ocultarErrorSim();
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

  // Renderizar los gráficos MAM del caso ANTES del snapshot (se crean lazy al
  // expandir); así el caso colapsado queda tan completo como el print de NT.
  const _mamBody = document.getElementById("mam-body");
  const _secMam  = document.getElementById("sec-mam");
  const _mamPrev = _mamBody ? _mamBody.style.display : null;
  const _secMamPrev = _secMam ? _secMam.style.display : null;
  const _mamTmp  = !!(sim.tabla_mam?.length && !_charts["barras-mam"]);
  if (_mamTmp) {
    const _prevAnim = (typeof Chart !== "undefined") ? Chart.defaults.animation : undefined;
    try {
      // Sin animación → Chart.js pinta sincrónico en new Chart(); el toDataURL()
      // del snapshot captura el gráfico ya pintado (si no, PNG en blanco).
      if (typeof Chart !== "undefined") Chart.defaults.animation = false;
      if (_secMam)  _secMam.style.display  = "";  // card visible → canvas con tamaño
      if (_mamBody) _mamBody.style.display = "";
      renderMamCharts(sim);
      renderMamTrafos(sim.trafo_orig_mam, sim.trafo_dest_mam,
        sim.nombre_orig, sim.nombre_dest, sim.ajustes_activos, sim.misma_barra_se ?? false);
    } catch (e) { /* si falla, el caso se colapsa sin MAM */ }
    finally { if (typeof Chart !== "undefined") Chart.defaults.animation = _prevAnim; }
  }

  // Informe interactivo: capturar configs de los gráficos vivos del caso y un clon
  // con los canvas intactos. El informe los recrea con Chart.js (no como PNG), así
  // no quedan vacíos. Debe hacerse mientras los charts existen (antes de destruir MAM).
  const _cfgsCaso = {};
  contenido.querySelectorAll("canvas").forEach(cv => {
    if (!cv.id) return;
    const ch = (typeof Chart !== "undefined") ? Chart.getChart(cv) : null;
    if (ch) _cfgsCaso[`_c${n}_${cv.id}`] = _serializeChartCfg(ch);
  });
  const cloneReport = contenido.cloneNode(true);
  cloneReport.removeAttribute("id");
  cloneReport.style.removeProperty("display");
  _limpiarPanelInforme(cloneReport);
  cloneReport.querySelectorAll("[id]").forEach(el => { el.id = `_c${n}_${el.id}`; });
  if (!state.cadenaReportCases) state.cadenaReportCases = [];
  state.cadenaReportCases.push({
    n, nombre_orig: sim.nombre_orig, nombre_dest: sim.nombre_dest,
    estado, colorEst, labelEst, pct, numpos, cfgs: _cfgsCaso, node: cloneReport,
  });

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

  // Destruir los gráficos MAM temporales y restaurar la sección tras el snapshot.
  if (_mamTmp) {
    _destroyCharts("barras-mam", "estados-mam", "canvas-trafo-orig-mam", "canvas-trafo-dest-mam");
    if (_mamBody) _mamBody.style.display = _mamPrev;
    if (_secMam)  _secMam.style.display  = _secMamPrev;
  }

  // Limpieza igual que el informe: quita secciones de trabajo (LZ disponible,
  // corrimiento, ajustes) y colapsa las auxiliares. Debe correr ANTES de renombrar
  // IDs (busca por id original). Los <img> PNG quedan dentro de los <details> cerrados.
  _limpiarPanelInforme(clone);

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
  // Ocultar el wrapper del caso actual hasta que se renderice el siguiente
  // (evita que quede un <details> vacío con el título del caso ya colapsado).
  const _det = document.getElementById("det-caso-actual");
  if (_det) _det.style.display = "none";
}

