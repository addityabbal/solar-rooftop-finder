// Solar Rooftop Finder: search, map, table, filters, CSV export, lead form. No framework.

const $ = (sel) => document.querySelector(sel);
const PIN = /^[1-9][0-9]{5}$/;
const POLL_MS = 10_000;
const RAMP = ["#fde9b8", "#f9c66a", "#f29a2e", "#d96a12", "#a8430a"];

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const fmtInr = (v) => inr.format(v);
const fmtNum = (v) => num.format(v);
function shortInr(v) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return fmtInr(v);
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const typeLabel = { residential: "Residential", commercial: "Commercial", institutional: "Institutional" };
const colorFor = (score) => RAMP[Math.min(RAMP.length - 1, Math.floor(score / 20))];

const state = { data: null, lang: "en", selected: null, sort: { key: "rank", asc: true }, map: null, pollTimer: null, seq: 0 };

// ------------------------------------------------------------------ search

function showError(msg) {
  const el = $("#search-error");
  el.textContent = msg || "";
  el.hidden = !msg;
}

function setStatus(html, spinning = true) {
  const el = $("#status");
  if (!html) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = `${spinning ? '<span class="spinner" aria-hidden="true"></span>' : ""}<div>${html}</div>`;
}

async function load(pin, push = true) {
  clearTimeout(state.pollTimer);
  showError("");
  if (!PIN.test(pin)) { showError("Enter a six-digit pincode. The first digit can't be 0."); return; }
  $("#pin").value = pin;
  $("#lead-form").pin.value ||= pin;
  if (push) history.pushState({ pin }, "", `?pin=${pin}`);
  const seq = ++state.seq;
  setStatus(`Loading pincode ${pin}…`);
  let res;
  try {
    res = await fetch(`/api/pincode/${pin}`);
  } catch {
    setStatus("Couldn't reach the server. Check your connection and try again.", false);
    return;
  }
  if (seq !== state.seq) return;
  const body = await res.json().catch(() => ({}));
  if (res.status === 200) { setStatus(""); render(body); return; }
  $("#result").hidden = true;
  if (res.status === 202) { setStatus(buildingMessage(pin, body.status)); poll(pin, seq); return; }
  if (res.status === 429) { setStatus(`Today's limit of new pincode builds is used up. Ready pincodes still work; try ${pin} again tomorrow.`, false); return; }
  if (res.status === 503) { setStatus(body.message || "New pincodes can't be built right now. Try one of the ready pincodes.", false); return; }
  setStatus(body.message || body.error || "Something went wrong. Please try again.", false);
}

function buildingMessage(pin, status) {
  const step = status === "running" ? "Analysing buildings" : "Queued";
  return `<strong>${step} for ${pin}.</strong> A new pincode takes about 3–8 minutes: we read every building in a 3 km square from open satellite-derived data, then score each roof. This page checks every 10 seconds.`;
}

function poll(pin, seq) {
  state.pollTimer = setTimeout(async () => {
    if (seq !== state.seq) return;
    try {
      const s = await (await fetch(`/api/status/${pin}`)).json();
      if (seq !== state.seq) return;
      if (s.status === "done") return load(pin, false);
      if (s.status === "failed") return setStatus(`The build for ${pin} failed. ${esc(s.error || "")} Please try again later.`, false);
      setStatus(buildingMessage(pin, s.status));
    } catch { /* network blip: keep polling */ }
    poll(pin, seq);
  }, POLL_MS);
}

// ------------------------------------------------------------------ render

function addressOf(r, d = state.data) {
  const tail = [d.state, d.pin].filter(Boolean).join(" ");
  return [r.road ? `Near ${r.road}` : null, d.locality, d.district, tail].filter(Boolean).join(", ");
}

