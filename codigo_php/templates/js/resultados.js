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
        <div class="text-muted small mt-1">Equipos dentro de la isla que recibirán corriente desde la dirección opuesta. Verificar si aplica según topología real.</div>
      </div>`;
    } else {
      _alertaInv.innerHTML = "";
    }
  }

  // Info equipo abre / cierra
  const _br = state.ultimaSimulacion?.body_request || {};
  const _equipoAbre   = _br.equipo_nombre  || "";
  const _equipoCierra = _br.equipo_cierra  || "";
  const _escenario    = _br.escenario      || "normal";
  const _infoEq = document.getElementById("info-equipos");
  if (_infoEq) {
    let _eqHtml = "";
    if (_escenario === "corte_circuito") {
      _eqHtml = `<span class="badge bg-secondary me-1"><i class="bi bi-scissors me-1"></i>Corte de circuito</span>`;
      if (_equipoCierra) _eqHtml += `<span class="badge bg-light text-dark border me-1"><i class="bi bi-toggles me-1"></i>Cierra: ${_equipoCierra.toUpperCase()}</span>`;
    } else {
      if (_equipoAbre)   _eqHtml += `<span class="badge bg-light text-dark border me-1"><i class="bi bi-door-open me-1"></i>Abre: ${_equipoAbre.toUpperCase()}</span>`;
      if (_equipoCierra) _eqHtml += `<span class="badge bg-light text-dark border me-1"><i class="bi bi-toggles me-1"></i>Cierra: ${_equipoCierra.toUpperCase()}</span>`;
    }
    _infoEq.innerHTML = _eqHtml;
    _infoEq.style.display = _eqHtml ? "" : "none";
  }

  // Tabla resumen ejecutivo (FU mes a mes) + trafos
  renderTablaResumenEjecutivo(data);
  renderTablaTrafosEjecutivo(data);

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
    </div>`;

  // Evaluación equipos receptor dentro de esta tarjeta
  const secPeor = document.getElementById("sec-vcc-receptor-peor");
  if (secPeor) {
    if (data.vcc_alim_b_equipos?.length) {
      secPeor.innerHTML = _vccReceptorBlock(data.vcc_alim_b_equipos);
      secPeor.style.display = "";
    } else {
      secPeor.innerHTML = "";
      secPeor.style.display = "none";
    }
  }
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
          borderWidth: 2, pointRadius: 2, fill: false, order: 1,
        },
        {
          type: "line", label: "Prealerta 90%",
          data: trafoData.tabla.map(() => 90),
          borderColor: "rgba(230,126,34,0.8)", borderDash: [6,3],
          borderWidth: 1.5, pointRadius: 0, fill: false, order: 0,
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
  if (sub && bar)  return `Transformador de potencia Barra ${bar} SE ${sub}`;
  if (sub)         return `Transformador de potencia SE ${sub}`;
  if (bar)         return `Transformador de potencia Barra ${bar}`;
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
    // Lazy-init — Chart.js necesita canvas visible para calcular dimensiones
    const sim = state.ultimaSimulacion;
    if (sim && !_charts["barras-mam"]) {
      renderMamCharts(sim);
      renderMamTrafos(sim.trafo_orig_mam, sim.trafo_dest_mam, sim.nombre_orig, sim.nombre_dest, sim.ajustes_activos, sim.misma_barra_se ?? false);
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

  // Evaluación equipos receptor dentro de la sección MAM
  const secMamVcc = document.getElementById("sec-vcc-receptor-mam");
  if (secMamVcc) {
    if (data.vcc_alim_b_equipos?.length) {
      secMamVcc.innerHTML = _vccReceptorBlock(data.vcc_alim_b_equipos);
      secMamVcc.style.display = "";
    } else {
      secMamVcc.innerHTML = "";
      secMamVcc.style.display = "none";
    }
  }
}

function renderMamCharts(data) {
  _destroyCharts("barras-mam", "estados-mam");
  const tabla   = data.tabla_mam || [];
  const labels  = tabla.map(r => _mesLabel(r.mes));
  const nomOrig = data.nombre_orig || "Origen";
  const nomDest = data.nombre_dest || "Destino";

  const bgDest  = tabla.map(r => ESTADO_COLOR[r.estado_dest]  || ESTADO_COLOR.sin_datos);
  const brdDest = tabla.map(r => ESTADO_BORDER[r.estado_dest] || ESTADO_BORDER.sin_datos);

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
          borderWidth: brdDestAntesWidth, order: 3,
        },
        {
          type: "bar",
          label: `${nomDest} — Perfil Mes a mes (A)`,
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
          pointRadius: ptRadiusOrig,
          pointBackgroundColor: ptColorOrig,
          pointBorderColor: ptColorOrig,
          pointStyle: ptStyleOrig,
          fill: false, order: 1,
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
          fill: false, order: 1,
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
          label: `FU (%) ${nomDest} Mes a mes`,
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
    { key: "I_orig_antes",         lbl: `${nO} — Antes (A)`,             fu: false },
    { key: "I_orig_despues",       lbl: `${nO} — Después Mes a mes (A)`, fu: false },
    { key: "uso_orig_antes_pct",   lbl: `FU antes (%) ${nO}`,            fu: false },
    { key: "uso_orig_despues_pct", lbl: `FU (%) ${nO} Mes a mes`,        fu: false },
    { key: "I_dest_antes",         lbl: `${nD} — Antes (A)`,             fu: false },
    { key: "I_dest_despues",       lbl: `${nD} — Perfil Mes a mes (A)`,  fu: false },
    { key: "uso_dest_antes_pct",   lbl: `FU antes (%) ${nD}`,            fu: false },
    { key: "uso_dest_despues_pct", lbl: `FU (%) ${nD} Mes a mes`,        fu: true  },
    { key: "estado_dest",          lbl: "Estado",                         isEstado: true },
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
    }
  };

  if (trafoOrig) _addTrafoFilas(trafoOrig, `Trafo ${nomOrig} — alivio`, ajOrig);
  if (trafoDest) _addTrafoFilas(trafoDest, `Trafo ${nomDest} — carga`, ajDest);

  document.getElementById("tabla-trafos-ej-body").innerHTML = filas.map(f => {
    const cells = tabla_mam.map((r, colIdx) => {
      const d   = f.byMes[r.mes] || {};
      const v   = d[f.key];
      const est = r.estado_dest || "";
      const wst = colIdx === worstIdx ? W_TD : "";
      const fuBg = f.fu ? (rowBg[est] || "") : "";
      const st   = [fuBg ? `background:${fuBg}` : "", wst].filter(Boolean).join(";");
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

async function descargarHTML() {
  const sim    = state.ultimaSimulacion;
  const cadena = state.cadenaSimulaciones;
  if (!sim) return mostrarError("Primero ejecuta una simulación.");

  let body;
  const fecha = new Date().toISOString().slice(0, 10);
  let nombreArchivo;

  if (cadena.length > 1) {
    // Multi-caso: enviar todos los casos para reporte de cadena
    body = { casos: cadena.map(s => _mapCasoDescarga(s, s._numero_caso ?? 1)) };
    nombreArchivo = `corrimiento_${cadena.length}casos_${fecha}.html`;
  } else {
    // Caso único
    body = _mapCasoDescarga(sim, sim._numero_caso ?? 1);
    body.feeder_nuevo = sim.feeder_nuevo || null;
    nombreArchivo = `traspaso_${fecha}.html`;
  }

  spinner(true, "Generando informe...");
  try {
    const r = await fetch("/api/descargar_html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) { mostrarError("Error generando HTML."); return; }
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
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
    return feeders.map(f => ({ value: String(f.numalim), text: f.nombre }));
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

