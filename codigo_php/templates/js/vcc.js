// ─── cargar lista de equipos/TPs del alimentador en el selector ───────────
async function vccCargarEquipos(nomAlim, modo = "equipos") {
  if (!nomAlim) return;
  spinner(true, modo === "tp" ? "Cargando TPs..." : "Cargando equipos...");
  try {
    const data = await apiFetch(
      `/api/vcc/equipos/${encodeURIComponent(nomAlim)}?modo=${modo}`
    );

    // Construir opciones según modo
    const TIPO_ICON = { reconectador: "🔴", equipo_sub: "🔵" };
    if (modo === "equipos") {
      state.vccEquiposCache = {};
      data.forEach(e => { state.vccEquiposCache[e.numpos] = e; });
    }

    let opts;
    if (modo === "tp") {
      opts = data.map(e => {
        const kvaStr = e.kva != null ? ` — ${e.kva.toLocaleString("es-CL")} kVA` : " — s/d";
        return { value: e.numpos, text: e.nombre, label: `${e.nombre}${kvaStr}` };
      });
    } else {
      // Badges AT + separadores para modo equipos
      const autotrafos = state.alimConfig?.autotrafos ?? [];
      const atNomMap = {}, atPrioMap = {};
      for (const at of autotrafos) {
        const tipo = at.tipo ?? 'reductor';
        if (at.rec_alta) atNomMap[at.rec_alta.trim().toUpperCase()] = at.tension_alta ?? 23;
        if (at.rec_baja) atNomMap[at.rec_baja.trim().toUpperCase()] = 12;
        if (tipo === 'elevador') {
          if (at.rec_baja) atPrioMap[at.rec_baja.trim().toUpperCase()] = 2;
          if (at.rec_alta) atPrioMap[at.rec_alta.trim().toUpperCase()] = 3;
        } else {
          if (at.rec_alta) atPrioMap[at.rec_alta.trim().toUpperCase()] = 2;
          if (at.rec_baja) atPrioMap[at.rec_baja.trim().toUpperCase()] = 3;
        }
      }
      // Aplicar tiebreaker al sort del backend (fraccion desc, luego prioridad AT)
      data.sort((a, b) => {
        const diff = (b.fraccion ?? -1) - (a.fraccion ?? -1);
        return diff !== 0 ? diff : (atPrioMap[(a.numpos||'').trim().toUpperCase()] ?? 1) - (atPrioMap[(b.numpos||'').trim().toUpperCase()] ?? 1);
      });
      opts = data.map(e => {
        const icon   = TIPO_ICON[e.tipo] || "⚫";
        const pctStr = e.fraccion != null ? ` (${(e.fraccion * 100).toFixed(1)}%)` : "";
        const nom    = (e.numpos || '').trim().toUpperCase();
        const atKv   = atNomMap[nom];
        const atSfx  = atKv != null ? ` · ⚡ ${atKv}kV` : '';
        return { value: e.numpos, text: e.numpos, nom, label: `${icon} ${e.numpos}${pctStr}${atSfx}` };
      });
      // Separadores: reductor → después de rec_alta (o justo antes de rec_baja si sin alta); elevador → después de rec_baja
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
          const idx = opts.findIndex(o => o.nom === anchor);
          if (idx >= 0) sepInserts.push({ idx, label, alta });
        } else if (at.rec_baja && tipo === 'reductor') {
          // Sin rec_alta: feeder nace en alta — separador justo antes de rec_baja
          const bajaKey = at.rec_baja.trim().toUpperCase();
          const bajaIdx = opts.findIndex(o => o.nom === bajaKey);
          if (bajaIdx > 0) sepInserts.push({ idx: bajaIdx - 1, label, alta: bajaKey });
        }
      }
      sepInserts.sort((a, b) => b.idx - a.idx);
      for (const { idx, label, alta } of sepInserts) {
        opts.splice(idx + 1, 0, {
          value: `__at_sep_${alta}__`, text: '', nom: '', disabled: true, label,
        });
      }
    }

    const ph = modo === "tp"
      ? "Buscar TP por nombre o NUMPOS..."
      : "Escribe o selecciona NUMPOS...";

    if (_vccTsPunto) {
      _vccTsPunto.clearOptions();
      _vccTsPunto.addOptions(opts);
      _vccTsPunto.clear(true);
      _vccTsPunto.settings.placeholder = ph;
      _vccTsPunto.inputState();
    } else {
      const el = document.getElementById("vcc-sel-punto");
      _vccTsPunto = new TomSelect(el, {
        options:       opts,
        valueField:    "value",
        labelField:    "label",
        searchField:   ["value", "text", "label"],
        disabledField: "disabled",
        create:        true,
        createOnBlur:  false,
        maxOptions:    400,
        placeholder:   ph,
        render: {
          option: (item) => item.disabled
            ? `<div style="font-size:.78rem;color:#f5a623;font-style:italic;cursor:default;padding:4px 10px;border-top:1px solid #f5a623;border-bottom:1px solid #f5a623">${item.label}</div>`
            : `<div style="font-size:.82rem">${item.label}</div>`,
          item: (item) => `<div>${item.label || item.value}</div>`,
        },
        onChange: async (val) => {
          if (!val || val.startsWith('__at_sep_')) { vccLimpiarPunto(); return; }
          await vccBuscarPunto(val);
        },
      });
    }
  } catch(e) {
    console.warn("Error cargando equipos VCC:", e);
    mostrarError("No se pudo cargar la lista de puntos de conexión.");
  } finally { spinner(false); }
}

// ─── limpiar estado del punto ──────────────────────────────────────────────
function vccLimpiarPunto() {
  state.vccEquipos       = [];
  state.vccPuntoRef      = null;
  state.vccUltimaEval    = null;
  state.vccAlimDestIdx   = null;
  state.vccAlimDestNom   = null;
  state.vccNumposLz      = null;
  state.vccEquiposTroncalB = [];
  state.vccKvaIsla       = null;
  // reset traspaso UI
  const tmNinguno = document.getElementById("vcc-tm-ninguno");
  if (tmNinguno) { tmNinguno.checked = true; vccTraspasoModo("ninguno"); }
  const badge = document.getElementById("vcc-traspaso-badge");
  if (badge) { badge.style.display = "none"; badge.textContent = ""; }
  document.getElementById("vcc-punto-info").classList.add("d-none");
  ["vcc-card-equipos","vcc-card-potencia","vcc-card-traspaso","vcc-card-datos","vcc-card-periodo","vcc-card-evaluar"]
    .forEach(id => document.getElementById(id).classList.add("d-none"));
  document.getElementById("vcc-equipos-tabla").innerHTML = "";
  document.getElementById("vcc-resultados").classList.add("d-none");
}

// ─── buscar punto de conexión ──────────────────────────────────────────────
async function vccBuscarPunto(numposArg) {
  const nom    = state.vccAlimNom;
  const numpos = (numposArg || vccGetNumpos()).trim();
  if (!nom)    return mostrarError("Selecciona un alimentador primero.");
  if (!numpos) return mostrarError("Selecciona o escribe el NUMPOS.");
  spinner(true, "Buscando punto de conexión...");
  try {
    const r = await apiFetch("/api/vcc/punto", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ nom_alim: nom, numpos }),
    });
    if (r.error) { mostrarError(r.error); return; }
    if (r.tipo === "no_encontrado") {
      mostrarError(`NUMPOS "${numpos}" no encontrado en el alimentador ${nom}.`);
      return;
    }
    // Enriquecer upstream con fracción del cache (calculada una sola vez al cargar el alim.)
    const upstream = (r.upstream || []).map(eq => {
      const cached = state.vccEquiposCache[eq.nombre];
      return cached
        ? { ...eq, fraccion: cached.fraccion, kva_down: cached.kva_down,
            kva_total: cached.kva_total, tds_down: cached.tds_down,
            tds_con_kva: cached.tds_con_kva, tds_sin_kva: cached.tds_sin_kva }
        : eq;
    });
    state.vccEquipos  = upstream;
    state.vccPuntoRef = {
      nombre_ref:        r.nombre_ref,
      tipo_ref:          r.tipo,
      n_tds_aguas_abajo: r.n_tds_aguas_abajo || 0,
    };

    const tipoLabel = r.tipo === "td" ? "TP del cliente" : "Equipo upstream";
    const tdsMsg    = r.n_tds_aguas_abajo > 0
      ? ` | ${r.n_tds_aguas_abajo} TD(s) aguas abajo` : "";
    document.getElementById("vcc-punto-alerta").innerHTML =
      `<i class="bi bi-geo-alt me-1"></i>`+
      `<strong>${tipoLabel}:</strong> ${r.nombre_ref} (${r.numpos_ref})${tdsMsg}`;
    document.getElementById("vcc-punto-info").classList.remove("d-none");

    try { vccRenderEquiposInputs(upstream); } catch(e) { console.error("vccRenderEquiposInputs:", e); }
    // Mostrar paso 4 siempre que haya un punto válido (aunque upstream esté vacío)
    document.getElementById("vcc-card-equipos").classList.remove("d-none");
    // Mostrar pasos 5-8 y botón
    ["vcc-card-potencia","vcc-card-traspaso","vcc-card-datos","vcc-card-periodo","vcc-card-evaluar"]
      .forEach(id => document.getElementById(id).classList.remove("d-none"));
    vccRenderMeses();
  } finally { spinner(false); }
}

// ─── tabla unificada upstream: info + CN inputs + conductores intermedios ──────
function vccRenderEquiposInputs(equipos) {
  const cont = document.getElementById("vcc-equipos-tabla");
  if (!equipos.length) {
    cont.innerHTML = `<p class='text-muted small'>Sin equipos aguas arriba identificados.</p>`;
    return;
  }
  const savedConds = state.alimConfig?.conductores_intermedios ?? [];
  // Detectar el ATR relevante: por rec_alta en upstream; si no hay rec_alta, por rec_baja
  const _nombresUp = new Set(equipos.map(e => e.nombre));
  const atConfig   = (state.alimConfig?.autotrafos ?? []).find(at =>
    (at.rec_alta && _nombresUp.has(at.rec_alta)) ||
    (!at.rec_alta && at.rec_baja && _nombresUp.has(at.rec_baja))
  ) ?? null;
  const atRecAlta  = atConfig?.rec_alta ?? null;
  const atRecBaja  = atConfig?.rec_baja ?? null;
  const atTension  = atConfig?.tension_alta ?? 23;
  const atHasConf  = !!atConfig;

  // Sort desc por fraccion; en empate: rec_alta antes que rec_baja antes que otros
  const _atPrio = nom =>
    nom === atRecBaja ? 3 : nom === atRecAlta ? 2 : 1;
  const sorted = [...equipos].sort((a, b) => {
    const df = (b.fraccion ?? -1) - (a.fraccion ?? -1);
    return df !== 0 ? df : _atPrio(a.nombre) - _atPrio(b.nombre);
  });

  const rows = [];
  let belowAt = false;
  sorted.forEach((eq, i) => {
    const esAtBoundary  = eq.nombre === atRecAlta;
    const esAtBaja      = eq.nombre === atRecBaja;
    // El botón ⬇⚡ aparece en cualquier REC que no sea rec_alta mientras rec_baja no esté asignado
    const puedeRegBaja  = atHasConf && !atRecBaja;
    rows.push(_vccEqRow(eq, esAtBoundary, atTension, esAtBaja, atHasConf, puedeRegBaja, atRecAlta));
    if (i < sorted.length - 1) {
      const next  = sorted[i + 1];
      const saved = savedConds.find(c => c.entre_b === eq.nombre && c.entre_a === next.nombre);
      if (esAtBoundary) { rows.push(_vccAutotrafoSepRow(atTension, atRecAlta, atRecBaja)); belowAt = true; }
      rows.push(_vccCondBtnRow(eq.nombre, next.nombre, eq.fraccion ?? null));
      if (saved) rows.push(_vccCondRow(eq.nombre, next.nombre, eq.fraccion ?? null, saved.corriente_a));
    }
  });

  const atAltaLabel = atRecAlta ?? `${atTension}kV (feeder en alta)`;
  const atFooter = atConfig
    ? `<span class="text-muted small ms-2">⚡ Autotrafo: <b>${atAltaLabel}</b>` +
      (atRecBaja ? ` / <b>${atRecBaja}</b> (12kV)` : ` <span class="text-warning" style="font-size:.75rem">[12kV pendiente]</span>`) +
      `<button class="btn btn-link btn-sm py-0 px-1 text-danger ms-1" onclick="vccEliminarAutotrafo('${atRecBaja}')"
               title="Eliminar autotrafo">×</button></span>`
    : "";

  cont.innerHTML =
    `<div style="overflow-x:auto">` +
    `<table class="table table-sm tabla-vcc mb-1" style="font-size:.82rem">` +
    `<thead><tr><th>Tipo</th><th>NUMPOS</th>` +
    `<th class="text-end">Fracc.</th><th class="text-end">kVA↓</th>` +
    `<th class="text-end">CN (A)</th><th></th></tr></thead>` +
    `<tbody>${rows.join("")}</tbody></table></div>` +
    `<div class="d-flex align-items-center gap-2 flex-wrap mt-1">` +
    `<button class="btn btn-sm btn-outline-secondary" onclick="vccGuardarConfigAlim()">` +
    `<i class="bi bi-floppy me-1"></i>Guardar configuración</button>` +
    atFooter +
    `</div>`;
  initTooltips(cont);
}

