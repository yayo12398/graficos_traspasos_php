// ── RESULTADOS ────────────────────────────────────────────────────────────
function fmt(v, dec=1) { return (v != null && isFinite(v)) ? Number(v).toFixed(dec) : "—"; }

function mostrarResultados(data) {
  try {
    dbg("Renderizando resultados...");
    const _sec = document.getElementById("sec-resultado");
    if (!_sec) {
      mostrarErrorSim("Error interno: no se encontró el contenedor de resultados.");
      return;
    }
    ocultarErrorSim();
    document.getElementById("resultado-contenido").style.setProperty("display","block","important");
    _sec.scrollIntoView({ behavior: "smooth", block: "start" });

  // Alerta principal (sube al tope)
  const alerta = document.getElementById("alerta-resultado");
  const ncrit  = data.resumen.conteo?.critico ?? 0;
  const npre   = data.resumen.conteo?.prealerta ?? 0;
  if (ncrit > 0) {
    alerta.innerHTML = `<div class="alert alert-danger py-2"><i class="bi bi-exclamation-triangle-fill me-1"></i>
      <strong>${ncrit} meses críticos</strong> (supera CN): ${data.resumen.meses_criticos?.join(", ") || "—"}</div>`;
  } else if (npre > 0) {
    alerta.innerHTML = `<div class="alert alert-warning py-2"><i class="bi bi-exclamation-circle me-1"></i>
      <strong>${npre} meses en prealerta</strong> (≥90% CN)</div>`;
  } else {
    alerta.innerHTML = `<div class="alert alert-success py-2"><i class="bi bi-check-circle me-1"></i>
      Traspaso viable en todos los meses del histórico.</div>`;
  }

  // Métricas clave — fila condensada de chips
  const _tdClick = data.detalle_tds?.length ? `onclick="verDetalleTDs(state.ultimaSimulacion.detalle_tds)" style="cursor:pointer"` : "";
  const _chips = [
    { val: `${fmt(data.delta?.delta_max)} A`,    lbl: "Δ aplicado",      col: "var(--enel-blue)" },
    { val: `${fmt(data.isla?.p_pct)}%`,           lbl: "% kVA",           col: "var(--enel-blue)" },
    { val: data.isla?.n_td ?? "—",               lbl: "TDs",             col: "var(--enel-green)", extra: _tdClick },
    { val: data.isla?.clientes ?? "—",           lbl: "Clientes",        col: "var(--enel-green)" },
    { val: data.delta?.mes_peor ?? "—",          lbl: "Mes peor",        col: "var(--enel-amber)" },
    { val: data.resumen?.pct_max_uso != null ? `${fmt(data.resumen.pct_max_uso)}%` : "—",
      lbl: `FU máx. destino`,                                             col: "var(--enel-amber)" },
  ];
  document.getElementById("cards-resumen").innerHTML =
    `<div class="d-flex flex-wrap gap-2">${_chips.map(c =>
      `<div class="res-chip" ${c.extra || ""}>
        <span class="res-chip-val" style="color:${c.col}">${c.val}</span>
        <span class="res-chip-lbl">${c.lbl}</span>
      </div>`).join("")}</div>`;

  // Alerta inversión de flujo
  const _alertaInv = document.getElementById("alerta-inversion-resultado");
  if (_alertaInv) {
    const eqTsp = data.equipos_traspasados || [];
    if (eqTsp.length) {
      const badges = eqTsp.map(e =>
        `<span class="badge bg-warning text-dark me-1">${e.tipo}</span><code class="me-2">${e.nombre}</code>`
      ).join("");
      _alertaInv.innerHTML = `<div class="alert alert-info py-2">
        <i class="bi bi-arrow-left-right me-1"></i>
        <strong>Posible inversión de flujo:</strong> ${badges}
        <div class="text-muted small mt-1">Equipos dentro del segmento que recibirán corriente desde la dirección opuesta. Verificar si aplica según topología real.</div>
      </div>`;
    } else {
      _alertaInv.innerHTML = "";
    }
  }

  // Resumen de maniobra — equipos que abren/cierran + TLC, junto a las métricas.
  // El cierra puede venir en lz_info/_extras y no en body_request.
  const _br  = state.ultimaSimulacion?.body_request || {};
  const _sim = state.ultimaSimulacion || {};
  const _equipoAbre   = _br.equipo_nombre || "";
  const _equipoCierra = _br.equipo_cierra || _sim._extras?.equipo_cierra || _sim.lz_info?.numpos_lz_sel || "";
  const _escenario    = _br.escenario || "normal";
  const _infoEq = document.getElementById("info-equipos");
  if (_infoEq) {
    const _norm = s => (s || "").toUpperCase().trim();
    const _tlcAbre   = (state.equiposData || []).find(e => _norm(e.nombre)    === _norm(_equipoAbre))?.tlc;
    const _tlcCierra = (state.lzVecinos  || []).find(l => _norm(l.numpos_lz) === _norm(_equipoCierra))?.tlc;
    const _tlcBadge  = tlc => tlc === true
      ? ' <span class="badge bg-success" style="font-size:.6rem;vertical-align:middle"><i class="bi bi-broadcast me-1"></i>TLC</span>'
      : tlc === false
        ? ' <span class="badge bg-secondary" style="font-size:.6rem;vertical-align:middle">sin TLC</span>'
        : "";
    const _chip = (icon, val, lbl) =>
      `<div class="res-chip"><span class="res-chip-val" style="font-size:.9rem"><i class="bi ${icon} me-1"></i>${val}</span>` +
      `<span class="res-chip-lbl">${lbl}</span></div>`;
    const _chips = [];
    if (_escenario === "corte_circuito") _chips.push(_chip("bi-scissors", "Corte de circuito", "Escenario"));
    else if (_equipoAbre) _chips.push(_chip("bi-door-open", _norm(_equipoAbre) + _tlcBadge(_tlcAbre), "Equipo que abre"));
    if (_equipoCierra) _chips.push(_chip("bi-toggles", _norm(_equipoCierra) + _tlcBadge(_tlcCierra), "Equipo que cierra"));
    if (_chips.length) {
      _infoEq.innerHTML = `<div class="d-flex flex-wrap gap-2">${_chips.join("")}</div>`;
      _infoEq.style.display = "";
      const _cards = document.getElementById("cards-resumen");   // ubicar junto a las métricas
      if (_cards) _cards.insertAdjacentElement("afterend", _infoEq);
    } else {
      _infoEq.innerHTML = "";
      _infoEq.style.display = "none";
    }
  }

  // Nota de ATR (autotransformador) involucrado en el traspaso
  renderNotaATR(data);
  // Comentarios del caso (descripción + cambio topológico previo, si existen)
  renderComentariosCaso(data);

  // Tabla resumen ejecutivo (FU mes a mes) + trafos
  renderTablaResumenEjecutivo(data);
  renderTablaTrafosEjecutivo(data);
  // Botón "Copiar" en tablas de alimentadores y trafos
  agregarBotonesCopia(document.getElementById("sec-tabla-resumen"));
  agregarBotonesCopia(document.getElementById("sec-tabla-trafos-ej"));

  // Sección equipos involucrados + LZ (dentro de <details>)
  renderSecEquiposInvolucrados(data);
  renderPanelLZ(data.lz_info, data.nombre_orig, data.nombre_dest);
  const _lzEl  = document.getElementById("panel-lz");
  const _eqEl  = document.getElementById("sec-equipos-involucrados");
  const _detLZ = document.getElementById("det-equipos-lz");
  if (_detLZ) {
    const _hasLZ = _lzEl?.innerHTML.trim() !== "" && _lzEl?.style.display !== "none";
    const _hasEq = _eqEl?.innerHTML.trim() !== "";
    _detLZ.style.display = (_hasLZ || _hasEq) ? "" : "none";
  }

  // Panel Corrimiento (el show/hide de det-corrimiento lo maneja la propia función)
  renderPanelCorrimiento(data.numalim_dest, data.nombre_dest);

  // Gráficos Mes a mes (tabla ya está en ejecutivo)
  renderMamSection(data);

  // Peor caso — escenario conservador Δ fijo (al final)
  renderPeorCaso(data);

  // Panel de ajuste de datos anómalos
  renderAjustePanel(data);

  // Botón guardar
  const btnGuardar = document.getElementById("btn-guardar-transf");
  if (data.feeder_nuevo) {
    btnGuardar.style.display = "";
    btnGuardar.innerHTML =
      `<i class="bi bi-save me-1"></i>Guardar en alimentador "${data.feeder_nuevo}"`;
  } else {
    btnGuardar.style.display = "none";
  }
    dbg("✓ Resultados renderizados", "ok");
  } catch (err) {
    dbg(`✗ Error render: ${err.message}`, "error");
    mostrarErrorSim("Error al mostrar resultados: " + err.message);
  }
}

// ── NOTA ATR (autotransformador involucrado) ──────────────────────────────
// Banner ámbar debajo de los chips abre/cierra. Solo si un ATR participa del
// traspaso (lo decide el backend: origen con isla bajo su ATR, o destino con
// ATR en el troncal). Incluye la corriente efectiva entregada → recibida.
function renderNotaATR(data) {
  const infoEq = document.getElementById("info-equipos");
  let cont = document.getElementById("info-atr");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "info-atr";
    cont.className = "mb-2";
  }
  const ai = data.atr_info;
  if (!ai || !ai.notas?.length) {
    cont.innerHTML = "";
    cont.style.display = "none";
    return;
  }

  // Frase "entre/hacia" por flujo: reductor lista alta→baja; elevador baja→alta.
  const _entre = n => {
    const t = fmt(n.tension_alta, 0);
    const alta = n.eq_alta, baja = n.eq_baja;
    if (n.tipo === "elevador") {
      return alta
        ? `entre <code>${baja || "—"}</code> (lado 12 kV) y <code>${alta}</code> (lado ${t} kV)`
        : `hacia <code>${baja}</code> (lado 12 kV)`;
    }
    return alta
      ? `entre <code>${alta}</code> (lado ${t} kV) y <code>${baja || "—"}</code> (lado 12 kV)`
      : `hacia <code>${baja}</code> (lado 12 kV)`;
  };

  const _nota = n => {
    const rol = n.rol === "recibe" ? "recibe la carga" : "entrega la carga";
    const t   = fmt(n.tension_alta, 0);
    const dir = n.tipo === "elevador" ? `elevador 12→${t} kV` : `reductor ${t}→12 kV`;
    const naceAlta = (n.tipo !== "elevador" && !n.eq_alta);
    const cuerpo = naceAlta
      ? `nace en ${t} kV; su autotransformador <strong>${dir}</strong> baja ${_entre(n)}`
      : `tiene un autotransformador <strong>${dir}</strong> ${_entre(n)}`;
    return `<div><i class="bi bi-lightning-charge-fill me-1"></i>El alimentador ` +
      `<strong>${n.feeder}</strong> (${rol}) ${cuerpo}. ` +
      `Las corrientes mostradas ya consideran esta transformación.</div>`;
  };

  const notas = ai.notas.map(_nota).join("");
  const efectiva = ai.transformado
    ? `<div class="mt-1 pt-1" style="border-top:1px solid #f0d68a">` +
      `<i class="bi bi-arrow-left-right me-1"></i>Se traspasan ` +
      `<strong>${fmt(ai.delta_entregado, 1)} A</strong> desde ${data.nombre_orig} (${fmt(ai.v_cab_orig, 0)} kV); ` +
      `por el ATR llegan <strong>${fmt(ai.delta_recibido, 1)} A</strong> a la cabecera de ` +
      `${data.nombre_dest} (${fmt(ai.v_cab_dest, 0)} kV).</div>`
    : "";

  cont.innerHTML =
    `<div class="alert py-2 mb-0" style="background:#fdf6e3;border:1px solid #f0d68a;color:#6b5900;font-size:.85rem">` +
    `${notas}${efectiva}</div>`;
  cont.style.display = "";
  if (infoEq) infoEq.insertAdjacentElement("afterend", cont);
  else document.getElementById("cards-resumen")?.insertAdjacentElement("afterend", cont);
}

// ── COMENTARIOS DEL CASO ──────────────────────────────────────────────────
// Pestaña plegable delgada (abierta por defecto) con la descripción del caso y
// el cambio topológico previo — cada uno solo si fue rellenado por el operador.
// Se ubica bajo la nota ATR si existe, si no bajo los chips abre/cierra.
function renderComentariosCaso(data) {
  const ex      = data._extras || {};
  const desc    = (ex.descripcion || "").trim();
  const camTopo = (ex.cambio_topologico || "").trim();

  let cont = document.getElementById("info-comentarios");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "info-comentarios";
    cont.className = "mb-2";
  }
  if (!desc && !camTopo) {
    cont.innerHTML = "";
    cont.style.display = "none";
    return;
  }

  const _campo = (icon, titulo, texto) =>
    `<div class="mb-1">
       <div class="fw-semibold text-muted" style="font-size:.75rem"><i class="bi ${icon} me-1"></i>${titulo}</div>
       <div class="small" style="white-space:pre-wrap">${_escHtml(texto)}</div>
     </div>`;
  const items = [];
  if (desc)    items.push(_campo("bi-card-text",  "Descripción del caso",     desc));
  if (camTopo) items.push(_campo("bi-diagram-2",  "Cambio topológico previo", camTopo));

  cont.innerHTML =
    `<details open class="border rounded" style="background:#fcfcfd">
       <summary class="px-2 py-1 d-flex align-items-center gap-1" style="cursor:pointer;list-style:none">
         <i class="bi bi-chat-left-text text-muted"></i>
         <span class="fw-semibold text-muted" style="font-size:.8rem">Comentarios del caso</span>
         <i class="bi bi-chevron-down ms-auto text-muted" style="font-size:.7rem"></i>
       </summary>
       <div class="px-2 pb-2 pt-1" style="border-top:1px solid #eee">${items.join("")}</div>
     </details>`;
  cont.style.display = "";

  // Ubicación: bajo la nota ATR si aplica, si no bajo los chips abre/cierra.
  const atrEl  = document.getElementById("info-atr");
  const infoEq = document.getElementById("info-equipos");
  const visible = el => el && el.style.display !== "none" && el.innerHTML.trim() !== "";
  const anchor = visible(atrEl) ? atrEl
               : visible(infoEq) ? infoEq
               : document.getElementById("cards-resumen");
  if (anchor) anchor.insertAdjacentElement("afterend", cont);
}

// ── CHART.JS ──────────────────────────────────────────────────────────────
const ESTADO_COLOR = {
  viable:    "rgba(46, 204, 113, 0.82)",
  prealerta: "rgba(230, 126, 34,  0.82)",
  critico:   "rgba(231, 76,  60,  0.85)",
  sin_datos: "rgba(150, 150, 150, 0.45)",
};
const ESTADO_BORDER = {
  viable:    "rgba(39, 174, 96,  1)",
  prealerta: "rgba(211, 84,  0,  1)",
  critico:   "rgba(192, 57,  43, 1)",
  sin_datos: "rgba(120, 120, 120, 1)",
};

let _charts = {};

function _destroyCharts(...ids) {
  ids.forEach(id => { _charts[id]?.destroy(); delete _charts[id]; });
}

function _mesLabel(yyyymm) {
  const [y, m] = yyyymm.split("-");
  return `${MESES_ES[parseInt(m,10)-1]} ${y.slice(2)}`;
}

