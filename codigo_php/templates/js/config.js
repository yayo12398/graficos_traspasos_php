// ── TAB CONFIGURACIÓN ─────────────────────────────────────────────────────

function cfgMostrar(seccion) {
  document.querySelectorAll(".cfg-section").forEach(el => el.classList.add("d-none"));
  document.querySelectorAll(".cfg-pill").forEach(el => {
    el.classList.remove("btn-primary");
    el.classList.add("btn-outline-secondary");
  });
  const active = document.getElementById(`cfg-${seccion}`);
  if (active) active.classList.remove("d-none");
  const pill = document.querySelector(`.cfg-pill[data-cfg="${seccion}"]`);
  if (pill) { pill.classList.remove("btn-outline-secondary"); pill.classList.add("btn-primary"); }

  if (seccion === "equipos")       cargarEquiposGlobal();
  if (seccion === "alimentadores") { cargarAlimentadoresConfig(); _cfgAlimGetNoms(); }
  if (seccion === "ajustes")       cargarAjustesAdmin();
}

// ── Equipos globales (todos los del sistema desde dfAb + LZ) ──────────────

let _cfgEqLista = []; // cache local de la lista completa

async function cargarEquiposGlobal() {
  const cont = document.getElementById("cfg-eq-contenido");
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted small">'
    + '<div class="spinner-border spinner-border-sm me-2" role="status"></div>'
    + 'Cargando…</div>';
  try {
    const data = await apiFetch("/api/equipos/todos");
    if (data?.ok === false) throw new Error(data.error || "Error del servidor");
    _cfgEqLista = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    renderEquiposGlobal(_cfgEqLista, false);
  } catch(e) {
    cont.innerHTML = '<div class="text-danger small p-2">Error al cargar equipos: ' + e.message + '</div>';
  }
}

let _cfgEqBuscarTimer = null;
function filtrarEquiposGlobal() {
  clearTimeout(_cfgEqBuscarTimer);
  const q = (document.getElementById("cfg-eq-buscar")?.value ?? "").trim().toUpperCase();
  if (!q) {
    renderEquiposGlobal(_cfgEqLista, false);
    return;
  }
  if (q.length < 2) return;
  _cfgEqBuscarTimer = setTimeout(async () => {
    const cont = document.getElementById("cfg-eq-contenido");
    if (!cont) return;
    cont.innerHTML = '<div class="text-muted small"><div class="spinner-border spinner-border-sm me-2" role="status"></div>Buscando…</div>';
    try {
      const data = await apiFetch(`/api/equipos/todos?q=${encodeURIComponent(q)}`);
      if (data?.ok === false) throw new Error(data.error || "Error del servidor");
      const lista = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      renderEquiposGlobal(lista, true, q);
    } catch(e) {
      cont.innerHTML = '<div class="text-danger small p-2">Error: ' + e.message + '</div>';
    }
  }, 300);
}