function render(d) {
  d.roofs.forEach((r) => (r.address = addressOf(r, d)));
  state.data = d;
  state.selected = null;
  $("#result").hidden = false;
  $("#title").textContent = d.pin;
  $("#place").textContent = [d.locality, d.district, d.state].filter(Boolean).join(", ");
  $("#built").textContent = `Built ${new Date(d.built_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · ${fmtNum(d.stats.buildings_scanned)} buildings scanned in a ${d.assumptions.bbox_half_km * 2} km square · Overture ${d.overture_release}`;

  const s = d.stats;
  const cards = [
    ["Usable roof", `${fmtNum(s.usable_sqft_total)} sq ft`, `${fmtNum(s.eligible_roofs)} roofs`],
    ["Solar potential", `${s.potential_mw} MW`, "if every eligible roof is used"],
    [`Saved / year at ${Math.round(s.adoption_share * 100)}% adoption`, shortInr(s.saving_year_if_adopted_inr), `${fmtNum(s.roofs_with_public_contact)} listed roofs with public contact`],
    ["Median payback", s.median_payback_years == null ? "n/a" : `${s.median_payback_years} yrs`, `sunlight ${d.sunlight.kwh_m2_day} kWh/m²/day`],
  ];
  $("#cards").innerHTML = cards.map(([t, v, n]) => `<div><dt>${esc(t)}</dt><dd>${esc(v)}<small>${esc(n)}</small></dd></div>`).join("");

  renderSummary();
  renderMap();
  renderRoof(null);
  renderTable();
  renderHow();
  document.title = `Rooftops in ${d.pin} — Solar Rooftop Finder`;
}

function renderSummary() {
  const sm = state.data.summary;
  $("#summary-text").textContent = state.lang === "hi" ? sm.hi : sm.en;
  $("#summary-text").lang = state.lang === "hi" ? "hi" : "en";
  $("#pitch-text").textContent = sm.pitch;
  $("#summary-source").textContent = sm.source === "ai"
    ? `Written by AI (${sm.model}) from the numbers above; every number was checked against the data.`
    : "Written from a fixed template using the numbers above.";
  document.querySelectorAll(".toggle button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang)));
}

// ------------------------------------------------------------------ map

function roofsGeoJSON(roofs) {
  return {
    type: "FeatureCollection",
    features: roofs.map((r) => ({
      type: "Feature",
      id: r.rank,
      properties: { rank: r.rank, score: r.score, color: colorFor(r.score) },
      geometry: r.rings.length === 1
        ? { type: "Polygon", coordinates: [r.rings[0]] }
        : { type: "MultiPolygon", coordinates: r.rings.map((ring) => [ring]) },
    })),
  };
}

function renderMap() {
  const d = state.data;
  const roofs = filtered();
  const data = roofsGeoJSON(roofs);
  const bounds = [[d.bbox.west, d.bbox.south], [d.bbox.east, d.bbox.north]];
  if (!window.maplibregl) { $("#map").textContent = "Map could not load."; return; }
  if (!state.map) {
    state.map = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/liberty",
      bounds,
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
    });
    state.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    state.map.on("load", () => {
      state.map.addSource("roofs", { type: "geojson", data: roofsGeoJSON(filtered()) });
      state.map.addLayer({ id: "roofs-fill", type: "fill", source: "roofs", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.85 } });
      state.map.addLayer({
        id: "roofs-line", type: "line", source: "roofs",
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#0369a1", "#0f1b2d"],
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 0.6],
        },
      });
      state.map.on("click", "roofs-fill", (e) => selectRoof(e.features[0].properties.rank, false));
      state.map.on("mouseenter", "roofs-fill", () => (state.map.getCanvas().style.cursor = "pointer"));
      state.map.on("mouseleave", "roofs-fill", () => (state.map.getCanvas().style.cursor = ""));
    });
  } else {
    const src = state.map.getSource("roofs");
    if (src) src.setData(data);
    state.map.fitBounds(bounds, { padding: 20, duration: 0 });
  }
}

function highlight(rank) {
  const m = state.map;
  if (!m || !m.getSource("roofs")) return;
  m.removeFeatureState({ source: "roofs" });
  if (rank != null) m.setFeatureState({ source: "roofs", id: rank }, { selected: true });
}

// ------------------------------------------------------------------ roof card