function renderPeorCaso(data) {
  _destroyCharts("barras", "estados");
  const tabla   = data.tabla || [];
  const secEl   = document.getElementById("sec-peor-caso");
  const el      = document.getElementById("peor-caso-body");
  if (!tabla.length) { el.innerHTML = ""; if (secEl) secEl.style.display = "none"; return; }
  if (secEl) secEl.style.display = "";

  const nO = data.nombre_orig || "Origen";
  const nD = data.nombre_dest || "Destino";
  const estadoLabel = { viable: "Viable", prealerta: "Prealerta", critico: "Crítico", sin_datos: "—" };
  const badgeClass  = { viable: "badge-viable", prealerta: "badge-prealerta", critico: "badge-critico" };
  const rowBg       = { viable: "#E8F7EE", prealerta: "#FEF3E2", critico: "#FCECEA" };

  const worstIdx = tabla.reduce((best, r, i) =>
    (r.I_orig_antes || 0) > (tabla[best]?.I_orig_antes || 0) ? i : best, 0);
  const w      = tabla[worstIdx];
  const mesLbl = _mesLabel(w.mes);
  const deltaA = data.delta?.delta_max;
  const pPct   = data.isla?.p_pct;
  const estBg  = rowBg[w.estado_dest] || "";
  const estBadge = `<span class="badge ${badgeClass[w.estado_dest] || ""}">${estadoLabel[w.estado_dest] || w.estado_dest || "—"}</span>`;

  // ── Trafos de potencia en el mes peor (mismo mes que el alimentador) ──────
  // Δ del trafo = I_después − I_antes de su propia fila: refleja alivio (−) en
  // origen, carga (+) en destino, y ≈0 si comparten barra o hay ATR asimétrico.
  const _peorTrafoTabla = (trafo, label, showEstado) => {
    if (!trafo || trafo.sin_datos) return "";
    const row = (trafo.tabla || []).find(r => r.mes === w.mes);
    if (!row) return "";
    const cnStr = trafo.cn_trafo != null ? ` · CN=${fmt(trafo.cn_trafo,0)} A` : "";
    const dT    = (row.I_despues != null && row.I_antes != null) ? row.I_despues - row.I_antes : null;
    const dTxt  = dT != null ? `${dT >= 0 ? "+" : "−"}${fmt(Math.abs(dT),1)} A` : "—";
    const dCol  = dT == null ? "color:#888"
                : dT < -0.05 ? "color:#1f8a4c" : dT > 0.05 ? "color:#b06a00" : "color:#666";
    const est   = row.estado || "sin_datos";
    const eBg    = rowBg[est] || "";
    const eBadge = `<span class="badge ${badgeClass[est] || ""}">${estadoLabel[est] || "—"}</span>`;
    const eHead  = showEstado ? `<th class="text-center py-1">Estado</th>` : "";
    const eAntes = showEstado ? `<td></td>` : "";
    const eDesp  = showEstado ? `<td class="text-center">${eBadge}</td>` : "";
    return `
      <div class="small fw-semibold mb-1 text-muted">
        <i class="bi bi-lightning me-1"></i>${_trafoLabel(trafo)} — ${label}${cnStr}
      </div>
      <table class="table table-sm table-bordered mb-0" style="font-size:.82rem">
        <thead><tr>
          <th></th><th class="text-end py-1">Corriente</th><th class="text-end py-1">FU (%)</th>
          <th class="text-end py-1">Δ</th>${eHead}
        </tr></thead>
        <tbody>
          <tr><td style="white-space:nowrap">Antes</td>
              <td class="text-end">${fmt(row.I_antes,1)} A</td>
              <td class="text-end">${fmt(row.uso_antes_pct,1)}%</td>
              <td></td>${eAntes}</tr>
          <tr${eBg ? ` style="background:${eBg}"` : ""}>
              <td style="white-space:nowrap">Después</td>
              <td class="text-end">${fmt(row.I_despues,1)} A</td>
              <td class="text-end">${fmt(row.uso_despues_pct,1)}%</td>
              <td class="text-end fw-semibold" style="${dCol}">${dTxt}</td>${eDesp}</tr>
        </tbody>
      </table>`;
  };

  const _tO = data.trafo_orig, _tD = data.trafo_dest;
  const _mismaBarra = data.misma_barra_se || _tO?.mismo_trafo_destino || _tD?.mismo_trafo_destino;
  let trafoHtml = "";
  if (_mismaBarra) {
    const _t = (_tO && !_tO.sin_datos) ? _tO : _tD;
    const _blk = _peorTrafoTabla(_t, "sin cambio neto", true);
    if (_blk) trafoHtml = `
      <div class="mt-2 pt-2" style="border-top:1px solid #c8d5ec">
        <div class="alert alert-info py-1 px-2 mb-2" style="font-size:.8rem">
          <i class="bi bi-info-circle me-1"></i>Alimentadores en la <strong>misma barra SE</strong> —
          el transformador de potencia no ve cambio neto en su cargabilidad.
        </div>
        ${_blk}
      </div>`;
  } else {
    const _blkO = _peorTrafoTabla(_tO, "alivio", false);
    const _blkD = _peorTrafoTabla(_tD, "carga adicional", true);
    if (_blkO || _blkD) trafoHtml = `
      <div class="row g-2 mt-2 pt-2" style="border-top:1px solid #c8d5ec">
        <div class="col-sm-6">${_blkO || '<div class="small text-muted fst-italic">Trafo de origen sin datos.</div>'}</div>
        <div class="col-sm-6">${_blkD || '<div class="small text-muted fst-italic">Trafo de destino sin datos.</div>'}</div>
      </div>`;
  }

  el.innerHTML = `
    <div class="rounded-3 p-2" style="background:#f0f4fb;border:1px solid #d0ddef">
      <div class="d-flex flex-wrap align-items-center gap-3 mb-2 pb-1" style="border-bottom:1px solid #c8d5ec">
        <span class="fw-semibold" style="color:var(--enel-blue)">
          <i class="bi bi-calendar-event me-1"></i>${mesLbl}
        </span>
        <span class="text-muted small">Δ = <strong>${fmt(deltaA, 1)} A</strong></span>
        <span class="text-muted small">Traspaso = <strong>${pPct != null ? fmt(pPct) + "%" : "—"}</strong></span>
      </div>
      <div class="row g-2">
        <div class="col-sm-6">
          <div class="small fw-semibold mb-1 text-muted">${nO}</div>
          <table class="table table-sm table-bordered mb-0" style="font-size:.82rem">
            <thead><tr>
              <th></th><th class="text-end py-1">Corriente</th><th class="text-end py-1">FU (%)</th>
            </tr></thead>
            <tbody>
              <tr><td style="white-space:nowrap">Antes</td>
                  <td class="text-end">${fmt(w.I_orig_antes,1)} A</td>
                  <td class="text-end">${fmt(w.uso_orig_antes_pct,1)}%</td></tr>
              <tr><td style="white-space:nowrap">Después</td>
                  <td class="text-end">${fmt(w.I_orig_despues,1)} A</td>
                  <td class="text-end">${fmt(w.uso_orig_despues_pct,1)}%</td></tr>
            </tbody>
          </table>
        </div>
        <div class="col-sm-6">
          <div class="small fw-semibold mb-1 text-muted">${nD}</div>
          <table class="table table-sm table-bordered mb-0" style="font-size:.82rem">
            <thead><tr>
              <th></th><th class="text-end py-1">Corriente</th><th class="text-end py-1">FU (%)</th><th class="text-center py-1">Estado</th>
            </tr></thead>
            <tbody>
              <tr><td style="white-space:nowrap">Antes</td>
                  <td class="text-end">${fmt(w.I_dest_antes,1)} A</td>
                  <td class="text-end">${fmt(w.uso_dest_antes_pct,1)}%</td>
                  <td></td></tr>
              <tr${estBg ? ` style="background:${estBg}"` : ""}>
                  <td style="white-space:nowrap">Después</td>
                  <td class="text-end">${fmt(w.I_dest_despues,1)} A</td>
                  <td class="text-end">${fmt(w.uso_dest_despues_pct,1)}%</td>
                  <td class="text-center">${estBadge}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      ${trafoHtml}
    </div>`;

  // Evaluación equipos receptor: ahora se muestra solo en la card
  // "Equipos troncales en alimentador receptor" (renderSecEquiposInvolucrados)
  const secPeor = document.getElementById("sec-vcc-receptor-peor");
  if (secPeor) { secPeor.innerHTML = ""; secPeor.style.display = "none"; }
}

function renderCharts(data) {
  _destroyCharts("barras", "estados");
  const tabla  = data.tabla || [];
  const labels = tabla.map(r => _mesLabel(r.mes));

  // ── Chart 1: Corriente en A (barras agrupadas + líneas CN) ──────────────
  const bgDest   = tabla.map(r => ESTADO_COLOR[r.estado_dest]  || ESTADO_COLOR.sin_datos);
  const brdDest  = tabla.map(r => ESTADO_BORDER[r.estado_dest] || ESTADO_BORDER.sin_datos);
  const cnDestArr = tabla.map(() => data.cn_dest);
  const cnOrigArr = tabla.map(() => data.cn_orig);

  const nomOrig = data.nombre_orig || "Origen";
  const nomDest = data.nombre_dest || "Destino";
  document.getElementById("lbl-chart-estados").textContent = `FU (%) — ${nomDest} por mes`;

  _charts.barras = new Chart(document.getElementById("canvas-barras"), {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: `${nomDest} — Antes (A)`,
          data: tabla.map(r => r.I_dest_antes),
          backgroundColor: "rgba(100,149,237,0.45)",
          borderColor:     "rgba(100,149,237,0.9)",
          borderWidth: 1, order: 3,
        },
        {
          type: "bar",
          label: `${nomDest} — Después (A)`,
          data: tabla.map(r => r.I_dest_despues),
          backgroundColor: bgDest, borderColor: brdDest,
          borderWidth: 1, order: 2,
        },
        {
          type: "line",
          label: `${nomOrig} — Antes (A)`,
          data: tabla.map(r => r.I_orig_antes),
          borderColor: "rgba(52,73,94,0.55)",
          borderDash: [5,4], borderWidth: 2,
          pointRadius: 3, fill: false, order: 1,
        },
        {
          type: "line",
          label: `${nomOrig} — Después (A)`,
          data: tabla.map(r => r.I_orig_despues),
          borderColor: "rgba(52,73,94,1)",
          borderDash: [2,2], borderWidth: 2,
          pointRadius: 3, fill: false, order: 1,
        },
        {
          type: "line",
          label: `CN ${nomDest} (${fmt(data.cn_dest,0)} A)`,
          data: cnDestArr,
          borderColor: "rgba(231,76,60,0.9)",
          borderDash: [8,4], borderWidth: 2,
          pointRadius: 0, fill: false, order: 0,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            afterLabel: ctx => {
              if (ctx.datasetIndex === 1 && data.cn_dest) {
                const pct = (ctx.raw / data.cn_dest * 100).toFixed(1);
                return `→ ${pct}% CN`;
              }
            }
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 10 } } },
        y: { title: { display: true, text: "Corriente (A)", font: { size: 11 } }, beginAtZero: true },
      },
    },
  });

  // ── Chart 2: % uso CN destino por mes ───────────────────────────────────
  const maxPct = Math.max(110, ...tabla.map(r => r.uso_dest_despues_pct || 0));
  _charts.estados = new Chart(document.getElementById("canvas-estados"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: `FU (%) — ${nomDest}`,
          data: tabla.map(r => r.uso_dest_despues_pct),
          backgroundColor: bgDest, borderColor: brdDest,
          borderWidth: 1, order: 2,
        },
        {
          type: "line", label: "Prealerta 90%",
          data: tabla.map(() => 90),
          borderColor: "rgba(230,126,34,0.85)", borderDash: [6,3],
          borderWidth: 2, pointRadius: 0, fill: false, order: 1,
        },
        {
          type: "line", label: "Crítico 100%",
          data: tabla.map(() => 100),
          borderColor: "rgba(231,76,60,0.85)", borderDash: [6,3],
          borderWidth: 2, pointRadius: 0, fill: false, order: 0,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.datasetIndex === 0
              ? ` FU: ${fmt(ctx.raw)}%  (${fmt(data.tabla[ctx.dataIndex]?.I_dest_despues,0)} A)`
              : ` ${ctx.dataset.label}`
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 10 } } },
        y: {
          title: { display: true, text: "FU (%)", font: { size: 11 } },
          min: 0, max: maxPct,
          ticks: { callback: v => v + "%" },
        },
      },
    },
  });
}

function _renderTrafoChart(canvasId, trafoData, titulo, modo, ajMeses = new Set()) {
  _destroyCharts(canvasId);
  if (!trafoData || trafoData.sin_datos || !trafoData.tabla?.length) return false;

  const labels  = trafoData.tabla.map(r => _mesLabel(r.mes));
  const bgCol   = trafoData.tabla.map(r => ESTADO_COLOR[r.estado]  || ESTADO_COLOR.sin_datos);
  const brdCol  = trafoData.tabla.map(r => ESTADO_BORDER[r.estado] || ESTADO_BORDER.sin_datos);
  const maxPct  = Math.max(110, ...trafoData.tabla.map(r => r.uso_despues_pct || 0));
  const signo   = modo === "alivio" ? "−" : "+";

  const worstIdx = trafoData.tabla.reduce((best, r, i) =>
    (r.uso_despues_pct || 0) > (trafoData.tabla[best]?.uso_despues_pct || 0) ? i : best, 0);
  const bgFinal  = bgCol.map((c, i)  => i === worstIdx ? "rgba(180,0,0,0.85)" : c);
  const brdFinal = brdCol.map((c, i) => {
    if (i === worstIdx) return "rgba(140,0,0,1)";
    if (ajMeses.has(trafoData.tabla[i].mes)) return "#f5a623";
    return c;
  });
  const brdWidth = trafoData.tabla.map((r, i) => {
    if (i === worstIdx) return 2;
    if (ajMeses.has(r.mes)) return 2.5;
    return 1;
  });

  _charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: `FU (%) trafo ${signo}Δ`,
          data: trafoData.tabla.map(r => r.uso_despues_pct),
          backgroundColor: bgFinal, borderColor: brdFinal,
          borderWidth: brdWidth, order: 2,
        },
        {
          label: "FU (%) antes",
          data: trafoData.tabla.map(r => r.uso_antes_pct),
          type: "line",
          borderColor: "rgba(100,149,237,0.75)", borderDash: [5,3],
          borderWidth: 2, pointRadius: 2, fill: false, order: 1, hidden: true,
        },
        {
          type: "line", label: "Prealerta 90%",
          data: trafoData.tabla.map(() => 90),
          borderColor: "rgba(230,126,34,0.8)", borderDash: [6,3],
          borderWidth: 1.5, pointRadius: 0, fill: false, order: 0, hidden: true,
        },
        {
          type: "line", label: "Crítico 100%",
          data: trafoData.tabla.map(() => 100),
          borderColor: "rgba(231,76,60,0.8)", borderDash: [6,3],
          borderWidth: 1.5, pointRadius: 0, fill: false, order: 0,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 10 } } },
        tooltip: {
          filter: item => item.datasetIndex < 2,
          callbacks: {
            label: ctx => {
              const row = trafoData.tabla[ctx.dataIndex];
              if (ctx.datasetIndex === 0) {
                const I = row?.I_despues;
                const aj = ajMeses.has(row?.mes) ? "  ✎ ajustado" : "";
                return ` FU después: ${fmt(ctx.raw)}%${I != null ? "  (" + fmt(I,0) + " A)" : ""}${aj}`;
              }
              return ` FU antes: ${fmt(ctx.raw)}%`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 10 } } },
        y: {
          title: { display: true, text: "FU (%) trafo", font: { size: 11 } },
          min: 0, max: maxPct,
          ticks: { callback: v => v + "%" },
        },
      },
    },
  });
  return true;
}

// ── CARGABILIDAD TRAFOS ───────────────────────────────────────────────────
function _trafoLabel(trafo) {
  const sub = trafo?.subestacion || "";
  const bar = trafo?.barra       || "";
  if (sub && bar)  return `${bar} SE ${sub}`;
  if (sub)         return `SE ${sub}`;
  if (bar)         return `${bar}`;
  return "Transformador de potencia";
}

function renderTrafos(trafoOrig, trafoDest, nomOrig = "Origen", nomDest = "Destino") {
  const sec = document.getElementById("sec-trafos");
  const secOrig = document.getElementById("trafo-orig-section");
  const secDest = document.getElementById("trafo-dest-section");
  _destroyCharts("canvas-trafo-orig", "canvas-trafo-dest");

  if (!trafoOrig && !trafoDest) { sec.style.display = "none"; return; }
  sec.style.display = "";

  // Trafo origen
  if (trafoOrig && !trafoOrig.sin_datos) {
    const cnStr    = trafoOrig.cn_trafo != null ? `  CN=${fmt(trafoOrig.cn_trafo,0)} A` : "";
    const mismoStr = trafoOrig.mismo_trafo_destino ? "  — mismo trafo que destino, sin cambio neto" : "";
    document.getElementById("trafo-orig-label").textContent =
      `${_trafoLabel(trafoOrig)} — alivio${cnStr}${mismoStr}`;
    secOrig.style.display = "";
    _renderTrafoChart("canvas-trafo-orig", trafoOrig, "Trafo Origen", "alivio");
  } else {
    secOrig.style.display = "none";
  }

  // Trafo destino
  if (trafoDest && !trafoDest.sin_datos) {
    const cnStr = trafoDest.cn_trafo != null ? `  CN=${fmt(trafoDest.cn_trafo,0)} A` : "";
    document.getElementById("trafo-dest-label").textContent =
      `${_trafoLabel(trafoDest)} — carga adicional${cnStr}`;
    secDest.style.display = "";
    _renderTrafoChart("canvas-trafo-dest", trafoDest, "Trafo Destino", "carga");
  } else {
    secDest.style.display = "none";
  }
}