function renderEquiposGlobal(lista, esBusqueda = false, q = "") {
  const cont = document.getElementById("cfg-eq-contenido");
  if (!cont) return;
  if (!lista || !lista.length) {
    cont.innerHTML = esBusqueda
      ? `<p class="text-muted small">Sin resultados para "<b>${q}</b>".</p>`
      : `<p class="text-muted small">Sin equipos configurados aún. Usa el botón "＋ Nuevo" o búscalos por NUMPOS.</p>`;
    return;
  }
  const TIPO_LBL = { setpoint:"Setpoint", conductor:"Conductor", fusible:"Fusible" };
  const confCount = lista.filter(e => e.tiene_config).length;

  let rows = "";
  for (const e of lista) {
    try {
      const np      = (e.numpos || "").replace(/'/g, "\\'");
      const lzBadge = e.es_lz
        ? '<span class="badge bg-warning text-dark ms-1" style="font-size:.62rem;vertical-align:middle">LZ</span>'
        : "";
      const tipo  = e.tiene_config
        ? (TIPO_LBL[e.tipo_limite] || e.tipo_limite || "—")
        : '<span class="text-muted">—</span>';
      const cn    = e.corriente_a != null
        ? (e.corriente_a + " A")
        : '<span class="text-muted">—</span>';
      const fecha = e.ultima_actividad || "—";
      const feeders = e.feeders || [];
      const feedTitle = feeders.join(", ").replace(/"/g, "&quot;");
      const feedStr   = feeders.slice(0, 2).join(", ")
        + (feeders.length > 2 ? ' <span class="text-muted">+' + (feeders.length - 2) + "</span>" : "");
      const notas = e.notas
        ? '<span title="' + e.notas.replace(/"/g, "&quot;") + '">📝</span>'
        : "";
      const rowStyle  = e.tiene_config ? "" : "opacity:.5";
      const editTitle = e.tiene_config ? "Editar" : "Crear ficha";
      const editIcon  = e.tiene_config ? "⚙" : "＋";
      const editBtn   = '<button class="btn btn-link btn-sm p-0 me-1 text-secondary"'
        + ' onclick="fichaAbrirModal(\'' + np + '\', cargarEquiposGlobal)"'
        + ' title="' + editTitle + '">' + editIcon + '</button>';
      const delBtn = e.tiene_config
        ? '<button class="btn btn-link btn-sm p-0 text-danger" onclick="cfgEliminarEquipo(\''
          + np + '\')" title="Eliminar">✕</button>'
        : "";
      rows += '<tr class="cfg-eq-row" data-numpos="' + e.numpos + '" style="' + rowStyle + '">'
        + '<td class="font-monospace small">' + e.numpos + lzBadge + '</td>'
        + '<td class="small">' + tipo + '</td>'
        + '<td class="text-end small">' + cn + '</td>'
        + '<td class="small" style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"'
        + ' title="' + feedTitle + '">' + feedStr + '</td>'
        + '<td class="text-center small">' + notas + '</td>'
        + '<td class="text-muted small">' + fecha + '</td>'
        + '<td class="text-nowrap">' + editBtn + delBtn + '</td>'
        + '</tr>';
    } catch(_) { /* skip malformed entry */ }
  }

  const resumen = esBusqueda
    ? `${lista.length} resultado${lista.length !== 1 ? "s" : ""} para "<b>${q}</b>" — ${confCount} configurados`
    : `${lista.length} equipos configurados`;
  cont.innerHTML =
    '<div class="text-muted small mb-2">' + resumen + '</div>'
    + '<div style="overflow-x:auto"><table class="table table-sm tabla-vcc" style="font-size:.83rem">'
    + '<thead><tr><th>NUMPOS</th><th>Tipo</th><th class="text-end">CN</th>'
    + '<th>Alimentador(es)</th><th></th><th>Última actividad</th><th></th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table></div>';
}

async function cfgEliminarEquipo(numpos) {
  if (!confirm(`¿Eliminar la ficha de ${numpos}?`)) return;
  try {
    await apiFetch(`/api/equipos/config/${encodeURIComponent(numpos)}`, { method: "DELETE" });
    delete state.equiposConfig[numpos];
    cargarEquiposGlobal();
    if (state.vccEquipos.length) vccRenderEquiposInputs(state.vccEquipos);
  } catch(e) { alert("Error: " + e.message); }
}

// ── Alimentadores globales ────────────────────────────────────────────────

async function cargarAlimentadoresConfig() {
  const cont = document.getElementById("cfg-alim-contenido");
  if (!cont) return;
  try {
    const data = await apiFetch("/api/alimentadores/config");
    renderAlimentadoresConfig(data);
  } catch(e) {
    cont.innerHTML = `<div class="text-danger small">Error al cargar: ${e.message}</div>`;
  }
}

function renderAlimentadoresConfig(data) {
  const cont = document.getElementById("cfg-alim-contenido");
  if (!cont) return;
  const entries = Object.entries(data ?? {});
  if (!entries.length) {
    cont.innerHTML = `<p class="text-muted small">Sin alimentadores configurados. Los conductores intermedios se guardan desde la pestaña VCC.</p>`;
    return;
  }
  const rows = entries.map(([nom, cfg]) => {
    const conds      = cfg.conductores_intermedios ?? [];
    const autotrafos = cfg.autotrafos ?? [];
    const nConds = conds.length;
    const safeId = nom.replace(/[^a-zA-Z0-9]/g, "_");
    const id     = "cfg-alim-d-" + safeId;
    const eqId   = "cfg-alim-eq-" + safeId;
    const nomE   = nom.replace(/'/g, "\\'");

    // Capa 1: badge AT en fila resumen
    const atBadge = autotrafos.length
      ? '<span class="badge bg-warning text-dark ms-1" style="font-size:.65rem">⚡ AT</span>'
      : '';

    // Capa 2a: sección AT compacta en fila expandida (todos los ATRs)
    const atCards = autotrafos.map(at => {
      const bajaTxt   = at.rec_baja
        ? `<code>${at.rec_baja}</code> <span class="text-muted" style="font-size:.75rem">(12 kV)</span>`
        : `<span class="text-muted fst-italic" style="font-size:.78rem">12 kV por asignar</span>`;
      const altaTxt   = at.rec_alta
        ? `<code>${at.rec_alta}</code>`
        : `<span class="text-muted fst-italic" style="font-size:.78rem">feeder en alta</span>`;
      const recBajaE  = (at.rec_baja ?? '').replace(/'/g, "\\'");
      return `<div class="d-inline-flex align-items-center gap-2 px-2 py-1 rounded"
                   style="background:#fff9e6;border:1px solid #ffc107;font-size:.83rem">
        ${altaTxt}
        <span class="text-muted" style="font-size:.75rem">(${at.tension_alta ?? 23} kV)</span>
        <span class="text-muted">↕</span>
        ${bajaTxt}
        <button class="btn btn-link btn-sm py-0 px-1 text-danger ms-1"
                onclick="event.stopPropagation();cfgAlimEliminarATRLista('${nomE}','${recBajaE}')"
                title="Eliminar ATR">× Eliminar</button>
      </div>`;
    }).join("");
    const atSection = `<div class="px-3 pb-2">
      <div class="d-flex align-items-center gap-2 mb-1">
        <span class="small fw-semibold text-muted">⚡ Autotrafo${autotrafos.length !== 1 ? "s" : ""}</span>
        <button class="btn btn-link btn-sm py-0 px-1 text-warning" style="font-size:.78rem"
                onclick="event.stopPropagation();cfgAlimSeleccionar('${nomE}')"
                title="Abrir panel para agregar ATR">＋ Agregar</button>
      </div>
      ${autotrafos.length ? `<div class="d-flex flex-wrap gap-2">${atCards}</div>`
        : `<span class="text-muted small fst-italic">Sin autotrafos configurados.</span>`}
    </div>`;

    const condRows = conds.map((c, i) =>
      `<tr>
        <td class="font-monospace small">${c.entre_a}</td>
        <td class="small text-muted">→</td>
        <td class="font-monospace small">${c.entre_b}</td>
        <td class="text-end small">${c.corriente_a} A</td>
        <td class="text-muted small">${c.fecha_registro ?? "—"}</td>
        <td>
          <button class="btn btn-link btn-sm p-0 text-danger"
            onclick="cfgEliminarConductorAlim('${nomE}',${i})" title="Eliminar">✕</button>
        </td>
      </tr>`
    ).join("");
    const condSection = nConds
      ? `<div style="overflow-x:auto"><table class="table table-sm mb-0" style="font-size:.82rem;background:#f8f9fa">
          <thead><tr><th>Desde</th><th></th><th>Hasta</th><th class="text-end">CN (A)</th><th>Fecha</th><th></th></tr></thead>
          <tbody>${condRows}</tbody>
        </table></div>`
      : `<div class="text-muted small fst-italic px-1">Sin conductores intermedios.</div>`;
    return `
      <tr style="cursor:pointer" onclick="cfgToggleAlim('${id}','${nomE}')">
        <td class="fw-semibold font-monospace">
          <span class="text-primary" style="cursor:pointer;text-decoration:underline dotted"
                onclick="event.stopPropagation();cfgAlimSeleccionar('${nomE}')"
                title="Abrir panel de gestión (ATRs, equipos)">${nom}</span>${esAlimFrg(nom) ? frgBadge() : ''}${atBadge}</td>
        <td class="text-muted small">${nConds} conductor${nConds !== 1 ? "es" : ""}</td>
        <td class="text-muted small"><i class="bi bi-cpu me-1"></i><span class="cfg-alim-eq-badge-${safeId}">equipos</span></td>
        <td>
          <button class="btn btn-link btn-sm p-0 text-danger"
            onclick="event.stopPropagation();cfgEliminarAlim('${nomE}')" title="Eliminar alimentador">✕</button>
        </td>
      </tr>
      <tr class="d-none" id="${id}">
        <td colspan="4" class="p-0 bg-light">
          ${atSection}
          <div class="px-3 pt-2 pb-1">
            <div class="small fw-semibold text-muted mb-1">Conductores intermedios</div>
            ${condSection}
          </div>
          <div class="px-3 pb-2" id="${eqId}">
            <div class="small fw-semibold text-muted mb-1">Equipos</div>
            <div class="text-muted small fst-italic cfg-alim-eq-pending">Expandiendo…</div>
          </div>
        </td>
      </tr>`;
  }).join("");
  cont.innerHTML = `<div style="overflow-x:auto"><table class="table table-sm tabla-vcc" style="font-size:.84rem">
    <thead><tr>
      <th>Alimentador</th><th>Conductores</th><th>Equipos</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function cfgToggleAlim(id, nom) {
  const row = document.getElementById(id);
  if (!row) return;
  const wasHidden = row.classList.contains("d-none");
  row.classList.toggle("d-none");
  if (wasHidden && nom) {
    const safeId = nom.replace(/[^a-zA-Z0-9]/g, "_");
    const eqCont = document.getElementById("cfg-alim-eq-" + safeId);
    if (eqCont && !eqCont.dataset.loaded) {
      eqCont.dataset.loaded = "1";
      cfgCargarEquiposAlim(nom, eqCont, safeId);
    }
  }
}

async function cfgCargarEquiposAlim(nom, cont, safeId) {
  const pending = cont.querySelector(".cfg-alim-eq-pending");
  if (pending) pending.textContent = "Cargando…";
  try {
    const fd = state.feedersData.find(f => f.nom_alim === nom);
    const numalim = fd?.numalim ?? "";
    const r    = await apiFetch(`/api/alimentadores/equipos/${encodeURIComponent(nom)}?numalim=${numalim}`);
    const data = r?.data ?? r;
    const equipos = data.equipos ?? [];
    const confEq  = equipos.filter(e => e.tiene_config).length;
    const TIPO_LBL = { setpoint:"Setpoint", conductor:"Conductor", fusible:"Fusible" };

    // actualizar badge en la fila cabecera
    const badge = document.querySelector(`.cfg-alim-eq-badge-${safeId}`);
    if (badge) badge.textContent = `${equipos.length} (${confEq} cfg)`;

    if (!equipos.length) {
      cont.innerHTML = '<div class="small fw-semibold text-muted mb-1">Equipos</div>'
        + '<div class="text-muted small fst-italic">Sin equipos en la base.</div>';
      return;
    }
    const nomEsc  = nom.replace(/'/g, "\\'");
    const eqRows = equipos.map(eq => {
      const np      = (eq.numpos || "").replace(/'/g, "\\'");
      const lzBadge = eq.es_lz
        ? '<span class="badge bg-warning text-dark ms-1" style="font-size:.6rem">LZ</span>' : "";
      const tipo = eq.tiene_config ? (TIPO_LBL[eq.tipo_limite] || "—") : '<span class="text-muted">—</span>';
      const cn   = eq.corriente_a != null ? (eq.corriente_a + " A") : '<span class="text-muted">—</span>';
      const rowStyle = eq.tiene_config ? "" : "opacity:.45";
      const btnIcon  = eq.tiene_config ? "⚙" : "＋";
      const btnTitle = eq.tiene_config ? "Editar" : "Crear ficha";
      return `<tr style="${rowStyle}">
        <td class="font-monospace small">${eq.numpos}${lzBadge}</td>
        <td class="small">${tipo}</td>
        <td class="text-end small">${cn}</td>
        <td><button class="btn btn-link btn-sm p-0 text-secondary"
          onclick="fichaAbrirModal('${np}', ()=>_cfgAlimFichaListCb('${nomEsc}','${safeId}'))"
          title="${btnTitle}">${btnIcon}</button></td>
      </tr>`;
    }).join("");
    cont.innerHTML = `<div class="small fw-semibold text-muted mb-1">Equipos (${equipos.length} — ${confEq} configurados)</div>
      <div style="overflow-x:auto"><table class="table table-sm tabla-vcc mb-0" style="font-size:.82rem">
        <thead><tr><th>NUMPOS</th><th>Tipo</th><th class="text-end">CN</th><th></th></tr></thead>
        <tbody>${eqRows}</tbody>
      </table></div>`;
  } catch(e) {
    cont.innerHTML = '<div class="small fw-semibold text-muted mb-1">Equipos</div>'
      + `<div class="text-danger small">Error: ${e.message}</div>`;
  }
}

async function cfgAlimEliminarATRLista(nom, recBaja) {
  spinner(true, "Eliminando autotrafo...");
  try {
    const existing    = await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nom)}`).catch(() => ({}));
    const conductores = existing?.conductores_intermedios ?? [];
    const autotrafos  = (existing?.autotrafos ?? []).filter(at => at.rec_baja !== recBaja);
    await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nom)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conductores_intermedios: conductores, autotrafos }),
    });
    await cargarAlimentadoresConfig();
  } catch(e) { mostrarError("Error al eliminar autotrafo: " + e.message); }
  finally { spinner(false); }
}