function _vccEqRow(eq, esAtBoundary = false, atTension = 23, esAtBaja = false, atHasConf = false, puedeRegistrarBaja = false, atRecAltaNom = null) {
  const TIPO_BADGE = {
    reconectador: `<span class="badge bg-danger">REC</span>`,
    equipo_sub:   `<span class="badge bg-primary">Sub</span>`,
  };
  const badge    = TIPO_BADGE[eq.tipo] || `<span class="badge bg-secondary">${eq.tipo||'?'}</span>`;
  const fracHtml = eq.fraccion != null
    ? `${(eq.fraccion * 100).toFixed(1)}%` : `<span class="text-muted">—</span>`;
  const kvaHtml  = eq.kva_down != null
    ? Math.round(eq.kva_down).toLocaleString("es-CL") : `<span class="text-muted">—</span>`;
  const warnHtml = (eq.tds_sin_kva > 0)
    ? ` <span class="text-warning" title="${eq.tds_sin_kva} TDs sin kVA">⚠</span>` : "";
  const cfg   = state.equiposConfig[eq.nombre];
  const esPPF = /^PPF/i.test(eq.nombre);
  let cnHtml;
  if (esPPF) {
    cnHtml = cfg?.es_hdlb === true
      ? `<span class="badge bg-success" style="font-size:.7rem">HDLB</span>`
      : cfg?.es_hdlb === false
        ? `<span class="badge bg-warning text-dark" style="font-size:.7rem">No HDLB</span>`
        : `<span class="text-warning" style="font-size:.8rem" title="Configurar si está en troncal">⚠ ¿HDLB?</span>`;
  } else {
    const cnPrefill = cfg?.corriente_a ?? "";
    const tipoBadge = cfg?.corriente_a
      ? ` <span class="text-info" style="font-size:.72rem">(${
          cfg.tipo_limite === "setpoint" ? "SP" : cfg.tipo_limite === "fusible" ? "Fus" : "Cond"})</span>` : "";
    cnHtml = `<input type="number" class="form-control form-control-sm d-inline-block" style="width:68px"` +
      ` id="vcc-cn-${eq.nombre}" placeholder="A" min="1" value="${cnPrefill}">${tipoBadge}`;
  }
  const atBadge = esAtBoundary
    ? ` <span class="badge bg-warning text-dark" style="font-size:.65rem" title="REC lado ${atTension} kV del autotrafo">⚡ ${atTension}kV</span>`
    : esAtBaja
      ? ` <span class="badge bg-info text-white" style="font-size:.65rem" title="REC lado 12 kV del autotrafo">⚡ 12kV</span>`
      : "";
  const tlcBadge = eq.tlc
    ? ` <span style="font-size:.65rem;color:#198754;font-weight:700">[TLC]</span>`
    : "";
  let atBtn = "";
  if (_esBordeATR(eq.nombre) && !esAtBoundary && !esAtBaja) {
    if (puedeRegistrarBaja) {
      atBtn = `<button class="btn btn-link btn-sm p-0 text-info ms-1"
                onclick="vccRegistrarRecBaja('${eq.nombre}', '${atRecAltaNom}')"
                title="Registrar como equipo lado 12 kV del autotrafo">⬇⚡</button>`;
    } else if (!atHasConf) {
      atBtn = `<button class="btn btn-link btn-sm p-0 text-warning ms-1"
                onclick="vccRegistrarAutotrafo('${eq.nombre}', ${atTension})"
                title="Registrar como equipo ${atTension} kV del autotrafo">⚡</button>`;
    }
  }
  const rowStyle = esAtBoundary
    ? ' style="background:#fff9e6"'
    : esAtBaja
      ? ' style="background:#e8f4ff"'
      : "";
  return `<tr class="vcc-eq-row" data-nombre="${eq.nombre}" data-fraccion="${eq.fraccion ?? ''}"${rowStyle}>` +
    `<td>${badge}</td><td class="font-monospace">${eq.nombre}${atBadge}${tlcBadge}</td>` +
    `<td class="text-end">${fracHtml}${warnHtml}</td><td class="text-end">${kvaHtml}</td>` +
    `<td class="text-end">${cnHtml}</td>` +
    `<td><button class="btn btn-link btn-sm p-0 text-secondary" ` +
      `onclick="fichaAbrirModal('${eq.nombre}')" title="Configurar equipo">⚙</button>${atBtn}</td></tr>`;
}

function _vccAutotrafoSepRow(tensionAlta, recAlta, recBaja = null) {
  const bajaInfo = recBaja
    ? ` → <code>${recBaja}</code> (12 kV)`
    : ` → <span class="text-warning" style="font-size:.72rem">[12 kV por asignar ⬇⚡]</span>`;
  return `<tr class="vcc-at-sep-row">` +
    `<td colspan="6" class="py-1 px-2" ` +
    `style="background:#fff3cd;border-top:2px dashed #ffc107;border-bottom:2px dashed #ffc107;font-size:.75rem">` +
    `<i class="bi bi-lightning-charge-fill text-warning me-1"></i>` +
    `<b>Autotrafo</b> — <code>${recAlta}</code> (${tensionAlta} kV)${bajaInfo}` +
    `</td></tr>`;
}

function _vccCondBtnRow(entreB, entreA, fraccion) {
  return `<tr class="vcc-cond-btn-row" ` +
    `data-entre-b="${entreB}" data-entre-a="${entreA}" data-fraccion="${fraccion ?? ''}">` +
    `<td colspan="6" class="p-0 text-center" style="border:none">` +
    `<button class="btn btn-link btn-sm text-muted py-0 w-100 vcc-cond-btn" ` +
    `style="font-size:.7rem;opacity:.45" onclick="vccInsertarConductor(this)" ` +
    `title="Agregar conductor intermedio entre ${entreA} y ${entreB}">` +
    `<i class="bi bi-plus-circle me-1"></i>conductor</button></td></tr>`;
}

function _vccCondRow(entreB, entreA, fraccion, cn) {
  return `<tr class="vcc-cond-row" ` +
    `data-entre-b="${entreB}" data-entre-a="${entreA}" data-fraccion="${fraccion ?? ''}">` +
    `<td colspan="2"><span class="badge bg-secondary" style="font-size:.7rem">Cond</span>` +
    ` <span class="text-muted" style="font-size:.75rem">tramo</span></td>` +
    `<td colspan="2" class="text-muted" style="font-size:.75rem">→ ${entreB}</td>` +
    `<td class="text-end"><input type="number" ` +
    `class="form-control form-control-sm d-inline-block vcc-cond-cn-input" ` +
    `style="width:68px" placeholder="A" min="1" value="${cn ?? ''}"></td>` +
    `<td><button class="btn btn-link btn-sm p-0 text-danger" ` +
    `onclick="vccEliminarConductor(this)" title="Eliminar conductor">×</button></td></tr>`;
}

function vccInsertarConductor(btn) {
  const btnRow = btn.closest("tr.vcc-cond-btn-row");
  btnRow.insertAdjacentHTML("afterend",
    _vccCondRow(btnRow.dataset.entreB, btnRow.dataset.entreA,
      parseFloat(btnRow.dataset.fraccion) || null, null));
  btn.disabled      = true;
  btn.style.opacity = "0.2";
}

function vccEliminarConductor(btn) {
  const condRow = btn.closest("tr.vcc-cond-row");
  const tbody   = condRow.closest("tbody");
  const condBtn = tbody.querySelector(
    `tr.vcc-cond-btn-row[data-entre-b="${condRow.dataset.entreB}"]` +
    `[data-entre-a="${condRow.dataset.entreA}"] .vcc-cond-btn`);
  if (condBtn) { condBtn.disabled = false; condBtn.style.opacity = ".45"; }
  condRow.remove();
}

// ─── Configuración equipos receptor (panel B en modo Topología VCC) ──────────