function selectRoof(rank, fly = true) {
  state.selected = rank;
  const roof = state.data.roofs.find((r) => r.rank === rank) || null;
  renderRoof(roof);
  highlight(rank);
  document.querySelectorAll("#table tbody tr").forEach((tr) => tr.setAttribute("aria-selected", String(Number(tr.dataset.rank) === rank)));
  if (roof && fly && state.map) state.map.flyTo({ center: [roof.lon, roof.lat], zoom: 17.5 });
}

function renderRoof(r) {
  const el = $("#roof");
  if (!r) { el.innerHTML = '<p class="muted">Select a roof on the map or in the table to see its numbers.</p>'; return; }
  const contact = [];
  if (r.phone) contact.push(`<a href="tel:${esc(r.phone.replace(/\s/g, ""))}">${esc(r.phone)}</a>`);
  if (r.website) contact.push(`<a href="${esc(r.website)}" target="_blank" rel="noopener">Website</a>`);
  el.innerHTML = `
    <p class="small"><span class="tag ${r.type}">${typeLabel[r.type]}</span>Rank ${r.rank} · score ${r.score}</p>
    <h3>${esc(r.name || r.address)}</h3>
    ${r.name ? `<p class="small muted">${esc(r.address)}</p>` : ""}
    <p class="big">${fmtInr(r.saving_year)}<span class="small muted"> saved / year</span></p>
    <dl>
      <div><dt>Roof footprint</dt><dd>${fmtNum(r.area_sqft)} sq ft</dd></div>
      <div><dt>Usable roof</dt><dd>${fmtNum(r.usable_sqft)} sq ft</dd></div>
      <div><dt>System size</dt><dd>${r.kw} kW</dd></div>
      <div><dt>Units / year</dt><dd>${fmtNum(r.kwh_year)}</dd></div>
      <div><dt>Subsidy</dt><dd>${r.subsidy ? fmtInr(r.subsidy) : "None"}</dd></div>
      <div><dt>Payback</dt><dd>${r.payback_years == null ? "n/a" : `${r.payback_years} years`}</dd></div>
      <div><dt>Plus Code</dt><dd>${esc(r.plus_code)}</dd></div>
      <div><dt>Footprint source</dt><dd>${esc(r.source || "—")}</dd></div>
    </dl>
    ${contact.length ? `<p>Public contact: ${contact.join(" · ")}</p>` : r.type === "residential" ? '<p class="small muted">Home: no contact details are collected. Owners can use the quote form below.</p>' : '<p class="small muted">No public contact listed.</p>'}
    <p><a href="https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}" target="_blank" rel="noopener">Open in Google Maps</a></p>
    <p class="small muted">Estimate, not a quotation.</p>`;
}

// ------------------------------------------------------------------ table

function filtered() {
  const d = state.data;
  if (!d) return [];
  const minArea = Number($("#f-area").value) || 0;
  const onlyCommercial = $("#f-commercial").checked;
  const onlyContact = $("#f-contact").checked;
  return d.roofs.filter((r) =>
    r.usable_sqft >= minArea &&
    (!onlyCommercial || r.type === "commercial") &&
    (!onlyContact || r.phone || r.website));
}

function sorted(rows) {
  const { key, asc } = state.sort;
  const val = (r) => (key === "payback_years" ? r[key] ?? Infinity : r[key] ?? "");
  return [...rows].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (asc ? 1 : -1));
}

function renderTable() {
  const rows = sorted(filtered());
  $("#count").textContent = `${rows.length} of ${state.data.roofs.length} top roofs shown (ranked by lead score out of ${fmtNum(state.data.stats.eligible_roofs)} eligible).`;
  document.querySelectorAll("#table th[data-sort]").forEach((th) =>
    th.setAttribute("aria-sort", th.dataset.sort === state.sort.key ? (state.sort.asc ? "ascending" : "descending") : "none"));
  $("#table tbody").innerHTML = rows.slice(0, 500).map((r) => `
    <tr data-rank="${r.rank}" aria-selected="${r.rank === state.selected}">
      <td class="num">${r.rank}</td>
      <td class="num"><span class="swatch" style="background:${colorFor(r.score)}"></span>${r.score}</td>
      <td>${typeLabel[r.type]}</td>
      <td class="addr" title="${esc(r.name ? `${r.name} — ${r.address}` : r.address)}">${esc(r.name ? `${r.name} — ${r.address}` : r.address)}</td>
      <td class="num">${fmtNum(r.usable_sqft)}</td>
      <td class="num">${r.kw}</td>
      <td class="num">${shortInr(r.saving_year)}</td>
      <td class="num">${r.payback_years == null ? "n/a" : r.payback_years}</td>
      <td>${r.phone || r.website ? "Yes" : ""}</td>
    </tr>`).join("") || `<tr><td colspan="9" class="muted">No roofs match these filters.</td></tr>`;
  if (state.map?.getSource("roofs")) state.map.getSource("roofs").setData(roofsGeoJSON(filtered()));
}