async function cfgEliminarAlim(nom) {
  if (!confirm(`¿Eliminar toda la configuración de ${nom}?`)) return;
  try {
    await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nom)}`, { method: "DELETE" });
    await cargarAlimentadoresConfig();
  } catch(e) { alert("Error: " + e.message); }
}

async function cfgEliminarConductorAlim(nom, idx) {
  try {
    const r     = await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nom)}`);
    const conds = (r.conductores_intermedios ?? []).filter((_, i) => i !== idx);
    await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nom)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conductores_intermedios: conds }),
    });
    await cargarAlimentadoresConfig();
  } catch(e) { alert("Error: " + e.message); }
}

// ── Alimentadores — búsqueda y detalle de feeder ──────────────────────────

let _cfgAlimActual = null;   // {nom_alim, numalim}
let _cfgAlimNoms   = null;   // cache de la lista de nom_alim

async function _cfgAlimGetNoms() {
  if (_cfgAlimNoms) return _cfgAlimNoms;
  // Si feedersData ya está cargado, extraer nom_alim desde ahí
  if (state.feedersData.length) {
    _cfgAlimNoms = state.feedersData
      .map(f => f.nom_alim).filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return _cfgAlimNoms;
  }
  try {
    const r = await apiFetch("/api/alimentadores/lista");
    _cfgAlimNoms = Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : []);
  } catch(e) { _cfgAlimNoms = []; }
  return _cfgAlimNoms;
}