async function vccCargarEquiposB(nomAlimB, equiposTroncal) {
  const panel = document.getElementById("vcc-panel-equipos-b");
  if (!panel) return;
  if (!nomAlimB || !equiposTroncal?.length) {
    panel.innerHTML = ""; panel.style.display = "none"; return;
  }
  panel.style.display = "";
  panel.innerHTML = `<div class="text-muted small"><i class="bi bi-hourglass me-1"></i>Cargando equipos del receptor...</div>`;
  try {
    const r = await apiFetch("/api/alim/troncal_enriquecido", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom_alim: nomAlimB, equipos: equiposTroncal }),
    });
    if (!r.ok || !r.data?.equipos) {
      panel.innerHTML = `<p class="text-danger small">Error: ${r.error || "sin datos del receptor"}</p>`; return;
    }
    const alimCfgR  = await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nomAlimB)}`).catch(() => null);
    const savedConds = (alimCfgR && alimCfgR.ok !== false) ? (alimCfgR.conductores_intermedios ?? []) : [];
    vccRenderEquiposBInputs(r.data.equipos, savedConds);
  } catch(e) {
    panel.innerHTML = `<p class="text-danger small">Error al cargar equipos: ${e.message}</p>`;
  }
}

function vccRenderEquiposBInputs(equipos, savedConds) {
  const panel = document.getElementById("vcc-panel-equipos-b");
  if (!panel) return;
  if (!equipos.length) {
    panel.innerHTML = `<p class="text-muted small">Sin equipos troncales en el receptor.</p>`; return;
  }
  const sorted = [...equipos].sort((a, b) => (b.fraccion ?? -1) - (a.fraccion ?? -1));
  const rows = [];
  sorted.forEach((eq, i) => {
    rows.push(_vccbEqRow(eq));
    if (i < sorted.length - 1) {
      const next  = sorted[i + 1];
      const saved = savedConds.find(c => c.entre_b === eq.nombre && c.entre_a === next.nombre);
      rows.push(_vccbCondBtnRow(eq.nombre, next.nombre, eq.fraccion ?? null));
      if (saved) rows.push(_vccbCondRow(eq.nombre, next.nombre, eq.fraccion ?? null, saved.corriente_a));
    }
  });
  panel.innerHTML =
    `<div class="small fw-semibold mb-1" style="color:#f5a623">` +
    `<i class="bi bi-arrow-right-circle me-1"></i>Equipos troncales del receptor</div>` +
    `<div style="overflow-x:auto"><table class="table table-sm tabla-vcc mb-1" style="font-size:.82rem">` +
    `<thead><tr><th>Tipo</th><th>NUMPOS</th>` +
    `<th class="text-end">Fracc.</th><th class="text-end">kVA↓</th>` +
    `<th class="text-end">CN (A)</th><th></th></tr></thead>` +
    `<tbody>${rows.join("")}</tbody></table></div>` +
    `<button class="btn btn-sm btn-outline-secondary mt-1" id="vccb-guardar-btn" onclick="vccGuardarConfigAlimB()">` +
    `<i class="bi bi-floppy me-1"></i>Guardar configuración receptor</button>`;
  initTooltips(panel);
}

function _vccbEqRow(eq) {
  const TIPO_BADGE = {
    reconectador: `<span class="badge bg-danger">REC</span>`,
    equipo_sub:   `<span class="badge bg-primary">Sub</span>`,
  };
  const badge   = TIPO_BADGE[eq.tipo] || `<span class="badge bg-secondary">${eq.tipo||'?'}</span>`;
  const fracHtml = eq.fraccion != null ? `${(eq.fraccion*100).toFixed(1)}%` : `<span class="text-muted">—</span>`;
  const kvaHtml  = eq.kva_down != null ? Math.round(eq.kva_down).toLocaleString("es-CL") : `<span class="text-muted">—</span>`;
  const warnHtml = (eq.tds_sin_kva > 0) ? ` <span class="text-warning" title="${eq.tds_sin_kva} TDs sin kVA">⚠</span>` : "";
  const cfg   = state.equiposConfig[eq.nombre];
  const esPPF = /^PPF/i.test(eq.nombre);
  let cnHtml;
  if (esPPF) {
    cnHtml = cfg?.es_hdlb === true
      ? `<span class="badge bg-success" style="font-size:.7rem">HDLB</span>`
      : cfg?.es_hdlb === false
        ? `<span class="badge bg-warning text-dark" style="font-size:.7rem">No HDLB</span>`
        : `<span class="text-warning" style="font-size:.8rem">⚠ ¿HDLB?</span>`;
  } else {
    const cnPrefill = cfg?.corriente_a ?? "";
    cnHtml = `<input type="number" class="form-control form-control-sm d-inline-block" style="width:68px"` +
      ` id="vccb-cn-${eq.nombre}" placeholder="A" min="1" value="${cnPrefill}">`;
  }
  return `<tr class="vccb-eq-row" data-nombre="${eq.nombre}" data-tipo="${eq.tipo??''}" data-fraccion="${eq.fraccion??''}">` +
    `<td>${badge}</td><td class="font-monospace">${eq.nombre}</td>` +
    `<td class="text-end">${fracHtml}${warnHtml}</td><td class="text-end">${kvaHtml}</td>` +
    `<td class="text-end">${cnHtml}</td>` +
    `<td><button class="btn btn-link btn-sm p-0 text-secondary" ` +
      `onclick="fichaAbrirModal('${eq.nombre}', () => vccCargarEquiposB(state.vccAlimDestNom, state.vccEquiposTroncalB))" ` +
      `title="Configurar equipo">⚙</button></td></tr>`;
}

function _vccbCondBtnRow(entreB, entreA, fraccion) {
  return `<tr class="vccb-cond-btn-row" data-entre-b="${entreB}" data-entre-a="${entreA}" data-fraccion="${fraccion??''}">` +
    `<td colspan="6" class="p-0 text-center" style="border:none">` +
    `<button class="btn btn-link btn-sm text-muted py-0 w-100 vccb-cond-btn" ` +
    `style="font-size:.7rem;opacity:.45" onclick="vccbInsertarConductor(this)" ` +
    `title="Agregar conductor entre ${entreA} y ${entreB}">` +
    `<i class="bi bi-plus-circle me-1"></i>conductor</button></td></tr>`;
}

function _vccbCondRow(entreB, entreA, fraccion, cn) {
  return `<tr class="vccb-cond-row" data-entre-b="${entreB}" data-entre-a="${entreA}" data-fraccion="${fraccion??''}">` +
    `<td colspan="2"><span class="badge bg-secondary" style="font-size:.7rem">Cond</span>` +
    ` <span class="text-muted" style="font-size:.75rem">tramo</span></td>` +
    `<td colspan="2" class="text-muted" style="font-size:.75rem">→ ${entreB}</td>` +
    `<td class="text-end"><input type="number" ` +
    `class="form-control form-control-sm d-inline-block vccb-cond-cn-input" ` +
    `style="width:68px" placeholder="A" min="1" value="${cn??''}"></td>` +
    `<td><button class="btn btn-link btn-sm p-0 text-danger" ` +
    `onclick="vccbEliminarConductor(this)" title="Eliminar conductor">×</button></td></tr>`;
}

function vccbInsertarConductor(btn) {
  const btnRow = btn.closest("tr.vccb-cond-btn-row");
  btnRow.insertAdjacentHTML("afterend",
    _vccbCondRow(btnRow.dataset.entreB, btnRow.dataset.entreA,
      parseFloat(btnRow.dataset.fraccion) || null, null));
  btn.disabled = true; btn.style.opacity = "0.2";
}

function vccbEliminarConductor(btn) {
  const condRow = btn.closest("tr.vccb-cond-row");
  const tbody   = condRow.closest("tbody");
  const condBtn = tbody.querySelector(
    `tr.vccb-cond-btn-row[data-entre-b="${condRow.dataset.entreB}"]` +
    `[data-entre-a="${condRow.dataset.entreA}"] .vccb-cond-btn`);
  if (condBtn) { condBtn.disabled = false; condBtn.style.opacity = ".45"; }
  condRow.remove();
}

async function vccGuardarConfigAlimB() {
  const nom = state.vccAlimDestNom;
  if (!nom) return mostrarError("Sin alimentador receptor seleccionado.");
  const conductores = [];
  document.getElementById("vcc-panel-equipos-b")?.querySelectorAll("tr.vccb-cond-row").forEach(tr => {
    const el = tr.querySelector(".vccb-cond-cn-input");
    const cn = el ? (parseFloat(el.value) || null) : null;
    if (cn) conductores.push({ entre_a: tr.dataset.entreA, entre_b: tr.dataset.entreB, corriente_a: cn });
  });
  spinner(true, "Guardando...");
  try {
    await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nom)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conductores_intermedios: conductores }),
    });
    const btn = document.getElementById("vccb-guardar-btn");
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = `<i class="bi bi-check-circle me-1 text-success"></i>Guardado`;
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    }
  } catch(e) { mostrarError("Error al guardar: " + e.message); }
  finally { spinner(false); }
}

function vccLeerCNsEquiposB() {
  const panel = document.getElementById("vcc-panel-equipos-b");
  if (!panel || panel.style.display === "none") return state.vccEquiposTroncalB;
  const result = [];
  panel.querySelectorAll("tr.vccb-eq-row").forEach(tr => {
    const nombre   = tr.dataset.nombre;
    const fraccion = tr.dataset.fraccion !== "" ? parseFloat(tr.dataset.fraccion) : null;
    const tipo     = tr.dataset.tipo || null;
    const el       = document.getElementById(`vccb-cn-${nombre}`);
    const cn       = el ? (parseFloat(el.value) || null) : null;
    result.push({ nombre, fraccion, tipo, cn });
  });
  panel.querySelectorAll("tr.vccb-cond-row").forEach(tr => {
    const el = tr.querySelector(".vccb-cond-cn-input");
    const cn = el ? (parseFloat(el.value) || null) : null;
    result.push({
      tipo:    "conductor_intermedio",
      entre_b: tr.dataset.entreB,
      entre_a: tr.dataset.entreA,
      fraccion: tr.dataset.fraccion !== "" ? parseFloat(tr.dataset.fraccion) : null,
      cn,
    });
  });
  return result.length ? result : state.vccEquiposTroncalB;
}

async function vccGuardarConfigAlim() {
  const nom = state.vccAlimNom;
  if (!nom) return mostrarError("Sin alimentador seleccionado.");
  const conductores = [];
  document.querySelectorAll("tr.vcc-cond-row").forEach(tr => {
    const el = tr.querySelector(".vcc-cond-cn-input");
    const cn = el ? (parseFloat(el.value) || null) : null;
    if (cn) conductores.push({ entre_a: tr.dataset.entreA, entre_b: tr.dataset.entreB, corriente_a: cn });
  });
  const autotrafos = state.alimConfig?.autotrafos ?? [];
  spinner(true, "Guardando...");
  try {
    await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nom)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conductores_intermedios: conductores, autotrafos }),
    });
    state.alimConfig = Object.assign({}, state.alimConfig ?? {}, { conductores_intermedios: conductores });
    const saveBtn = document.querySelector("#vcc-card-equipos button[onclick='vccGuardarConfigAlim()']");
    if (saveBtn) {
      const orig = saveBtn.innerHTML;
      saveBtn.innerHTML = `<i class="bi bi-check-circle me-1 text-success"></i>Guardado`;
      setTimeout(() => { saveBtn.innerHTML = orig; }, 2000);
    }
  } catch(e) { mostrarError("Error al guardar: " + e.message); }
  finally { spinner(false); }
}

async function vccRegistrarAutotrafo(recAlta, tensionAlta = 23) {
  const nom = state.vccAlimNom;
  if (!nom) return;
  const conductores = [];
  document.querySelectorAll("tr.vcc-cond-row").forEach(tr => {
    const el = tr.querySelector(".vcc-cond-cn-input");
    const cn = el ? (parseFloat(el.value) || null) : null;
    if (cn) conductores.push({ entre_a: tr.dataset.entreA, entre_b: tr.dataset.entreB, corriente_a: cn });
  });
  const autotrafos = [...(state.alimConfig?.autotrafos ?? []),
                     { rec_alta: recAlta, rec_baja: null, tension_alta: tensionAlta }];
  spinner(true, "Guardando autotrafo...");
  try {
    await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nom)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conductores_intermedios: conductores, autotrafos }),
    });
    state.alimConfig = Object.assign({}, state.alimConfig ?? {}, { conductores_intermedios: conductores, autotrafos });
    const atBadge = document.getElementById("vcc-alim-at-badge");
    if (atBadge) atBadge.style.display = "";
    vccRenderEquiposInputs(state.vccEquipos);
  } catch(e) { mostrarError("Error al guardar autotrafo: " + e.message); }
  finally { spinner(false); }
}

async function vccEliminarAutotrafo(recBaja) {
  const nom = state.vccAlimNom;
  if (!nom) return;
  const conductores = (state.alimConfig?.conductores_intermedios ?? []);
  const autotrafos  = (state.alimConfig?.autotrafos ?? []).filter(at => at.rec_baja !== recBaja);
  spinner(true, "Eliminando autotrafo...");
  try {
    await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nom)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conductores_intermedios: conductores, autotrafos }),
    });
    state.alimConfig = Object.assign({}, state.alimConfig ?? {}, { autotrafos });
    const atBadge = document.getElementById("vcc-alim-at-badge");
    if (atBadge) atBadge.style.display = autotrafos.length ? "" : "none";
    vccRenderEquiposInputs(state.vccEquipos);
  } catch(e) { mostrarError("Error al eliminar autotrafo: " + e.message); }
  finally { spinner(false); }
}

async function vccRegistrarRecBaja(recBaja, recAlta) {
  const nom = state.vccAlimNom;
  if (!nom) return;
  const atConfig = (state.alimConfig?.autotrafos ?? []).find(at => at.rec_alta === recAlta);
  if (!atConfig?.rec_alta) return mostrarError("Primero registra el equipo del lado 23 kV.");
  const conductores = [];
  document.querySelectorAll("tr.vcc-cond-row").forEach(tr => {
    const el = tr.querySelector(".vcc-cond-cn-input");
    const cn = el ? (parseFloat(el.value) || null) : null;
    if (cn) conductores.push({ entre_a: tr.dataset.entreA, entre_b: tr.dataset.entreB, corriente_a: cn });
  });
  const autotrafos = (state.alimConfig?.autotrafos ?? []).map(at =>
    at.rec_alta === recAlta ? { ...at, rec_baja: recBaja } : at
  );
  spinner(true, "Guardando REC 12 kV...");
  try {
    await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nom)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conductores_intermedios: conductores, autotrafos }),
    });
    state.alimConfig = Object.assign({}, state.alimConfig ?? {}, { conductores_intermedios: conductores, autotrafos });
    vccRenderEquiposInputs(state.vccEquipos);
  } catch(e) { mostrarError("Error al guardar REC 12 kV: " + e.message); }
  finally { spinner(false); }
}

// ─── Equipos receptor (alim B) — configuración desde tab Traspasos ───────────

async function tspCargarEquiposB(numalimDest, nomAlimB, equiposTroncal) {
  const panel = document.getElementById("panel-equipos-b");
  if (!numalimDest || !nomAlimB) {
    if (panel) panel.style.display = "none";
    state.troncalBNomAlim = null;
    state.troncalBEnriquecido = [];
    return;
  }
  state.troncalBNomAlim = nomAlimB;
  const cont = document.getElementById("equipos-b-tabla");
  state.equiposConfigB = state.equiposConfig;
  try {
    const alimCfgR = await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nomAlimB)}`).catch(() => null);
    state.alimConfigB = (alimCfgR && alimCfgR.ok !== false) ? alimCfgR : null;

    if (equiposTroncal?.length) {
      // ── Modo automático: troncal desde la tabla LZ, enriquecido con fracciones ──
      const r = await apiFetch("/api/alim/troncal_enriquecido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom_alim: nomAlimB, equipos: equiposTroncal }),
      });
      state.troncalBEnriquecido = r.data?.equipos ?? [];
      state.equiposBDisponibles = null;
      tspRenderEquiposBTabla(state.troncalBEnriquecido);
    } else {
      // ── Modo manual (traspaso forzado): panel vacío + selector para agregar ──
      // La composición del troncal es efímera (no se persiste); solo el CN de cada
      // equipo se guarda vía ⚙ → equipos_config.
      const r = await apiFetch(`/api/vcc/equipos/${encodeURIComponent(nomAlimB)}?modo=equipos`);
      state.equiposBDisponibles = Array.isArray(r) ? r : [];
      state.troncalBEnriquecido = [];
      tspRenderManualB();
    }
    if (panel) panel.style.display = "";
  } catch(e) {
    if (cont) cont.innerHTML = `<p class="text-danger small"><i class="bi bi-x-circle me-1"></i>Error al cargar equipos: ${e.message}</p>`;
    if (panel) panel.style.display = "";
  }
}

// Panel de troncal manual (traspaso forzado): selector para agregar equipos del
// receptor + tabla de los agregados. No persiste la composición (solo CN por equipo).
function tspRenderManualB() {
  const cont = document.getElementById("equipos-b-tabla");
  if (!cont) return;
  const added       = state.troncalBEnriquecido || [];
  const disponibles = (state.equiposBDisponibles || [])
    .filter(e => !added.some(a => a.nombre === e.nombre));

  const opts = disponibles.map(e => {
    const fr = e.fraccion != null ? ` (${(e.fraccion * 100).toFixed(1)}%)` : "";
    return `<option value="${e.nombre}">${e.nombre}${fr}</option>`;
  }).join("");

  const filas = added.length
    ? added.map(eq => _tspEqBRow(eq, true)).join("")
    : `<tr><td colspan="6" class="text-muted small text-center py-2">Sin equipos agregados — usa el selector para añadir el camino del receptor.</td></tr>`;

  cont.innerHTML =
    `<div class="alert alert-warning py-2 px-3 small mb-2">
       <i class="bi bi-exclamation-triangle me-1"></i>
       <strong>Troncal manual (traspaso forzado).</strong> La base no registra el troncal de este receptor.
       Agrega los equipos del camino; las fracciones se calculan desde aguas_abajo.
       <span class="text-muted d-block mt-1">Esta composición no se guarda — solo el CN de cada equipo (⚙).</span>
     </div>
     <select class="form-select form-select-sm mb-2" id="tsp-b-add-select"
             onchange="tspAgregarEquipoB(this.value); this.value='';">
       <option value="">+ Agregar equipo del receptor…</option>${opts}
     </select>
     <div style="overflow-x:auto">
       <table class="table table-sm tabla-vcc mb-1" style="font-size:.82rem">
         <thead><tr><th>Tipo</th><th>NUMPOS</th>
           <th class="text-end">Fracc.</th><th class="text-end">kVA↓</th>
           <th class="text-end">CN (A)</th><th></th></tr></thead>
         <tbody>${filas}</tbody>
       </table>
     </div>`;
  initTooltips(cont);
}

function tspAgregarEquipoB(nombre) {
  if (!nombre) return;
  const eq = (state.equiposBDisponibles || []).find(e => e.nombre === nombre);
  if (!eq) return;
  if ((state.troncalBEnriquecido || []).some(e => e.nombre === nombre)) return;
  state.troncalBEnriquecido = [...(state.troncalBEnriquecido || []), eq];
  tspRenderManualB();
}

function tspQuitarEquipoB(nombre) {
  state.troncalBEnriquecido = (state.troncalBEnriquecido || []).filter(e => e.nombre !== nombre);
  tspRenderManualB();
}