function downloadCSV() {
  const rows = sorted(filtered());
  const cols = ["rank", "score", "type", "name", "address", "plus_code", "lat", "lon", "area_sqft", "usable_sqft", "kw", "kwh_year", "saving_year", "subsidy", "payback_years", "phone", "website", "source"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\r\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })),
    download: `solar-rooftops-${state.data.pin}.csv`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ------------------------------------------------------------------ how we calculate

function renderHow() {
  const d = state.data;
  const a = d.assumptions;
  const slabs = a.subsidy.slabs.map((s, i, all) => `${fmtInr(s.inr_per_kw)}/kW ${i === 0 ? `up to ${s.up_to_kw} kW` : `from ${all[i - 1].up_to_kw} to ${s.up_to_kw} kW`}`).join(", ");
  const rows = [
    ["Search area", `${a.bbox_half_km * 2} km square around the pincode centre (${esc(d.centre.source)})`],
    ["Smallest roof counted", `${a.min_footprint_m2} m² footprint`],
    ["Usable share of roof", `${a.usable_factor} (${a.usable_factor_small} if footprint under ${a.small_footprint_m2} m²): tanks, stairs, setbacks`],
    ["Roof space per kW", `${a.m2_per_kw} m², rounded down to ${a.kw_step} kW`],
    ["Sunlight", `${d.sunlight.kwh_m2_day} kWh/m²/day — ${esc(d.sunlight.source)}`],
    ["Performance ratio", `${a.performance_ratio} (heat, dust, inverter losses)`],
    ["Tariff (approximate)", `₹${d.tariff.residential}/kWh homes, ₹${d.tariff.commercial}/kWh businesses`],
    ["Installed cost", `${fmtInr(a.cost_per_kw_inr)} per kW before subsidy (approximate)`],
    ["Subsidy", `${esc(a.subsidy.scheme)}, homes only: ${slabs}, capped at ${fmtInr(a.subsidy.cap_inr)}`],
    ["Lead score weights", Object.entries(a.score_weights).map(([k, v]) => `${k.replace("_", " ")} ${v}`).join(", ")],
  ];
  $("#how-body").innerHTML = `
    <p>Every number comes from one chain: footprint → usable area → kW → yearly units → rupees saved → payback.</p>
    <p class="formula">usable = footprint × usable share
kW = floor(usable ÷ ${a.m2_per_kw}) to ${a.kw_step} kW
units/year = kW × sunlight × 365 × ${a.performance_ratio}
₹/year = units × tariff
payback = (kW × cost − subsidy) ÷ ₹/year</p>
    <table><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</tbody></table>
    <p class="small muted">Not modelled: shading, tilt, roof condition, or whether an apartment roof is shared. A site visit decides the real design and price.</p>`;
}

function renderHowEmpty() {
  $("#how-body").innerHTML = "<p>Search a pincode to see the exact assumptions behind its numbers: usable roof share, roof space per kW, NASA sunlight, approximate tariff, installed cost and the PM Surya Ghar subsidy slabs.</p>";
}

// ------------------------------------------------------------------ lead form