// ── ANÁLISIS MES A MES ───────────────────────────────────────────────────

function toggleSecMam() {
  const body    = document.getElementById("mam-body");
  const chevron = document.getElementById("mam-chevron");
  const abierto = body.style.display !== "none";
  if (!abierto) {
    body.style.display      = "";
    chevron.style.transform = "rotate(180deg)";
    // Re-render fresco en cada apertura: Chart.js necesita el canvas visible con
    // dimensiones. requestAnimationFrame asegura el layout tras mostrar mam-body,
    // y destruir+recrear evita canvas en blanco por estado stale entre casos.
    const sim = state.ultimaSimulacion;
    if (sim) {
      requestAnimationFrame(() => {
        renderMamCharts(sim);
        renderMamTrafos(sim.trafo_orig_mam, sim.trafo_dest_mam, sim.nombre_orig, sim.nombre_dest, sim.ajustes_activos, sim.misma_barra_se ?? false);
      });
    }
  } else {
    body.style.display      = "none";
    chevron.style.transform = "";
  }
}

function renderMamSection(data) {
  const sec = document.getElementById("sec-mam");
  if (!data.tabla_mam || !data.tabla_mam.length) { sec.style.display = "none"; return; }

  sec.style.display = "";
  // Destruir charts anteriores para que toggleSecMam los reinicie al abrir
  _destroyCharts("barras-mam", "estados-mam", "canvas-trafo-orig-mam", "canvas-trafo-dest-mam");
  const mamBody = document.getElementById("mam-body");
  mamBody.style.display = "none";
  document.getElementById("mam-chevron").style.transform = "";

  const nomDest = data.nombre_dest || "Destino";
  document.getElementById("lbl-estados-mam").textContent = `FU (%) ${nomDest} — mes a mes`;

  // Evaluación equipos receptor: ahora se muestra solo en la card
  // "Equipos troncales en alimentador receptor" (renderSecEquiposInvolucrados)
  const secMamVcc = document.getElementById("sec-vcc-receptor-mam");
  if (secMamVcc) { secMamVcc.innerHTML = ""; secMamVcc.style.display = "none"; }
}

function renderMamCharts(data) {
  _destroyCharts("barras-mam", "estados-mam");
  const tabla   = data.tabla_mam || [];
  const labels  = tabla.map(r => _mesLabel(r.mes));
  const nomOrig = data.nombre_orig || "Origen";
  const nomDest = data.nombre_dest || "Destino";

  const bgDest  = tabla.map(r => ESTADO_COLOR[r.estado_dest]  || ESTADO_COLOR.sin_datos);
  const brdDest = tabla.map(r => ESTADO_BORDER[r.estado_dest] || ESTADO_BORDER.sin_datos);

  // Destacar el peor mes (máx FU destino después) en rojo oscuro, como los trafos.
  // bgDest/brdDest los comparten el chart de corriente y el de FU → aplica a ambos.
  const worstIdx = tabla.reduce((best, r, i) =>
    (r.uso_dest_despues_pct || 0) > (tabla[best]?.uso_dest_despues_pct || 0) ? i : best, 0);
  if (tabla.length) {
    bgDest[worstIdx]  = "rgba(180,0,0,0.85)";
    brdDest[worstIdx] = "rgba(140,0,0,1)";
  }
  const brdWDest = tabla.map((r, i) => i === worstIdx ? 2 : 1);

  const ajOrig = new Set(Object.keys(data.ajustes_activos?.alim_orig || {}));
  const ajDest = new Set(Object.keys(data.ajustes_activos?.alim_dest || {}));

  const ptColorOrig  = tabla.map(r => ajOrig.has(r.mes) ? "#f5a623" : "rgba(52,73,94,0.7)");
  const ptRadiusOrig = tabla.map(r => ajOrig.has(r.mes) ? 7 : 3);
  const ptStyleOrig  = tabla.map(r => ajOrig.has(r.mes) ? "triangle" : "circle");

  const brdDestAntesColor = tabla.map(r => ajDest.has(r.mes) ? "#f5a623" : "rgba(100,149,237,0.9)");
  const brdDestAntesWidth = tabla.map(r => ajDest.has(r.mes) ? 2.5 : 1);

  // ── Chart barras mam ─────────────────────────────────────────────────────
  _charts["barras-mam"] = new Chart(document.getElementById("canvas-barras-mam"), {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: `${nomDest} — Antes (A)`,
          data: tabla.map(r => r.I_dest_antes),
          backgroundColor: "rgba(100,149,237,0.45)",
          borderColor: brdDestAntesColor,
          borderWidth: brdDestAntesWidth, order: 2,
        },
        {
          type: "bar",
          label: `${nomDest} — Después (A)`,
          data: tabla.map(r => r.I_dest_despues),
          backgroundColor: bgDest, borderColor: brdDest,
          borderWidth: brdWDest, order: 3,
        },
        {
          type: "line",
          label: `${nomOrig} — Antes (A)`,
          data: tabla.map(r => r.I_orig_antes),
          borderColor: "rgba(52,73,94,0.55)",
          borderDash: [5,4], borderWidth: 2,
          pointRadius: ptRadiusOrig,
          pointBackgroundColor: ptColorOrig,
          pointBorderColor: ptColorOrig,
          pointStyle: ptStyleOrig,
          fill: false, order: 1, hidden: true,
        },
        {
          type: "line",
          label: `${nomOrig} — Después (A)`,
          data: tabla.map(r => r.I_orig_despues),
          borderColor: "rgba(52,73,94,1)",
          borderDash: [2,2], borderWidth: 2,
          pointRadius: ptRadiusOrig,
          pointBackgroundColor: ptColorOrig,
          pointBorderColor: ptColorOrig,
          pointStyle: ptStyleOrig,
          fill: false, order: 1, hidden: true,
        },
        {
          type: "line",
          label: `CN ${nomDest} (${fmt(data.cn_dest,0)} A)`,
          data: tabla.map(() => data.cn_dest),
          borderColor: "rgba(231,76,60,0.9)",
          borderDash: [8,4], borderWidth: 2,
          pointRadius: 0, fill: false, order: 0,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            afterLabel: ctx => {
              const mes = tabla[ctx.dataIndex]?.mes;
              if (ctx.datasetIndex === 1 && data.cn_dest) {
                let txt = `→ ${(ctx.raw / data.cn_dest * 100).toFixed(1)}% CN`;
                if (mes && ajDest.has(mes)) txt += "\n✎ valor ajustado";
                return txt;
              }
              if ((ctx.datasetIndex === 2 || ctx.datasetIndex === 3) && mes && ajOrig.has(mes)) {
                return "✎ valor ajustado";
              }
            }
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 10 } } },
        y: { title: { display: true, text: "Corriente (A)", font: { size: 11 } }, beginAtZero: true },
      },
    },
  });

  // ── Chart FU% mam ────────────────────────────────────────────────────────
  const maxPct = Math.max(110, ...tabla.map(r => r.uso_dest_despues_pct || 0));
  _charts["estados-mam"] = new Chart(document.getElementById("canvas-estados-mam"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: `FU (%) ${nomDest} — Después`,
          data: tabla.map(r => r.uso_dest_despues_pct),
          backgroundColor: bgDest, borderColor: brdDest,
          borderWidth: brdWDest, order: 2,
        },
        {
          type: "line", label: "Prealerta 90%",
          data: tabla.map(() => 90),
          borderColor: "rgba(230,126,34,0.85)", borderDash: [6,3],
          borderWidth: 2, pointRadius: 0, fill: false, order: 1,
        },
        {
          type: "line", label: "Crítico 100%",
          data: tabla.map(() => 100),
          borderColor: "rgba(231,76,60,0.85)", borderDash: [6,3],
          borderWidth: 2, pointRadius: 0, fill: false, order: 0,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.datasetIndex === 0
              ? ` FU: ${fmt(ctx.raw)}%  (${fmt(data.tabla_mam[ctx.dataIndex]?.I_dest_despues,0)} A)`
              : ` ${ctx.dataset.label}`
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 10 } } },
        y: {
          title: { display: true, text: "FU (%)", font: { size: 11 } },
          min: 0, max: maxPct,
          ticks: { callback: v => v + "%" },
        },
      },
    },
  });
}

function renderMamTrafos(trafoOrig, trafoDest, nomOrig="Origen", nomDest="Destino", ajActivos={}, mismaBarra=false) {
  const sec     = document.getElementById("sec-trafos-mam");
  const secOrig = document.getElementById("trafo-orig-mam-section");
  const secDest = document.getElementById("trafo-dest-mam-section");
  const notaEl  = document.getElementById("misma-barra-nota");
  _destroyCharts("canvas-trafo-orig-mam", "canvas-trafo-dest-mam");

  if (notaEl) notaEl.style.display = "none";
  if (!trafoOrig && !trafoDest) {
    if (mismaBarra) {
      sec.style.display = "";
      if (secOrig) secOrig.style.display = "none";
      if (secDest) secDest.style.display = "none";
      if (notaEl)  notaEl.style.display  = "";
    } else {
      sec.style.display = "none";
    }
    return;
  }
  sec.style.display = "";

  const ajOrig = new Set(Object.keys(ajActivos?.trafo_orig || {}));
  const ajDest = new Set(Object.keys(ajActivos?.trafo_dest || {}));

  if (trafoOrig && !trafoOrig.sin_datos) {
    const cnStr = trafoOrig.cn_trafo != null ? `  CN=${fmt(trafoOrig.cn_trafo,0)} A` : "";
    document.getElementById("trafo-orig-mam-label").textContent =
      `${_trafoLabel(trafoOrig)} — alivio Mes a mes${cnStr}`;
    secOrig.style.display = "";
    _renderTrafoChart("canvas-trafo-orig-mam", trafoOrig, "Trafo Origen Mes a mes", "alivio", ajOrig);
  } else {
    secOrig.style.display = "none";
  }

  if (trafoDest && !trafoDest.sin_datos) {
    const cnStr = trafoDest.cn_trafo != null ? `  CN=${fmt(trafoDest.cn_trafo,0)} A` : "";
    document.getElementById("trafo-dest-mam-label").textContent =
      `${_trafoLabel(trafoDest)} — carga Mes a mes${cnStr}`;
    secDest.style.display = "";
    _renderTrafoChart("canvas-trafo-dest-mam", trafoDest, "Trafo Destino Mes a mes", "carga", ajDest);
  } else {
    secDest.style.display = "none";
  }
}

function renderMamTable(data, headId, bodyId) {
  const tabla  = data.tabla_mam || [];
  const nO = data.nombre_orig || "Origen";
  const nD = data.nombre_dest || "Destino";

  const estadoLabel = { viable: "Viable", prealerta: "Prealerta", critico: "Crítico", sin_datos: "—" };
  const badgeClass  = { viable: "badge-viable", prealerta: "badge-prealerta", critico: "badge-critico" };
  const rowBg       = { viable: "#E8F7EE", prealerta: "#FEF3E2", critico: "#FCECEA" };

  const ajOrig = new Set(Object.keys(data.ajustes_activos?.alim_orig || {}));
  const ajDest = new Set(Object.keys(data.ajustes_activos?.alim_dest || {}));

  const worstIdx = tabla.reduce((best, r, i) =>
    (r.I_orig_antes || 0) > (tabla[best]?.I_orig_antes || 0) ? i : best, 0);
  const W_TH = "border-left:2px solid rgba(192,0,0,0.6);border-right:2px solid rgba(192,0,0,0.6);background:rgba(231,76,60,0.12);font-weight:bold;color:#000";
  const W_TD = "border-left:2px solid rgba(192,0,0,0.5);border-right:2px solid rgba(192,0,0,0.5);font-weight:bold;color:#000";

  document.getElementById(headId).innerHTML =
    `<tr>
      <th class="py-1" style="min-width:170px;white-space:nowrap">Métrica</th>
      ${tabla.map((r,i) => {
        const isWorst = i === worstIdx;
        const isAj    = ajOrig.has(r.mes) || ajDest.has(r.mes);
        let st = "white-space:nowrap";
        if (isWorst) st += ";" + W_TH;
        else if (isAj) st += ";background:#fff3cd";
        const ajMark = isAj ? ` <span title="Valor ajustado" style="color:#c07000;font-size:.75rem">✎</span>` : "";
        return `<th class="py-1 text-center" style="${st}">${_mesLabel(r.mes)}${ajMark}</th>`;
      }).join("")}
    </tr>`;

  const metricas = [
    { key: "I_orig_antes",         lbl: `${nO} — Antes (A)`,           fu: false },
    { key: "I_orig_despues",       lbl: `${nO} — Después (A)`,         fu: false },
    { key: "uso_orig_antes_pct",   lbl: `FU (%) ${nO} — Antes (A)`,    fu: false },
    { key: "uso_orig_despues_pct", lbl: `FU (%) ${nO} — Después (A)`,  fu: false },
    { key: "I_dest_antes",         lbl: `${nD} — Antes (A)`,           fu: false },
    { key: "I_dest_despues",       lbl: `${nD} — Después (A)`,         fu: false },
    { key: "uso_dest_antes_pct",   lbl: `FU (%) ${nD} — Antes (A)`,    fu: false },
    { key: "uso_dest_despues_pct", lbl: `FU (%) ${nD} — Después (A)`,  fu: true  },
    { key: "estado_dest",          lbl: "Estado",                       isEstado: true },
  ];

  document.getElementById(bodyId).innerHTML = metricas.map(m => {
    const cells = tabla.map((row, colIdx) => {
      const v   = row[m.key];
      const est = row.estado_dest || "";
      const wst = colIdx === worstIdx ? W_TD : "";
      if (m.isEstado) {
        const bg = rowBg[est] || "";
        const st = [bg ? `background:${bg}` : "", wst].filter(Boolean).join(";");
        return `<td class="text-center" style="${st}"><span class="badge ${badgeClass[est]||""}">${estadoLabel[est]||est}</span></td>`;
      }
      const fuBg = m.fu ? (rowBg[est] || "") : "";
      const st   = [fuBg ? `background:${fuBg}` : "", wst].filter(Boolean).join(";");
      const suffix = m.key.includes("pct") ? "%" : "";
      const txt    = (typeof v === "number" && isFinite(v)) ? (v.toFixed(1) + suffix) : "—";
      return `<td class="text-center" style="${st}">${txt}</td>`;
    }).join("");
    return `<tr><td class="fw-semibold small" style="white-space:nowrap;background:#f8f9fa">${m.lbl}</td>${cells}</tr>`;
  }).join("");
}

function renderTablaResumenEjecutivo(data) {
  const sec = document.getElementById("sec-tabla-resumen");
  if (!data.tabla_mam?.length) { if (sec) sec.style.display = "none"; return; }
  renderMamTable(data, "tabla-resumen-head", "tabla-resumen-body");
  if (sec) sec.style.display = "";
}