function tspRenderEquiposBTabla(equipos) {
  const cont = document.getElementById("equipos-b-tabla");
  if (!cont) return;
  if (!equipos.length) {
    cont.innerHTML = `<p class='text-muted small'>Sin equipos troncales identificados.</p>`;
    return;
  }
  const sorted     = [...equipos].sort((a, b) => (b.fraccion ?? -1) - (a.fraccion ?? -1));
  const savedConds = state.alimConfigB?.conductores_intermedios ?? [];
  const rows = [];
  sorted.forEach((eq, i) => {
    rows.push(_tspEqBRow(eq));
    if (i < sorted.length - 1) {
      const next  = sorted[i + 1];
      const saved = savedConds.find(c => c.entre_b === eq.nombre && c.entre_a === next.nombre);
      rows.push(_vccCondBtnRow(eq.nombre, next.nombre, eq.fraccion ?? null));
      if (saved) rows.push(_vccCondRow(eq.nombre, next.nombre, eq.fraccion ?? null, saved.corriente_a));
    }
  });
  cont.innerHTML =
    `<div style="overflow-x:auto">` +
    `<table class="table table-sm tabla-vcc mb-1" style="font-size:.82rem">` +
    `<thead><tr><th>Tipo</th><th>NUMPOS</th>` +
    `<th class="text-end">Fracc.</th><th class="text-end">kVA↓</th>` +
    `<th class="text-end">CN (A)</th><th></th></tr></thead>` +
    `<tbody>${rows.join("")}</tbody></table></div>` +
    `<button class="btn btn-sm btn-outline-secondary mt-1" onclick="tspGuardarConfigAlimB()">` +
    `<i class="bi bi-floppy me-1"></i>Guardar configuración del receptor</button>`;
  initTooltips(cont);
}

function _tspEqBRow(eq, removable = false) {
  const badge    = _badgeTipoEquipo(eq.nombre);
  const fracHtml = eq.fraccion != null
    ? `${(eq.fraccion * 100).toFixed(1)}%` : `<span class="text-muted">—</span>`;
  const kvaHtml  = eq.kva_down != null
    ? Math.round(eq.kva_down).toLocaleString("es-CL") : `<span class="text-muted">—</span>`;
  const warnHtml = (eq.tds_sin_kva > 0)
    ? ` <span class="text-warning" title="${eq.tds_sin_kva} TDs sin kVA">⚠</span>` : "";
  const cfg        = state.equiposConfigB[eq.nombre];
  const cnPrefill  = cfg?.corriente_a ?? "";
  const tipoBadge  = cfg?.corriente_a
    ? ` <span class="text-info" style="font-size:.72rem">(${
        cfg.tipo_limite === "setpoint" ? "SP" : cfg.tipo_limite === "fusible" ? "Fus" : "Cond"})</span>` : "";
  const cnHtml = `<input type="number" class="form-control form-control-sm d-inline-block" style="width:68px"` +
    ` id="b-cn-${eq.nombre}" placeholder="A" min="1" value="${cnPrefill}">${tipoBadge}`;
  const removeBtn = removable
    ? ` <button class="btn btn-link btn-sm p-0 text-danger" onclick="tspQuitarEquipoB('${eq.nombre}')" title="Quitar del troncal"><i class="bi bi-trash"></i></button>`
    : "";
  return `<tr class="vcc-eq-row" data-nombre="${eq.nombre}" data-fraccion="${eq.fraccion ?? ''}">` +
    `<td>${badge}</td><td class="font-monospace">${eq.nombre}</td>` +
    `<td class="text-end">${fracHtml}${warnHtml}</td><td class="text-end">${kvaHtml}</td>` +
    `<td class="text-end">${cnHtml}</td>` +
    `<td class="text-nowrap"><button class="btn btn-link btn-sm p-0 text-secondary" ` +
      `onclick="fichaAbrirModal('${eq.nombre}', () => tspRefrescarCNsB())" title="Configurar equipo">⚙</button>${removeBtn}</td></tr>`;
}

async function tspGuardarConfigAlimB() {
  const nom = state.troncalBNomAlim;
  if (!nom) return mostrarError("Sin alimentador receptor seleccionado.");
  const conductores = [];
  document.querySelectorAll("#equipos-b-tabla tr.vcc-cond-row").forEach(tr => {
    const el = tr.querySelector(".vcc-cond-cn-input");
    const cn = el ? (parseFloat(el.value) || null) : null;
    if (cn) conductores.push({ entre_a: tr.dataset.entreA, entre_b: tr.dataset.entreB, corriente_a: cn });
  });
  spinner(true, "Guardando...");
  try {
    await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nom)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conductores_intermedios: conductores }),
    });
    state.alimConfigB = { conductores_intermedios: conductores };
    const btn = document.querySelector("#equipos-b-tabla button[onclick='tspGuardarConfigAlimB()']");
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = `<i class="bi bi-check-circle me-1 text-success"></i>Guardado`;
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    }
  } catch(e) { mostrarError("Error al guardar: " + e.message); }
  finally { spinner(false); }
}

function tspLeerEquiposB() {
  const result = [];
  const tabla  = document.getElementById("equipos-b-tabla");
  if (!tabla) return result;
  tabla.querySelectorAll("tr.vcc-eq-row, tr.vcc-cond-row").forEach(tr => {
    if (tr.classList.contains("vcc-eq-row")) {
      const nombre   = tr.dataset.nombre;
      const fraccion = tr.dataset.fraccion !== "" ? parseFloat(tr.dataset.fraccion) : null;
      const el       = document.getElementById(`b-cn-${nombre}`);
      const cn       = el ? (parseFloat(el.value) || null) : null;
      result.push({ nombre, fraccion, cn });
    } else {
      const entreB   = tr.dataset.entreB;
      const fraccion = tr.dataset.fraccion !== "" ? parseFloat(tr.dataset.fraccion) : null;
      const el       = tr.querySelector(".vcc-cond-cn-input");
      const cn       = el ? (parseFloat(el.value) || null) : null;
      if (!cn) return;
      result.push({ nombre: `conductor_intermedio→${entreB}`, tipo: "conductor_intermedio",
                    entre_b: entreB, entre_a: tr.dataset.entreA, fraccion, cn });
    }
  });
  return result;
}

async function tspRefrescarCNsB() {
  await cargarEquiposConfig();
  state.equiposConfigB = state.equiposConfig;
  document.querySelectorAll("#equipos-b-tabla tr.vcc-eq-row").forEach(tr => {
    const nombre = tr.dataset.nombre;
    const cfg    = state.equiposConfigB[nombre];
    const el     = document.getElementById(`b-cn-${nombre}`);
    if (!el || !cfg?.corriente_a) return;
    el.value = cfg.corriente_a;
  });
}

// ─── traspaso simultáneo ──────────────────────────────────────────────────
function vccToggleTraspaso() {
  const body    = document.getElementById("vcc-traspaso-body");
  const chevron = document.getElementById("vcc-traspaso-chevron");
  const open    = body.style.display === "";
  body.style.display      = open ? "none" : "";
  chevron.style.transform = open ? "" : "rotate(180deg)";
}

function vccTraspasoModo(modo) {
  ["a","pct","topo"].forEach(m =>
    document.getElementById(`vcc-traspaso-panel-${m}`).style.display = m === modo ? "" : "none"
  );
  if (modo !== "topo") {
    const el = document.getElementById("vcc-traspaso-isla-result");
    if (el) { el.style.display = "none"; el.innerHTML = ""; }
  }
  // Al entrar al modo topo, poblar dropdown equipo_abre desde vccEquipos
  if (modo === "topo") _vccPoblarAbreDropdown();
  // En modos a/pct renderizar selector de destino manual
  if (modo === "a"   ) _vccRenderDestinoManual("vcc-traspaso-dest-a");
  if (modo === "pct" ) _vccRenderDestinoManual("vcc-traspaso-dest-pct");
}

function _vccPoblarAbreDropdown() {
  const sel = document.getElementById("vcc-traspaso-eq-abre");
  if (!sel) return;
  const TIPO_ICON = { reconectador: "🔴", equipo_sub: "🔵" };
  // Mismo orden que la tabla: mayor fraccion primero (más cercano a SE)
  const equipos = [...state.vccEquipos.filter(e => e.nombre)]
    .sort((a, b) => (b.fraccion ?? -1) - (a.fraccion ?? -1));
  sel.innerHTML = `<option value="">— Seleccionar equipo —</option>` +
    equipos.map(e => {
      const icon   = TIPO_ICON[e.tipo] || "⚫";
      const pctStr = e.fraccion != null ? ` (${(e.fraccion * 100).toFixed(1)}%)` : "";
      const kvaStr = e.kva_down != null
        ? ` — ${Math.round(e.kva_down).toLocaleString("es-CL")} kVA↓` : "";
      return `<option value="${e.nombre}">${icon} ${e.nombre}${pctStr}${kvaStr}</option>`;
    }).join("");
  if (equipos.length === 1) {
    sel.value = equipos[0].nombre;
    vccTraspasoAbreChange(equipos[0].nombre);
  }
}

// Llamado al cambiar equipo_abre en modo topo
function vccTraspasoAbreChange(equipoAbre) {
  const destPanel  = document.getElementById("vcc-traspaso-dest-topo");
  const destSel    = document.getElementById("vcc-traspaso-alim-dest");
  const islaEl     = document.getElementById("vcc-traspaso-isla-result");
  const infoEl     = document.getElementById("vcc-traspaso-dest-info");
  if (!destPanel || !destSel) return;

  // Reset destino
  state.vccAlimDestIdx = null; state.vccAlimDestNom = null;
  state.vccNumposLz = null; state.vccEquiposTroncalB = []; state.vccKvaIsla = null;
  if (islaEl) { islaEl.style.display = "none"; islaEl.innerHTML = ""; }
  if (infoEl) infoEl.textContent = "";
  const lzPanel = document.getElementById("vcc-lz-cierra-panel");
  if (lzPanel) lzPanel.style.display = "none";
  vccCargarEquiposB(null, []);

  if (!equipoAbre) { destPanel.style.display = "none"; return; }

  // Filtrar LZ devices donde equipo_abre ∈ equipos_troncal_orig
  const eqUp = equipoAbre.toUpperCase().trim();
  const lzValidos = state.vccLzVecinos.filter(lz =>
    lz.equipos_troncal_orig?.some(e => e.toUpperCase().trim() === eqUp)
  );

  if (!lzValidos.length) {
    destPanel.style.display = "none";
    if (infoEl) {
      infoEl.textContent = "Sin dispositivos LZ aguas abajo de este equipo.";
      infoEl.className = "small text-warning mt-1";
    }
    destPanel.style.display = "";
    destSel.innerHTML = `<option value="">— Sin opciones —</option>`;
    return;
  }

  // Recopilar alimentadores B únicos y viables
  const destMap = new Map(); // numalim → {nom_alim, lzList}
  lzValidos.forEach(lz => {
    lz.vecinos?.forEach(v => {
      if (!v.viable) return;
      if (!destMap.has(v.numalim)) destMap.set(v.numalim, { nom_alim: v.nom_alim, lzList: [] });
      destMap.get(v.numalim).lzList.push({ numpos_lz: lz.numpos_lz, equipos_troncal: v.equipos_troncal, tipo: lz.tipo ?? '', tlc: lz.tlc ?? false });
    });
  });

  if (!destMap.size) {
    destSel.innerHTML = `<option value="">— Sin destinos viables —</option>`;
    destPanel.style.display = "";
    return;
  }

  destSel.innerHTML = `<option value="">— Seleccionar alimentador —</option>` +
    [...destMap.entries()].map(([nm, d]) =>
      `<option value="${nm}" data-nom="${d.nom_alim}">${esAlimFrg(nm) ? '[FRG] ' : ''}${d.nom_alim}</option>`
    ).join("");

  // Guardar mapa en dataset para usarlo al seleccionar
  destSel.dataset.destMap = JSON.stringify(Object.fromEntries(
    [...destMap.entries()].map(([k,v]) => [k, v])
  ));
  destPanel.style.display = "";

  if (infoEl) {
    infoEl.textContent = `${destMap.size} alimentador(es) disponible(s) con LZ aguas abajo`;
    infoEl.className = "small text-success mt-1";
  }
}

// ── EQUIPO QUE CIERRA — selector LZ en VCC ───────────────────────────────
function vccMostrarLzCierra(lzList) {
  const panel = document.getElementById("vcc-lz-cierra-panel");
  if (!panel) return;
  if (!lzList?.length) { panel.style.display = "none"; return; }

  // Solo se etiqueta el subterráneo de 3 ramas; "bilateral" (por defecto) se omite.
  const _badge = lz => lz.tipo === "subterraneo_3ramas"
    ? ` <span class="badge bg-warning text-dark ms-1">3 ramas</span>`
    : '';

  // Auto-seleccionar el primero
  vccSeleccionarLz(lzList[0]);

  if (lzList.length === 1) {
    const lz = lzList[0];
    panel.innerHTML =
      `<div class="small"><i class="bi bi-toggle-on me-1 text-primary"></i>` +
      `<span class="text-muted">Equipo que cierra:</span> ` +
      `<code class="ms-1">${lz.numpos_lz || "cabecera"}</code>${_badge(lz)}${_lzTlcBadge(lz)}</div>`;
  } else {
    const opts = lzList.map((lz, i) =>
      `<div class="form-check form-check-inline mb-0">
        <input class="form-check-input" type="radio" name="vcc-sel-lz"
               id="vcc-lz-radio-${lz.numpos_lz}" value="${lz.numpos_lz}"
               ${i === 0 ? "checked" : ""}
               onchange="vccLzCierraChange('${lz.numpos_lz}')">
        <label class="form-check-label small" for="vcc-lz-radio-${lz.numpos_lz}">
          <code>${lz.numpos_lz || "cabecera"}</code>${_badge(lz)}${_lzTlcBadge(lz)}
        </label>
      </div>`
    ).join("");
    panel.innerHTML =
      `<div class="text-muted small mb-1"><i class="bi bi-toggle-on me-1 text-primary"></i>Equipo que cierra — selecciona:</div>${opts}`;
  }
  panel.style.display = "";
}

function vccSeleccionarLz(lz) {
  state.vccNumposLz        = lz.numpos_lz;
  state.vccEquiposTroncalB = lz.equipos_troncal ?? [];
  vccCargarEquiposB(state.vccAlimDestNom, state.vccEquiposTroncalB);
}