async function cfgAlimBuscar(q) {
  const dd = document.getElementById("cfg-alim-dropdown");
  q = q.trim().toUpperCase();
  if (!q || q.length < 2) { dd.style.display = "none"; return; }
  const noms = await _cfgAlimGetNoms();
  const hits  = noms.filter(n => n.toUpperCase().includes(q)).slice(0, 25);
  if (!hits.length) { dd.style.display = "none"; return; }
  dd.innerHTML = hits.map(n => {
    const ne = n.replace(/'/g, "\\'");
    return `<a class="dropdown-item py-1 font-monospace small" href="#"
      onmousedown="event.preventDefault();cfgAlimSeleccionar('${ne}')">${n}</a>`;
  }).join("");
  dd.style.display = "block";
}

async function cfgAlimSeleccionar(nomAlim) {
  document.getElementById("cfg-alim-dropdown").style.display = "none";
  document.getElementById("cfg-alim-buscar").value = nomAlim;

  const det = document.getElementById("cfg-alim-detalle");
  det.classList.remove("d-none");
  det.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("cfg-alim-det-nom").textContent = nomAlim;
  document.getElementById("cfg-alim-det-meta").textContent = "";
  document.getElementById("cfg-alim-det-contenido").innerHTML =
    '<div class="text-muted small p-2">Cargando…</div>';

  // numalim lo tomamos de feedersData para que el PHP evite re-escanear dfAb
  const fd      = state.feedersData.find(f => f.nom_alim === nomAlim);
  const numalim = fd?.numalim ?? "";

  try {
    const r    = await apiFetch(
      `/api/alimentadores/equipos/${encodeURIComponent(nomAlim)}?numalim=${numalim}`
    );
    const data = r?.data ?? r;
    _cfgAlimActual = { nom_alim: nomAlim, numalim: data.numalim };
    const metaTxt  = data.numalim ? `#${data.numalim}` : "";
    document.getElementById("cfg-alim-det-meta").textContent = metaTxt;
    renderCfgAlimDetalle(data);
  } catch(e) {
    document.getElementById("cfg-alim-det-contenido").innerHTML =
      `<div class="text-danger small p-2">Error: ${e.message}</div>`;
  }
}

function cfgAlimCerrarDetalle() {
  document.getElementById("cfg-alim-detalle").classList.add("d-none");
  document.getElementById("cfg-alim-buscar").value = "";
  _cfgAlimActual = null;
}

async function cfgAlimFichaCallback() {
  if (!_cfgAlimActual) { cargarEquiposGlobal(); return; }
  await cargarEquiposConfig();
  await cfgAlimSeleccionar(_cfgAlimActual.nom_alim);
}

async function _cfgAlimFichaListCb(nom, safeId) {
  await cargarEquiposConfig();
  const cont = document.getElementById("cfg-alim-eq-" + safeId);
  if (cont) { delete cont.dataset.loaded; cfgCargarEquiposAlim(nom, cont, safeId); }
}

function renderCfgAlimDetalle(data) {
  const cont      = document.getElementById("cfg-alim-det-contenido");
  const equipos   = data.equipos ?? [];
  const condInter = data.conductores_intermedios ?? [];
  const autotrafos = data.autotrafos ?? [];
  const ajAlim    = Object.entries(data.ajustes_demanda?.alim  ?? {});
  const ajTrafo   = Object.entries(data.ajustes_demanda?.trafo ?? {});
  const TIPO_LBL = { setpoint:"Setpoint", conductor:"Conductor", fusible:"Fusible" };

  let html = "";

  // ─── Autotrafos ────────────────────────────────────────────
  {
    const nomAlim = _cfgAlimActual?.nom_alim ?? "";
    const nomEsc  = nomAlim.replace(/'/g, "\\'");
    // Equipos que pueden delimitar un ATR (borde). Prefijos en init.js (AT_PREFIJOS).
    const eqsBorde = equipos
      .filter(e => _esBordeATR(e.numpos))
      .sort((a, b) => _atBordePrio(a.numpos) - _atBordePrio(b.numpos) || String(a.numpos).localeCompare(String(b.numpos)));
    let atHtml = '<div class="mb-3"><div class="small fw-semibold mb-2">⚡ Autotransformadores</div>';
    autotrafos.forEach((at) => {
      const recBajaTxt = at.rec_baja
        ? `<code>${at.rec_baja}</code>`
        : `<span class="text-muted fst-italic">no configurado</span>`;
      const recAltaTxt = at.rec_alta
        ? `<code>${at.rec_alta}</code>`
        : `<span class="text-muted fst-italic" style="font-size:.78rem">feeder en alta (sin equipo)</span>`;
      const recBajaEsc = (at.rec_baja ?? '').replace(/'/g, "\\'");
      const tpsDiv = autotrafos.length === 1
        ? `<div id="cfg-at-tps-info" class="mt-2 pt-2" style="border-top:1px solid #ffe082;font-size:.8rem"><span class="text-muted">Cargando TPs…</span></div>`
        : '';
      const atTipo      = at.tipo ?? 'reductor';
      const atTipoLabel = atTipo === 'elevador' ? '↑ Elevador 12→23 kV' : '↓ Reductor 23→12 kV';
      const [labelAlta, labelBaja] = atTipo === 'elevador'
        ? [`Lado ${at.tension_alta ?? 23} kV (alta / downstream)`, 'Lado 12 kV (baja / upstream)']
        : [`Lado ${at.tension_alta ?? 23} kV (alta / upstream)`,   'Lado 12 kV (baja / downstream)'];
      // Para elevador mostramos primero baja (upstream) luego alta (downstream)
      const pairHtml = atTipo === 'elevador'
        ? `<div><div class="text-muted" style="font-size:.7rem">${labelBaja}</div>${recBajaTxt}</div>
           <div class="text-muted">↕</div>
           <div><div class="text-muted" style="font-size:.7rem">${labelAlta}</div>${recAltaTxt}</div>`
        : `<div><div class="text-muted" style="font-size:.7rem">${labelAlta}</div>${recAltaTxt}</div>
           <div class="text-muted">↕</div>
           <div><div class="text-muted" style="font-size:.7rem">${labelBaja}</div>${recBajaTxt}</div>`;
      atHtml += `<div class="p-2 rounded mb-1" style="background:#fff9e6;border:1px solid #ffc107;font-size:.85rem">
        <div class="d-flex align-items-center gap-3 flex-wrap">
          ${pairHtml}
          <div class="ms-auto d-flex align-items-center gap-2">
            <span class="badge bg-warning text-dark" style="font-size:.65rem;font-weight:500">${atTipoLabel}</span>
            <span class="text-muted small">${at.fecha_registro ?? ""}</span>
            <button class="btn btn-link btn-sm py-0 px-1 text-danger"
                    onclick="cfgAlimEliminarAutotrafo('${nomEsc}', '${recBajaEsc}')">× Eliminar</button>
          </div>
        </div>
        ${tpsDiv}
      </div>`;
    });
    if (eqsBorde.length) {
      const opcsBorde = eqsBorde.map(e => `<option value="${e.numpos}">${e.numpos}</option>`).join("");
      const addLabel = autotrafos.length ? 'Agregar otro autotrafo:' : 'Selecciona los equipos que delimitan el autotrafo:';
      atHtml += `<div class="p-2 rounded mt-1" style="background:#f8f9fa;border:1px solid #dee2e6;font-size:.84rem">
        <div class="text-muted small mb-2">${addLabel}</div>
        <div class="d-flex gap-2 align-items-end flex-wrap">
          <div>
            <label class="form-label mb-1 small text-muted">Tipo</label>
            <select id="cfg-at-tipo-sel" class="form-select form-select-sm" style="width:auto"
                    onchange="cfgAtTipoChange()">
              <option value="reductor">↓ Reductor 23→12 kV</option>
              <option value="elevador">↑ Elevador 12→23 kV</option>
            </select>
          </div>
          <div id="cfg-at-div-alta" style="order:1">
            <label id="cfg-at-label-alta" class="form-label mb-1 small text-muted">Lado 23 kV — alta (opcional si feeder nace en alta)</label>
            <select id="cfg-at-rec-alta-sel" class="form-select form-select-sm" style="width:auto">
              <option value="">Sin equipo (feeder nace en alta)</option>${opcsBorde}
            </select>
          </div>
          <div id="cfg-at-div-baja" style="order:2">
            <label id="cfg-at-label-baja" class="form-label mb-1 small text-muted">Lado 12 kV — baja (downstream ↓)</label>
            <select id="cfg-at-rec-baja-sel" class="form-select form-select-sm" style="width:auto">
              <option value="">— equipo baja —</option>${opcsBorde}
            </select>
          </div>
          <div style="order:3">
            <button class="btn btn-sm btn-outline-warning"
                    onclick="cfgAlimRegistrarAutotrafo('${nomEsc}')">
              <i class="bi bi-lightning-charge me-1"></i>Registrar
            </button>
          </div>
        </div>
      </div>`;
    } else if (!autotrafos.length) {
      atHtml += '<div class="text-muted small">Sin RECs en la base para este alimentador.</div>';
    }
    atHtml += '</div>';
    html += atHtml;
  }

  // ─── Equipos ───────────────────────────────────────────────
  const confEq = equipos.filter(e => e.tiene_config).length;
  html += '<div class="mb-3">'
    + '<div class="d-flex align-items-center gap-2 mb-1">'
    + '<span class="small fw-semibold">Equipos del alimentador</span>'
    + '<span class="text-muted small">' + equipos.length + ' total — ' + confEq + ' configurados</span>'
    + '</div>';
  if (!equipos.length) {
    html += '<div class="text-muted small">Sin equipos en la base.</div>';
  } else {
    // Mapa upstream_rec → fila separadora (reductor: upstream=alta o baja si sin alta; elevador: upstream=baja)
    const atSepRowMap = {};
    for (const at of autotrafos) {
      const atTipo   = at.tipo ?? 'reductor';
      const upstream = atTipo === 'elevador' ? at.rec_baja : (at.rec_alta || at.rec_baja);
      if (!upstream) continue;
      const altaInfo = at.rec_alta
        ? `<code>${at.rec_alta}</code> (${at.tension_alta ?? 23} kV)`
        : `<span class="fst-italic">${at.tension_alta ?? 23} kV (feeder en alta)</span>`;
      const bajaInfo = at.rec_baja
        ? ` → <code>${at.rec_baja}</code> (12 kV)`
        : ` → <span class="text-warning" style="font-size:.72rem">[12 kV por asignar ⬇⚡]</span>`;
      atSepRowMap[upstream] =
        `<tr><td colspan="4" class="py-1 px-2" style="background:#fff3cd;border-top:2px dashed #ffc107;border-bottom:2px dashed #ffc107;font-size:.75rem">` +
        `<i class="bi bi-lightning-charge-fill text-warning me-1"></i>` +
        `<b>Autotrafo</b> — ${altaInfo}${bajaInfo}</td></tr>`;
    }
    let eqRows = "";
    for (const eq of equipos) {
      const np      = (eq.numpos || "").replace(/'/g, "\\'");
      const lzBadge = eq.es_lz
        ? '<span class="badge bg-warning text-dark ms-1" style="font-size:.6rem">LZ</span>' : "";
      const tipo = eq.tiene_config
        ? (TIPO_LBL[eq.tipo_limite] || "—")
        : '<span class="text-muted">—</span>';
      const cn   = eq.corriente_a != null
        ? (eq.corriente_a + " A")
        : '<span class="text-muted">—</span>';
      const rowStyle = eq.tiene_config ? "" : "opacity:.5";
      const btnTitle = eq.tiene_config ? "Editar" : "Crear ficha";
      const btnIcon  = eq.tiene_config ? "⚙" : "＋";
      eqRows += '<tr style="' + rowStyle + '">'
        + '<td class="font-monospace small">' + eq.numpos + lzBadge + '</td>'
        + '<td class="small">' + tipo + '</td>'
        + '<td class="text-end small">' + cn + '</td>'
        + '<td class="text-nowrap">'
        + '<button class="btn btn-link btn-sm p-0 text-secondary"'
        + ' onclick="fichaAbrirModal(\'' + np + '\', cfgAlimFichaCallback)"'
        + ' title="' + btnTitle + '">' + btnIcon + '</button>'
        + '</td></tr>';
      if (atSepRowMap[eq.numpos]) eqRows += atSepRowMap[eq.numpos];
    }
    html += '<div style="overflow-x:auto"><table class="table table-sm tabla-vcc mb-0" style="font-size:.82rem">'
      + '<thead><tr><th>NUMPOS</th><th>Tipo</th><th class="text-end">CN</th><th></th></tr></thead>'
      + '<tbody>' + eqRows + '</tbody></table></div>';
  }
  html += '</div>';

  // ─── Conductores intermedios ───────────────────────────────
  if (condInter.length) {
    const ciRows = condInter.map(c => `<tr>
      <td class="font-monospace small">${c.entre_a}</td>
      <td class="small text-muted">→</td>
      <td class="font-monospace small">${c.entre_b}</td>
      <td class="text-end small">${c.corriente_a} A</td>
      <td class="text-muted small">${c.fecha_registro ?? "—"}</td>
    </tr>`).join("");
    html += `<div class="mb-3">
      <div class="small fw-semibold mb-1">Conductores intermedios</div>
      <div style="overflow-x:auto"><table class="table table-sm mb-0" style="font-size:.81rem;background:#f8f9fa">
        <thead><tr><th>Desde</th><th></th><th>Hasta</th><th class="text-end">CN</th><th>Fecha</th></tr></thead>
        <tbody>${ciRows}</tbody>
      </table></div>
    </div>`;
  }

  // ─── Ajustes de demanda ────────────────────────────────────
  if (ajAlim.length || ajTrafo.length) {
    html += `<div class="mb-1"><div class="small fw-semibold mb-1">Ajustes de demanda activos</div>
      <div class="d-flex gap-3 flex-wrap small">`;
    if (ajAlim.length) {
      html += `<div><span class="badge bg-secondary me-1" style="font-size:.68rem">Alimentador</span>`;
      html += ajAlim.map(([m, v]) => `${_mesLabel(m)}: <b>${v.toFixed(1)} A</b>`).join(" · ");
      html += `</div>`;
    }
    if (ajTrafo.length) {
      html += `<div><span class="badge bg-secondary me-1" style="font-size:.68rem">Trafo</span>`;
      html += ajTrafo.map(([m, v]) => `${_mesLabel(m)}: <b>${v.toFixed(1)} A</b>`).join(" · ");
      html += `</div>`;
    }
    html += `</div></div>`;
  }

  cont.innerHTML = html;

  // Cargar TPs por lado del AT de forma async (si aplica)
  const nomAlimAt = _cfgAlimActual?.nom_alim ?? "";
  if (autotrafos.length && nomAlimAt) cfgCargarTpsAt(nomAlimAt);
}

async function cfgCargarTpsAt(nomAlim) {
  const el = document.getElementById("cfg-at-tps-info");
  if (!el) return;
  try {
    const r = await apiFetch(`/api/vcc/equipos/${encodeURIComponent(nomAlim)}?modo=tps_at`);
    const alta = r.alta ?? {n:0, kva:0, tps:[]};
    const baja = r.baja ?? {n:0, kva:0, tps:[]};

    const _tpList = (tps) => tps.length
      ? tps.map(t => `<span class="badge bg-light text-dark border me-1 mb-1" style="font-size:.7rem;font-weight:normal">
          ${t.nombre || t.numpos} <span class="text-muted">${t.kva > 0 ? t.kva + " kVA" : ""}</span></span>`).join("")
      : `<span class="text-muted" style="font-size:.75rem">Sin TPs en este tramo</span>`;

    el.innerHTML = `
      <div class="row g-2">
        <div class="col-auto">
          <div style="font-size:.72rem;color:#856404" class="fw-semibold mb-1">
            ⚡ 23 kV — ${alta.n} TP${alta.n !== 1 ? "s" : ""}, ${alta.kva.toLocaleString()} kVA
          </div>
          <div>${_tpList(alta.tps)}</div>
        </div>
        <div class="col-auto" style="border-left:2px dashed #ffc107;padding-left:10px">
          <div style="font-size:.72rem;color:#0c63e4" class="fw-semibold mb-1">
            ⚡ 12 kV — ${baja.n} TP${baja.n !== 1 ? "s" : ""}, ${baja.kva.toLocaleString()} kVA
          </div>
          <div>${_tpList(baja.tps)}</div>
        </div>
      </div>`;
  } catch(e) {
    el.innerHTML = `<span class="text-danger small">Error al cargar TPs: ${e.message}</span>`;
  }
}

function cfgAtTipoChange() {
  const tipo   = document.getElementById("cfg-at-tipo-sel")?.value ?? "reductor";
  const lAlta  = document.getElementById("cfg-at-label-alta");
  const lBaja  = document.getElementById("cfg-at-label-baja");
  const dAlta  = document.getElementById("cfg-at-div-alta");
  const dBaja  = document.getElementById("cfg-at-div-baja");
  if (!lAlta || !lBaja || !dAlta || !dBaja) return;
  if (tipo === "elevador") {
    lAlta.textContent  = "Lado 23 kV — alta (downstream ↓)";
    lBaja.textContent  = "Lado 12 kV — baja (upstream ↑)";
    dBaja.style.order  = "1";
    dAlta.style.order  = "2";
  } else {
    lAlta.textContent  = "Lado 23 kV — alta (upstream ↑)";
    lBaja.textContent  = "Lado 12 kV — baja (downstream ↓)";
    dAlta.style.order  = "1";
    dBaja.style.order  = "2";
  }
}

async function cfgAlimRegistrarAutotrafo(nomAlim) {
  const selAlta = document.getElementById("cfg-at-rec-alta-sel");
  const selBaja = document.getElementById("cfg-at-rec-baja-sel");
  const selTipo = document.getElementById("cfg-at-tipo-sel");
  const recAlta = selAlta?.value ?? "";
  const recBaja = selBaja?.value ?? "";
  const tipo    = selTipo?.value ?? "reductor";
  if (!recBaja) return mostrarError("Selecciona el REC del lado 12 kV (baja tensión).");
  spinner(true, "Guardando autotrafo...");
  try {
    const existing    = await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nomAlim)}`).catch(() => ({}));
    const conductores = existing?.conductores_intermedios ?? [];
    const autotrafos  = [...(existing?.autotrafos ?? []),
                         { rec_alta: recAlta || null, rec_baja: recBaja, tension_alta: 23, tipo }];
    await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nomAlim)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conductores_intermedios: conductores, autotrafos }),
    });
    await cfgAlimSeleccionar(nomAlim);
  } catch(e) { mostrarError("Error al registrar autotrafo: " + e.message); }
  finally { spinner(false); }
}

async function cfgAlimEliminarAutotrafo(nomAlim, recBaja) {
  spinner(true, "Eliminando autotrafo...");
  try {
    const existing    = await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nomAlim)}`).catch(() => ({}));
    const conductores = existing?.conductores_intermedios ?? [];
    const autotrafos  = (existing?.autotrafos ?? []).filter(at => at.rec_baja !== recBaja);
    await apiFetch(`/api/alimentadores/config/${encodeURIComponent(nomAlim)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conductores_intermedios: conductores, autotrafos }),
    });
    await cfgAlimSeleccionar(nomAlim);
  } catch(e) { mostrarError("Error al eliminar autotrafo: " + e.message); }
  finally { spinner(false); }
}

// ── AJUSTES ADMIN ─────────────────────────────────────────────────────────
async function cargarAjustesAdmin() {
  const cont = document.getElementById("ajustes-admin-contenido");
  if (!cont) return;
  cont.innerHTML = '<div class="text-muted small">Cargando...</div>';
  try {
    const lista = await apiFetch("/api/ajustes");
    if (!lista.length) {
      cont.innerHTML = '<div class="text-muted small p-2">No hay ajustes activos.</div>';
      return;
    }
    const tipoLabel = { alim: "Alimentador", trafo: "Trafo" };
    const filas = lista.flatMap(ent =>
      ent.ajustes.map(m => {
        const sqlStr = m.valor_sql != null ? `${m.valor_sql.toFixed(1)} A` : "—";
        return `<tr>
          <td><span class="badge bg-secondary" style="font-size:.7rem">${tipoLabel[ent.tipo] || ent.tipo}</span></td>
          <td class="small">${ent.nombre}</td>
          <td class="small text-nowrap">${_mesLabel(m.mes)}</td>
          <td class="text-end small text-muted">${sqlStr}</td>
          <td class="text-end small fw-semibold" style="color:#c07000">${m.valor_ajustado.toFixed(1)} A</td>
          <td class="text-center">
            <button class="btn btn-sm py-0 px-1" style="font-size:.75rem;color:#dc3545"
              title="Eliminar ajuste"
              onclick="eliminarAjusteAdmin('${ent.tipo}',${ent.numalim},'${m.mes}',this)">✕</button>
          </td>
        </tr>`;
      })
    ).join("");
    cont.innerHTML = `
      <div style="overflow-x:auto">
        <table class="table table-sm table-bordered" style="font-size:.85rem">
          <thead class="table-light">
            <tr>
              <th>Tipo</th><th>Nombre</th><th>Mes</th>
              <th class="text-end">Valor SQL (A)</th>
              <th class="text-end">Valor aplicado (A)</th>
              <th style="width:36px"></th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <div class="text-muted small mt-1">
        <i class="bi bi-info-circle me-1"></i>
        Los ajustes al alimentador origen modifican el Δ y se reflejan automáticamente en los trafos.
      </div>`;
  } catch(e) {
    cont.innerHTML = `<div class="text-danger small">Error al cargar ajustes: ${e.message}</div>`;
  }
}

async function eliminarAjusteAdmin(tipo, numalim, mes, btn) {
  try {
    const r = await fetch(`/api/ajustes/${tipo}/${numalim}/${mes}`, { method: "DELETE" });
    const j = await r.json();
    if (j.error) { alert("Error: " + j.error); return; }
    btn.closest("tr").remove();
    const tbody = document.querySelector("#ajustes-admin-contenido tbody");
    if (tbody && !tbody.children.length) {
      document.getElementById("ajustes-admin-contenido").innerHTML =
        '<div class="text-muted small p-2">No hay ajustes activos.</div>';
    }
    mostrarToast("Ajuste eliminado.");
  } catch(e) {
    alert("Error: " + e.message);
  }
}

// ── UTILIDADES UI ─────────────────────────────────────────────────────────
function mostrarError(msg) {
  spinner(false);
  const toast = document.createElement("div");
  toast.className = "position-fixed bottom-0 end-0 m-3 alert alert-danger shadow";
  toast.style.zIndex = 9999;
  toast.innerHTML = `<i class="bi bi-exclamation-triangle me-1"></i>${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function mostrarToast(msg) {
  const toast = document.createElement("div");
  toast.className = "position-fixed bottom-0 end-0 m-3 alert alert-success shadow";
  toast.style.zIndex = 9999;
  toast.innerHTML = `<i class="bi bi-check-circle me-1"></i>${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ════════════════════════════════════════════════════════════════════════════
//  HISTORIAL VCC GLOBAL
// ════════════════════════════════════════════════════════════════════════════

let _histGlobalCargado = false;
let _histGlobalData    = [];          // todas las evaluaciones (sin filtrar)
const _histGlobalMap   = new Map();   // clave "nombre_alim__idx" → objeto completo

async function vccCargarHistorialGlobal() {
  spinner(true, "Cargando historial VCC...");
  try {
    const data = await apiFetch("/api/vcc/historial_global");
    _histGlobalData    = Array.isArray(data) ? data : [];
    _histGlobalCargado = true;
    // Poblar mapa para acceso seguro desde onclick
    _histGlobalMap.clear();
    _histGlobalData.forEach(ev => {
      _histGlobalMap.set(`${ev.nombre_alim}__${ev.idx}`, ev);
    });
    hvccRenderTabla(_histGlobalData);
  } catch(e) {
    document.getElementById("hvcc-cuerpo").innerHTML =
      `<p class="text-danger">Error al cargar historial: ${e.message}</p>`;
  } finally { spinner(false); }
}

function hvccFiltrar() {
  const txt    = (document.getElementById("hvcc-buscar")?.value || "").toLowerCase();
  const estado = document.getElementById("hvcc-fil-estado")?.value || "";
  const filtered = _histGlobalData.filter(ev => {
    const matchTxt = !txt ||
      (ev.nombre_alim || "").toLowerCase().includes(txt) ||
      (ev.id_cliente  || "").toLowerCase().includes(txt) ||
      (ev.nombre_cliente || "").toLowerCase().includes(txt) ||
      (ev.numpos      || "").toLowerCase().includes(txt);
    const matchEst = !estado || hvccEstadoEv(ev) === estado;
    return matchTxt && matchEst;
  });
  hvccRenderTabla(filtered);
}

function hvccEstadoEv(ev) {
  const p = ev.pct_max_alim;
  if (p == null) return "viable";
  if (p >= 100)  return "critico";
  if (p >= 90)   return "prealerta";
  return "viable";
}

function hvccRenderTabla(evs) {
  const cuerpo = document.getElementById("hvcc-cuerpo");
  if (!evs.length) {
    cuerpo.innerHTML = "<p class='text-muted'>No hay evaluaciones guardadas.</p>";
    return;
  }

  const BADGE = {
    viable:    `<span class="badge badge-viable">Viable</span>`,
    prealerta: `<span class="badge badge-prealerta">Prealerta</span>`,
    critico:   `<span class="badge badge-critico">Crítico</span>`,
  };

  const rows = evs.map(ev => {
    const est    = hvccEstadoEv(ev);
    const kvaInst = ev.kva_instalado ? ` / ${ev.kva_instalado}` : "";
    const punto  = ev.numpos_nuevo_tp
      ? `<code>${ev.numpos||"—"}</code> <small class="text-muted">→ ${ev.numpos_nuevo_tp}</small>`
      : `<code>${ev.numpos||"—"}</code> <small class="text-muted">${ev.nombre_ref||""}</small>`;
    const dI     = ev.delta_I != null ? Number(ev.delta_I).toFixed(2) : "—";
    const fuMax  = ev.pct_max_alim != null ? Number(ev.pct_max_alim).toFixed(1) + "%" : "—";

    return `<tr>
      <td class="text-muted small">${ev.fecha||"—"}</td>
      <td><strong>${ev.nombre_alim||"—"}</strong>${esAlimFrg(ev.nombre_alim) ? frgBadge() : ''}</td>
      <td>${punto}</td>
      <td class="text-muted small">${ev.id_cliente||"—"}</td>
      <td class="small">${ev.nombre_cliente||"—"}</td>
      <td class="r">${ev.kva_empalme?.toLocaleString("es-CL")||"—"}${kvaInst}</td>
      <td class="r">${dI}</td>
      <td class="r">${fuMax}</td>
      <td>${BADGE[est]||""}</td>
      <td>
        <div class="d-flex gap-1">
          <button class="btn btn-xs btn-outline-secondary py-0 px-1"
            onclick="hvccDescargar('${ev.nombre_alim}',${ev.idx})"
            title="Descargar HTML">
            <i class="bi bi-file-earmark-code"></i>
          </button>
          <button class="btn btn-xs btn-outline-danger py-0 px-1"
            onclick="hvccEliminar('${ev.nombre_alim}',${ev.idx})"
            title="Eliminar">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join("");

  cuerpo.innerHTML = `
    <div class="card step-card p-0">
      <div class="step-body p-0" style="overflow-x:auto">
        <table class="table table-sm tabla-sim mb-0" style="font-size:.82rem">
          <thead>
            <tr>
              <th>Fecha</th><th>Alimentador</th><th>Punto</th>
              <th>ID</th><th>Cliente</th>
              <th class="r">kVA emp.</th><th class="r">ΔI (A)</th>
              <th class="r">FU máx</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <p class="text-muted small mt-2">${evs.length} evaluación(es) mostradas.</p>`;
}

async function hvccEliminar(nombreAlim, idx) {
  if (!confirm(`¿Eliminar evaluación #${idx} de ${nombreAlim}?`)) return;
  spinner(true, "Eliminando...");
  try {
    await fetch(`/api/vcc/${encodeURIComponent(nombreAlim)}/${idx}`, { method: "DELETE" });
    mostrarToast(`Evaluación #${idx} eliminada.`);
    // Quitar de la lista local
    _histGlobalData = _histGlobalData.filter(
      e => !(e.nombre_alim === nombreAlim && e.idx === idx)
    );
    hvccFiltrar();
  } finally { spinner(false); }
}

async function hvccDescargar(nombreAlim, idx) {
  const ev = _histGlobalMap.get(`${nombreAlim}__${idx}`);
  if (!ev) { mostrarError("Evaluación no encontrada en memoria. Recarga el historial."); return; }
  spinner(true, "Generando HTML...");
  try {
    const resp = await fetch("/api/vcc/descargar_html", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(ev),
    });
    if (!resp.ok) { mostrarError("Error generando HTML."); return; }
    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const fname = `vcc_${(ev.nombre_alim||"alim").replace(/\s+/g,"_")}_${ev.fecha||"sin_fecha"}.html`;
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
  } finally { spinner(false); }
}

// ── AJUSTE DE DATOS ANÓMALOS ──────────────────────────────────────────────

function renderAjustePanel(data) {
  const sec  = document.getElementById("sec-ajustes");
  const body = document.getElementById("ajuste-panel-body");
  if (!sec || !body) return;

  const mesesSel = new Set(data.meses_sel || []);

  function filtrarMeses(serie) {
    if (!mesesSel.size) return serie || {};
    return Object.fromEntries(Object.entries(serie || {}).filter(([m]) => mesesSel.has(m)));
  }

  const entidades = [];
  if (data.numalim_orig && data.serie_raw_orig) {
    entidades.push({
      tipo: "alim", numalim: data.numalim_orig,
      label: "Alimentador Origen", nombre: data.nombre_orig || "",
      rawSerie: filtrarMeses(data.serie_raw_orig),
      ajustes: data.ajustes_activos?.alim_orig || {},
      prefix: "alim-orig"
    });
  }
  if (data.numalim_dest && data.serie_raw_dest && Object.keys(data.serie_raw_dest).length) {
    entidades.push({
      tipo: "alim", numalim: data.numalim_dest,
      label: "Alimentador Destino", nombre: data.nombre_dest || "",
      rawSerie: filtrarMeses(data.serie_raw_dest),
      ajustes: data.ajustes_activos?.alim_dest || {},
      prefix: "alim-dest"
    });
  }
  if (data.numalim_trafo_orig && data.serie_raw_trafo_orig) {
    entidades.push({
      tipo: "trafo", numalim: data.numalim_trafo_orig,
      label: "Trafo Origen", nombre: data.trafo_orig?.barra || String(data.numalim_trafo_orig),
      rawSerie: filtrarMeses(data.serie_raw_trafo_orig),
      ajustes: data.ajustes_activos?.trafo_orig || {},
      prefix: "trafo-orig"
    });
  }
  if (data.numalim_trafo_dest && data.serie_raw_trafo_dest) {
    entidades.push({
      tipo: "trafo", numalim: data.numalim_trafo_dest,
      label: "Trafo Destino", nombre: data.trafo_dest?.barra || String(data.numalim_trafo_dest),
      rawSerie: filtrarMeses(data.serie_raw_trafo_dest),
      ajustes: data.ajustes_activos?.trafo_dest || {},
      prefix: "trafo-dest"
    });
  }

  const totalAjustes = entidades.reduce((s, e) => s + Object.keys(e.ajustes).length, 0);
  const badge = document.getElementById("ajuste-badge-count");
  if (badge) {
    badge.textContent = `${totalAjustes} ajuste${totalAjustes !== 1 ? "s" : ""} activo${totalAjustes !== 1 ? "s" : ""}`;
    badge.style.display = totalAjustes ? "" : "none";
  }

  if (!entidades.length) { sec.style.display = "none"; return; }

  const _bloqueEntidad = e => {
    if (!e) return `<div class="col-12 col-md-6"></div>`;
    const meses = Object.keys(e.rawSerie).sort();
    if (!meses.length) return `<div class="col-12 col-md-6"></div>`;
    const nAj = Object.keys(e.ajustes).length;
    const filas = meses.map(mes => {
      const rawVal      = e.rawSerie[mes];
      const ajustado    = e.ajustes[mes];
      const tieneAjuste = ajustado !== undefined && ajustado !== null;
      const bg          = tieneAjuste ? "background:#fff8e1" : "";
      return `<tr style="${bg}">
        <td class="small text-nowrap">${_mesLabel(mes)}</td>
        <td class="text-end small">${rawVal != null ? fmt(rawVal, 1) : "—"} A</td>
        <td style="min-width:95px;padding:2px 4px">
          <input type="number" step="0.1" min="0"
                 class="form-control form-control-sm py-0"
                 id="inp-${e.prefix}-${mes}"
                 value="${tieneAjuste ? ajustado : ""}"
                 placeholder="${rawVal != null ? fmt(rawVal,1) : "—"}"
                 style="font-size:.8rem;height:24px">
        </td>
        <td class="text-center" style="padding:2px">
          ${tieneAjuste
            ? `<button class="btn btn-sm py-0 px-1" title="Restablecer"
                 onclick="eliminarAjuste('${e.tipo}',${e.numalim},'${mes}',event)"
                 style="font-size:.75rem;color:#dc3545;line-height:1.2">✕</button>`
            : ""}
        </td>
      </tr>`;
    }).join("");
    return `<div class="col-12 col-md-6">
      <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
        <span class="small fw-semibold">${e.label}</span>
        <span class="text-muted small">${e.nombre}</span>
        ${nAj ? `<span class="badge" style="background:#f5a623;color:#000;font-size:.7rem">
          ${nAj} ajustado${nAj > 1 ? "s" : ""}</span>` : ""}
      </div>
      <div style="overflow-x:auto">
        <table class="table table-sm table-bordered mb-1" style="font-size:.8rem;width:auto;min-width:300px">
          <thead><tr>
            <th>Mes</th>
            <th class="text-end">Valor SQL (A)</th>
            <th style="min-width:95px">Valor real (A)</th>
            <th style="width:28px"></th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <button class="btn btn-sm btn-warning py-1 px-2" style="font-size:.8rem"
        onclick="guardarAjustesEntidad('${e.tipo}',${e.numalim},'${e.prefix}',event)">
        <i class="bi bi-arrow-clockwise me-1"></i>Guardar y recalcular
      </button>
    </div>`;
  };

  // Organizar en mapa por prefix para layout 2×2
  const eMap = Object.fromEntries(entidades.map(e => [e.prefix, e]));
  const filaOrig = (eMap["alim-orig"] || eMap["trafo-orig"])
    ? `<div class="row g-3 mb-2">
        ${_bloqueEntidad(eMap["alim-orig"])}
        ${_bloqueEntidad(eMap["trafo-orig"])}
      </div>` : "";
  const filaDest = (eMap["alim-dest"] || eMap["trafo-dest"])
    ? `<div class="row g-3" style="border-top:1px solid #dee2e6;padding-top:.75rem">
        ${_bloqueEntidad(eMap["alim-dest"])}
        ${_bloqueEntidad(eMap["trafo-dest"])}
      </div>` : "";

  body.innerHTML = filaOrig + filaDest;

  sec.style.display = "";
}

// Recalcula la simulación actual preservando la cadena de corrimiento.
// Reemplaza el último caso en cadenaSimulaciones en lugar de reiniciar.
async function recalcularConAjuste() {
  state.esRecalculo = true;
  if (state.cadenaSimulaciones.length > 0) {
    state.cadenaSimulaciones.pop(); // quitar el caso actual (se va a reemplazar)
  }
  if (state.numeroCaso > 1) {
    state.esCorrimiento = true; // restaurar delta acumulado del caso anterior
  }
  await ejecutarSimulacion();
}

async function guardarAjustesEntidad(tipo, numalim, prefix, evt) {
  evt?.stopPropagation();
  const cambios = {};
  document.querySelectorAll(`[id^="inp-${prefix}-"]`).forEach(inp => {
    const mes = inp.id.slice(`inp-${prefix}-`.length);
    const v = inp.value.trim();
    if (v !== "") cambios[mes] = parseFloat(v);
  });
  if (!Object.keys(cambios).length) {
    alert("Ingresa al menos un valor antes de guardar.");
    return;
  }
  try {
    const r = await fetch(`/api/ajustes/${tipo}/${numalim}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    const j = await r.json();
    if (j.error) { alert("Error: " + j.error); return; }
    await recalcularConAjuste();
  } catch (err) {
    alert("Error al guardar: " + err.message);
  }
}

async function eliminarAjuste(tipo, numalim, mes, evt) {
  evt?.stopPropagation();
  try {
    const r = await fetch(`/api/ajustes/${tipo}/${numalim}/${mes}`, { method: "DELETE" });
    const j = await r.json();
    if (j.error) { alert("Error: " + j.error); return; }
    await recalcularConAjuste();
  } catch (err) {
    alert("Error al restablecer: " + err.message);
  }
}