async function setupLead() {
  const form = $("#lead-form");
  const msg = $("#lead-msg");
  let info = { enabled: false };
  try { info = await (await fetch("/api/lead")).json(); } catch { /* offline */ }
  $("#consent-text").textContent = info.consentText || "I agree to be contacted about a solar quote.";
  if (!info.enabled) {
    [...form.elements].forEach((el) => (el.disabled = true));
    msg.textContent = "Quote requests open soon.";
    return;
  }
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  s.async = true;
  document.head.appendChild(s);
  $("#turnstile").innerHTML = `<div class="cf-turnstile" data-sitekey="${esc(info.siteKey)}"></div>`;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    const f = new FormData(form);
    const payload = {
      pin: String(f.get("pin") || "").trim(),
      name: String(f.get("name") || "").trim(),
      phone: String(f.get("phone") || "").replace(/\D/g, ""),
      monthly_bill_inr: String(f.get("monthly_bill_inr") || "").replace(/\D/g, ""),
      consent: f.get("consent") === "on",
      turnstile_token: f.get("cf-turnstile-response"),
    };
    if (!PIN.test(payload.pin)) return (msg.textContent = "Enter your 6-digit pincode.");
    if (!/^[6-9]\d{9}$/.test(payload.phone)) return (msg.textContent = "Enter a 10-digit mobile number.");
    if (!payload.consent) return (msg.textContent = "Please tick the consent box.");
    form.querySelector("button[type=submit]").disabled = true;
    try {
      const res = await fetch("/api/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not send. Please try again.");
      form.reset();
      msg.textContent = "Thank you. An installer may call you about a quote.";
    } catch (err) {
      msg.textContent = err.message;
      window.turnstile?.reset();
    } finally {
      form.querySelector("button[type=submit]").disabled = false;
    }
  });
}

// ------------------------------------------------------------------ wiring

async function setupChips() {
  try {
    const seeds = await (await fetch("seeds.json")).json();
    $("#chips").insertAdjacentHTML("beforeend", seeds.map((s) => `<button type="button" class="chip" data-pin="${esc(s.pin)}">${esc(s.pin)} · ${esc(s.label)}</button>`).join(""));
  } catch { /* no seeds */ }
}

function init() {
  // Analytics (adityabal.com/a.js): record that a pincode was asked for, never which one.
  $("#search").addEventListener("submit", (e) => { e.preventDefault(); window.abTrack?.("demo_query", { target: "solar", detail: "typed" }); load($("#pin").value.trim()); });
  $("#pin").addEventListener("input", (e) => (e.target.value = e.target.value.replace(/\D/g, "")));
  $("#chips").addEventListener("click", (e) => { const b = e.target.closest("[data-pin]"); if (b) { window.abTrack?.("demo_query", { target: "solar", detail: "chip" }); load(b.dataset.pin); } });
  document.querySelectorAll(".toggle button").forEach((b) => b.addEventListener("click", () => { state.lang = b.dataset.lang; renderSummary(); }));
  $("#copy-pitch").addEventListener("click", async () => {
    await navigator.clipboard?.writeText($("#pitch-text").textContent);
    $("#copy-pitch").textContent = "Copied";
    setTimeout(() => ($("#copy-pitch").textContent = "Copy pitch"), 1500);
  });
  ["#f-area", "#f-commercial", "#f-contact"].forEach((id) => $(id).addEventListener("input", () => state.data && renderTable()));
  $("#f-area").addEventListener("input", (e) => (e.target.value = e.target.value.replace(/\D/g, "")));
  $("#csv").addEventListener("click", downloadCSV);
  $("#table thead").addEventListener("click", (e) => {
    const key = e.target.closest("th")?.dataset.sort;
    if (!key) return;
    state.sort = state.sort.key === key ? { key, asc: !state.sort.asc } : { key, asc: ["rank", "type", "address", "payback_years"].includes(key) };
    renderTable();
  });
  $("#table tbody").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-rank]"); if (tr) selectRoof(Number(tr.dataset.rank)); });
  document.querySelector("[data-open=how]").addEventListener("click", () => { if (!state.data) renderHowEmpty(); $("#how").showModal(); });
  document.querySelector("#how [data-close]").addEventListener("click", () => $("#how").close());
  window.addEventListener("popstate", (e) => e.state?.pin && load(e.state.pin, false));

  setupChips();
  setupLead();
  const pin = new URLSearchParams(location.search).get("pin");
  if (pin) load(pin, false);
}

init();