function vccLzCierraChange(numposLz) {
  const destSel = document.getElementById("vcc-traspaso-alim-dest");
  const destMap = JSON.parse(destSel?.dataset.destMap || "{}");
  const entry   = destMap[String(state.vccAlimDestIdx)];
  const lz      = entry?.lzList?.find(l => l.numpos_lz === numposLz);
  if (lz) vccSeleccionarLz(lz);
}

// Llamado al seleccionar alimentador receptor en modo topo
async function vccTraspasoDestinoChange(numalimDestStr) {
  const islaEl = document.getElementById("vcc-traspaso-isla-result");
  const infoEl = document.getElementById("vcc-traspaso-dest-info");
  state.vccAlimDestIdx = null; state.vccAlimDestNom = null;
  state.vccNumposLz = null; state.vccEquiposTroncalB = []; state.vccKvaIsla = null;
  if (islaEl) { islaEl.style.display = "none"; islaEl.innerHTML = ""; }
  if (!numalimDestStr) { vccCargarEquiposB(null, []); return; }

  const numalimDest = parseInt(numalimDestStr);
  const destSel  = document.getElementById("vcc-traspaso-alim-dest");
  const destMap  = JSON.parse(destSel?.dataset.destMap || "{}");
  const entry    = destMap[String(numalimDest)];
  if (!entry) return;

  if (!entry.lzList?.length) return;

  state.vccAlimDestIdx = numalimDest;
  state.vccAlimDestNom = entry.nom_alim;

  // Mostrar selector equipo cierra (auto-selecciona primero y carga panel B)
  vccMostrarLzCierra(entry.lzList);

  // Calcular isla automáticamente
  const equipoAbre = document.getElementById("vcc-traspaso-eq-abre")?.value;
  if (equipoAbre && state.vccAlimIdx) {
    spinner(true, "Calculando segmento...");
    try {
      const r = await apiFetch("/api/isla/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numalim_orig:  state.vccAlimIdx,
          nom_alim_orig: state.vccAlimNom,
          tipo_isla:     "equipo",
          equipo_nombre: equipoAbre,
          tds_excluidos: [],
        }),
      });
      if (!r.error) {
        state.vccKvaIsla = r.kva_isla ?? 0;
        const pPct = r.p_pct?.toFixed(2) ?? "—";
        const nTd  = r.n_td  ?? "—";
        const kvaI = r.kva_isla != null ? Math.round(r.kva_isla).toLocaleString("es-CL") : "—";
        if (islaEl) {
          islaEl.innerHTML =
            `<i class="bi bi-check-circle me-1"></i>` +
            `<strong>${nTd} TDs</strong> · <strong>${kvaI} kVA</strong> · ` +
            `<strong>${pPct}% del alimentador</strong> se traspasa hacia ${entry.nom_alim}`;
          islaEl.dataset.pPct = r.p_pct ?? 0;
          islaEl.style.display = "";
        }
        const badge = document.getElementById("vcc-traspaso-badge");
        if (badge) { badge.textContent = `${pPct}% → ${entry.nom_alim}`; badge.style.display = ""; }
      }
    } catch(e) { /* silencioso */ }
    finally { spinner(false); }
  }
}

// Selector de destino para modos ΔI/% (sin validación topológica)
function _vccRenderDestinoManual(containerId) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  // Recopilar todos los vecinos viables
  const destinos = [];
  state.vccLzVecinos.forEach(lz => {
    lz.vecinos?.forEach(v => {
      if (!v.viable) return;
      if (!destinos.find(d => d.numalim === v.numalim)) {
        destinos.push({ numalim: v.numalim, nom_alim: v.nom_alim,
                        equipos_troncal: v.equipos_troncal, numpos_lz: lz.numpos_lz });
      }
    });
  });
  if (!destinos.length) { cont.innerHTML = ""; return; }

  cont.innerHTML = `
    <label class="form-label text-muted small mb-1">Alimentador receptor <span class="text-muted">(opcional)</span></label>
    <select class="form-select form-select-sm" onchange="vccDestinoManualChange(this)">
      <option value="">— Sin receptor —</option>
      ${destinos.map((d,i) => `<option value="${i}">${d.nom_alim}</option>`).join("")}
    </select>
    <div class="small text-muted mt-1">
      <i class="bi bi-info-circle me-1"></i>Sin validación topológica — referencial.
    </div>
    <div id="${containerId}-info" class="small mt-1"></div>`;
  cont.dataset.destinos = JSON.stringify(destinos);
}

function vccDestinoManualChange(sel) {
  const contId = sel.closest("[id]")?.id;
  const infoId = contId + "-info";
  const infoEl = document.getElementById(infoId);
  state.vccAlimDestIdx = null; state.vccAlimDestNom = null;
  state.vccNumposLz = null; state.vccEquiposTroncalB = [];
  if (infoEl) infoEl.innerHTML = "";
  if (!sel.value) return;

  const destinos = JSON.parse(sel.closest("[data-destinos]")?.dataset.destinos || "[]");
  const d = destinos[parseInt(sel.value)];
  if (!d) return;
  state.vccAlimDestIdx     = d.numalim;
  state.vccAlimDestNom     = d.nom_alim;
  state.vccNumposLz        = d.numpos_lz;
  state.vccEquiposTroncalB = d.equipos_troncal ?? [];
  if (infoEl) infoEl.innerHTML = _htmlEquiposTroncal(state.vccEquiposTroncalB);
}

function vccGetTraspasoParams() {
  const modo = document.querySelector('input[name="vcc-traspaso-modo"]:checked')?.value || "ninguno";
  if (modo === "ninguno") return { delta_traspaso_a: 0, delta_traspaso_pct: 0, delta_traspaso_modo: "" };
  const dest = {
    nom_alim_dest:     state.vccAlimDestNom  || null,
    numalim_dest:      state.vccAlimDestIdx  || null,
    equipo_lz:         state.vccNumposLz     || null,
    equipos_troncal_b: state.vccEquiposTroncalB,
    kva_isla:          state.vccKvaIsla      || null,
  };
  if (modo === "a") {
    const v = parseFloat(document.getElementById("vcc-traspaso-a-val").value) || 0;
    return { delta_traspaso_a: v, delta_traspaso_pct: 0, delta_traspaso_modo: "a", ...dest };
  }
  if (modo === "pct") {
    const v = parseFloat(document.getElementById("vcc-traspaso-pct-val").value) || 0;
    return { delta_traspaso_a: 0, delta_traspaso_pct: v, delta_traspaso_modo: "pct", ...dest };
  }
  if (modo === "topo") {
    const resEl = document.getElementById("vcc-traspaso-isla-result");
    const pPct  = parseFloat(resEl?.dataset.pPct || 0);
    return { delta_traspaso_a: 0, delta_traspaso_pct: pPct, delta_traspaso_modo: "topo",
             ...dest, equipos_troncal_b: vccLeerCNsEquiposB() };
  }
  return { delta_traspaso_a: 0, delta_traspaso_pct: 0, delta_traspaso_modo: "" };
}

// ─── leer ajustes ingresados ──────────────────────────────────────────────
function vccLeerCNsEquipos() {
  const result = [];
  const tabla  = document.getElementById("vcc-equipos-tabla");
  if (!tabla) return result;

  tabla.querySelectorAll("tr.vcc-eq-row, tr.vcc-cond-row").forEach(tr => {
    if (tr.classList.contains("vcc-eq-row")) {
      const nombre   = tr.dataset.nombre;
      const fraccion = tr.dataset.fraccion !== "" ? parseFloat(tr.dataset.fraccion) : null;
      const el       = document.getElementById(`vcc-cn-${nombre}`);
      const cn       = el ? (parseFloat(el.value) || null) : null;
      const eq       = state.vccEquipos.find(e => e.nombre === nombre);
      if (!eq) return;
      const cfg    = state.equiposConfig[nombre];
      const fuente = (cfg?.tipo_limite === "conductor" || cfg?.tipo_limite === "fusible")
                     ? "conductor" : "equipo";
      result.push({ ...eq, cn, fuente_ajuste: fuente });
    } else {
      // conductor_intermedio posicionado entre dos equipos
      const entreB   = tr.dataset.entreB;
      const fraccion = tr.dataset.fraccion !== "" ? parseFloat(tr.dataset.fraccion) : null;
      const el       = tr.querySelector(".vcc-cond-cn-input");
      const cn       = el ? (parseFloat(el.value) || null) : null;
      if (!cn) return;
      result.push({
        nombre:        `Conductor(→${entreB})`,
        tipo:          "conductor_intermedio",
        cn,
        cn_opcional:   true,
        fuente_ajuste: "conductor",
        fraccion,
        kva_down:      null,
        entre_b:       entreB,
      });
    }
  });
  return result;
}

// ─── Ficha Equipo (modal compartido) ─────────────────────────────────────
let _fichaNumpos    = null;
let _fichaModal     = null;
let _fichaCallback  = null;

function fichaAbrirModal(numpos, callback = null) {
  _fichaNumpos   = numpos;
  _fichaCallback = callback;
  if (!_fichaModal) _fichaModal = new bootstrap.Modal(document.getElementById("modalFichaEquipo"));

  const entry = state.equiposConfig[numpos] || null;
  const esPPF = /^PPF/i.test(numpos);

  // Modo nueva ficha: mostrar campo NUMPOS editable
  const numposRow   = document.getElementById("ficha-numpos-row");
  const numposInput = document.getElementById("ficha-numpos-input");
  const esNuevo     = !numpos;
  if (numposRow)   numposRow.classList.toggle("d-none", !esNuevo);
  if (numposInput) numposInput.value = "";

  // Título
  document.getElementById("fichaEquipoTitle").textContent = esNuevo ? "Nueva ficha" : numpos;

  // Rellenar campos
  document.getElementById("ficha-corriente-a").value         = entry?.corriente_a ?? "";
  document.getElementById("ficha-tipo-limite").value         = entry?.tipo_limite  ?? _fichaDefaultTipo(numpos);
  document.getElementById("ficha-corriente-conductor").value = entry?.corriente_conductor_a ?? "";
  document.getElementById("ficha-es-hdlb").checked           = entry?.es_hdlb ?? false;
  document.getElementById("ficha-notas").value               = entry?.notas ?? "";
  document.getElementById("ficha-notas-historial").value     = "";

  // Mostrar/ocultar campos condicionales
  fichaToggleCampos();
  document.getElementById("ficha-hdlb-row").classList.toggle("d-none", !esPPF);

  // Motivo de cambio solo si ya tiene corriente_a guardada
  document.getElementById("ficha-historial-nota-row").classList.toggle("d-none", !entry?.corriente_a);

  // Botón eliminar solo si existe
  document.getElementById("ficha-btn-delete").classList.toggle("d-none", !entry);

  // Historial
  const hist = entry?.historial ?? [];
  const histSec = document.getElementById("ficha-historial-section");
  if (hist.length) {
    const items = hist.slice().reverse().map(h =>
      `<div class="mb-1 text-muted">
        <span class="text-white-50">${h.fecha}</span>
        ${h.valor_anterior} → <strong>${h.valor_nuevo}</strong> A
        ${h.notas ? `<br><em>${h.notas}</em>` : ""}
      </div>`
    ).join("");
    document.getElementById("ficha-historial-list").innerHTML = items;
    histSec.classList.remove("d-none");
  } else {
    histSec.classList.add("d-none");
  }

  _fichaModal.show();
}

function fichaToggleCampos() {
  const tipo = document.getElementById("ficha-tipo-limite").value;
  document.getElementById("ficha-conductor-row").classList.toggle("d-none", tipo !== "fusible");
}

function _fichaDefaultTipo(numpos) {
  const pref = numpos.replace(/[^A-Za-z].*/,"").toUpperCase();
  if (["REC","RTS"].includes(pref))                              return "setpoint";
  if (["PPF"].includes(pref))                                    return "fusible";
  if (["ORM","SCH","ABB","GMT","CGP"].includes(pref))            return "conductor";
  return "conductor";
}

async function fichaGuardar() {
  let numpos = _fichaNumpos;
  if (!numpos) {
    numpos = (document.getElementById("ficha-numpos-input")?.value ?? "").trim().toUpperCase();
    if (!numpos) { alert("Ingresa el NUMPOS del equipo."); return; }
  }
  const corrienteA = parseFloat(document.getElementById("ficha-corriente-a").value);
  if (!corrienteA || corrienteA <= 0) {
    alert("Ingresa una corriente límite válida.");
    return;
  }
  const esPPF = /^PPF/i.test(numpos);
  const tipo  = document.getElementById("ficha-tipo-limite").value;
  const body  = {
    corriente_a:           corrienteA,
    tipo_limite:           tipo,
    corriente_conductor_a: tipo === "fusible"
      ? (parseFloat(document.getElementById("ficha-corriente-conductor").value) || null)
      : null,
    es_hdlb:               esPPF ? document.getElementById("ficha-es-hdlb").checked : null,
    notas:                 document.getElementById("ficha-notas").value.trim(),
    notas_historial:       document.getElementById("ficha-notas-historial").value.trim(),
  };
  try {
    const r = await apiFetch(`/api/equipos/config/${encodeURIComponent(numpos)}`, {
      method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body),
    });
    if (r.error) { alert("Error: " + r.error); return; }
    state.equiposConfig[numpos] = r.entry;
    _fichaModal.hide();
    if (_fichaCallback) _fichaCallback();
    else if (state.vccEquipos.length) vccRenderEquiposInputs(state.vccEquipos);
  } catch(e) { alert("Error al guardar: " + e.message); }
}