function renderTablaTrafosEjecutivo(data) {
  const sec = document.getElementById("sec-tabla-trafos-ej");
  if (!sec) return;

  const trafoOrig = data.trafo_orig_mam;
  const trafoDest = data.trafo_dest_mam;
  const mismaBarra = data.misma_barra_se ?? false;
  const nomOrig = data.nombre_orig || "Origen";
  const nomDest = data.nombre_dest || "Destino";

  const notaEl = document.getElementById("nota-misma-barra-ej");
  if (notaEl) notaEl.style.display = mismaBarra ? "" : "none";

  if (!trafoOrig && !trafoDest) {
    sec.style.display = mismaBarra ? "" : "none";
    document.getElementById("tabla-trafos-ej-head").innerHTML = "";
    document.getElementById("tabla-trafos-ej-body").innerHTML = "";
    return;
  }

  const tabla_mam = data.tabla_mam || [];
  const ajOrig = new Set(Object.keys(data.ajustes_activos?.trafo_orig || {}));
  const ajDest = new Set(Object.keys(data.ajustes_activos?.trafo_dest || {}));

  const trafoLabel = t => {
    if (!t) return "";
    const parts = [t.nombre || t.numpos || "Trafo"];
    if (t.kva) parts.push(`${t.kva} kVA`);
    if (t.cn_trafo) parts.push(`CN=${fmt(t.cn_trafo,0)} A`);
    return parts.join(" · ");
  };

  const estadoLabel = { viable: "Viable", prealerta: "Prealerta", critico: "Crítico", sin_datos: "—" };
  const badgeClass  = { viable: "badge-viable", prealerta: "badge-prealerta", critico: "badge-critico" };
  const rowBg       = { viable: "#E8F7EE", prealerta: "#FEF3E2", critico: "#FCECEA" };

  const worstIdx = tabla_mam.reduce((best, r, i) =>
    (r.I_orig_antes || 0) > (tabla_mam[best]?.I_orig_antes || 0) ? i : best, 0);
  const W_TH = "border-left:2px solid rgba(192,0,0,0.6);border-right:2px solid rgba(192,0,0,0.6);background:rgba(231,76,60,0.12);font-weight:bold;color:#000";
  const W_TD = "border-left:2px solid rgba(192,0,0,0.5);border-right:2px solid rgba(192,0,0,0.5);font-weight:bold;color:#000";

  document.getElementById("tabla-trafos-ej-head").innerHTML =
    `<tr>
      <th class="py-1" style="min-width:170px;white-space:nowrap">Métrica</th>
      ${tabla_mam.map((r,i) => {
        const isWorst = i === worstIdx;
        const isAj    = ajOrig.has(r.mes) || ajDest.has(r.mes);
        let st = "white-space:nowrap";
        if (isWorst) st += ";" + W_TH;
        else if (isAj) st += ";background:#fff3cd";
        const ajMark = isAj ? ` <span title="Valor ajustado" style="color:#c07000;font-size:.75rem">✎</span>` : "";
        return `<th class="py-1 text-center" style="${st}">${_mesLabel(r.mes)}${ajMark}</th>`;
      }).join("")}
    </tr>`;

  const filas = [];
  const _addTrafoFilas = (trafo, label, ajSet) => {
    if (!trafo || trafo.sin_datos) return;
    const datos = trafo.tabla || [];
    const byMes = Object.fromEntries(datos.map(d => [d.mes, d]));
    filas.push({ lbl: `${label} — Antes (A)`,      key: "I_antes",        trafo, byMes, ajSet, fu: false });
    filas.push({ lbl: `${label} — Después (A)`,     key: "I_despues",      trafo, byMes, ajSet, fu: false });
    if (trafo.cn_trafo) {
      filas.push({ lbl: `FU (%) ${label}`,           key: "uso_despues_pct", trafo, byMes, ajSet, fu: true });
      filas.push({ lbl: `Estado`,                     key: "estado",          trafo, byMes, ajSet, isEstado: true });
    }
  };

  // Citar el transformador por su barra (ej. "Tr Lo Valledor 4"), no el alimentador.
  const _nomTrafo = (t, fb) => (t && (t.barra || "").trim()) ? t.barra.trim() : `Trafo ${fb}`;
  if (trafoOrig) _addTrafoFilas(trafoOrig, `${_nomTrafo(trafoOrig, nomOrig)} — alivio`, ajOrig);
  if (trafoDest) _addTrafoFilas(trafoDest, `${_nomTrafo(trafoDest, nomDest)} — carga`, ajDest);

  document.getElementById("tabla-trafos-ej-body").innerHTML = filas.map(f => {
    const cells = tabla_mam.map((r, colIdx) => {
      const d   = f.byMes[r.mes] || {};
      const wst = colIdx === worstIdx ? W_TD : "";
      // Estado propio del transformador en el mes (no del alimentador receptor)
      const estTrafo = d.estado || "sin_datos";
      if (f.isEstado) {
        const bg = rowBg[estTrafo] || "";
        const st = [bg ? `background:${bg}` : "", wst].filter(Boolean).join(";");
        return `<td class="text-center" style="${st}"><span class="badge ${badgeClass[estTrafo]||""}">${estadoLabel[estTrafo]||"—"}</span></td>`;
      }
      const v    = d[f.key];
      const fuBg  = f.fu ? (rowBg[estTrafo] || "") : "";
      const st    = [fuBg ? `background:${fuBg}` : "", wst].filter(Boolean).join(";");
      const suffix = f.key === "uso_despues_pct" ? "%" : "";
      const txt    = (typeof v === "number" && isFinite(v)) ? (v.toFixed(1) + suffix) : "—";
      return `<td class="text-center" style="${st}">${txt}</td>`;
    }).join("");
    return `<tr><td class="fw-semibold small" style="white-space:nowrap;background:#f8f9fa">${f.lbl}</td>${cells}</tr>`;
  }).join("");

  sec.style.display = filas.length ? "" : "none";
}

// ── GUARDAR TRANSFERENCIA ─────────────────────────────────────────────────
async function guardarTransferencia() {
  const sim = state.ultimaSimulacion;
  if (!sim || !sim.feeder_nuevo) return;

  const body = {
    feeder_nombre: sim.feeder_nuevo,
    origen:        sim.nombre_orig,
    delta_A:       sim.delta.delta_max,
    kva_isla:      sim.isla.kva_isla,
    kva_origen:    sim.isla.kva_feeder,
    p_pct:         sim.isla.p_pct,
    n_td:          sim.isla.n_td,
    clientes:      sim.isla.clientes,
    descripcion:      sim._extras?.descripcion       || "",
    tabla:           sim.tabla,
    tabla_mam:       sim.tabla_mam       || [],
    cn_orig:         sim.cn_orig,
    cn_dest:         sim.cn_dest,
    nombre_dest:     sim.nombre_dest,
    resumen:         sim.resumen,
    trafo_orig:      sim.trafo_orig,
    trafo_dest:      sim.trafo_dest,
    trafo_orig_mam:  sim.trafo_orig_mam  || null,
    trafo_dest_mam:  sim.trafo_dest_mam  || null,
    meses_sel:       sim.meses_sel,
    detalle_tds:     sim.detalle_tds     || [],
    equipo_abre:        sim.body_request?.equipo_nombre  || "",
    escenario:          sim.body_request?.escenario      || "normal",
    equipo_cierra:      sim._extras?.equipo_cierra || sim.lz_info?.numpos_lz_sel || "",
    n_td_equipo_total:  sim.isla?.n_td_equipo_total      ?? null,
    cambio_topologico:   sim._extras?.cambio_topologico  || "",
    equipos_traspasados: sim.equipos_traspasados || [],
  };

  spinner(true, "Guardando...");
  try {
    const r = await apiFetch("/api/guardar_transferencia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      document.getElementById("btn-guardar-transf").style.display = "none";
      mostrarToast("Transferencia guardada correctamente.");
      cargarDestinos(); // refrescar feeders
    } else {
      mostrarError(r.error || "Error al guardar.");
    }
  } finally {
    spinner(false);
  }
}

// ── DESCARGAR HTML ────────────────────────────────────────────────────────
function _mapCasoDescarga(s, numeroCaso) {
  return {
    numero_caso:          numeroCaso,
    nombre_orig:          s.nombre_orig,
    nombre_dest:          s.nombre_dest,
    cn_orig:              s.cn_orig,
    cn_dest:              s.cn_dest,
    delta_max:            s.delta.delta_max,
    isla:                 s.isla,
    resumen:              s.resumen,
    tabla:                s.tabla,
    descripcion:          s._extras?.descripcion           || "",
    trafo_orig:           s.trafo_orig                     || null,
    trafo_dest:           s.trafo_dest                     || null,
    detalle_tds:          s.detalle_tds                    || [],
    equipo_abre:          s.body_request?.equipo_nombre    || "",
    escenario:            s.body_request?.escenario        || "normal",
    equipo_cierra:        s._extras?.equipo_cierra || s.lz_info?.numpos_lz_sel || "",
    n_td_equipo_total:    s.isla?.n_td_equipo_total        ?? null,
    tabla_mam:            s.tabla_mam                      || [],
    trafo_orig_mam:       s.trafo_orig_mam                 || null,
    trafo_dest_mam:       s.trafo_dest_mam                 || null,
    cambio_topologico:    s._extras?.cambio_topologico     || "",
    equipos_traspasados:  s.equipos_traspasados            || [],
    ajustes_activos:      s.ajustes_activos                || {},
    serie_raw_orig:       s.serie_raw_orig                 || {},
    serie_raw_dest:       s.serie_raw_dest                 || {},
    serie_raw_trafo_orig: s.serie_raw_trafo_orig           || {},
    serie_raw_trafo_dest: s.serie_raw_trafo_dest           || {},
    lz_info:              s.lz_info                        || null,
  };
}

// Serializa la config de un Chart.js vivo a JSON. Descarta funciones
// (callbacks de tooltip con closures que no sobreviven fuera del panel) y
// corta refs internas/circulares de Chart.js. Los gráficos quedan interactivos
// con el tooltip por defecto; solo se pierden anotaciones custom.
function _serializeChartCfg(chart) {
  const seen = new WeakSet();
  const replacer = (k, v) => {
    if (k && (k[0] === "_" || k[0] === "$")) return undefined;  // internos Chart.js
    if (typeof v === "function") return undefined;              // sin closures
    if (v && typeof v === "object") {
      if (seen.has(v)) return undefined;                        // corta ciclos
      seen.add(v);
    }
    return v;
  };
  return JSON.stringify(
    { type: chart.config.type, data: chart.config.data, options: chart.config.options },
    replacer
  );
}

// Convierte una sección (div-card con .step-header) en un <details> colapsado,
// para que en el informe estático se pueda minimizar/expandir sin JS de la app.
function _seccionADetails(root, id) {
  const sec = root.querySelector("#" + id);
  if (!sec) return;
  const det = document.createElement("details");
  det.className = sec.className || "";
  det.style.cssText = sec.style.cssText;
  det.style.display = "";  // la card podía estar display:none
  const header  = sec.querySelector(".step-header");
  const summary = document.createElement("summary");
  summary.className = header ? header.className : "step-header";
  summary.style.cssText = "cursor:pointer;list-style:none";
  if (header) { summary.innerHTML = header.innerHTML; header.remove(); }
  else summary.textContent = "Detalle";
  det.appendChild(summary);
  while (sec.firstChild) det.appendChild(sec.firstChild);
  sec.replaceWith(det);
}

// Limpieza compartida del clon del panel para el informe: quita secciones de
// trabajo, colapsa las secciones auxiliares en <details> y deja visibles las
// tablas ejecutivas. Usada por el caso actual y por los previos (colapsarCasoActual).
function _limpiarPanelInforme(clon) {
  // Secciones que no van en el informe.
  ["panel-lz", "det-corrimiento", "sec-ajustes"].forEach(id => {
    const el = clon.querySelector("#" + id);
    if (el) el.remove();
  });
  // Controles interactivos.
  clon.querySelectorAll(".no-copy, button").forEach(el => el.remove());
  clon.querySelectorAll("[onclick]").forEach(el => el.removeAttribute("onclick"));
  // MAM: mostrar el cuerpo (colapsado por la app) para que se vea al abrir el details.
  const mamBody = clon.querySelector("#mam-body");
  if (mamBody) mamBody.style.display = "block";
  // Colapsar los <details> existentes (equipos/LZ, etc.).
  clon.querySelectorAll("details").forEach(d => (d.open = false));
  // Convertir secciones auxiliares (div-card) en <details> colapsados.
  ["sec-mam", "sec-peor-caso"].forEach(id => _seccionADetails(clon, id));
  return clon;
}

// Construye un clon estático del panel de resultados para el informe.
function _prepararClonPanel(panel) {
  const clon = panel.cloneNode(true);
  clon.style.display = "block";
  return _limpiarPanelInforme(clon);
}