async function fichaEliminar() {
  const numpos = _fichaNumpos;
  if (!numpos || !confirm(`¿Eliminar configuración de ${numpos}?`)) return;
  try {
    await apiFetch(`/api/equipos/config/${encodeURIComponent(numpos)}`, { method: "DELETE" });
    delete state.equiposConfig[numpos];
    _fichaModal.hide();
    if (_fichaCallback) _fichaCallback();
    else if (state.vccEquipos.length) vccRenderEquiposInputs(state.vccEquipos);
  } catch(e) { alert("Error al eliminar: " + e.message); }
}

// ─── período VCC ───────────────────────────────────────────────────────────
function vccRenderMeses(historico = false) {
  const meses  = state.mesesDisponibles;
  const limite = _limiteAnioCorrido(meses);
  const cont   = document.getElementById("vcc-meses-checklist");
  if (!cont) return;
  const tog = document.getElementById("vcc-toggle-historico");
  if (tog) tog.checked = false;
  cont.innerHTML = meses.map(m => {
    const ac      = !limite || m >= limite;
    const bg      = ac ? "#6c757d" : "white";
    const color   = ac ? "#fff"    : "#6c757d";
    const disp    = (!ac && !historico) ? "none" : "flex";
    return `<label class="badge vcc-mes-label"
                   style="display:${disp};align-items:center;gap:4px;cursor:pointer;font-weight:normal;padding:4px 8px;background:${bg};color:${color};border:1px solid #dee2e6"
                   data-ac="${ac ? "1" : "0"}">
      <input type="checkbox" class="vcc-mes-chk" value="${m}" style="display:none"
             ${ac ? "checked" : ""} onchange="vccMesToggle(this)">
      <span>${fmtMes(m)}</span>
    </label>`;
  }).join("");
  vccActualizarLblMeses();
}
function vccMesToggle(chk) {
  const lbl = chk.closest(".vcc-mes-label");
  if (lbl) {
    lbl.style.background = chk.checked ? "#6c757d" : "white";
    lbl.style.color      = chk.checked ? "#fff"    : "#6c757d";
  }
  vccActualizarLblMeses();
}
function vccMesesSeleccionados() {
  return [...document.querySelectorAll(".vcc-mes-chk:checked")].map(c => c.value);
}
function vccActualizarLblMeses() {
  const n = vccMesesSeleccionados().length;
  const el = document.getElementById("vcc-lbl-n-meses");
  if (el) el.textContent = `${n} mes${n !== 1 ? "es" : ""} seleccionado${n !== 1 ? "s" : ""}`;
}
function vccToggleHistorico(activo) {
  document.querySelectorAll(".vcc-mes-label[data-ac='0']").forEach(lbl => {
    lbl.style.display = activo ? "flex" : "none";
    if (!activo) {
      const chk = lbl.querySelector(".vcc-mes-chk");
      chk.checked = false;
      lbl.style.background = "white";
      lbl.style.color = "#6c757d";
    }
  });
  vccActualizarLblMeses();
}
function vccSelMeses(checked) {
  document.querySelectorAll(".vcc-mes-label").forEach(lbl => {
    if (lbl.style.display !== "none") {
      lbl.querySelector(".vcc-mes-chk").checked = checked;
      lbl.style.background = checked ? "#6c757d" : "white";
      lbl.style.color      = checked ? "#fff"    : "#6c757d";
    }
  });
  vccActualizarLblMeses();
}

// ─── evaluar VCC ───────────────────────────────────────────────────────────
async function vccEvaluar() {
  if (state.vccAlimIdx == null)  return mostrarError("Selecciona un alimentador.");
  if (!state.vccAlimNom)         return mostrarError("Alimentador sin correspondencia NOM_ALIM.");
  const numpos = vccGetNumpos();
  if (!numpos || !state.vccPuntoRef) return mostrarError("Selecciona el punto de conexión primero.");
  const kvaEmp = parseFloat(document.getElementById("vcc-kva-emp").value);
  if (!kvaEmp || kvaEmp <= 0) return mostrarError("Ingresa el kVA de empalme.");
  const kvaInst = parseFloat(document.getElementById("vcc-kva-inst").value) || null;
  const tension = parseFloat(document.querySelector('input[name="vcc-tension"]:checked').value);
  const equipos = vccLeerCNsEquipos();
  const pRef    = state.vccPuntoRef;

  spinner(true, "Calculando VCC...");
  try {
    const traspaso = vccGetTraspasoParams();
    const r = await apiFetch("/api/vcc/evaluar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nom_alim:          state.vccAlimNom,
        numalim:           state.vccAlimIdx,
        numpos,
        nombre_ref:        pRef.nombre_ref || "",
        tipo_ref:          pRef.tipo_ref   || "",
        n_tds_aguas_abajo: pRef.n_tds_aguas_abajo || 0,
        tension_kv:        tension,
        kva_empalme:       kvaEmp,
        kva_instalado:     kvaInst,
        equipos_cn:        equipos,
        meses_sel:         vccMesesSeleccionados(),
        ...traspaso,
      }),
    });
    if (r.error) { mostrarError(r.error); return; }
    state.vccUltimaEval = r;
    vccRenderResultados(r, tension, kvaEmp, kvaInst);
    document.getElementById("vcc-resultados")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally { spinner(false); }
}

// ─── render resultados ─────────────────────────────────────────────────────
const _EST_CLS = { viable:"badge-viable", prealerta:"badge-prealerta", critico:"badge-critico", sin_cn:"bg-secondary" };
const _EST_LBL = { viable:"Viable", prealerta:"Prealerta", critico:"Crítico", sin_cn:"Sin ajuste" };

function _vccEstadoEquipos(equipos) {
  // Retorna el peor estado entre todos los equipos evaluados
  if (!equipos?.length) return null;
  const orden = ["critico","prealerta","viable","sin_cn"];
  return orden.find(e => equipos.some(eq => eq.estado === e)) || null;
}

function _vccResumenHTML(pctAlim, pctTrafo, trafoNom, equipos) {
  const items = [];
  const pill = (lbl, val, cls) =>
    `<span class="badge ${cls} me-1">${lbl}: ${val}</span>`;

  // Alimentador
  if (pctAlim != null) {
    const est = pctAlim >= 100 ? "critico" : pctAlim >= 90 ? "prealerta" : "viable";
    items.push(pill(`Alim. FU máx`, pctAlim.toFixed(1) + "%", _EST_CLS[est]));
  }
  // Trafo
  if (pctTrafo != null) {
    const trafoTbl = pctTrafo;
    const bestT = trafoTbl.tabla?.reduce((mx, r) =>
      (r.uso_despues_pct ?? -1) > (mx ?? -1) ? r.uso_despues_pct : mx, null);
    if (bestT != null) {
      const est = bestT >= 100 ? "critico" : bestT >= 90 ? "prealerta" : "viable";
      items.push(pill(`${trafoNom || "Trafo"} FU máx`, bestT.toFixed(1) + "%", _EST_CLS[est]));
    }
  }
  // Peor equipo
  const estEq = _vccEstadoEquipos(equipos);
  if (estEq) {
    items.push(`<span class="badge ${_EST_CLS[estEq]}">Equipos: ${_EST_LBL[estEq]}</span>`);
  }
  return items.join(" ");
}

function _vccRenderReceptorEnEscenario(suffix, dest) {
  const group = document.getElementById(`vcc-det-receptor-group-${suffix}`);
  const ids = {
    eq:   `vcc-det-receptor-${suffix}`,
    alim: `vcc-det-alim-receptor-${suffix}`,
    traf: `vcc-det-trafo-receptor-${suffix}`,
  };
  if (!dest) {
    group?.classList.add("d-none");
    Object.values(ids).forEach(id => document.getElementById(id)?.classList.add("d-none"));
    return;
  }
  const nomB = dest.nom_alim || "Receptor";
  // Mostrar grupo padre
  if (group) {
    document.getElementById(`vcc-receptor-group-titulo-${suffix}`).textContent = nomB;
    group.classList.remove("d-none");
  }
  // Info de maniobra
  const maniobraEl = document.getElementById(`vcc-receptor-maniobra-${suffix}`);
  if (maniobraEl) {
    const eqAbre   = document.getElementById("vcc-traspaso-eq-abre")?.value || "";
    const eqCierra = dest.equipo_lz || state.vccNumposLz || "";
    if (eqAbre || eqCierra) {
      maniobraEl.innerHTML =
        `<i class="bi bi-arrow-up-right me-1"></i>Abre: <code>${eqAbre || "—"}</code>` +
        ` &nbsp;|&nbsp; <i class="bi bi-arrow-down-left me-1"></i>Cierra: <code>${eqCierra || "—"}</code>`;
      maniobraEl.style.display = "";
    }
  }
  // Equipos troncal
  const detEq = document.getElementById(ids.eq);
  if (detEq) {
    if (dest.equipos_eval?.length) {
      document.getElementById(`vcc-receptor-titulo-${suffix}`).textContent = nomB;
      document.getElementById(`vcc-tabla-receptor-${suffix}`).innerHTML    = vccTablaEquipos(dest.equipos_eval, dest.delta_I);
      detEq.classList.remove("d-none");
    } else detEq.classList.add("d-none");
  }
  // Alimentador FU mensual
  const detAlim = document.getElementById(ids.alim);
  if (detAlim) {
    if (dest.tabla_alim?.length) {
      document.getElementById(`vcc-alim-receptor-titulo-${suffix}`).textContent = nomB;
      document.getElementById(`vcc-tabla-alim-receptor-${suffix}`).innerHTML    = vccTablaFU(dest.tabla_alim, null, { labelDelta: "ΔI traspaso (A)" });
      detAlim.classList.remove("d-none");
    } else detAlim.classList.add("d-none");
  }
  // Trafo
  const detTraf = document.getElementById(ids.traf);
  if (detTraf) {
    if (dest.tabla_trafo?.tabla) {
      document.getElementById(`vcc-tabla-trafo-receptor-${suffix}`).innerHTML = vccTablaFU(dest.tabla_trafo.tabla, null, { labelDelta: "ΔI traspaso (A)" });
      detTraf.classList.remove("d-none");
    } else detTraf.classList.add("d-none");
  }
}

function vccRenderResultados(r, tension, kvaEmp, kvaInst) {
  document.getElementById("vcc-res-titulo").textContent = `VCC — ${state.vccAlimNom}`;

  // Subtítulo principal
  document.getElementById("vcc-res-subtitulo").textContent =
    `${tension} kV  |  ΔI cliente = ${r.delta_I?.toFixed(2)} A  |  CN = ${r.cn_alim?.toFixed(0)} A`;

  // Bloque de traspaso cuantificado
  const _trpEl = document.getElementById("vcc-res-traspaso-info");
  const _hasTrp = r.delta_traspaso_modo && r.delta_traspaso_modo !== "ninguno" &&
                  (r.delta_traspaso_a > 0 || r.delta_traspaso_pct > 0);
  if (_trpEl) {
    if (_hasTrp) {
      const modoLabel = { a: "ΔI manual", pct: "% manual", topo: "Topología" };
      const _pct  = r.delta_traspaso_pct > 0 ? `${r.delta_traspaso_pct.toFixed(1)}%` : null;
      const _dA   = r.delta_traspaso_a   > 0 ? `${r.delta_traspaso_a.toFixed(1)} A`  : null;
      const _modo = modoLabel[r.delta_traspaso_modo] || r.delta_traspaso_modo;
      const _alivio = r.alivio_A_peor ? `<strong>−${r.alivio_A_peor.toFixed(1)} A</strong> en peor mes` : "";
      const _val = _pct ? `${_pct}` : (_dA ?? "");
      _trpEl.innerHTML =
        `<i class="bi bi-arrow-down-circle me-1" style="color:#f5a623"></i>` +
        `<strong>Traspaso simultáneo</strong> — Modo: ${_modo} · ${_val}` +
        (_alivio ? ` → Alivio: ${_alivio}` : "");
      _trpEl.style.display = "";
    } else {
      _trpEl.style.display = "none";
      _trpEl.innerHTML = "";
    }
  }

  // ── Escenario 1: empalme ──────────────────────────────────────────────────
  document.getElementById("vcc-badge-emp").textContent =
    `${kvaEmp} kVA  ·  ΔI = ${r.delta_I?.toFixed(2)} A`;
  document.getElementById("vcc-alim-titulo-emp").textContent = state.vccAlimNom;
  const _atOpts = r.autotrafo ? { labelDelta: "ΔI alim. (A)" } : {};
  document.getElementById("vcc-tabla-alim-emp").innerHTML    = vccTablaFU(r.tabla_alim, r, _atOpts);
  document.getElementById("vcc-tabla-equip-emp").innerHTML   = vccTablaEquipos(r.equipos_eval, r.delta_I);

  const detT = document.getElementById("vcc-det-trafo-emp");
  if (r.tabla_trafo?.tabla) {
    const nom = r.tabla_trafo.barra || r.tabla_trafo.barra_alim || "Trafo AT/MT";
    document.getElementById("vcc-trafo-titulo-emp").textContent = nom;
    document.getElementById("vcc-tabla-trafo-emp").innerHTML    = vccTablaFU(r.tabla_trafo.tabla, r, _atOpts);
    detT.classList.remove("d-none");
  } else { detT.classList.add("d-none"); }

  document.getElementById("vcc-resumen-emp").innerHTML =
    _vccResumenHTML(r.pct_max_alim, r.tabla_trafo, r.tabla_trafo?.barra || "Trafo", r.equipos_eval);

  // Receptor dentro de cada escenario
  const _destRec = r.analisis_destino;
  _vccRenderReceptorEnEscenario("emp", _destRec);

  // ── Escenario 2: instalado ────────────────────────────────────────────────
  const detSens = document.getElementById("vcc-details-sens");
  if (kvaInst && r.tabla_alim_sens) {
    document.getElementById("vcc-badge-inst").textContent =
      `${kvaInst} kVA  ·  ΔI = ${r.delta_I_sens?.toFixed(2)} A`;
    document.getElementById("vcc-alim-titulo-inst").textContent = state.vccAlimNom;
    document.getElementById("vcc-tabla-alim-inst").innerHTML    = vccTablaFU(r.tabla_alim_sens, r, _atOpts);
    document.getElementById("vcc-tabla-equip-inst").innerHTML   =
      vccTablaEquipos(r.equipos_eval_sens, r.delta_I_sens);

    const detTI = document.getElementById("vcc-det-trafo-inst");
    if (r.tabla_trafo_sens?.tabla) {
      const nom = r.tabla_trafo_sens.barra || r.tabla_trafo_sens.barra_alim || "Trafo AT/MT";
      document.getElementById("vcc-trafo-titulo-inst").textContent = nom;
      document.getElementById("vcc-tabla-trafo-inst").innerHTML    = vccTablaFU(r.tabla_trafo_sens.tabla, r, _atOpts);
      detTI.classList.remove("d-none");
    } else { detTI.classList.add("d-none"); }

    document.getElementById("vcc-resumen-inst").innerHTML =
      _vccResumenHTML(r.pct_max_alim_sens, r.tabla_trafo_sens,
                      r.tabla_trafo_sens?.barra || "Trafo", r.equipos_eval_sens);

    _vccRenderReceptorEnEscenario("inst", _destRec);
    detSens.classList.remove("d-none");
  } else {
    _vccRenderReceptorEnEscenario("inst", null);
    detSens.classList.add("d-none");
  }

  document.getElementById("vcc-resultados").classList.remove("d-none");
  initTooltips(document.getElementById("vcc-resultados"));
  // Botón "Copiar" en tablas de equipos/alimentador y trafos
  agregarBotonesCopia(document.getElementById("vcc-resultados"));
}

// ─── inicializar tooltips Bootstrap en un contenedor ─────────────────────
function initTooltips(container) {
  (container || document).querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
    bootstrap.Tooltip.getOrCreateInstance(el, {
      trigger: "hover focus",
      container: "body",   // anclar al body para evitar recorte por overflow/z-index de padres
      placement: "top",
    });
  });
}

// ─── tabla FU transpuesta (meses = columnas) ──────────────────────────────
function vccTablaFU(tabla, vccResult, opts = {}) {
  if (!tabla?.length) return "<p class='text-muted small'>Sin datos.</p>";

  const W_TH = "border-left:2px solid rgba(192,0,0,.6);border-right:2px solid rgba(192,0,0,.6);background:rgba(231,76,60,.12);font-weight:bold";
  const W_TD = "border-left:2px solid rgba(192,0,0,.5);border-right:2px solid rgba(192,0,0,.5);font-weight:bold";

  const dt_a   = vccResult?.delta_traspaso_a   || 0;
  const dt_pct = vccResult?.delta_traspaso_pct || 0;
  const hayTrp = dt_a > 0 || dt_pct > 0;

  function iSQL(I_adj) {
    if (I_adj == null) return null;
    if (dt_pct > 0 && dt_pct < 100) return +(I_adj / (1 - dt_pct / 100)).toFixed(1);
    if (dt_a > 0) return +(I_adj + dt_a).toFixed(1);
    return I_adj;
  }

  function iTraspasoDelta(I_adj) {
    // Reducción real en A = valor_ajustado - valor_SQL (resultado negativo)
    const sql = iSQL(I_adj);
    if (sql == null || I_adj == null) return null;
    return +(I_adj - sql).toFixed(1);
  }

  const worstIdx = tabla.reduce((best, r, i) =>
    (r.uso_despues_pct ?? -1) > (tabla[best]?.uso_despues_pct ?? -1) ? i : best, 0);

  const head = `<tr>
    <th class="py-1" style="min-width:130px;white-space:nowrap">Métrica</th>
    ${tabla.map((r, i) =>
      `<th class="py-1 text-center" style="white-space:nowrap${i===worstIdx ? ';'+W_TH : ''}">${_mesLabel(r.mes)}</th>`
    ).join("")}
  </tr>`;

  const rowBg  = { viable: "#E8F7EE", prealerta: "#FEF3E2", critico: "#FCECEA" };
  const badgeCl= { viable: "badge-viable", prealerta: "badge-prealerta", critico: "badge-critico" };
  const lbEs   = { viable: "Viable", prealerta: "Prealerta", critico: "Crítico", sin_datos: "—" };

  function cell(r, key, i) {
    const est = r.estado || "";
    const wst = i === worstIdx ? W_TD : "";
    if (key === "estado") {
      const bg = rowBg[est] || "";
      const st = [bg && `background:${bg}`, wst].filter(Boolean).join(";");
      return `<td class="text-center" style="${st}"><span class="badge ${badgeCl[est]||""}">${lbEs[est]||est}</span></td>`;
    }
    if (key === "_delta") {
      const d = r.delta != null ? r.delta
              : (r.I_despues != null && r.I_antes != null) ? r.I_despues - r.I_antes : null;
      const txt = d != null ? (d >= 0 ? "+" : "") + d.toFixed(1) : "—";
      return `<td class="text-center" style="${wst}">${txt}</td>`;
    }
    if (key === "_i_sql") {
      // Si la fila tiene I_antes_orig (trafo con reducción absoluta), usarlo directo.
      // Si no, reconstruir via iSQL (alim con reducción porcentual propia).
      const v = r.I_antes_orig != null ? r.I_antes_orig : iSQL(r.I_antes);
      return `<td class="text-center" style="${wst}">${v != null ? (+v).toFixed(1) : "—"}</td>`;
    }
    if (key === "_i_traspaso") {
      const v = r.I_traspasada != null ? r.I_traspasada : iTraspasoDelta(r.I_antes);
      const txt = v != null ? (v > 0 ? "+" : "") + (+v).toFixed(1) : "—";
      return `<td class="text-center" style="color:#c07000;${wst}">${txt}</td>`;
    }
    const v    = r[key];
    const isPct = key.includes("pct");
    const fuBg  = key === "uso_despues_pct" ? (rowBg[est] || "") : "";
    const st    = [fuBg && `background:${fuBg}`, wst].filter(Boolean).join(";");
    const txt   = v != null ? (isPct ? v.toFixed(1) + "%" : v.toFixed(1)) : "—";
    return `<td class="text-center" style="${st}">${txt}</td>`;
  }

  function fila(label, key, bg = "#f8f9fa", rowStyle = "") {
    const cells = tabla.map((r, i) => cell(r, key, i)).join("");
    return `<tr style="${rowStyle}"><td class="fw-semibold small" style="white-space:nowrap;background:${bg}">${label}</td>${cells}</tr>`;
  }

  let body = "";
  if (hayTrp) {
    body += fila("I antes (A)",        "_i_sql",      "#fdf5d0", "background:#fff8e1");
    body += fila("I traspasada (A)",   "_i_traspaso", "#fdf5d0", "background:#fff8e1");
  } else {
    body += fila("I antes (A)", "I_antes");
  }
  body += fila(opts.labelDelta ?? "ΔI cliente (A)", "_delta");
  body += fila("I después (A)",     "I_despues");
  body += fila("FU antes (%)",      "uso_antes_pct");
  body += fila("FU después (%)",    "uso_despues_pct");
  body += fila("Estado",            "estado");

  return `<div style="overflow-x:auto">
    <table class="table table-sm tabla-sim tabla-vcc mb-0" style="font-size:.78rem">
      <thead>${head}</thead><tbody>${body}</tbody>
    </table></div>`;
}