// Ensambla un documento HTML autónomo: clona los estilos del documento vivo,
// inserta el cuerpo (via buildBody(doc)) y, si hay configs de Chart.js, un
// script que los recrea. Los gráficos dentro de un <details> cerrado se crean
// recién al abrirlo (un canvas de tamaño 0 no dibuja bien). Se arma con DOM APIs
// para no incluir literales de <head>/<body>/script que el router inyecta.
function _ensamblarDocInforme(titulo, buildBody, cfgs) {
  const doc = document.implementation.createHTMLDocument(titulo);
  document.querySelectorAll('link[rel="stylesheet"], style').forEach(n =>
    doc.head.appendChild(n.cloneNode(true)));
  const bodyStyle = doc.createElement("style");
  bodyStyle.textContent = "body{background:#fff;padding:1rem}";
  doc.head.appendChild(bodyStyle);

  doc.body.appendChild(buildBody(doc));

  if (cfgs && Object.keys(cfgs).length) {
    const cfgsJson = JSON.stringify(cfgs).replace(/<\//g, "<\\/");
    const s1 = doc.createElement("script");
    s1.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
    const s2 = doc.createElement("script");
    s2.textContent =
      "var raw=" + cfgsJson + ";" +
      "function mk(id){var el=document.getElementById(id);if(!el||el._d)return;el._d=1;" +
      "try{new Chart(el,JSON.parse(raw[id]));}catch(e){console.error(id,e);}}" +
      "window.addEventListener('DOMContentLoaded',function(){" +
      "Object.keys(raw).forEach(function(id){" +
      "var el=document.getElementById(id);if(!el)return;var d=el.closest('details');" +
      "if(d&&!d.open){d.addEventListener('toggle',function(){if(d.open)mk(id);});}else{mk(id);}" +
      "});});";
    doc.body.appendChild(s1);
    doc.body.appendChild(s2);
  }
  return "<!doc" + "type html>\n" + doc.documentElement.outerHTML;
}

// Construye un documento HTML autónomo idéntico al panel de resultados vivo.
function _construirInformeHTML(titulo) {
  const panel = document.getElementById("resultado-contenido");
  if (!panel) return null;

  // Capturar configs de los gráficos ANTES de clonar (canvas clonado sale en
  // blanco). Se recuperan por el canvas del DOM vía Chart.getChart.
  const cfgs = {};
  panel.querySelectorAll("canvas").forEach(cv => {
    if (!cv.id) return;
    const ch = (typeof Chart !== "undefined") ? Chart.getChart(cv) : null;
    if (ch) cfgs[cv.id] = _serializeChartCfg(ch);
  });

  const clon = _prepararClonPanel(panel);

  return _ensamblarDocInforme(titulo, doc => {
    const wrap = doc.createElement("div");
    wrap.style.width = "100%";
    const h = doc.createElement("h5");
    h.className = "mb-1";
    h.textContent = titulo;
    const sub = doc.createElement("div");
    sub.className = "text-muted small mb-3";
    sub.textContent = "Informe generado " + new Date().toLocaleString("es-CL");
    wrap.appendChild(h);
    wrap.appendChild(sub);
    wrap.appendChild(doc.importNode(clon, true));
    return wrap;
  }, cfgs);
}

// ── INFORME DE CORRIMIENTO (cadena) — captura DOM client-side ────────────────
// Réplica del informe de NT para toda la cadena: cabecera con intro narrativo +
// tablas-resumen de cargabilidad (alimentadores y trafos), luego cada caso en un
// <details> colapsado con la captura DOM completa del panel (como el print de NT).
// Casos previos con gráficos PNG (ya así en #cadena-casos); último interactivo.
function _cadenaWorstRow(tabla) {
  let worst = null, best = -Infinity;
  (tabla || []).forEach(r => {
    const v = r.uso_dest_despues_pct;
    if (typeof v === "number" && isFinite(v) && v > best) { best = v; worst = r; }
  });
  return worst || (tabla || [])[0] || null;
}
function _trafoWorstRow(t) {
  if (!t || t.sin_datos || !t.tabla?.length) return null;
  const cn = t.cn_trafo || 0;
  let worst = null, best = -Infinity;
  t.tabla.forEach(r => {
    const v = (typeof r.uso_despues_pct === "number") ? r.uso_despues_pct : (cn > 0 ? (r.I_despues / cn * 100) : null);
    if (typeof v === "number" && isFinite(v) && v > best) { best = v; worst = r; }
  });
  if (!worst) return null;
  const fuAntes = (cn > 0 && typeof worst.I_antes === "number") ? worst.I_antes / cn * 100 : null;
  const fuDesp  = (typeof worst.uso_despues_pct === "number") ? worst.uso_despues_pct
                : (cn > 0 && typeof worst.I_despues === "number") ? worst.I_despues / cn * 100 : null;
  return { fuAntes, fuDesp, estado: worst.estado || "" };
}
function _fmtFU(v)  { return (typeof v === "number" && isFinite(v)) ? v.toFixed(1) + "%" : "—"; }
function _fmtAmp(v) { return (typeof v === "number" && isFinite(v)) ? v.toFixed(0) : "—"; }
function _estadoBadgeCad(est) {
  const lbl = { viable: "Viable", prealerta: "Prealerta", critico: "Crítico" }[est] || "—";
  const cls = { viable: "badge-viable", prealerta: "badge-prealerta", critico: "badge-critico" }[est] || "";
  return `<span class="badge ${cls}">${lbl}</span>`;
}
function _trafoLblCad(t) {
  if (!t || t.sin_datos) return "—";
  const parts = [t.nombre || t.numpos || "Trafo"];
  const barra = (t.barra || "").trim();
  if (barra) parts.push(barra);
  return parts.join(" · ");
}

function _cadenaIntroHTML(cadena) {
  const pasos = cadena.map(s =>
    `<strong>${s.nombre_orig || ""} → ${s.nombre_dest || ""}</strong> transfiriendo ${(s.isla?.p_pct ?? 0).toFixed(1)}%`);
  const n = cadena.length;
  let txt;
  if (n <= 1)      txt = `Traspaso de carga: ${pasos[0] || ""}.`;
  else if (n === 2) txt = `Traspaso de carga con 1 corrimiento: desde ${pasos[0]}, luego ${pasos[1]}.`;
  else {
    const mid = pasos.slice(1, n - 1).join(", luego ");
    txt = `Traspaso de carga con ${n - 1} corrimientos: desde ${pasos[0]}, ${mid}, y finalmente ${pasos[n - 1]}.`;
  }
  return `<div class="alert alert-info py-2 px-3 small mb-3"><i class="bi bi-arrow-repeat me-1"></i>${txt}</div>`;
}

function _cadenaCaseColor(i) {
  return (typeof _CASO_COLORS !== "undefined") ? _CASO_COLORS[i % _CASO_COLORS.length] : "#1565c0";
}
function _cadenaEstadoCaso(s, r) {
  // Estado del peor mes del receptor; fallback al conteo del caso.
  if (r?.estado_dest) return r.estado_dest;
  const c = s.resumen?.conteo || {};
  return c.critico > 0 ? "critico" : c.prealerta > 0 ? "prealerta" : "viable";
}
function _cadenaTablaAlimHTML(cadena) {
  const rows = cadena.map((s, i) => {
    // Escenario proporcional (perfil mes a mes), igual que las tablas por-caso.
    const r      = _cadenaWorstRow(s.tabla_mam);
    const abre   = (s.body_request?.equipo_nombre || "—").toUpperCase();
    const cierra = (s._extras?.equipo_cierra || s.lz_info?.numpos_lz_sel || "—").toUpperCase();
    const est    = _cadenaEstadoCaso(s, r);
    const bc     = _cadenaCaseColor(i);
    return `<tr style="--bs-table-bg:${bc}1f">
      <td class="text-center" style="border-left:4px solid ${bc}">${i + 1}</td>
      <td>${s.nombre_orig || ""} → ${s.nombre_dest || ""}</td>
      <td><code>${abre}</code></td>
      <td><code>${cierra}</code></td>
      <td class="text-center">${(s.isla?.p_pct ?? 0).toFixed(1)}%</td>
      <td class="text-center">${_fmtAmp(s.delta?.delta_max)}</td>
      <td class="text-center">${_fmtFU(r?.uso_orig_antes_pct)} → ${_fmtFU(r?.uso_orig_despues_pct)}</td>
      <td class="text-center">${_fmtFU(r?.uso_dest_antes_pct)} → ${_fmtFU(r?.uso_dest_despues_pct)}</td>
      <td class="text-center">${_estadoBadgeCad(est)}</td>
    </tr>`;
  }).join("");
  return `<h6 class="mt-2 mb-1">Cargabilidad — Alimentadores (peor mes)</h6>
    <div style="overflow-x:auto"><table class="table table-sm table-bordered small mb-3">
      <thead class="table-light"><tr>
        <th class="text-center">Caso</th><th>Origen → Destino</th><th>Abre</th><th>Cierra</th>
        <th class="text-center">% trasp.</th><th class="text-center">ΔI (A)</th>
        <th class="text-center">FU orig (antes→desp)</th><th class="text-center">FU dest (antes→desp)</th>
        <th class="text-center">Estado</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function _cadenaTablaTrafosHTML(cadena) {
  const rows = [];
  cadena.forEach((s, i) => {
    const tO = s.trafo_orig_mam, tD = s.trafo_dest_mam;
    const hasO = tO && !tO.sin_datos, hasD = tD && !tD.sin_datos;
    if (!hasO && !hasD) return;
    const rO = _trafoWorstRow(tO), rD = _trafoWorstRow(tD);
    const estado = rD?.estado || rO?.estado || "";
    const bc = _cadenaCaseColor(i);
    rows.push(`<tr style="--bs-table-bg:${bc}1f">
      <td class="text-center" style="border-left:4px solid ${bc}">${i + 1}</td>
      <td>${_trafoLblCad(tO)}</td>
      <td>${_trafoLblCad(tD)}</td>
      <td class="text-center">${rO ? `${_fmtFU(rO.fuAntes)} → ${_fmtFU(rO.fuDesp)}` : "—"}</td>
      <td class="text-center">${rD ? `${_fmtFU(rD.fuAntes)} → ${_fmtFU(rD.fuDesp)}` : "—"}</td>
      <td class="text-center">${_estadoBadgeCad(estado)}</td>
    </tr>`);
  });
  if (!rows.length) return "";
  return `<h6 class="mt-2 mb-1">Cargabilidad — Transformadores (peor mes)</h6>
    <div style="overflow-x:auto"><table class="table table-sm table-bordered small mb-3">
      <thead class="table-light"><tr>
        <th class="text-center">Caso</th><th>Trafo origen (alivio)</th><th>Trafo destino (carga)</th>
        <th class="text-center">FU orig (antes→desp)</th><th class="text-center">FU dest (antes→desp)</th>
        <th class="text-center">Estado</th>
      </tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

// Tabla FU por período — estado final de la red (mes a mes), unificada.
// Por cada alimentador involucrado (orden A, B, C…): una fila del alimentador y
// debajo la de su transformador. Cada uno usa el "después" del último caso que
// tocó ese alimentador (y el trafo del mismo lado/caso). Columnas = meses
// seleccionados. Cada par de filas se tiñe con el color de su caso.
function _cadenaTablaFUFinal(cadena) {
  if (cadena.length < 2) return "";
  const mesesSet = new Set();
  cadena.forEach(s => (s.tabla_mam || []).forEach(r => { if (r.mes) mesesSet.add(r.mes); }));
  const meses = [...mesesSet].sort();
  if (!meses.length) return "";

  // Orden de alimentadores: origen del caso 1, luego destino de cada caso.
  const orden = [], seen = new Set();
  const push = nom => { if (nom && !seen.has(nom)) { seen.add(nom); orden.push(nom); } };
  if (cadena[0]) push(cadena[0].nombre_orig);
  cadena.forEach(s => push(s.nombre_dest));

  // Último caso que tocó cada alimentador (gana mayor índice) + rol + su trafo
  // del mismo lado. Usa la serie proporcional (tabla_mam / trafo_*_mam), el mismo
  // escenario que las tablas por-caso — así los valores coinciden.
  const info = {};
  cadena.forEach((s, i) => {
    const reg = (nom, role, trafo) => {
      const byMesA = {}; (s.tabla_mam || []).forEach(r => { byMesA[r.mes] = r; });
      const byMesT = {};
      if (trafo && !trafo.sin_datos) (trafo.tabla || []).forEach(r => { byMesT[r.mes] = r; });
      info[nom] = { i, role, byMesA, trafo, byMesT };
    };
    if (s.nombre_orig) reg(s.nombre_orig, "orig", s.trafo_orig_mam);
    if (s.nombre_dest) reg(s.nombre_dest, "dest", s.trafo_dest_mam);
  });

  // Celdas de una fila, destacando el peor mes (máx FU de esa fila) en rojo.
  const celdasFila = vals => {
    let worstI = -1, worstV = -Infinity;
    vals.forEach((v, i) => { if (typeof v === "number" && isFinite(v) && v > worstV) { worstV = v; worstI = i; } });
    return vals.map((v, i) => {
      const st = i === worstI
        ? ' style="font-weight:bold;background:rgba(231,76,60,0.18);color:#8c0000"'
        : "";
      return `<td class="text-center"${st}>${_fmtFU(v)}</td>`;
    }).join("");
  };
  const rows = orden.map(nom => {
    const d = info[nom]; if (!d) return "";
    const bc = _cadenaCaseColor(d.i);
    // Fila alimentador (FU del rol que tuvo en su caso finalizador).
    const valsA = meses.map(m => {
      const r = d.byMesA[m];
      return r ? (d.role === "orig" ? r.uso_orig_despues_pct : r.uso_dest_despues_pct) : null;
    });
    const filaA = `<tr style="--bs-table-bg:${bc}1f">` +
      `<td class="fw-semibold" style="white-space:nowrap;border-left:4px solid ${bc}">${nom}</td>${celdasFila(valsA)}</tr>`;
    // Fila transformador del mismo lado/caso.
    const t  = d.trafo;
    const cn = (t && t.cn_trafo) || 0;
    const valsT = meses.map(m => {
      const r = d.byMesT[m];
      if (!r) return null;
      return (typeof r.uso_despues_pct === "number") ? r.uso_despues_pct : (cn > 0 ? r.I_despues / cn * 100 : null);
    });
    const lblT  = (t && !t.sin_datos) ? _trafoLblCad(t) : "—";
    const filaT = `<tr style="--bs-table-bg:${bc}14">` +
      `<td class="small text-muted" style="white-space:nowrap;border-left:4px solid ${bc};padding-left:1.1rem">⚡ ${lblT}</td>${celdasFila(valsT)}</tr>`;
    return filaA + filaT;
  }).join("");

  const head = meses.map(m => `<th class="text-center">${_mesLabel(m)}</th>`).join("");
  return `<h6 class="mt-3 mb-1">FU por período — Alimentadores y Transformadores (estado final)</h6>
    <div style="overflow-x:auto"><table class="table table-sm table-bordered small mb-3">
      <thead class="table-light"><tr><th>Elemento</th>${head}</tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

// <details> del caso actual (vivo) con el mismo header de color que colapsarCasoActual.
function _cadenaDetallesActual(doc, sim, n, clon) {
  const bc     = (typeof _CASO_COLORS !== "undefined") ? _CASO_COLORS[(n - 1) % _CASO_COLORS.length] : "#1565c0";
  const _cnt   = sim?.resumen?.conteo || {};
  const estado = _cnt.critico > 0 ? "critico" : _cnt.prealerta > 0 ? "prealerta" : "viable";
  const colorEst = estado === "critico" ? "danger" : estado === "prealerta" ? "warning" : "success";
  const labelEst = estado === "critico" ? "Crítico" : estado === "prealerta" ? "Prealerta" : "Viable";
  const pct    = sim?.isla?.p_pct?.toFixed(1) ?? "—";

  const det = doc.createElement("details");
  det.className = "card step-card mb-2";
  det.style.borderLeft = `4px solid ${bc}`;
  det.style.borderRadius = "6px";
  const sum = doc.createElement("summary");
  sum.className = "step-header d-flex align-items-center gap-2";
  sum.style.cssText = `cursor:pointer;list-style:none;background:${bc}18;border-radius:6px`;
  sum.innerHTML =
    `<span class="fw-semibold" style="color:${bc}">Caso ${n}: ${sim?.nombre_orig || ""} → ${sim?.nombre_dest || ""}</span>` +
    `<span class="badge bg-${colorEst} text-${colorEst === "warning" ? "dark" : "white"}">${labelEst}</span>` +
    `<span class="small text-muted">${pct}% traspasado</span>`;
  const body = doc.createElement("div");
  body.className = "step-body p-0";
  body.appendChild(doc.importNode(clon, true));
  det.appendChild(sum);
  det.appendChild(body);
  return det;
}

// <details> de un caso previo guardado (node con canvas intactos + header de color).
function _cadenaCaseDetails(doc, pc) {
  const bc = _cadenaCaseColor(pc.n - 1);
  const det = doc.createElement("details");
  det.className = "card step-card mb-2";
  det.style.borderLeft = `4px solid ${bc}`;
  det.style.borderRadius = "6px";
  const sum = doc.createElement("summary");
  sum.className = "step-header d-flex align-items-center gap-2";
  sum.style.cssText = `cursor:pointer;list-style:none;background:${bc}18;border-radius:6px`;
  sum.innerHTML =
    `<span class="fw-semibold" style="color:${bc}">Caso ${pc.n}: ${pc.nombre_orig || ""} → ${pc.nombre_dest || ""}</span>` +
    `<span class="badge bg-${pc.colorEst} text-${pc.colorEst === "warning" ? "dark" : "white"}">${pc.labelEst}</span>` +
    `<span class="small text-muted">${pc.pct}% traspasado</span>`;
  const body = doc.createElement("div");
  body.className = "step-body p-0";
  if (pc.node) body.appendChild(doc.importNode(pc.node, true));
  det.appendChild(sum);
  det.appendChild(body);
  return det;
}

function _construirInformeCadenaHTML() {
  const cadena    = state.cadenaSimulaciones || [];
  const prevCasos = state.cadenaReportCases || [];
  const panel     = document.getElementById("resultado-contenido");

  // Configs de gráficos: casos previos (guardados) + caso actual (vivo). El
  // informe los recrea con Chart.js (interactivos), no como PNG estático.
  const cfgs = {};
  prevCasos.forEach(pc => Object.assign(cfgs, pc.cfgs || {}));
  if (panel) panel.querySelectorAll("canvas").forEach(cv => {
    if (!cv.id) return;
    const ch = (typeof Chart !== "undefined") ? Chart.getChart(cv) : null;
    if (ch) cfgs[cv.id] = _serializeChartCfg(ch);
  });
  const clonActual = panel ? _prepararClonPanel(panel) : null;

  return _ensamblarDocInforme("Corrimiento de carga", doc => {
    const wrap = doc.createElement("div");
    wrap.style.width = "100%";
    const h = doc.createElement("h5");
    h.className = "mb-1";
    h.textContent = `Corrimiento de carga — ${cadena.length} caso${cadena.length !== 1 ? "s" : ""}`;
    const sub = doc.createElement("div");
    sub.className = "text-muted small mb-2";
    sub.textContent = "Informe generado " + new Date().toLocaleString("es-CL");
    wrap.appendChild(h);
    wrap.appendChild(sub);

    // Cabecera resumen (intro + tablas de cargabilidad).
    const resumen = doc.createElement("div");
    resumen.innerHTML = _cadenaIntroHTML(cadena)
      + _cadenaTablaAlimHTML(cadena) + _cadenaTablaTrafosHTML(cadena)
      + _cadenaTablaFUFinal(cadena);
    wrap.appendChild(resumen);

    // Casos previos guardados (canvas intactos → gráficos interactivos).
    prevCasos.forEach(pc => wrap.appendChild(_cadenaCaseDetails(doc, pc)));

    // Caso actual (vivo) en un <details> colapsado, gráficos interactivos.
    if (clonActual && panel && panel.style.display !== "none" && cadena.length) {
      wrap.appendChild(_cadenaDetallesActual(doc, cadena[cadena.length - 1], state.numeroCaso, clonActual));
    }
    return wrap;
  }, cfgs);
}

function _descargarBlobHTML(html, nombreArchivo) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

async function descargarHTML() {
  const sim    = state.ultimaSimulacion;
  const cadena = state.cadenaSimulaciones;
  if (!sim) return mostrarError("Primero ejecuta una simulación.");

  const fecha    = new Date().toISOString().slice(0, 10);
  const esCadena = cadena.length > 1;

  spinner(true, "Generando informe...");
  // Los gráficos MAM del caso actual se crean lazy al expandir la sección; si el
  // caso los tiene pero no están renderizados, los creamos temporalmente para
  // capturarlos y luego restauramos el panel. Aplica a ambos flujos (único y
  // cadena: en cadena el caso actual es el último de la cadena).
  const mamBody       = document.getElementById("mam-body");
  const mamPrevDisp   = mamBody ? mamBody.style.display : null;
  const mamTemporal   = !!(sim.tabla_mam?.length && !_charts["barras-mam"]);
  try {
    if (mamTemporal) {
      if (mamBody) mamBody.style.display = "";   // visible para dimensionar
      renderMamCharts(sim);
      renderMamTrafos(sim.trafo_orig_mam, sim.trafo_dest_mam,
        sim.nombre_orig, sim.nombre_dest, sim.ajustes_activos, sim.misma_barra_se ?? false);
    }
    let html, nombre;
    if (esCadena) {
      // Corrimiento: informe client-side de toda la cadena (captura DOM, como NT).
      html   = _construirInformeCadenaHTML();
      nombre = `corrimiento_${cadena.length}casos_${fecha}.html`;
    } else {
      // Caso único: informe = captura exacta del panel de resultados.
      const titulo = `Traspaso ${sim.nombre_orig || "Origen"} → ${sim.nombre_dest || "Destino"}`;
      html   = _construirInformeHTML(titulo);
      nombre = `traspaso_${fecha}.html`;
    }
    if (!html) { mostrarError("No hay panel de resultados para exportar."); return; }
    _descargarBlobHTML(html, nombre);
  } catch (e) {
    mostrarError("Error generando informe: " + e.message);
  } finally {
    // Restaurar el panel al estado previo si los gráficos MAM eran temporales.
    if (mamTemporal) {
      _destroyCharts("barras-mam", "estados-mam", "canvas-trafo-orig-mam", "canvas-trafo-dest-mam");
      if (mamBody) mamBody.style.display = mamPrevDisp;
    }
    spinner(false);
  }
}

// ── FEEDERS NUEVOS TAB ────────────────────────────────────────────────────
async function cargarFeedersNuevos() {
  const feeders = await apiFetch("/api/destinos/nuevos");
  const cont = document.getElementById("lista-feeders-nuevos");

  if (!feeders.length) {
    cont.innerHTML = `<div class="alert alert-light">
      No hay alimentadores en comisionamiento. Crea uno en la pestaña <em>Nuevo Traspaso</em>.</div>`;
    return;
  }

  cont.innerHTML = feeders.map(f => {
    const pct = f.uso_pct ?? 0;
    const barClass = pct >= 100 ? "progress-bar-crit" : pct >= 90 ? "progress-bar-warn" : "progress-bar-enel";
    const pctSafe  = Math.min(pct, 100);
    return `
    <div class="card feeder-card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span><i class="bi bi-lightning-charge me-1 text-primary"></i>${f.nombre}</span>
        <div class="d-flex gap-2">
          <button class="btn btn-xs btn-outline-primary btn-sm" onclick="verDetalleFeeder('${f.nombre}')">
            <i class="bi bi-eye me-1"></i>Ver detalle
          </button>
          <button class="btn btn-xs btn-outline-danger btn-sm" onclick="eliminarFeeder('${f.nombre}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
      <div class="card-body py-2">
        <div class="row g-3 align-items-center">
          <div class="col-md-5">
            <div class="d-flex justify-content-between small text-muted mb-1">
              <span>Acumulado: <strong>${f.acumulado.toFixed(1)} A</strong></span>
              <span>CN: <strong>${f.cn} A</strong></span>
              <span class="fw-bold">${pct?.toFixed(1) ?? "?"}%</span>
            </div>
            <div class="progress" style="height:10px">
              <div class="progress-bar ${barClass}" style="width:${pctSafe}%"></div>
            </div>
          </div>
          <div class="col-md-3 text-muted small">
            <i class="bi bi-arrow-left-right me-1"></i>${f.n_transf} transferencia(s)
          </div>
          <div class="col-md-4 text-muted small">
            Disponible: <strong>${(f.cn - f.acumulado).toFixed(1)} A</strong>
            (${(100 - pct).toFixed(1)}%)
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
}

function _feederCambiosTopoHTML(nombre, cambios) {
  const filas = cambios.length
    ? cambios.map(c => `
        <tr>
          <td class="text-muted small" style="white-space:nowrap">${c.fecha}</td>
          <td class="small">${c.descripcion}</td>
          <td>
            <button class="btn btn-xs btn-outline-danger btn-sm py-0"
                    onclick="eliminarCambioTopo('${nombre}', ${c.idx})"
                    title="Eliminar">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>`).join("")
    : `<tr><td colspan="3" class="text-muted small fst-italic">Sin cambios topológicos registrados.</td></tr>`;

  return `
    <h6 class="fw-semibold mb-1">
      <i class="bi bi-diagram-2 me-1 text-warning"></i>Cambios topológicos del alimentador
    </h6>
    <div class="mb-2" style="overflow-x:auto">
      <table class="table table-sm mb-1" style="font-size:.82rem">
        <thead><tr><th style="width:90px">Fecha</th><th>Descripción</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="input-group input-group-sm">
        <input type="text" id="inp-nuevo-cambio-topo-${nombre.replace(/\W/g,'_')}"
               class="form-control" placeholder="Registrar nuevo cambio topológico...">
        <button class="btn btn-outline-warning" onclick="agregarCambioTopo('${nombre}')">
          <i class="bi bi-plus-lg"></i>
        </button>
      </div>
    </div>`;
}

async function agregarCambioTopo(nombre) {
  const inputId = `inp-nuevo-cambio-topo-${nombre.replace(/\W/g,'_')}`;
  const inp = document.getElementById(inputId);
  const desc = inp?.value.trim();
  if (!desc) return;
  try {
    await apiFetch(`/api/feeders_nuevos/${encodeURIComponent(nombre)}/cambios_topologicos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descripcion: desc }),
    });
    mostrarToast("Cambio topológico registrado.");
    verDetalleFeeder(nombre);  // refrescar modal
  } catch (e) {
    mostrarError("Error al guardar: " + e.message);
  }
}

async function eliminarCambioTopo(nombre, idx) {
  if (!confirm("¿Eliminar este cambio topológico?")) return;
  try {
    await apiFetch(`/api/feeders_nuevos/${encodeURIComponent(nombre)}/cambios_topologicos/${idx}`, {
      method: "DELETE",
    });
    mostrarToast("Eliminado.");
    verDetalleFeeder(nombre);
  } catch (e) {
    mostrarError("Error: " + e.message);
  }
}

async function verDetalleFeeder(nombre) {
  spinner(true, "Cargando detalle...");
  try {
    const d = await apiFetch(`/api/feeders_nuevos/${encodeURIComponent(nombre)}`);
    if (d.error) { mostrarError(d.error); return; }

    const transferencias = d.data.transferencias;
    // Cache de detalle_tds para evitar problemas de quoting en onclick
    window._feederTDsCache = {};
    transferencias.forEach(t => {
      if (t.detalle_tds?.length) window._feederTDsCache[t.idx] = t.detalle_tds;
    });
    const histHTML = transferencias.length ? `
      <table class="table table-sm mb-0">
        <thead><tr>
          <th>#</th><th>Origen</th><th class="text-end">Δ (A)</th><th class="text-end">%</th>
          <th class="text-end">TDs</th><th class="text-end">Clientes</th><th>Fecha</th><th>Descripción / Cambio topológico</th>
          <th></th>
        </tr></thead>
        <tbody>
        ${transferencias.map(t => `
          <tr>
            <td>${t.idx}</td>
            <td>${t.origen}</td>
            <td class="text-end">${t.delta_A.toFixed(1)}</td>
            <td class="text-end">${t.p_pct.toFixed(1)}%</td>
            <td class="text-end">${t.detalle_tds?.length
              ? `<span style="cursor:pointer;text-decoration:underline;color:var(--enel-blue)"
                       onclick="verDetalleTDs(window._feederTDsCache[${t.idx}])"
                       title="Ver TDs">${t.n_td} <i class="bi bi-list-ul"></i></span>`
              : t.n_td}</td>
            <td class="text-end">${t.clientes ?? "—"}</td>
            <td>${t.fecha}</td>
            <td class="text-muted small">${t.escenario === "corte_circuito"
              ? `<span class="badge bg-secondary">Corte circ.</span>${t.equipo_cierra ? ` <span class="badge bg-light text-dark border">Cierra: ${t.equipo_cierra.toUpperCase()}</span>` : ""} `
              : `${t.equipo_abre   ? `<span class="badge bg-light text-dark border">Abre: ${t.equipo_abre.toUpperCase()}</span> ` : ""}${t.equipo_cierra ? `<span class="badge bg-light text-dark border">Cierra: ${t.equipo_cierra.toUpperCase()}</span> ` : ""}`}${t.descripcion || ""}${t.cambio_topologico ? `<br><span class="badge bg-warning text-dark mt-1"><i class="bi bi-diagram-2 me-1"></i>C.T.</span> <em>${t.cambio_topologico}</em>` : ""}</td>
            <td class="d-flex gap-1">
              ${t.tabla && t.tabla.length ? `
              <button class="btn btn-xs btn-outline-primary btn-sm"
                onclick="verDetalleTransferencia('${nombre}', ${t.idx})">
                <i class="bi bi-bar-chart-line"></i>
              </button>` : ""}
              <button class="btn btn-xs btn-outline-danger btn-sm"
                onclick="eliminarTransferencia('${nombre}', ${t.idx})">
                <i class="bi bi-trash"></i>
              </button>
            </td>
          </tr>`).join("")}
        </tbody>
      </table>` : "<p class='text-muted m-2'>Sin transferencias registradas.</p>";

    const graficoCard = d.tabla_sim?.length
      ? `<div class="card step-card mt-3 mb-2">
           <div class="step-header">
             <i class="bi bi-speedometer2 me-1"></i>
             <span class="fw-semibold">FU (%) — carga acumulada</span>
           </div>
           <div class="step-body p-2">
             <div style="position:relative;height:200px">
               <canvas id="canvas-feeder-acum"></canvas>
             </div>
           </div>
         </div>`
      : "";

    // Cargabilidad del transformador de potencia asociado al feeder
    let trafoHTML = "";
    if (d.trafo) {
      const t = d.trafo;
      if (t.sin_datos) {
        trafoHTML = `<div class="alert alert-secondary py-2 mt-3 small">
          <i class="bi bi-info-circle me-1"></i>Transformador encontrado pero sin datos de demanda.</div>`;
      } else {
        const cnStr = t.cn_trafo != null ? `CN = ${t.cn_trafo.toFixed(0)} A` : "CN no disponible";
        const mesMax = t.mes_max_uso ? `Mes peor: <strong>${t.mes_max_uso}</strong> (${t.pct_max_uso?.toFixed(1)}%)` : "";
        const _estadoClass = { viable: "row-viable", prealerta: "row-prealerta", critico: "row-critico" };
        const _badgeClass  = { viable: "badge-viable", prealerta: "badge-prealerta", critico: "badge-critico" };
        const _estadoLabel = { viable: "Viable", prealerta: "Prealerta", critico: "Crítico", sin_datos: "—" };
        // Tabla transpuesta: filas = métricas, columnas = meses
        const tTabla = t.tabla || [];
        const worstTIdx = tTabla.reduce((best, r, i) =>
          (r.uso_despues_pct || 0) > (tTabla[best]?.uso_despues_pct || 0) ? i : best, 0);
        const W_TH_T = "border-left:2px solid rgba(192,0,0,0.6);border-right:2px solid rgba(192,0,0,0.6);background:rgba(231,76,60,0.12);font-weight:bold;color:#000";
        const W_TD_T = "border-left:2px solid rgba(192,0,0,0.5);border-right:2px solid rgba(192,0,0,0.5);font-weight:bold;color:#000";
        const tHead = `<tr>
          <th class="py-1" style="min-width:140px;white-space:nowrap">Métrica</th>
          ${tTabla.map((r, i) => `<th class="py-1 text-center" style="white-space:nowrap${i===worstTIdx?';'+W_TH_T:''}">${_mesLabel(r.mes)}</th>`).join("")}
        </tr>`;
        const tMetricas = [
          { key: "I_antes",        lbl: "I antes (A)",   fmt: v => v != null ? v.toFixed(1) : "—" },
          { key: "I_despues",      lbl: "I después (A)", fmt: v => v != null ? v.toFixed(1) : "—" },
          { lbl: "Δ (A)",          isDelta: true },
          { key: "uso_antes_pct",  lbl: "FU antes (%)",  fmt: v => v != null ? v.toFixed(1) + "%" : "—" },
          { key: "uso_despues_pct",lbl: "FU después (%)",fmt: v => v != null ? v.toFixed(1) + "%" : "—", fu: true },
          { key: "estado",         lbl: "Estado",         isEstado: true },
        ];
        const rowBgT = { viable: "#E8F7EE", prealerta: "#FEF3E2", critico: "#FCECEA" };
        const tBody = tMetricas.map(m => {
          const cells = tTabla.map((r, i) => {
            const v = r[m.key]; const est = r.estado || "";
            const wst = i === worstTIdx ? W_TD_T : "";
            if (m.isEstado) {
              const bg = rowBgT[est] || "";
              const st = [bg ? `background:${bg}` : "", wst].filter(Boolean).join(";");
              return `<td class="text-center" style="${st}"><span class="badge ${_badgeClass[est]||""}">${_estadoLabel[est]||est}</span></td>`;
            }
            if (m.isDelta) {
              const d = r.delta != null ? r.delta :
                        (r.I_despues != null && r.I_antes != null) ? r.I_despues - r.I_antes : null;
              const txt = d != null ? (d >= 0 ? "+" : "") + d.toFixed(1) : "—";
              return `<td class="text-center" style="${wst}">${txt}</td>`;
            }
            const fuBg = m.fu ? (rowBgT[est] || "") : "";
            const st = [fuBg ? `background:${fuBg}` : "", wst].filter(Boolean).join(";");
            return `<td class="text-center" style="${st}">${m.fmt(v)}</td>`;
          }).join("");
          return `<tr><td class="fw-semibold small" style="white-space:nowrap;background:#f8f9fa">${m.lbl}</td>${cells}</tr>`;
        }).join("");
        trafoHTML = `
        <div class="mt-3">
          <h6 class="fw-semibold"><i class="bi bi-lightning me-1"></i>${_trafoLabel(t)}</h6>
          <div class="d-flex gap-3 align-items-baseline mb-1">
            <span class="text-muted small">${cnStr}</span>
            <span class="text-muted small">${mesMax}</span>
          </div>
          <div style="overflow-x:auto">
            <table class="table tabla-sim mb-0" style="font-size:.78rem">
              <thead>${tHead}</thead>
              <tbody>${tBody}</tbody>
            </table>
          </div>
        </div>`;
      }
    }

    const modalHTML = `
    <div class="modal fade" id="modalDetalle" tabindex="-1">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header" style="background:var(--enel-blue);color:#fff">
            <h5 class="modal-title">Alimentador: ${nombre}</h5>
            <button class="btn btn-sm btn-light me-2" onclick="descargarInformeFeeder('${nombre}')">
              <i class="bi bi-file-earmark-html me-1"></i>Descargar informe
            </button>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-2 mb-3">
              <div class="col-4 text-center">
                <div class="fw-bold fs-4 text-primary">${d.acumulado.toFixed(1)} A</div>
                <div class="text-muted small">Corriente acumulada</div>
              </div>
              <div class="col-4 text-center">
                <div class="fw-bold fs-4">${d.data.cn} A</div>
                <div class="text-muted small">Corriente nominal (CN)</div>
              </div>
              <div class="col-4 text-center">
                <div class="fw-bold fs-4 ${d.uso_pct >= 100 ? 'text-danger' : d.uso_pct >= 90 ? 'text-warning' : 'text-success'}">
                  ${d.uso_pct?.toFixed(1) ?? "?"}%</div>
                <div class="text-muted small">Uso del CN</div>
              </div>
            </div>
            <!-- Cambios topológicos del feeder -->
            ${_feederCambiosTopoHTML(nombre, d.data.cambios_topologicos || [])}

            <h6 class="fw-semibold mt-3">Histórico de transferencias</h6>
            <div style="overflow-x:auto">${histHTML}</div>
            ${graficoCard}
            ${trafoHTML}
          </div>
        </div>
      </div>
    </div>`;

    // Limpiar modal anterior si existe
    document.getElementById("modalDetalle")?.remove();
    if (_feederAcumChart) { _feederAcumChart.destroy(); _feederAcumChart = null; }
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    const _mdlFeeder = new bootstrap.Modal(document.getElementById("modalDetalle"));
    if (d.tabla_sim?.length) {
      document.getElementById("modalDetalle").addEventListener("shown.bs.modal", () => {
        _feederAcumChart = _renderFeederAcumChart(d.tabla_sim, d.cn, nombre);
      }, { once: true });
    }
    document.getElementById("modalDetalle").addEventListener("hidden.bs.modal", () => {
      if (_feederAcumChart) { _feederAcumChart.destroy(); _feederAcumChart = null; }
    }, { once: true });
    _mdlFeeder.show();
  } finally {
    spinner(false);
  }
}

async function eliminarTransferencia(feeder, idx) {
  if (!confirm(`¿Eliminar la transferencia #${idx} del alimentador "${feeder}"?`)) return;
  spinner(true, "Eliminando...");
  try {
    await apiFetch(`/api/feeders_nuevos/${encodeURIComponent(feeder)}/transferencias/${idx}`,
                   { method: "DELETE" });
    bootstrap.Modal.getInstance(document.getElementById("modalDetalle"))?.hide();
    cargarFeedersNuevos();
    mostrarToast("Transferencia eliminada.");
  } finally {
    spinner(false);
  }
}

async function eliminarFeeder(nombre) {
  if (!confirm(`¿Eliminar PERMANENTEMENTE el alimentador "${nombre}" y todas sus transferencias?`)) return;
  spinner(true, "Eliminando...");
  try {
    await apiFetch(`/api/feeders_nuevos/${encodeURIComponent(nombre)}`, { method: "DELETE" });
    cargarFeedersNuevos();
    cargarDestinos();
    mostrarToast(`Alimentador "${nombre}" eliminado.`);
  } finally {
    spinner(false);
  }
}

// ── GRÁFICO FEEDER ACUMULADO ──────────────────────────────────────────────
let _feederAcumChart = null;

function _renderFeederAcumChart(tabla, cn, nombre) {
  const labels = tabla.map(r => _mesLabel(r.mes));
  const bgCol  = tabla.map(r => ESTADO_COLOR[r.estado_dest]  || ESTADO_COLOR.sin_datos);
  const brdCol = tabla.map(r => ESTADO_BORDER[r.estado_dest] || ESTADO_BORDER.sin_datos);
  const maxPct = Math.max(110, ...tabla.map(r => r.uso_dest_despues_pct || 0));
  return new Chart(document.getElementById("canvas-feeder-acum"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: `FU (%) — ${nombre}`,
          data:  tabla.map(r => r.uso_dest_despues_pct),
          backgroundColor: bgCol, borderColor: brdCol,
          borderWidth: 1, order: 2,
        },
        {
          type: "line", label: "Prealerta 90%",
          data: tabla.map(() => 90),
          borderColor: "rgba(230,126,34,0.85)", borderDash: [6,3],
          borderWidth: 2, pointRadius: 0, fill: false, order: 1,
        },
        {
          type: "line", label: "Crítico 100%",
          data: tabla.map(() => 100),
          borderColor: "rgba(231,76,60,0.85)", borderDash: [6,3],
          borderWidth: 2, pointRadius: 0, fill: false, order: 0,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.datasetIndex === 0
              ? ` FU: ${fmt(ctx.raw)}%  (${fmt(tabla[ctx.dataIndex]?.I_dest_despues, 0)} A)`
              : ` ${ctx.dataset.label}`
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 10 } } },
        y: {
          title: { display: true, text: "FU (%)", font: { size: 11 } },
          min: 0, max: maxPct,
          ticks: { callback: v => v + "%" },
        },
      },
    },
  });
}