// ─── tabla equipos upstream ────────────────────────────────────────────────
function vccTablaEquipos(equipos, deltaI) {
  if (!equipos?.length)
    return "<p class='text-muted small mt-1'>Sin equipos upstream con ajuste relevante.</p>";

  // Solo mostrar equipos con CN configurado (evaluados)
  const equiposEval = equipos.filter(e => e.cn != null);
  const nTotal      = equipos.length;
  const nOmitidos   = nTotal - equiposEval.length;
  const omitidosTxt = nOmitidos > 0
    ? `<p class="text-muted small mb-1">
        <i class="bi bi-info-circle me-1"></i>${nOmitidos} equipo(s) sin ajuste configurado omitido(s).
       </p>`
    : "";
  if (!equiposEval.length)
    return omitidosTxt + "<p class='text-muted small'>Ningún equipo tiene ajuste vigente configurado.</p>";

  // Etiqueta de tipo: conductor especial; el resto por prefijo (aéreo/subt./REC).
  const _tipoLbl = eq => eq.tipo === "conductor_intermedio" ? "Conductor" : _labelTipoEquipo(eq.nombre);
  const BADGE_CLS = {
    viable: "badge-viable", prealerta: "badge-prealerta",
    critico: "badge-critico", sin_cn: "bg-secondary"
  };
  const BADGE_LBL = { viable: "Viable", prealerta: "Prealerta", critico: "Crítico", sin_cn: "Sin ajuste" };
  const ROW_BG    = { viable: "#E8F7EE", prealerta: "#FEF3E2", critico: "#FCECEA" };
  const SEP = "border-left:2px solid #dee2e6";

  const _fuenteBadge = fuente => fuente === "conductor"
    ? `<br><span class="badge bg-warning text-dark" style="font-size:.65rem">Conductor</span>`
    : `<br><span class="badge bg-info text-white"   style="font-size:.65rem">Equipo</span>`;

  const hasEnfoques = equiposEval.some(e => e.enfoque_a || e.enfoque_b);

  // ── tabla legacy ──────────────────────────────────────────────────────────
  if (!hasEnfoques) {
    const dI23leg = equiposEval.find(e => (e.delta_I ?? deltaI) !== deltaI)?.delta_I ?? null;
    const _atSepLeg = () => `<tr class="vcc-at-sep-row"><td colspan="6" style="padding:4px 8px;` +
      `background:#fff9e6;border-top:2px dashed #ffc107;border-bottom:2px dashed #ffc107;font-size:.77rem">` +
      `<span class="badge bg-warning text-dark me-2">⚡ Autotrafo</span>` +
      `<span class="text-muted">23 kV — ΔI = <b>${Number(dI23leg).toFixed(2)} A</b></span>` +
      `<span class="text-muted mx-2">//</span>` +
      `<span class="text-muted">12 kV — ΔI = <b>${Number(deltaI).toFixed(2)} A</b></span>` +
      `</td></tr>`;
    const rows = equiposEval.flatMap((eq, i, arr) => {
      const fuente  = eq.fuente_ajuste || "equipo";
      const cnStr   = eq.cn != null
        ? `${Number(eq.cn).toFixed(0)} A${_fuenteBadge(fuente)}` : "—";
      const dpctStr = eq.delta_pct != null ? `${Number(eq.delta_pct).toFixed(1)}%` : "—";
      const eqDeltaI = eq.delta_I ?? deltaI;
      const dI       = eqDeltaI != null ? Number(eqDeltaI).toFixed(2) : "—";
      const atMark   = eq.tension_kv_override != null && eqDeltaI !== deltaI
        ? ` <span style="font-size:.65rem;color:#b08000" title="${eq.tension_kv_override} kV">⚡</span>` : "";
      const bcls    = BADGE_CLS[eq.estado] || "bg-secondary";
      const blbl    = BADGE_LBL[eq.estado] || eq.estado;
      const nombreDisplay = eq.tipo === "conductor_intermedio"
        ? `<span class="text-muted">tramo</span> <code>${eq.nombre.replace("Conductor(","").replace(")","")}</code>`
        : `<code>${eq.nombre}</code>`;
      const mainRow = `<tr>
        <td>${nombreDisplay}</td><td>${_tipoLbl(eq)}</td>
        <td class="r">${cnStr}</td><td class="r">${dI} A${atMark}</td>
        <td class="r">${dpctStr}</td>
        <td><span class="badge ${bcls}">${blbl}</span></td></tr>`;
      const prevDI = i > 0 ? (arr[i-1].delta_I ?? deltaI) : eqDeltaI;
      const needSep = i > 0 && prevDI !== deltaI && eqDeltaI === deltaI && dI23leg !== null;
      return needSep ? [_atSepLeg(), mainRow] : [mainRow];
    }).join("");
    return omitidosTxt + `<div style="overflow-x:auto"><table class="table table-sm tabla-sim tabla-vcc mb-0" style="font-size:.78rem">
      <thead><tr>
        <th>Equipo</th><th>Tipo</th>
        <th class="r">Ajuste</th><th class="r">ΔI</th>
        <th class="r">ΔI/Ajuste</th><th>Estado</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ── tabla dos enfoques ────────────────────────────────────────────────────
  const TIP_A = "Cota conservadora: I​base = CN​alim × (kVA aguas abajo / kVA total del alim.). " +
    "Peor caso teórico: toda la potencia instalada aguas abajo se consume simultáneamente.";
  const TIP_B = "Demanda real ponderada: I​base = I​alim​real(mes) × (kVA aguas abajo / kVA total). " +
    "Usa la demanda mensual medida del alimentador escalada por la fracción de carga que pasa por el equipo. " +
    "Se muestra el peor mes del año corrido.";
  const TIP_ST = "cursor:help;font-size:.8rem;opacity:.7;margin-left:4px;text-decoration:none;border:none";

  const head = `
    <tr>
      <th rowspan="2">Equipo</th><th rowspan="2">Tipo</th>
      <th class="r" rowspan="2">Ajuste (A)</th>
      <th class="r" rowspan="2">ΔI (A)</th>
      <th colspan="3" class="c" style="${SEP}">Enfoque A — conservador
        <span data-bs-toggle="tooltip" data-bs-placement="top"
              data-bs-title="${TIP_A}"
              style="${TIP_ST}">ⓘ</span></th>
      <th colspan="3" class="c" style="${SEP}">Enfoque B — demanda real
        <span data-bs-toggle="tooltip" data-bs-placement="top"
              data-bs-title="${TIP_B}"
              style="${TIP_ST}">ⓘ</span></th>
      <th rowspan="2">Estado</th>
    </tr>
    <tr>
      <th class="r" style="${SEP}">I_base (A)</th>
      <th class="r">I+ΔI (A)</th>
      <th class="r">% Ajuste</th>
      <th class="r" style="${SEP}">I_base_max (A)</th>
      <th class="r">I+ΔI (A)</th>
      <th class="r">% Ajuste</th>
    </tr>`;

  const dI23dual = equiposEval.find(e => (e.delta_I ?? deltaI) !== deltaI)?.delta_I ?? null;
  const _atSepDual = (prevDI) => `<tr class="vcc-at-sep-row"><td colspan="11" style="padding:4px 8px;` +
    `background:#fff9e6;border-top:2px dashed #ffc107;border-bottom:2px dashed #ffc107;font-size:.77rem">` +
    `<span class="badge bg-warning text-dark me-2">⚡ Autotrafo</span>` +
    `<span class="text-muted">23 kV — ΔI = <b>${Number(prevDI).toFixed(2)} A</b></span>` +
    `<span class="text-muted mx-2">//</span>` +
    `<span class="text-muted">12 kV — ΔI = <b>${Number(deltaI).toFixed(2)} A</b></span>` +
    `</td></tr>`;

  const rows = equiposEval.flatMap((eq, i, arr) => {
    const fuente = eq.fuente_ajuste || "equipo";
    const cn     = eq.cn != null
      ? `${Number(eq.cn).toFixed(0)}${_fuenteBadge(fuente)}` : "—";
    const eqDI  = eq.delta_I ?? deltaI;
    const atTag = eq.tension_kv_override != null && eqDI !== deltaI
      ? ` <span style="font-size:.62rem;color:#b08000" title="${eq.tension_kv_override} kV">⚡</span>` : "";
    const dI    = eqDI != null ? Number(eqDI).toFixed(2) + atTag : "—";
    const tipo  = _tipoLbl(eq);
    const est   = eq.estado || "sin_cn";
    const bcls  = BADGE_CLS[est] || "bg-secondary";
    const blbl  = BADGE_LBL[est] || est;

    const enf_a = eq.enfoque_a;
    const enf_b = eq.enfoque_b;

    const pctCell = (pct, estado) => {
      const bg = ROW_BG[estado] || "";
      return `<td class="r" style="${bg ? `background:${bg}` : ''}">${Number(pct).toFixed(1)}%</td>`;
    };

    // base: 'CN' → reducción sobre CN máx | 'real' → sobre demanda histórica
    const _alivioTag = (alivio, iBaseOrig, base = null) => {
      if (alivio == null || alivio >= -0.05) return "";
      const baseLabel = base === 'CN'   ? 'sobre CN máx'
                      : base === 'real' ? 'sobre demanda real'
                      : '';
      const tip = iBaseOrig != null
        ? `Sin traspaso (${baseLabel}): ${(+iBaseOrig).toFixed(1)} A → Con traspaso: ${(+iBaseOrig + alivio).toFixed(1)} A`
        : `Alivio por traspaso (${baseLabel}): −${Math.abs(alivio).toFixed(1)} A`;
      const suffix = base
        ? ` <span style="font-size:.6rem;opacity:.65">(${base})</span>`
        : '';
      return `<br><small style="color:#c07000;font-size:.68rem" title="${tip}">▼ ${Math.abs(alivio).toFixed(1)} A${suffix}</small>`;
    };

    const iBaseAOrig = enf_a?.I_alivio != null ? enf_a.I_base - enf_a.I_alivio : null;
    const iBaseBOrig = enf_b?.I_alivio != null ? enf_b.I_base_max - enf_b.I_alivio : null;

    const cellsA = enf_a
      ? `<td class="r" style="${SEP}">${Number(enf_a.I_base).toFixed(1)}${_alivioTag(enf_a.I_alivio, iBaseAOrig, 'CN')}</td>
         <td class="r">${Number(enf_a.I_total).toFixed(1)}</td>
         ${pctCell(enf_a.pct, enf_a.estado)}`
      : `<td class="r text-muted" style="${SEP}">—</td><td class="r text-muted">—</td><td class="r text-muted">—</td>`;

    const cellsB = enf_b
      ? `<td class="r" style="${SEP}">${Number(enf_b.I_base_max).toFixed(1)}${_alivioTag(enf_b.I_alivio, iBaseBOrig, 'real')}
           <br><small class="text-muted" style="font-size:.68rem">(${_mesLabel(enf_b.mes_max)})</small></td>
         <td class="r">${Number(enf_b.I_total).toFixed(1)}</td>
         ${pctCell(enf_b.pct, enf_b.estado)}`
      : `<td class="r text-muted" style="${SEP}">—</td><td class="r text-muted">—</td><td class="r text-muted">—</td>`;

    const nombreDisplay2 = eq.tipo === "conductor_intermedio"
      ? `<span class="text-muted">tramo</span> <code>${eq.nombre.replace("Conductor(","").replace(")","")}</code>`
      : `<code>${eq.nombre}</code>`;
    const mainRow = `<tr>
      <td>${nombreDisplay2}</td><td>${tipo}</td>
      <td class="r">${cn}</td><td class="r">${dI}</td>
      ${cellsA}${cellsB}
      <td><span class="badge ${bcls}">${blbl}</span></td>
    </tr>`;

    // Sub-fila: serie mensual Enfoque B (colapsable)
    let serieRow = "";
    if (enf_b?.serie?.length) {
      const ths = enf_b.serie.map(s =>
        `<th style="font-size:.72rem;padding:2px 5px">${_mesLabel(s.mes)}</th>`
      ).join("");
      const tds = enf_b.serie.map(s => {
        const bg = ROW_BG[s.estado] || "";
        return `<td style="font-size:.72rem;padding:2px 5px;text-align:right;${bg?`background:${bg}`:''}">` +
               `${Number(s.pct).toFixed(1)}%</td>`;
      }).join("");
      serieRow = `<tr><td colspan="11" style="padding:0 0 6px 2rem;border-top:none">
        <details><summary style="cursor:pointer;color:#666;font-size:.78rem">
          Serie mensual — Enfoque B</summary>
          <div style="overflow-x:auto;margin-top:4px">
            <table style="font-size:.72rem;border-collapse:collapse">
              <thead><tr><th style="padding:2px 5px">% Ajuste</th>${ths}</tr></thead>
              <tbody><tr><td style="padding:2px 5px;color:#888">valor</td>${tds}</tr></tbody>
            </table>
          </div>
        </details>
      </td></tr>`;
    }

    const prevDI  = i > 0 ? (arr[i-1].delta_I ?? deltaI) : eqDI;
    const atSep   = (i > 0 && prevDI !== deltaI && eqDI === deltaI && dI23dual !== null)
      ? [_atSepDual(prevDI)] : [];
    return [...atSep, mainRow, serieRow].filter(Boolean);
  }).join("");

  const hayAlivioEq = equiposEval.some(e =>
    (e.enfoque_a?.I_alivio != null && e.enfoque_a.I_alivio < 0) ||
    (e.enfoque_b?.I_alivio != null && e.enfoque_b.I_alivio < 0)
  );
  const alivioNote = hayAlivioEq
    ? `<p class="small mb-1" style="color:#c07000">
        <i class="bi bi-arrow-down-circle me-1"></i>
        <strong>Traspaso aplicado:</strong> las I_base (▼) están reducidas por la carga traspasada al alimentador receptor.
       </p>`
    : "";

  return omitidosTxt + alivioNote + `<div style="overflow-x:auto">
    <table class="table table-sm tabla-sim tabla-vcc mb-0" style="font-size:.78rem">
      <thead>${head}</thead><tbody>${rows}</tbody>
    </table></div>`;
}

// ─── guardar evaluación ────────────────────────────────────────────────────
async function vccGuardar() {
  const r = state.vccUltimaEval;
  if (!r) return mostrarError("Primero evalúa la VCC.");
  const numpos  = vccGetNumpos();
  const kvaEmp  = parseFloat(document.getElementById("vcc-kva-emp").value);
  const kvaInst = parseFloat(document.getElementById("vcc-kva-inst").value) || null;
  const tension = parseFloat(document.querySelector('input[name="vcc-tension"]:checked').value);
  spinner(true, "Guardando evaluación VCC...");
  try {
    const resp = await apiFetch("/api/vcc/guardar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nom_alim:         state.vccAlimNom,
        numalim:          state.vccAlimIdx,
        cn_alim:          r.cn_alim,
        // punto
        numpos,
        numpos_nuevo_tp:  vccGetNuevoTp(),
        modo_punto:       vccGetModoPunto(),
        nombre_ref:       r.nombre_ref,
        tipo_ref:         r.tipo_ref,
        n_tds_aguas_abajo: r.n_tds_aguas_abajo,
        // cliente
        id_cliente:       vccGetIdCliente(),
        nombre_cliente:   vccGetNombreCliente(),
        direccion:        vccGetDireccion(),
        descripcion:      document.getElementById("vcc-descripcion").value.trim(),
        // cálculo
        tension_kv:       tension,
        kva_empalme:      kvaEmp,
        kva_instalado:    kvaInst,
        delta_I:          r.delta_I,
        delta_I_sens:     r.delta_I_sens,
        pct_max_alim:     r.pct_max_alim,
        mes_max_alim:     r.mes_max_alim,
        pct_max_alim_sens: r.pct_max_alim_sens,
        tabla_alim:       r.tabla_alim,
        tabla_trafo:      r.tabla_trafo,
        equipos_eval:     r.equipos_eval,
        tabla_alim_sens:  r.tabla_alim_sens,
        tabla_trafo_sens: r.tabla_trafo_sens,
        equipos_eval_sens: r.equipos_eval_sens,
        resumen_alim:     r.resumen_alim,
        delta_traspaso_a:    r.delta_traspaso_a    || 0,
        delta_traspaso_pct:  r.delta_traspaso_pct  || 0,
        delta_traspaso_modo: r.delta_traspaso_modo || "",
        alivio_A_peor:       r.alivio_A_peor       || 0,
        analisis_destino:    r.analisis_destino ? {
          ...r.analisis_destino,
          equipo_abre:   document.getElementById("vcc-traspaso-eq-abre")?.value || null,
          equipo_cierra: state.vccNumposLz || r.analisis_destino.equipo_lz || null,
        } : null,
      }),
    });
    if (resp.error) { mostrarError(resp.error); return; }
    mostrarToast(`Evaluación #${resp.idx} guardada.`);
    if (_histGlobalCargado) vccCargarHistorialGlobal();
  } finally { spinner(false); }
}

async function vccEliminar(idx) {
  if (!confirm(`¿Eliminar evaluación #${idx}?`)) return;
  spinner(true, "Eliminando...");
  try {
    await fetch(`/api/vcc/${encodeURIComponent(state.vccAlimNom)}/${idx}`, { method: "DELETE" });
    mostrarToast(`Evaluación #${idx} eliminada.`);
    if (_histGlobalCargado) vccCargarHistorialGlobal();
  } finally { spinner(false); }
}

// ─── descargar HTML ────────────────────────────────────────────────────────
async function vccDescargarHTML() {
  const r = state.vccUltimaEval;
  if (!r) return mostrarError("Primero evalúa la VCC.");
  const numpos  = vccGetNumpos();
  const kvaEmp  = parseFloat(document.getElementById("vcc-kva-emp").value);
  const kvaInst = parseFloat(document.getElementById("vcc-kva-inst").value) || null;
  const tension = parseFloat(document.querySelector('input[name="vcc-tension"]:checked').value);
  spinner(true, "Generando HTML...");
  try {
    const resp = await fetch("/api/vcc/descargar_html", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        nombre_alim:       state.vccAlimNom,
        numpos,
        numpos_nuevo_tp:   vccGetNuevoTp(),
        nombre_ref:        r.nombre_ref,
        n_tds_aguas_abajo: r.n_tds_aguas_abajo,
        tension_kv:        tension,
        kva_empalme:       kvaEmp,
        kva_instalado:     kvaInst,
        delta_I:           r.delta_I,
        delta_I_sens:      r.delta_I_sens,
        cn_alim:           r.cn_alim,
        tabla_alim:        r.tabla_alim,
        tabla_trafo:       r.tabla_trafo,
        equipos_eval:      r.equipos_eval,
        tabla_alim_sens:   r.tabla_alim_sens,
        tabla_trafo_sens:  r.tabla_trafo_sens,
        equipos_eval_sens: r.equipos_eval_sens,
        id_cliente:        vccGetIdCliente(),
        nombre_cliente:    vccGetNombreCliente(),
        direccion:         vccGetDireccion(),
        descripcion:       document.getElementById("vcc-descripcion").value.trim(),
        delta_traspaso_a:    r.delta_traspaso_a    || 0,
        delta_traspaso_pct:  r.delta_traspaso_pct  || 0,
        delta_traspaso_modo: r.delta_traspaso_modo || "",
        alivio_A_peor:       r.alivio_A_peor       || 0,
        mes_max_alim:        r.mes_max_alim         || "",
        analisis_destino:    r.analisis_destino ? {
          ...r.analisis_destino,
          equipo_abre:   document.getElementById("vcc-traspaso-eq-abre")?.value || null,
          equipo_cierra: state.vccNumposLz || r.analisis_destino.equipo_lz || null,
        } : null,
      }),
    });
    if (!resp.ok) { mostrarError("Error generando HTML."); return; }
    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `vcc_${state.vccAlimNom}_${new Date().toISOString().slice(0,10)}.html`
      .replace(/[^a-zA-Z0-9_.\-]/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  } finally { spinner(false); }
}