// ── DETALLE DE TRANSFERENCIA ──────────────────────────────────────────────
let _modalTCharts = {};

function _destroyModalTCharts() {
  Object.values(_modalTCharts).forEach(c => c?.destroy());
  _modalTCharts = {};
}

async function verDetalleTransferencia(feeder, idx) {
  spinner(true, "Cargando detalle...");
  try {
    const resp = await apiFetch(
      `/api/feeders_nuevos/${encodeURIComponent(feeder)}/transferencias/${idx}`
    );
    if (resp.error) { mostrarError(resp.error); return; }
    const t = resp.transferencia;
    if (!t.tabla?.length && !t.tabla_mam?.length) {
      mostrarError("Este traspaso fue guardado sin datos de simulación detallada.");
      return;
    }

    // Preferir datos mes a mes si están guardados
    const useMam       = t.tabla_mam?.length > 0;
    const displayTabla = useMam ? t.tabla_mam : (t.tabla || []);

    const nomOrig = t.origen      || "Origen";
    const nomDest = t.nombre_dest || feeder;
    const mLabels = displayTabla.map(r => _mesLabel(r.mes));
    const bgDest  = displayTabla.map(r => ESTADO_COLOR[r.estado_dest]  || ESTADO_COLOR.sin_datos);
    const brdDest = displayTabla.map(r => ESTADO_BORDER[r.estado_dest] || ESTADO_BORDER.sin_datos);
    const maxPct  = Math.max(110, ...displayTabla.map(r => r.uso_dest_despues_pct || 0));

    const resumen = t.resumen || {};
    const ncrit   = resumen.conteo?.critico   ?? 0;
    const npre    = resumen.conteo?.prealerta ?? 0;
    const alertaCls  = ncrit > 0 ? "alert-danger" : npre > 0 ? "alert-warning" : "alert-success";
    const alertaTxt  = ncrit > 0
      ? `<strong>${ncrit} meses críticos</strong>`
      : npre > 0
      ? `<strong>${npre} meses en prealerta</strong>`
      : "Traspaso viable en todos los meses.";

    const estadoLabel = { viable:"Viable", prealerta:"Prealerta", critico:"Crítico", sin_datos:"—" };
    const estadoClass = { viable:"row-viable", prealerta:"row-prealerta", critico:"row-critico" };
    const badgeClass  = { viable:"badge-viable", prealerta:"badge-prealerta", critico:"badge-critico" };

    // Tabla transpuesta (mes a mes si está disponible)
    const tTabla   = displayTabla;
    const tRowBg   = { viable:"#E8F7EE", prealerta:"#FEF3E2", critico:"#FCECEA" };
    const tWorstIdx = tTabla.reduce((best, r, i) =>
      (r.I_orig_antes || 0) > (tTabla[best]?.I_orig_antes || 0) ? i : best, 0);
    const TW_TH = "border-left:2px solid rgba(192,0,0,0.6);border-right:2px solid rgba(192,0,0,0.6);background:rgba(231,76,60,0.12);font-weight:bold;color:#000";
    const TW_TD = "border-left:2px solid rgba(192,0,0,0.5);border-right:2px solid rgba(192,0,0,0.5);font-weight:bold;color:#000";
    const tMesHdrs = tTabla.map((r, i) => `<th class="text-center" style="white-space:nowrap${i === tWorstIdx ? ';' + TW_TH : ''}">${_mesLabel(r.mes)}</th>`).join("");
    const sfxMam = useMam ? " Mes a mes" : "";
    const tMetricas = [
      { key: "I_orig_antes",         lbl: `${nomOrig} — Antes (A)`,             fu: false },
      { key: "I_orig_despues",       lbl: `${nomOrig} — Después${sfxMam} (A)`,  fu: false },
      { key: "uso_orig_antes_pct",   lbl: `FU antes (%) ${nomOrig}`,            fu: false },
      { key: "uso_orig_despues_pct", lbl: `FU (%)${sfxMam} ${nomOrig}`,         fu: false },
      { key: "I_dest_antes",         lbl: `${nomDest} — Antes (A)`,             fu: false },
      { key: "I_dest_despues",       lbl: `${nomDest} — Después${sfxMam} (A)`,  fu: false },
      { key: "uso_dest_antes_pct",   lbl: `FU antes (%) ${nomDest}`,            fu: false },
      { key: "uso_dest_despues_pct", lbl: `FU (%)${sfxMam} ${nomDest}`,         fu: true  },
      { key: "estado_dest",          lbl: "Estado",                             isEstado: true },
    ];
    const tFilas = tMetricas.map(m => {
      const cells = tTabla.map((row, colIdx) => {
        const v   = row[m.key];
        const est = row.estado_dest || "";
        const wst = colIdx === tWorstIdx ? TW_TD : "";
        if (m.isEstado) {
          const bg = tRowBg[est] || "";
          const st = [bg ? `background:${bg}` : "", wst].filter(Boolean).join(";");
          return `<td class="text-center" style="${st}"><span class="badge ${badgeClass[est]||""}">${estadoLabel[est]||est}</span></td>`;
        }
        const fuBg = m.fu ? (tRowBg[est] || "") : "";
        const st   = [fuBg ? `background:${fuBg}` : "", wst].filter(Boolean).join(";");
        const suffix = m.key.includes("pct") ? "%" : "";
        const txt    = (typeof v === "number" && isFinite(v)) ? v.toFixed(1) + suffix : "—";
        return `<td class="text-center" style="${st}">${txt}</td>`;
      }).join("");
      return `<tr><td class="fw-semibold small" style="white-space:nowrap;background:#f8f9fa">${m.lbl}</td>${cells}</tr>`;
    }).join("");

    // Trafo sections — preferir m.a.m. si disponible
    const trafoOrigMT = (useMam && t.trafo_orig_mam && !t.trafo_orig_mam.sin_datos) ? t.trafo_orig_mam : t.trafo_orig;
    const trafoDestMT = (useMam && t.trafo_dest_mam && !t.trafo_dest_mam.sin_datos) ? t.trafo_dest_mam : t.trafo_dest;
    const trafoSfx = useMam ? " Mes a mes" : "";
    let trafoHTML = "";
    if (trafoOrigMT && !trafoOrigMT.sin_datos && trafoOrigMT.tabla?.length) {
      const cnO = trafoOrigMT.cn_trafo != null ? `CN=${fmt(trafoOrigMT.cn_trafo,0)} A` : "";
      trafoHTML += `
        <div class="mb-3">
          <div class="text-muted small fw-semibold mb-1">
            ${_trafoLabel(trafoOrigMT)} — alivio${trafoSfx}${cnO ? ` &nbsp;<span class="text-secondary">${cnO}</span>` : ""}
          </div>
          <div style="position:relative;height:180px">
            <canvas id="canvas-mt-trafo-orig"></canvas>
          </div>
        </div>`;
    }
    if (trafoDestMT && !trafoDestMT.sin_datos && trafoDestMT.tabla?.length) {
      const cnD = trafoDestMT.cn_trafo != null ? `CN=${fmt(trafoDestMT.cn_trafo,0)} A` : "";
      trafoHTML += `
        <div>
          <div class="text-muted small fw-semibold mb-1">
            ${_trafoLabel(trafoDestMT)} — carga${trafoSfx}${cnD ? ` &nbsp;<span class="text-secondary">${cnD}</span>` : ""}
          </div>
          <div style="position:relative;height:180px">
            <canvas id="canvas-mt-trafo-dest"></canvas>
          </div>
        </div>`;
    }
    const trafosCard = trafoHTML ? `
      <div class="card step-card mb-2">
        <div class="step-header"><i class="bi bi-lightning me-1"></i>
          <span class="fw-semibold">Cargabilidad Transformadores de Potencia${trafoSfx}</span></div>
        <div class="step-body p-2">${trafoHTML}</div>
      </div>` : "";

    // Cache detalle_tds para evitar JSON.stringify en onclick attribute
    window._modalDetalleTDs = t.detalle_tds || [];

    const modalHTML = `
    <div class="modal fade" id="modalTransfDetalle" tabindex="-1">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header" style="background:var(--enel-blue);color:#fff">
            <h5 class="modal-title">
              <i class="bi bi-lightning-charge me-1"></i>
              Traspaso: <strong>${nomOrig}</strong> → <strong>${nomDest}</strong>
              &nbsp;<span class="badge bg-light text-dark fw-normal" style="font-size:.8rem">${t.fecha}</span>
            </h5>
            <button class="btn btn-sm btn-light me-2"
                    onclick="descargarTransferencia('${feeder}', ${idx})">
              <i class="bi bi-file-earmark-html me-1"></i>Descargar informe
            </button>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-2 mb-3 text-center">
              <div class="col-6 col-md-3">
                <div class="res-card" style="background:#E8F0FA">
                  <div class="res-val" style="color:var(--enel-blue)">${t.delta_A.toFixed(1)} A</div>
                  <div class="res-lbl">Δ aplicado</div>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="res-card" style="background:#E8F0FA">
                  <div class="res-val" style="color:var(--enel-blue)">${t.p_pct.toFixed(1)}%</div>
                  <div class="res-lbl">% kVA traspasado</div>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="res-card" style="background:#F0F9F3${t.detalle_tds?.length ? ";cursor:pointer" : ""}"
                     ${t.detalle_tds?.length ? `onclick="verDetalleTDs(window._modalDetalleTDs)" title="Ver TDs"` : ""}>
                  <div class="res-val" style="color:var(--enel-green)">${t.n_td}
                    ${t.detalle_tds?.length ? `<i class="bi bi-list-ul ms-1" style="font-size:.9rem"></i>` : ""}
                  </div>
                  <div class="res-lbl">Transformadores</div>
                </div>
              </div>
              <div class="col-6 col-md-3">
                <div class="res-card" style="background:#F0F9F3">
                  <div class="res-val" style="color:var(--enel-green)">${t.clientes ?? "—"}</div>
                  <div class="res-lbl">Clientes</div>
                </div>
              </div>
            </div>
            ${t.escenario === "corte_circuito"
              ? `<div class="alert alert-secondary py-2 mb-2 small"><i class="bi bi-scissors me-1"></i><strong>Escenario: Corte de circuito</strong>${t.equipo_cierra ? ` &nbsp;|&nbsp; Equipo que cierra: <strong>${t.equipo_cierra.toUpperCase()}</strong>` : ""}</div>`
              : `${t.equipo_abre   ? `<div class="alert alert-light py-2 mb-1 small border"><i class="bi bi-door-open me-1"></i>Equipo que abre: <strong>${t.equipo_abre.toUpperCase()}</strong></div>` : ""}${t.equipo_cierra ? `<div class="alert alert-light py-2 mb-1 small border"><i class="bi bi-toggles me-1"></i>Equipo que cierra: <strong>${t.equipo_cierra.toUpperCase()}</strong></div>` : ""}`}
            <div class="alert ${alertaCls} py-2 mb-3 small">${alertaTxt}</div>

            <div class="card step-card mb-2">
              <div class="step-header"><i class="bi bi-bar-chart-fill me-1"></i>
                <span class="fw-semibold">Corriente antes / después${useMam ? " Mes a mes" : ""} (A)</span></div>
              <div class="step-body p-2">
                <div style="position:relative;height:240px">
                  <canvas id="canvas-mt-barras"></canvas>
                </div>
              </div>
            </div>

            <div class="card step-card mb-2">
              <div class="step-header"><i class="bi bi-speedometer2 me-1"></i>
                <span class="fw-semibold">FU (%)${useMam ? " Mes a mes" : ""} — ${nomDest}</span></div>
              <div class="step-body p-2">
                <div style="position:relative;height:200px">
                  <canvas id="canvas-mt-estados"></canvas>
                </div>
              </div>
            </div>

            ${trafosCard}

            <div class="card step-card mb-2">
              <div class="step-header"><i class="bi bi-table me-1"></i>
                <span class="fw-semibold">Detalle mensual</span></div>
              <div class="step-body p-0" style="overflow-x:auto">
                <table class="table tabla-sim mb-0">
                  <thead><tr>
                    <th style="min-width:170px">Métrica</th>${tMesHdrs}
                  </tr></thead>
                  <tbody>${tFilas}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

    document.getElementById("modalTransfDetalle")?.remove();
    _destroyModalTCharts();
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    const modal = new bootstrap.Modal(document.getElementById("modalTransfDetalle"));
    document.getElementById("modalTransfDetalle").addEventListener("shown.bs.modal", () => {
      _renderModalCharts(displayTabla, nomOrig, nomDest, mLabels, bgDest, brdDest, maxPct, t.cn_dest, trafoOrigMT, trafoDestMT);
    }, { once: true });
    document.getElementById("modalTransfDetalle").addEventListener("hidden.bs.modal", () => {
      _destroyModalTCharts();
    }, { once: true });
    modal.show();
  } catch(e) {
    mostrarError("Error al cargar detalle: " + e.message);
  } finally {
    spinner(false);
  }
}

function _renderModalCharts(tabla, nomOrig, nomDest, labels, bgDest, brdDest, maxPct, cnDest, trafoOrig, trafoDest) {
  // Chart 1: barras
  const cnDestArr = tabla.map(() => cnDest);
  _modalTCharts.barras = new Chart(document.getElementById("canvas-mt-barras"), {
    data: {
      labels,
      datasets: [
        { type:"bar",  label:`${nomDest} — Antes (A)`,
          data: tabla.map(r => r.I_dest_antes),
          backgroundColor:"rgba(100,149,237,0.45)", borderColor:"rgba(100,149,237,0.9)",
          borderWidth:1, order:3 },
        { type:"bar",  label:`${nomDest} — Después (A)`,
          data: tabla.map(r => r.I_dest_despues),
          backgroundColor:bgDest, borderColor:brdDest, borderWidth:1, order:2 },
        { type:"line", label:`${nomOrig} — Antes (A)`,
          data: tabla.map(r => r.I_orig_antes),
          borderColor:"rgba(52,73,94,0.65)", borderDash:[5,4], borderWidth:2,
          pointRadius:3, fill:false, order:1 },
        { type:"line", label:`CN ${nomDest} (${fmt(cnDest,0)} A)`,
          data: cnDestArr,
          borderColor:"rgba(231,76,60,0.9)", borderDash:[8,4], borderWidth:2,
          pointRadius:0, fill:false, order:0 },
      ],
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{ position:"bottom", labels:{font:{size:11}} } },
      scales: {
        x:{ ticks:{font:{size:10}} },
        y:{ title:{display:true, text:"Corriente (A)", font:{size:11}}, beginAtZero:true },
      },
    },
  });

  // Chart 2: % uso
  _modalTCharts.estados = new Chart(document.getElementById("canvas-mt-estados"), {
    type:"bar",
    data: {
      labels,
      datasets: [
        { label:`FU (%) — ${nomDest}`,
          data: tabla.map(r => r.uso_dest_despues_pct),
          backgroundColor:bgDest, borderColor:brdDest, borderWidth:1, order:2 },
        { type:"line", label:"Prealerta 90%",
          data: tabla.map(() => 90),
          borderColor:"rgba(230,126,34,0.85)", borderDash:[6,3],
          borderWidth:2, pointRadius:0, fill:false, order:1 },
        { type:"line", label:"Crítico 100%",
          data: tabla.map(() => 100),
          borderColor:"rgba(231,76,60,0.85)", borderDash:[6,3],
          borderWidth:2, pointRadius:0, fill:false, order:0 },
      ],
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{ position:"bottom", labels:{font:{size:11}} } },
      scales: {
        x:{ ticks:{font:{size:10}} },
        y:{ title:{display:true, text:"FU (%)", font:{size:11}},
            min:0, max:maxPct, ticks:{callback:v => v+"%"} },
      },
    },
  });

  // Trafo charts
  if (trafoOrig && !trafoOrig.sin_datos && trafoOrig.tabla?.length) {
    _destroyCharts("canvas-mt-trafo-orig");
    _renderTrafoChartGeneric("canvas-mt-trafo-orig", trafoOrig, "alivio", _modalTCharts);
  }
  if (trafoDest && !trafoDest.sin_datos && trafoDest.tabla?.length) {
    _destroyCharts("canvas-mt-trafo-dest");
    _renderTrafoChartGeneric("canvas-mt-trafo-dest", trafoDest, "carga", _modalTCharts);
  }
}

function _renderTrafoChartGeneric(canvasId, trafoData, modo, chartsStore) {
  const labels  = trafoData.tabla.map(r => _mesLabel(r.mes));
  const bgCol   = trafoData.tabla.map(r => ESTADO_COLOR[r.estado]  || ESTADO_COLOR.sin_datos);
  const brdCol  = trafoData.tabla.map(r => ESTADO_BORDER[r.estado] || ESTADO_BORDER.sin_datos);
  const maxPct  = Math.max(110, ...trafoData.tabla.map(r => r.uso_despues_pct || 0));
  const signo   = modo === "alivio" ? "−" : "+";

  const worstIdx = trafoData.tabla.reduce((best, r, i) =>
    (r.uso_despues_pct || 0) > (trafoData.tabla[best]?.uso_despues_pct || 0) ? i : best, 0);
  const bgFinal2  = bgCol.map((c, i)  => i === worstIdx ? "rgba(180,0,0,0.85)" : c);
  const brdFinal2 = brdCol.map((c, i) => i === worstIdx ? "rgba(140,0,0,1)"    : c);
  const brdWidth2 = brdCol.map((_, i) => i === worstIdx ? 2 : 1);

  chartsStore[canvasId] = new Chart(document.getElementById(canvasId), {
    type:"bar",
    data:{
      labels,
      datasets:[
        { label:`FU (%) trafo ${signo}Δ`,
          data:trafoData.tabla.map(r => r.uso_despues_pct),
          backgroundColor:bgFinal2, borderColor:brdFinal2, borderWidth:brdWidth2, order:2 },
        { label:"FU (%) antes", data:trafoData.tabla.map(r => r.uso_antes_pct),
          type:"line", borderColor:"rgba(100,149,237,0.75)", borderDash:[5,3],
          borderWidth:2, pointRadius:2, fill:false, order:1 },
        { type:"line", label:"Prealerta 90%", data:trafoData.tabla.map(() => 90),
          borderColor:"rgba(230,126,34,0.8)", borderDash:[6,3],
          borderWidth:1.5, pointRadius:0, fill:false, order:0 },
        { type:"line", label:"Crítico 100%", data:trafoData.tabla.map(() => 100),
          borderColor:"rgba(231,76,60,0.8)", borderDash:[6,3],
          borderWidth:1.5, pointRadius:0, fill:false, order:0 },
      ],
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:"index", intersect:false },
      plugins:{
        legend:{ position:"bottom", labels:{font:{size:10}} },
        tooltip:{
          filter: item => item.datasetIndex < 2,
          callbacks:{
            label: ctx => {
              const row = trafoData.tabla[ctx.dataIndex];
              if (ctx.datasetIndex === 0) {
                const I = row?.I_despues;
                return ` FU después: ${fmt(ctx.raw)}%${I != null ? "  (" + fmt(I,0) + " A)" : ""}`;
              }
              return ` FU antes: ${fmt(ctx.raw)}%`;
            }
          }
        }
      },
      scales:{
        x:{ ticks:{font:{size:10}} },
        y:{ title:{display:true, text:"FU (%) trafo", font:{size:11}},
            min:0, max:maxPct, ticks:{callback:v => v+"%"} },
      },
    },
  });
}

// ── DETALLE TDs ───────────────────────────────────────────────────────────
const TD_GRANDE_KVA = 300;

function verDetalleTDs(tds) {
  if (!tds || !tds.length) return;

  const filas = tds.map(td => {
    const kva   = td.potencia ?? td.kva ?? null;
    const grande = kva != null && kva >= TD_GRANDE_KVA;
    const badgeG = grande
      ? `<span class="badge bg-warning text-dark ms-1" title="≥${TD_GRANDE_KVA} kVA">⚡ Grande</span>`
      : "";
    return `<tr${grande ? ' class="table-warning"' : ""}>
      <td>${td.numpos_td ?? "—"}</td>
      <td>${td.nombre ?? "—"}${badgeG}</td>
      <td class="text-end">${kva != null ? kva.toLocaleString("es-CL") + " kVA" : "—"}</td>
      <td class="text-end">${td.clientes ?? "—"}</td>
      <td class="text-muted small">${td.nom_alim ?? "—"}</td>
    </tr>`;
  }).join("");

  const grandes = tds.filter(td => (td.potencia ?? td.kva ?? 0) >= TD_GRANDE_KVA).length;

  const html = `
  <div class="modal fade" id="modalDetalleTDs" tabindex="-1">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header" style="background:var(--enel-blue);color:#fff">
          <h5 class="modal-title"><i class="bi bi-list-ul me-1"></i>Detalle de TDs traspasados</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          ${grandes > 0 ? `<div class="alert alert-warning py-2 small mb-2">
            <i class="bi bi-exclamation-circle me-1"></i>
            <strong>${grandes} TD${grandes > 1 ? "s" : ""} grande${grandes > 1 ? "s" : ""}</strong>
            (≥${TD_GRANDE_KVA} kVA) — verificar clientes significativos antes del traspaso.</div>` : ""}
          <div style="max-height:400px;overflow-y:auto">
            <table class="table table-sm tabla-sim mb-0">
              <thead><tr>
                <th>Numpos</th><th>Nombre</th>
                <th class="text-end">Potencia</th><th class="text-end">Clientes</th>
                <th>Alimentador</th>
              </tr></thead>
              <tbody>${filas}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  document.getElementById("modalDetalleTDs")?.remove();
  document.body.insertAdjacentHTML("beforeend", html);
  new bootstrap.Modal(document.getElementById("modalDetalleTDs")).show();
}

// ── DESCARGAS DE INFORME ──────────────────────────────────────────────────

async function descargarInformeFeeder(nombre) {
  spinner(true, "Generando informe completo...");
  try {
    const r = await fetch(`/api/feeders_nuevos/${encodeURIComponent(nombre)}/informe`);
    if (!r.ok) { mostrarError("Error generando informe."); return; }
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `feeder_${nombre}_${new Date().toISOString().slice(0,10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) {
    mostrarError("Error: " + e.message);
  } finally {
    spinner(false);
  }
}

async function descargarTransferencia(feeder, idx) {
  spinner(true, "Generando informe...");
  try {
    const resp = await apiFetch(
      `/api/feeders_nuevos/${encodeURIComponent(feeder)}/transferencias/${idx}`
    );
    if (resp.error) { mostrarError(resp.error); return; }
    const t = resp.transferencia;
    if (!t.tabla || !t.tabla.length) {
      mostrarError("Este traspaso fue guardado sin datos detallados. No se puede generar informe individual.");
      return;
    }
    const body = {
      nombre_orig:  t.origen,
      nombre_dest:  t.nombre_dest || feeder,
      cn_orig:      t.cn_orig,
      cn_dest:      t.cn_dest,
      delta_max:    t.delta_A,
      isla: {
        n_td:       t.n_td,
        clientes:   t.clientes,
        kva_isla:   t.kva_isla,
        kva_feeder: t.kva_origen,
        p_pct:      t.p_pct,
        mes_peor:   t.resumen?.mes_max_uso || "—",
      },
      resumen:      t.resumen || {},
      tabla:        t.tabla,
      feeder_nuevo: feeder,
      descripcion:  t.descripcion || "",
    };
    const r = await fetch("/api/descargar_html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) { mostrarError("Error generando HTML."); return; }
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `traspaso_${t.origen}_${t.fecha}.html`.replace(/[^a-zA-Z0-9_.\-]/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) {
    mostrarError("Error: " + e.message);
  } finally {
    spinner(false);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// VCC — Validación de Conexión de Cliente
// ══════════════════════════════════════════════════════════════════════════

let _vccTsAlim   = null;
let _vccTsPunto  = null;
let _vccModoPunto = "equipos";   // "equipos" | "tp"

// ─── helpers ──────────────────────────────────────────────────────────────
function vccGetNumpos()        { return (_vccTsPunto?.getValue() || "").trim(); }
function vccGetNuevoTp()       { return (document.getElementById("vcc-numpos-nuevo-tp")?.value || "").trim(); }
function vccGetModoPunto()     { return _vccModoPunto; }
function vccGetIdCliente()     { return (document.getElementById("vcc-id-cliente")?.value    || "").trim(); }
function vccGetNombreCliente() { return (document.getElementById("vcc-nombre-cliente")?.value || "").trim(); }
function vccGetDireccion()     { return (document.getElementById("vcc-direccion")?.value     || "").trim(); }

// ─── inicializar TomSelect de alimentadores ────────────────────────────────
function vccInicializarSelect() {
  if (_vccTsAlim) return;
  const el = document.getElementById("vcc-sel-alim");

  function buildOpts(feeders) {
    return feeders.map(f => ({ value: String(f.numalim), text: (f.frg ? '[FRG] ' : '') + f.nombre }));
  }

  async function onChangeAlim(val) {
    const f = state.feedersData.find(x => String(x.numalim) === val);
    if (!f) return;
    state.vccAlimIdx = f.numalim;
    state.vccAlimNom = f.nom_alim || null;
    if (!state.vccAlimNom) {
      mostrarError(`Sin correspondencia NOM_ALIM para "${f.nombre}". Verifica mapeos.`);
    }
    const parts = [f.nombre];
    if (f.cn  != null) parts.push(`CN: ${f.cn.toFixed(0)} A`);
    if (f.subestacion) parts.push(f.subestacion);
    document.getElementById("vcc-alim-cn-txt").textContent = parts.join("  |  ");
    document.getElementById("vcc-alim-info").style.display = "";
    const vccFrgBadge = document.getElementById("vcc-alim-frg-badge");
    if (vccFrgBadge) vccFrgBadge.style.display = f.frg ? "" : "none";
    vccLimpiarPunto();
    if (state.vccAlimNom) {
      // Resetear toggle al modo equipo al cambiar alimentador
      _vccModoPunto = "equipos";
      document.getElementById("vcc-modo-equipo").checked = true;
      vccActualizarUIModo("equipos");
      await cargarConfigAlim(state.vccAlimNom);
      await vccCargarEquipos(state.vccAlimNom, "equipos");
      apiFetch(`/api/vecinos_lz/${state.vccAlimIdx}`).then(d => {
        state.vccLzVecinos = Array.isArray(d) ? d : [];
      }).catch(() => { state.vccLzVecinos = []; });
      // Mostrar paso 2 (tensión) y paso 3 (punto) al seleccionar alimentador
      document.getElementById("vcc-card-tension").classList.remove("d-none");
      document.getElementById("vcc-card-paso2").classList.remove("d-none");
    }
  }

  const initTs = (feeders) => {
    _vccTsAlim = new TomSelect(el, {
      options: buildOpts(feeders), valueField: "value", labelField: "text",
      searchField: ["text"], maxOptions: 80, placeholder: "Buscar alimentador...",
      onChange: onChangeAlim,
    });
  };

  if (state.feedersData.length > 0) {
    initTs(state.feedersData);
  } else {
    apiFetch("/api/feeders").then(data => {
      state.feedersData = data;
      initTs(data);
    });
  }

  // Toggle equipo / TP — registrar una sola vez
  document.querySelectorAll('input[name="vcc-modo-punto"]').forEach(radio =>
    radio.addEventListener("change", async () => {
      const modo = document.querySelector('input[name="vcc-modo-punto"]:checked').value;
      _vccModoPunto = modo;
      vccActualizarUIModo(modo);
      vccLimpiarPunto();
      if (state.vccAlimNom) await vccCargarEquipos(state.vccAlimNom, modo);
    })
  );
}

// ─── actualizar UI según modo punto ───────────────────────────────────────
function vccActualizarUIModo(modo) {
  const lbl    = document.getElementById("vcc-lbl-punto");
  const divNTP = document.getElementById("vcc-div-nuevo-tp");
  if (modo === "tp") {
    if (lbl) lbl.textContent = "TP existente en la red";
    if (divNTP) divNTP.style.display = "none";
  } else {
    if (lbl) lbl.textContent = "Equipo upstream (DBC, REC, CLB…)";
    if (divNTP) divNTP.style.display = "";
  }
}

