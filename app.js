// ======================
// COSTANTI
// ======================

const FIXED_CATEGORIES = ["base", "svago", "risparmio"];
const CATEGORY_STYLES = {
  base: { icon: "🏠", color: "#00b894" },
  svago: { icon: "🎉", color: "#0984e3" },
  risparmio: { icon: "💰", color: "#6c5ce7" }
};
const MONTHS_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const MONTHS_SHORT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

// ======================
// STATO
// ======================

let state = {
  incomes: [],
  categories: [
    { id: "base", name: "Spese di base", percent: 50, subcategories: [
      { id: "casa", name: "Casa", percent: 40, icon: "🏠" },
      { id: "auto", name: "Auto", percent: 20, icon: "🚗" },
      { id: "trasporti", name: "Trasporti", percent: 15, icon: "🚌" },
      { id: "alimentari", name: "Alimentari/Viveri", percent: 25, icon: "🛒" }
    ]},
    { id: "svago", name: "Svago", percent: 30, subcategories: [
      { id: "abbonamenti", name: "Abbonamenti", percent: 20, icon: "📱" },
      { id: "cene", name: "Cene", percent: 50, icon: "🍽️" },
      { id: "shopping", name: "Shopping", percent: 30, icon: "🛍️" }
    ]},
    { id: "risparmio", name: "Risparmio", percent: 20, subcategories: [
      { id: "fondo", name: "Fondo emergenza", percent: 50, icon: "🆘" },
      { id: "investimenti", name: "Investimenti", percent: 50, icon: "📈" }
    ]}
  ],
  expenses: [],
  currentMonth: currentMonthKey(),
  closedMonths: [],
  monthSnapshots: {},
  recurringExpenses: [],
  annualGoals: {},
  theme: "light"
};

// ======================
// UTILITY
// ======================

function currentMonthKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function monthKeyFromDate(iso) {
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function monthLabel(key) {
  const p = key.split("-");
  return MONTHS_IT[Number(p[1]) - 1] + " " + p[0];
}
function monthShortLabel(key) {
  return MONTHS_SHORT[Number(key.split("-")[1]) - 1];
}
function shiftMonth(key, delta) {
  const p = key.split("-");
  let y = Number(p[0]);
  let m = Number(p[1]) + delta;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return y + "-" + String(m).padStart(2, "0");
}
function formatEuro(n) { return n.toFixed(2).replace(".", ","); }

// ======================
// SALVATAGGIO (con sync Drive)
// ======================

function saveState() {
  localStorage.setItem("budgetState", JSON.stringify(state));
  localStorage.setItem("budgetStateUpdatedAt", String(Date.now()));
  // Notifica drive.js se l'utente è loggato
  if (typeof scheduleSyncToDrive === "function") {
    scheduleSyncToDrive();
  }
}

function loadState() {
  const saved = localStorage.getItem("budgetState");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state = parsed;
      if (!state.incomes) state.incomes = [];
      if (!state.expenses) state.expenses = [];
      if (!state.categories) state.categories = [];
      if (!state.currentMonth) state.currentMonth = currentMonthKey();
      if (!state.closedMonths) state.closedMonths = [];
      if (!state.monthSnapshots) state.monthSnapshots = {};
      if (!state.recurringExpenses) state.recurringExpenses = [];
      if (!state.annualGoals) state.annualGoals = {};
      if (!state.theme) state.theme = "light";

      state.incomes.forEach(function(inc) {
        if (!inc.type) inc.type = "base";
        if (inc.type === "extra" && inc.extraTarget === undefined) inc.extraTarget = null;
      });

      if (state.archivedMonths && Array.isArray(state.archivedMonths)) {
        state.archivedMonths.forEach(function(m) {
          if (m.incomes) m.incomes.forEach(function(i) { if (!i.type) i.type = "base"; state.incomes.push(i); });
          if (m.expenses) m.expenses.forEach(function(e) { state.expenses.push(e); });
          if (state.closedMonths.indexOf(m.month) === -1) state.closedMonths.push(m.month);
        });
        delete state.archivedMonths;
        saveState();
      }

      state.categories.forEach(function(cat) {
        const n = cat.subcategories.length;
        if (n === 0) return;
        let sumPercent = 0, missingCount = 0;
        cat.subcategories.forEach(function(s) {
          if (typeof s.percent === "number") sumPercent += s.percent;
          else missingCount++;
        });
        if (missingCount > 0) {
          const rest = Math.max(0, 100 - sumPercent);
          const perMissing = Math.round(rest / missingCount);
          cat.subcategories.forEach(function(s) {
            if (typeof s.percent !== "number") s.percent = perMissing;
          });
        }
      });
    } catch (e) { console.warn("Errore caricamento stato", e); }
  }
}

// ======================
// NAVIGAZIONE
// ======================

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(function(s) { s.classList.remove("active"); });
  document.getElementById(id).classList.add("active");
  window.scrollTo(0, 0);
}

// ======================
// TEMA
// ======================

function applyTheme() {
  document.body.setAttribute("data-theme", state.theme || "light");
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = state.theme === "dark" ? "☀️" : "🌙";
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  saveState();
  applyTheme();
}

// ======================
// PERCENTUALI PER MESE
// ======================

function categoriesForMonth(monthKey) {
  if (state.monthSnapshots[monthKey]) return state.monthSnapshots[monthKey];
  return state.categories;
}

function saveMonthSnapshot(monthKey) {
  state.monthSnapshots[monthKey] = JSON.parse(JSON.stringify(state.categories));
}

// ======================
// CALCOLI
// ======================

function isClosedMonth(key) { return state.closedMonths.indexOf(key) !== -1; }

function incomesForMonth(key) { return state.incomes.filter(function(i) { return monthKeyFromDate(i.date) === key; }); }
function baseIncomesForMonth(key) { return incomesForMonth(key).filter(function(i) { return i.type === "base"; }); }
function extraIncomesForMonth(key) { return incomesForMonth(key).filter(function(i) { return i.type === "extra"; }); }
function expensesForMonth(key) { return state.expenses.filter(function(e) { return monthKeyFromDate(e.date) === key; }); }
function baseIncomeTotal(key) { return baseIncomesForMonth(key).reduce(function(s, i) { return s + i.amount; }, 0); }
function extraIncomeTotal(key) { return extraIncomesForMonth(key).reduce(function(s, i) { return s + i.amount; }, 0); }
function totalIncomeForMonth(key) { return baseIncomeTotal(key) + extraIncomeTotal(key); }
function freeExtraTotal(key) {
  return extraIncomesForMonth(key)
    .filter(function(i) { return !i.extraTarget || !i.extraTarget.categoryId; })
    .reduce(function(s, i) { return s + i.amount; }, 0);
}
function extraForCategory(key, categoryId) {
  return extraIncomesForMonth(key)
    .filter(function(i) { return i.extraTarget && i.extraTarget.categoryId === categoryId; })
    .reduce(function(s, i) { return s + i.amount; }, 0);
}
function extraForSubcategory(key, categoryId, subcatId) {
  return extraIncomesForMonth(key)
    .filter(function(i) { return i.extraTarget && i.extraTarget.categoryId === categoryId && i.extraTarget.subcategoryId === subcatId; })
    .reduce(function(s, i) { return s + i.amount; }, 0);
}
function totalSpentForMonth(key) { return expensesForMonth(key).reduce(function(s, e) { return s + e.amount; }, 0); }

function allMonthsWithData() {
  const set = {};
  state.incomes.forEach(function(i) { set[monthKeyFromDate(i.date)] = true; });
  state.expenses.forEach(function(e) { set[monthKeyFromDate(e.date)] = true; });
  state.closedMonths.forEach(function(m) { set[m] = true; });
  return Object.keys(set).sort().reverse();
}

function getCategoryOfSubcat(subcatId, monthKey) {
  return categoriesForMonth(monthKey).find(function(c) {
    return c.subcategories.some(function(s) { return s.id === subcatId; });
  });
}

function getSpentForCategoryInMonth(catId, monthKey) {
  const cat = categoriesForMonth(monthKey).find(function(c) { return c.id === catId; });
  if (!cat) return 0;
  const subIds = cat.subcategories.map(function(s) { return s.id; });
  return expensesForMonth(monthKey).filter(function(e) { return subIds.indexOf(e.subcatId) !== -1; }).reduce(function(sum, e) { return sum + e.amount; }, 0);
}

function getSpentForSubcatInMonth(subcatId, monthKey) {
  return expensesForMonth(monthKey).filter(function(e) { return e.subcatId === subcatId; }).reduce(function(sum, e) { return sum + e.amount; }, 0);
}

function budgetForCategory(cat, monthKey) {
  const baseBudget = baseIncomeTotal(monthKey) * cat.percent / 100;
  return baseBudget + extraForCategory(monthKey, cat.id);
}

function normalizedSubcatPercents(cat) {
  const subs = cat.subcategories;
  if (subs.length === 0) return [];
  let total = 0;
  subs.forEach(function(s) { total += (typeof s.percent === "number" ? s.percent : 0); });
  if (total === 0) { const eq = 100 / subs.length; return subs.map(function() { return eq; }); }
  return subs.map(function(s) { return ((typeof s.percent === "number" ? s.percent : 0) / total) * 100; });
}

// ======================
// AUTO-AGGIUSTAMENTO SOTTOCATEGORIE
// ======================

function adjustOtherSubcatsProportionally(cat, changedSubId, delta) {
  const others = cat.subcategories.filter(function(s) { return s.id !== changedSubId; });
  if (others.length === 0) return;
  let othersTotal = 0;
  others.forEach(function(s) { othersTotal += (typeof s.percent === "number" ? s.percent : 0); });
  if (othersTotal === 0) {
    const perOther = (-delta) / others.length;
    others.forEach(function(s) { s.percent = Math.max(0, Math.round(perOther)); });
    return;
  }
  const beforeAdjust = others.map(function(s) { return (typeof s.percent === "number" ? s.percent : 0); });
  others.forEach(function(s, i) {
    const v = beforeAdjust[i];
    const share = (v / othersTotal) * (-delta);
    let newVal = v + share;
    if (newVal < 0) newVal = 0;
    s.percent = newVal;
  });
  others.forEach(function(s, i) { if (i < others.length - 1) s.percent = Math.round(s.percent); });
  let sumAll = 0;
  cat.subcategories.forEach(function(s) { sumAll += (typeof s.percent === "number" ? s.percent : 0); });
  const last = others[others.length - 1];
  last.percent = Math.max(0, (last.percent || 0) + (100 - sumAll));
}

// ======================
// RENDER HOME
// ======================

function renderHome() {
  const monthKey = state.currentMonth;
  const baseInc = baseIncomeTotal(monthKey);
  const extraInc = extraIncomeTotal(monthKey);
  const totalInc = baseInc + extraInc;
  const totalSp = totalSpentForMonth(monthKey);
  const saved = totalInc - totalSp;
  const cats = categoriesForMonth(monthKey);

  document.getElementById("month-label").textContent = monthLabel(monthKey);
  document.getElementById("month-badge").style.display = isClosedMonth(monthKey) ? "inline" : "none";
  document.getElementById("closed-banner").style.display = isClosedMonth(monthKey) ? "flex" : "none";

  document.getElementById("kpi-income").textContent = formatEuro(baseInc) + "€";
  document.getElementById("kpi-extra").textContent = formatEuro(extraInc) + "€";
  document.getElementById("kpi-spent").textContent = formatEuro(totalSp) + "€";
  const savedEl = document.getElementById("kpi-saved");
  savedEl.textContent = formatEuro(saved) + "€";
  savedEl.style.color = saved >= 0 ? "" : "var(--rosso)";
  const savedNote = document.getElementById("kpi-saved-note");
  if (saved < 0) { savedNote.textContent = "⚠️ hai speso " + formatEuro(-saved) + "€ più di quanto hai guadagnato"; }
  else { savedNote.textContent = ""; }

  const container = document.getElementById("categories-list");
  container.innerHTML = "";

  cats.forEach(function(cat) {
    const style = CATEGORY_STYLES[cat.id] || { icon: "📁", color: "#0984e3" };
    const budget = budgetForCategory(cat, monthKey);
    const spent = getSpentForCategoryInMonth(cat.id, monthKey);
    const percentUsed = budget > 0 ? Math.min(spent / budget * 100, 100) : 0;
    const over = spent > budget;
    const overAmount = over ? spent - budget : 0;
    const extraAssigned = extraForCategory(monthKey, cat.id);

    const subPercents = normalizedSubcatPercents(cat);
    let subcatsHtml = "";
    if (cat.subcategories.length === 0) {
      subcatsHtml = '<div class="subcat-empty">Nessuna sottocategoria</div>';
    } else {
      subcatsHtml = cat.subcategories.map(function(s, idx) {
        const sPercent = subPercents[idx];
        const sBaseBudget = budget * sPercent / 100;
        const sExtra = extraForSubcategory(monthKey, cat.id, s.id);
        const sBudget = sBaseBudget + sExtra;
        const sSpent = getSpentForSubcatInMonth(s.id, monthKey);
        const sPercentUsed = sBudget > 0 ? Math.min(sSpent / sBudget * 100, 100) : 0;
        const sOver = sSpent > sBudget;
        const sOverAmt = sOver ? sSpent - sBudget : 0;
        const sIcon = s.icon || style.icon;
        const sExtraLabel = sExtra > 0 ? ' <span style="color:var(--azzurro-scuro);font-size:11px;">+' + formatEuro(sExtra) + '€ extra</span>' : '';
        return '<div class="subcat-item" data-sub="' + s.id + '" data-cat="' + cat.id + '">' +
          '<div class="subcat-top">' +
            '<span class="subcat-name"><span class="subcat-icon">' + sIcon + '</span>' + s.name + '<span class="subcat-pencil">✎</span></span>' +
            '<span class="subcat-amounts"><strong>' + formatEuro(sSpent) + '€</strong> / ' + formatEuro(sBudget) + '€' + sExtraLabel + '</span>' +
          '</div>' +
          '<div class="subcat-progress"><div class="subcat-progress-fill ' + (sOver ? 'over' : '') + '" style="width: ' + sPercentUsed + '%"></div></div>' +
          (sOver ? '<div class="subcat-over-note">⚠️ +' + formatEuro(sOverAmt) + '€ oltre budget</div>' : '') +
        '</div>';
      }).join("");
    }

    const bgStyle = over ? '' : 'background: linear-gradient(90deg, ' + style.color + '88, ' + style.color + ')';
    const extraNote = extraAssigned > 0 ? '<div class="category-extra-note">💶 include ' + formatEuro(extraAssigned) + '€ extra assegnati</div>' : '';

    const div = document.createElement("div");
    div.className = "category";
    div.innerHTML =
      '<div class="category-header">' +
        '<span class="category-name"><span class="category-icon">' + style.icon + '</span>' + cat.name + '</span>' +
        '<span class="category-amounts"><strong>' + formatEuro(spent) + '€</strong> / ' + formatEuro(budget) + '€</span>' +
      '</div>' + extraNote +
      '<div class="progress-bar"><div class="progress-fill ' + (over ? 'over' : '') + '" style="width: ' + percentUsed + '%; ' + bgStyle + '"></div></div>' +
      (over ? '<div class="over-note">⚠️ +' + formatEuro(overAmount) + '€ oltre budget</div>' : '') +
      '<div class="subcats">' + subcatsHtml + '</div>' +
      '<button class="add-subcat-btn" data-cat="' + cat.id + '">+ Aggiungi sottocategoria</button>';
    container.appendChild(div);
  });

  container.querySelectorAll(".add-subcat-btn").forEach(function(btn) {
    btn.addEventListener("click", function() { openAddSubcatModal(btn.dataset.cat); });
  });
  container.querySelectorAll(".subcat-item").forEach(function(item) {
    item.addEventListener("click", function() { openEditSubcatModal(item.dataset.cat, item.dataset.sub); });
  });

  const closeBtn = document.getElementById("btn-close-month");
  closeBtn.style.display = (isClosedMonth(monthKey) || (totalInc === 0 && totalSp === 0)) ? "none" : "flex";
}

// ======================
// MODALE MODIFICA SOTTOCATEGORIA
// ======================

function openEditSubcatModal(catId, subcatId) {
  const cats = categoriesForMonth(state.currentMonth);
  const cat = cats.find(function(c) { return c.id === catId; });
  if (!cat) return;
  const sub = cat.subcategories.find(function(s) { return s.id === subcatId; });
  if (!sub) return;

  const catBudget = baseIncomeTotal(state.currentMonth) * cat.percent / 100 + extraForCategory(state.currentMonth, cat.id);
  function currentAmount(pct) { return catBudget * pct / 100; }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const pct = typeof sub.percent === "number" ? sub.percent : 0;

  overlay.innerHTML =
    '<div class="modal">' +
      '<h3>Modifica sottocategoria</h3>' +
      '<div class="subcat-modal-info">Categoria: <strong>' + cat.name + '</strong></div>' +
      '<label class="form-label">Nome</label>' +
      '<input type="text" id="edit-sub-name" value="' + sub.name + '">' +
      '<label class="form-label">Icona (emoji)</label>' +
      '<input type="text" id="edit-sub-icon" class="icon-input" value="' + (sub.icon || "") + '" maxlength="4" placeholder="🍕">' +
      '<label class="form-label">Percentuale nella categoria</label>' +
      '<div class="subcat-modal-row">' +
        '<input type="number" id="edit-sub-percent" min="0" max="100" value="' + pct + '">' +
        '<span>%</span>' +
      '</div>' +
      '<div class="subcat-modal-amount" id="edit-sub-amount">' + formatEuro(currentAmount(pct)) + '€</div>' +
      '<div class="subcat-modal-info">Le altre sottocategorie si aggiusteranno automaticamente.</div>' +
      '<div class="confirm-buttons">' +
        '<button class="primary" id="edit-sub-save">Salva</button>' +
        '<button id="edit-sub-delete" style="background:#ffeaea;color:var(--rosso);">Elimina</button>' +
      '</div>' +
      '<div class="confirm-buttons" style="margin-top:8px;"><button id="edit-sub-cancel" class="full">Annulla</button></div>' +
    '</div>';

  document.body.appendChild(overlay);
  const inputName = overlay.querySelector("#edit-sub-name");
  const inputIcon = overlay.querySelector("#edit-sub-icon");
  const inputPercent = overlay.querySelector("#edit-sub-percent");
  const amountDisplay = overlay.querySelector("#edit-sub-amount");

  inputPercent.addEventListener("input", function() {
    amountDisplay.textContent = formatEuro(currentAmount(Number(inputPercent.value) || 0)) + "€";
  });

  overlay.querySelector("#edit-sub-save").addEventListener("click", function() {
    const newName = inputName.value.trim();
    const newIcon = inputIcon.value.trim();
    let newPct = Number(inputPercent.value);
    if (!newName) { alert("Inserisci un nome."); return; }
    if (newPct < 0) newPct = 0;
    if (newPct > 100) newPct = 100;
    const oldPct = typeof sub.percent === "number" ? sub.percent : 0;
    const delta = newPct - oldPct;
    sub.name = newName;
    sub.icon = newIcon;
    sub.percent = newPct;
    if (delta !== 0) adjustOtherSubcatsProportionally(cat, sub.id, delta);
    if (!isClosedMonth(state.currentMonth)) {
      const g = state.categories.find(function(c) { return c.id === cat.id; });
      if (g) g.subcategories = JSON.parse(JSON.stringify(cat.subcategories));
    }
    saveState(); renderHome(); overlay.remove();
  });

  overlay.querySelector("#edit-sub-delete").addEventListener("click", function() {
    if (confirm('Eliminare la sottocategoria "' + sub.name + '"?')) {
      cat.subcategories = cat.subcategories.filter(function(s) { return s.id !== sub.id; });
      if (!isClosedMonth(state.currentMonth)) {
        const g = state.categories.find(function(c) { return c.id === cat.id; });
        if (g) g.subcategories = g.subcategories.filter(function(s) { return s.id !== sub.id; });
      }
      saveState(); renderHome(); overlay.remove();
    }
  });

  overlay.querySelector("#edit-sub-cancel").addEventListener("click", function() { overlay.remove(); });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
  inputName.focus();
}

// ======================
// MODALE MODIFICA SPESA
// ======================

function openEditExpenseModal(expenseId) {
  const exp = state.expenses.find(function(e) { return e.id === expenseId; });
  if (!exp) return;
  const cats = categoriesForMonth(state.currentMonth);
  let selectedSubcatId = exp.subcatId;
  const isClosed = isClosedMonth(state.currentMonth);

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  function renderModal() {
    let pickerHtml = "";
    cats.forEach(function(cat) {
      if (cat.subcategories.length === 0) return;
      const style = CATEGORY_STYLES[cat.id] || { icon: "📁" };
      pickerHtml += '<h4>' + style.icon + ' ' + cat.name + '</h4>';
      cat.subcategories.forEach(function(sub) {
        const sel = sub.id === selectedSubcatId ? " selected" : "";
        const ic = sub.icon || style.icon;
        pickerHtml += '<button type="button" class="edit-sub-pick' + sel + '" data-id="' + sub.id + '">' + ic + ' ' + sub.name + '</button>';
      });
    });

    overlay.innerHTML =
      '<div class="modal">' +
        '<h3>Modifica spesa</h3>' +
        (isClosed ? '<div class="warning-box">🔒 Questo mese è chiuso.</div>' : '') +
        '<label class="form-label">Importo (€)</label>' +
        '<input type="number" id="edit-exp-amount" value="' + exp.amount + '" step="0.01" min="0" inputmode="decimal" class="big-input">' +
        '<label class="form-label">Sottocategoria</label>' +
        '<div class="edit-expense-picker">' + pickerHtml + '</div>' +
        '<label class="form-label">Nota</label>' +
        '<input type="text" id="edit-exp-note" value="' + (exp.note || "").replace(/"/g, "&quot;") + '" maxlength="120" placeholder="Es. cena con Marco">' +
        '<div class="confirm-buttons">' +
          '<button class="primary" id="edit-exp-save">Salva</button>' +
          '<button id="edit-exp-delete" style="background:#ffeaea;color:var(--rosso);">Elimina</button>' +
        '</div>' +
        '<div class="confirm-buttons" style="margin-top:8px;"><button id="edit-exp-cancel" class="full">Annulla</button></div>' +
      '</div>';

    overlay.querySelectorAll(".edit-sub-pick").forEach(function(btn) {
      btn.addEventListener("click", function() {
        selectedSubcatId = btn.dataset.id;
        overlay.querySelectorAll(".edit-sub-pick").forEach(function(b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
      });
    });

    overlay.querySelector("#edit-exp-save").addEventListener("click", function() {
      const amount = Number(overlay.querySelector("#edit-exp-amount").value);
      const note = overlay.querySelector("#edit-exp-note").value.trim();
      if (!selectedSubcatId || amount <= 0) { alert("Importo valido e sottocategoria richiesti."); return; }
      exp.amount = amount;
      exp.subcatId = selectedSubcatId;
      exp.note = note;
      saveState(); renderExpensesList(); renderHome(); overlay.remove();
    });

    overlay.querySelector("#edit-exp-delete").addEventListener("click", function() {
      if (confirm("Eliminare la spesa di " + formatEuro(exp.amount) + "€?")) {
        state.expenses = state.expenses.filter(function(e) { return e.id !== exp.id; });
        saveState(); renderExpensesList(); renderHome(); overlay.remove();
      }
    });

    overlay.querySelector("#edit-exp-cancel").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
  }
  renderModal();
  document.body.appendChild(overlay);
}

// ======================
// SELETTORE MESE
// ======================

function changeMonth(delta) { state.currentMonth = shiftMonth(state.currentMonth, delta); saveState(); renderHome(); }

function openMonthPickerModal() {
  let pickerYear = Number(state.currentMonth.split("-")[0]);
  const currentKey = state.currentMonth;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML =
    '<div class="modal">' +
      '<h3>Scegli mese</h3>' +
      '<div class="year-nav">' +
        '<button id="year-prev">‹</button>' +
        '<span class="year-label" id="year-label">' + pickerYear + '</span>' +
        '<button id="year-next">›</button>' +
      '</div>' +
      '<div class="month-picker-modal" id="month-grid"></div>' +
      '<div class="confirm-buttons"><button id="month-cancel" class="full">Chiudi</button></div>' +
    '</div>';
  document.body.appendChild(overlay);

  function renderGrid() {
    document.getElementById("year-label").textContent = pickerYear;
    const grid = document.getElementById("month-grid");
    grid.innerHTML = "";
    MONTHS_IT.forEach(function(name, idx) {
      const mKey = pickerYear + "-" + String(idx + 1).padStart(2, "0");
      const btn = document.createElement("button");
      btn.textContent = name.substring(0, 3);
      if (mKey === currentKey) btn.classList.add("selected");
      btn.addEventListener("click", function() {
        state.currentMonth = mKey; saveState(); overlay.remove(); renderHome();
      });
      grid.appendChild(btn);
    });
  }
  renderGrid();
  overlay.querySelector("#year-prev").addEventListener("click", function() { pickerYear -= 1; renderGrid(); });
  overlay.querySelector("#year-next").addEventListener("click", function() { pickerYear += 1; renderGrid(); });
  overlay.querySelector("#month-cancel").addEventListener("click", function() { overlay.remove(); });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

// ======================
// CHIUSURA MESE
// ======================

function closeCurrentMonth() {
  const key = state.currentMonth;
  const totalInc = totalIncomeForMonth(key);
  const totalSp = totalSpentForMonth(key);
  if (totalInc === 0 && totalSp === 0) { alert("Non ci sono dati da chiudere."); return; }
  const msg = "Chiudere " + monthLabel(key) + "?\n\nRedditi: " + formatEuro(totalInc) + "€\nSpese: " + formatEuro(totalSp) + "€\nRisparmiato: " + formatEuro(totalInc - totalSp) + "€";
  if (!confirm(msg)) return;
  if (state.closedMonths.indexOf(key) === -1) state.closedMonths.push(key);
  saveMonthSnapshot(key);
  saveState();
  const nextKey = shiftMonth(key, 1);
  if (totalIncomeForMonth(nextKey) === 0 && totalSpentForMonth(nextKey) === 0) {
    state.currentMonth = nextKey; saveState();
  }
  renderHome();
}

function reopenCurrentMonth() {
  const key = state.currentMonth;
  if (confirm("Riaprire " + monthLabel(key) + "?")) {
    state.closedMonths = state.closedMonths.filter(function(m) { return m !== key; });
    delete state.monthSnapshots[key];
    saveState(); renderHome();
  }
}

// ======================
// MODALE AGGIUNGI SOTTOCATEGORIA
// ======================

function openAddSubcatModal(catId) {
  const cats = categoriesForMonth(state.currentMonth);
  const cat = cats.find(function(c) { return c.id === catId; });
  const catBudget = baseIncomeTotal(state.currentMonth) * cat.percent / 100 + extraForCategory(state.currentMonth, cat.id);

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML =
    '<div class="modal">' +
      '<h3>Nuova sottocategoria in "' + cat.name + '"</h3>' +
      '<label class="form-label">Nome</label>' +
      '<input type="text" id="modal-subcat-name" placeholder="Es. Ristoranti">' +
      '<label class="form-label">Icona (emoji)</label>' +
      '<input type="text" id="modal-subcat-icon" class="icon-input" placeholder="🍕" maxlength="4">' +
      '<label class="form-label">Percentuale nella categoria</label>' +
      '<input type="number" id="modal-subcat-percent" placeholder="Es. 20" min="0" max="100">' +
      '<div class="subcat-modal-info">Budget categoria: ' + formatEuro(catBudget) + '€<br>Le altre sottocategorie si aggiusteranno automaticamente.</div>' +
      '<div class="confirm-buttons">' +
        '<button class="primary" id="modal-save">Aggiungi</button>' +
        '<button id="modal-cancel">Annulla</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  const input = overlay.querySelector("#modal-subcat-name");
  input.focus();

  overlay.querySelector("#modal-save").addEventListener("click", function() {
    const name = input.value.trim();
    const icon = overlay.querySelector("#modal-subcat-icon").value.trim();
    let percent = Number(overlay.querySelector("#modal-subcat-percent").value) || 0;
    if (!name) { alert("Inserisci un nome."); return; }
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    const newSub = { id: "sub_" + Date.now(), name: name, icon: icon, percent: percent };
    cat.subcategories.push(newSub);
    if (percent > 0) adjustOtherSubcatsProportionally(cat, newSub.id, percent);
    if (!isClosedMonth(state.currentMonth)) {
      const g = state.categories.find(function(c) { return c.id === cat.id; });
      if (g) g.subcategories = JSON.parse(JSON.stringify(cat.subcategories));
    }
    saveState(); renderHome(); overlay.remove();
  });
  overlay.querySelector("#modal-cancel").addEventListener("click", function() { overlay.remove(); });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

// ======================
// MODALE REDDITO
// ======================

function openAddIncomeModal(forcedType) {
  const cats = categoriesForMonth(state.currentMonth);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  overlay.innerHTML =
    '<div class="modal">' +
      '<h3>Nuovo reddito</h3>' +
      '<label class="form-label">Descrizione</label>' +
      '<input type="text" id="modal-income-desc" placeholder="Es. Stipendio, Premio...">' +
      '<label class="form-label">Importo (€)</label>' +
      '<input type="number" id="modal-income-amount" placeholder="0,00" step="0.01" min="0" inputmode="decimal">' +
      '<label class="form-label">Tipo</label>' +
      '<div class="radio-group">' +
        '<label><input type="radio" name="inc-type" value="base" ' + (forcedType !== "extra" ? 'checked' : '') + '> 💼 Base</label>' +
        '<label><input type="radio" name="inc-type" value="extra" ' + (forcedType === "extra" ? 'checked' : '') + '> ✨ Extra</label>' +
      '</div>' +
      '<div id="extra-target-section" style="display:' + (forcedType === "extra" ? 'block' : 'none') + ';">' +
        '<label class="form-label">Destinazione extra</label>' +
        '<div class="radio-group">' +
          '<label><input type="radio" name="extra-target" value="free" checked> Libero</label>' +
          '<label><input type="radio" name="extra-target" value="category"> Assegna</label>' +
        '</div>' +
        '<div id="extra-cat-picker" style="display:none;">' +
          '<label class="form-label">Categoria</label>' +
          '<select id="extra-cat-select">' + cats.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join("") + '</select>' +
          '<label class="form-label">Sottocategoria (opzionale)</label>' +
          '<select id="extra-subcat-select"><option value="">— Tutta la categoria —</option></select>' +
        '</div>' +
      '</div>' +
      '<div class="confirm-buttons">' +
        '<button class="primary" id="modal-save">Aggiungi</button>' +
        '<button id="modal-cancel">Annulla</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  overlay.querySelectorAll('input[name="inc-type"]').forEach(function(r) {
    r.addEventListener("change", function() {
      overlay.querySelector("#extra-target-section").style.display = r.value === "extra" && r.checked ? "block" : "none";
    });
  });

  overlay.querySelectorAll('input[name="extra-target"]').forEach(function(r) {
    r.addEventListener("change", function() {
      overlay.querySelector("#extra-cat-picker").style.display = r.value === "category" && r.checked ? "block" : "none";
      if (r.value === "category") updateSubcatOptions();
    });
  });

  function updateSubcatOptions() {
    const catId = overlay.querySelector("#extra-cat-select").value;
    const cat = cats.find(function(c) { return c.id === catId; });
    const sel = overlay.querySelector("#extra-subcat-select");
    sel.innerHTML = '<option value="">— Tutta la categoria —</option>';
    if (cat) cat.subcategories.forEach(function(s) {
      const opt = document.createElement("option");
      opt.value = s.id; opt.textContent = s.name; sel.appendChild(opt);
    });
  }

  overlay.querySelector("#extra-cat-select").addEventListener("change", updateSubcatOptions);
  updateSubcatOptions();

  overlay.querySelector("#modal-save").addEventListener("click", function() {
    const description = overlay.querySelector("#modal-income-desc").value.trim();
    const amount = Number(overlay.querySelector("#modal-income-amount").value);
    const typeRadio = overlay.querySelector('input[name="inc-type"]:checked');
    const type = typeRadio ? typeRadio.value : "base";
    if (!description || amount <= 0) { alert("Inserisci descrizione e importo valido."); return; }
    let extraTarget = null;
    if (type === "extra") {
      const targetRadio = overlay.querySelector('input[name="extra-target"]:checked');
      if (targetRadio && targetRadio.value === "category") {
        const catId = overlay.querySelector("#extra-cat-select").value;
        const subId = overlay.querySelector("#extra-subcat-select").value;
        extraTarget = { categoryId: catId };
        if (subId) extraTarget.subcategoryId = subId;
      }
    }
    const parts = state.currentMonth.split("-");
    const dateISO = new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toISOString();
    state.incomes.push({
      id: "inc_" + Date.now(),
      description: description, amount: amount, date: dateISO,
      type: type, extraTarget: extraTarget
    });
    saveState(); renderIncomesList(); renderHome(); overlay.remove();
  });
  overlay.querySelector("#modal-cancel").addEventListener("click", function() { overlay.remove(); });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

// ======================
// RENDER REDDITI
// ======================

function renderIncomesList() {
  document.getElementById("incomes-month-info").textContent = monthLabel(state.currentMonth);
  const baseList = document.getElementById("incomes-base-list");
  const extraList = document.getElementById("incomes-extra-list");
  const cats = categoriesForMonth(state.currentMonth);

  const base = baseIncomesForMonth(state.currentMonth).sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  const extra = extraIncomesForMonth(state.currentMonth).sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

  baseList.innerHTML = "";
  if (base.length === 0) {
    baseList.innerHTML = '<div class="empty-state"><span class="emoji">💼</span>Nessun reddito base</div>';
  } else {
    base.forEach(function(inc) {
      const row = document.createElement("div");
      row.className = "income-row";
      row.innerHTML = '<div class="income-info"><div class="income-desc">' + inc.description + '</div></div>' +
        '<div class="income-amount">' + formatEuro(inc.amount) + '€</div>' +
        '<button class="remove-x">×</button>';
      row.querySelector(".remove-x").addEventListener("click", function() {
        if (confirm('Rimuovere "' + inc.description + '"?')) {
          state.incomes = state.incomes.filter(function(i) { return i.id !== inc.id; });
          saveState(); renderIncomesList(); renderHome();
        }
      });
      baseList.appendChild(row);
    });
  }

  extraList.innerHTML = "";
  if (extra.length === 0) {
    extraList.innerHTML = '<div class="empty-state"><span class="emoji">✨</span>Nessun reddito extra</div>';
  } else {
    extra.forEach(function(inc) {
      const cat = inc.extraTarget && inc.extraTarget.categoryId ? cats.find(function(c) { return c.id === inc.extraTarget.categoryId; }) : null;
      const sub = (cat && inc.extraTarget.subcategoryId) ? cat.subcategories.find(function(s) { return s.id === inc.extraTarget.subcategoryId; }) : null;
      let targetLabel = "Libero";
      let targetClass = "free";
      if (cat) { targetLabel = "→ " + cat.name + (sub ? " / " + sub.name : ""); targetClass = ""; }
      const row = document.createElement("div");
      row.className = "income-row";
      row.innerHTML =
        '<div class="income-info">' +
          '<div class="income-desc">' + inc.description + '</div>' +
          '<div class="income-target ' + targetClass + '">' + targetLabel + '</div>' +
        '</div>' +
        '<div class="income-amount">' + formatEuro(inc.amount) + '€</div>' +
        '<button class="remove-x">×</button>';
      row.querySelector(".remove-x").addEventListener("click", function() {
        if (confirm('Rimuovere "' + inc.description + '"?')) {
          state.incomes = state.incomes.filter(function(i) { return i.id !== inc.id; });
          saveState(); renderIncomesList(); renderHome();
        }
      });
      extraList.appendChild(row);
    });
  }

  document.getElementById("income-display-base").textContent = formatEuro(baseIncomeTotal(state.currentMonth));
  document.getElementById("income-display-extra").textContent = formatEuro(extraIncomeTotal(state.currentMonth));
  document.getElementById("income-display-big").textContent = formatEuro(totalIncomeForMonth(state.currentMonth));
}

// ======================
// PICKER SOTTOCATEGORIE
// ======================

let selectedSubcat = null;

function renderSubcatPicker() {
  document.getElementById("add-month-info").textContent = monthLabel(state.currentMonth);
  const picker = document.getElementById("subcategories-picker");
  picker.innerHTML = "";
  selectedSubcat = null;
  categoriesForMonth(state.currentMonth).forEach(function(cat) {
    const style = CATEGORY_STYLES[cat.id] || { icon: "📁" };
    const title = document.createElement("h3");
    title.textContent = style.icon + " " + cat.name;
    picker.appendChild(title);
    const group = document.createElement("div");
    group.className = "subcat-picker";
    group.style.width = "100%";
    cat.subcategories.forEach(function(sub) {
      const btn = document.createElement("button");
      const ic = sub.icon || style.icon;
      btn.textContent = ic + " " + sub.name;
      btn.dataset.id = sub.id;
      btn.type = "button";
      btn.addEventListener("click", function() {
        picker.querySelectorAll(".subcat-picker button").forEach(function(b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
        selectedSubcat = sub.id;
      });
      group.appendChild(btn);
    });
    picker.appendChild(group);
  });
}

// ======================
// LISTA SPESE
// ======================

function renderExpensesList() {
  document.getElementById("expenses-month-info").textContent = monthLabel(state.currentMonth);
  const list = document.getElementById("expenses-list");
  list.innerHTML = "";
  const monthExpenses = expensesForMonth(state.currentMonth).sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  if (monthExpenses.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="emoji">📋</span>Nessuna spesa registrata</div>';
    return;
  }
  monthExpenses.forEach(function(exp) {
    const cat = getCategoryOfSubcat(exp.subcatId, state.currentMonth);
    const sub = cat ? cat.subcategories.find(function(s) { return s.id === exp.subcatId; }) : null;
    const style = cat ? (CATEGORY_STYLES[cat.id] || { icon: "📁" }) : { icon: "📁" };
    const ic = (sub && sub.icon) ? sub.icon : style.icon;
    const noteHtml = exp.note ? '<div class="expense-note">' + exp.note + '</div>' : '';
    const row = document.createElement("div");
    row.className = "expense-row";
    row.innerHTML =
      '<div class="expense-info">' +
        '<div class="expense-subcat">' + ic + ' ' + (sub ? sub.name : "?") + '</div>' +
        '<div class="expense-cat">' + (cat ? cat.name : "") + '</div>' +
        noteHtml +
      '</div>' +
      '<div class="expense-amount">' + formatEuro(exp.amount) + '€</div>' +
      '<div class="expense-actions">' +
        '<button class="icon-btn edit" title="Modifica">✎</button>' +
        '<button class="icon-btn delete" title="Elimina">🗑</button>' +
      '</div>';
    row.querySelector(".icon-btn.edit").addEventListener("click", function(e) { e.stopPropagation(); openEditExpenseModal(exp.id); });
    row.querySelector(".icon-btn.delete").addEventListener("click", function(e) {
      e.stopPropagation();
      if (confirm("Eliminare la spesa di " + formatEuro(exp.amount) + "€?")) {
        state.expenses = state.expenses.filter(function(e2) { return e2.id !== exp.id; });
        saveState(); renderExpensesList(); renderHome();
      }
    });
    row.addEventListener("click", function() { openEditExpenseModal(exp.id); });
    list.appendChild(row);
  });
}
// ======================
// RICORRENTI
// ======================

function openRecurringModal(catId, recId) {
  const cats = categoriesForMonth(state.currentMonth);
  const isEdit = !!recId;
  const rec = isEdit ? state.recurringExpenses.find(function(r) { return r.id === recId; }) : null;
  let selectedSubcatId = rec ? rec.subcatId : null;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  function renderModal() {
    let pickerHtml = "";
    cats.forEach(function(cat) {
      if (cat.subcategories.length === 0) return;
      const style = CATEGORY_STYLES[cat.id] || { icon: "📁" };
      pickerHtml += '<h4>' + style.icon + ' ' + cat.name + '</h4>';
      cat.subcategories.forEach(function(sub) {
        const sel = sub.id === selectedSubcatId ? " selected" : "";
        const ic = sub.icon || style.icon;
        pickerHtml += '<button type="button" class="edit-sub-pick' + sel + '" data-id="' + sub.id + '">' + ic + ' ' + sub.name + '</button>';
      });
    });

    overlay.innerHTML =
      '<div class="modal">' +
        '<h3>' + (isEdit ? "Modifica" : "Nuova") + ' ricorrente</h3>' +
        '<label class="form-label">Descrizione</label>' +
        '<input type="text" id="rec-desc" value="' + (rec ? rec.description : "") + '" placeholder="Es. Affitto, Netflix...">' +
        '<label class="form-label">Importo (€)</label>' +
        '<input type="number" id="rec-amount" value="' + (rec ? rec.amount : "") + '" step="0.01" min="0" inputmode="decimal" class="big-input">' +
        '<label class="form-label">Sottocategoria</label>' +
        '<div class="edit-expense-picker">' + pickerHtml + '</div>' +
        '<label class="form-label">Nota (opzionale)</label>' +
        '<input type="text" id="rec-note" value="' + (rec && rec.note ? rec.note : "") + '" maxlength="120" placeholder="Es. Addebito il 5 del mese">' +
        '<div class="confirm-buttons">' +
          '<button class="primary" id="rec-save">' + (isEdit ? "Salva" : "Aggiungi") + '</button>' +
          (isEdit ? '<button id="rec-delete" style="background:#ffeaea;color:var(--rosso);">Elimina</button>' : '') +
        '</div>' +
        '<div class="confirm-buttons" style="margin-top:8px;"><button id="rec-cancel" class="full">Annulla</button></div>' +
      '</div>';

    overlay.querySelectorAll(".edit-sub-pick").forEach(function(btn) {
      btn.addEventListener("click", function() {
        selectedSubcatId = btn.dataset.id;
        overlay.querySelectorAll(".edit-sub-pick").forEach(function(b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
      });
    });

    overlay.querySelector("#rec-save").addEventListener("click", function() {
      const description = overlay.querySelector("#rec-desc").value.trim();
      const amount = Number(overlay.querySelector("#rec-amount").value);
      const note = overlay.querySelector("#rec-note").value.trim();
      if (!description || amount <= 0 || !selectedSubcatId) {
        alert("Descrizione, importo e sottocategoria sono obbligatori.");
        return;
      }
      if (isEdit) {
        rec.description = description; rec.amount = amount; rec.subcatId = selectedSubcatId; rec.note = note;
      } else {
        state.recurringExpenses.push({
          id: "rec_" + Date.now(),
          description: description,
          amount: amount,
          subcatId: selectedSubcatId,
          note: note
        });
      }
      saveState(); renderRecurringList(); overlay.remove();
    });

    if (isEdit) {
      overlay.querySelector("#rec-delete").addEventListener("click", function() {
        if (confirm('Eliminare la ricorrente "' + rec.description + '"?')) {
          state.recurringExpenses = state.recurringExpenses.filter(function(r) { return r.id !== rec.id; });
          saveState(); renderRecurringList(); overlay.remove();
        }
      });
    }

    overlay.querySelector("#rec-cancel").addEventListener("click", function() { overlay.remove(); });
    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
  }
  renderModal();
  document.body.appendChild(overlay);
}

function renderRecurringList() {
  const list = document.getElementById("recurring-list");
  list.innerHTML = "";
  if (state.recurringExpenses.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="emoji">🔁</span>Nessuna spesa ricorrente definita</div>';
    return;
  }
  const cats = categoriesForMonth(state.currentMonth);
  state.recurringExpenses.forEach(function(rec) {
    const cat = cats.find(function(c) { return c.subcategories.some(function(s) { return s.id === rec.subcatId; }); });
    const sub = cat ? cat.subcategories.find(function(s) { return s.id === rec.subcatId; }) : null;
    const style = cat ? (CATEGORY_STYLES[cat.id] || { icon: "📁" }) : { icon: "📁" };
    const ic = (sub && sub.icon) ? sub.icon : style.icon;
    const row = document.createElement("div");
    row.className = "expense-row";
    row.innerHTML =
      '<div class="expense-info">' +
        '<div class="expense-subcat">' + ic + ' ' + rec.description + '</div>' +
        '<div class="expense-cat">' + (cat ? cat.name : "") + (sub ? " / " + sub.name : "") + '</div>' +
        (rec.note ? '<div class="expense-note">' + rec.note + '</div>' : '') +
      '</div>' +
      '<div class="expense-amount">' + formatEuro(rec.amount) + '€</div>' +
      '<div class="expense-actions"><button class="icon-btn edit">✎</button></div>';
    row.addEventListener("click", function() { openRecurringModal(null, rec.id); });
    list.appendChild(row);
  });
}

function applyRecurringToMonth() {
  if (state.recurringExpenses.length === 0) {
    alert("Nessuna ricorrente definita.");
    return;
  }
  const parts = state.currentMonth.split("-");
  const dateISO = new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toISOString();
  const msg = "Applicare " + state.recurringExpenses.length + " spese ricorrenti a " + monthLabel(state.currentMonth) + "?";
  if (!confirm(msg)) return;
  state.recurringExpenses.forEach(function(rec) {
    state.expenses.push({
      id: "exp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      subcatId: rec.subcatId,
      amount: rec.amount,
      date: dateISO,
      note: rec.note || rec.description
    });
  });
  saveState();
  renderHome();
  showScreen("screen-home");
}

// ======================
// COPIA MESE
// ======================

function openCopyMonthModal() {
  const allMonths = allMonthsWithData().filter(function(m) { return m !== state.currentMonth; });
  if (allMonths.length === 0) {
    alert("Non ci sono altri mesi con dati da copiare.");
    return;
  }
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML =
    '<div class="modal">' +
      '<h3>Copia spese da…</h3>' +
      '<div class="info-box" style="margin-bottom:12px;">Copia tutte le spese del mese selezionato nel mese corrente.</div>' +
      '<label class="form-label">Mese di origine</label>' +
      '<select id="copy-source-month">' +
        allMonths.map(function(m) { return '<option value="' + m + '">' + monthLabel(m) + '</option>'; }).join("") +
      '</select>' +
      '<div class="confirm-buttons">' +
        '<button class="primary" id="copy-save">Copia</button>' +
        '<button id="copy-cancel">Annulla</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  overlay.querySelector("#copy-save").addEventListener("click", function() {
    const sourceMonth = overlay.querySelector("#copy-source-month").value;
    const sourceExpenses = expensesForMonth(sourceMonth);
    if (sourceExpenses.length === 0) {
      alert("Il mese selezionato non ha spese.");
      return;
    }
    const parts = state.currentMonth.split("-");
    const dateISO = new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toISOString();
    const msg = "Copiare " + sourceExpenses.length + " spese da " + monthLabel(sourceMonth) + " a " + monthLabel(state.currentMonth) + "?";
    if (!confirm(msg)) return;
    sourceExpenses.forEach(function(exp) {
      state.expenses.push({
        id: "exp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        subcatId: exp.subcatId,
        amount: exp.amount,
        date: dateISO,
        note: exp.note || ""
      });
    });
    saveState();
    renderHome();
    overlay.remove();
    alert("Copiate " + sourceExpenses.length + " spese.");
  });
  overlay.querySelector("#copy-cancel").addEventListener("click", function() { overlay.remove(); });
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
}

// ======================
// EDITOR PERCENTUALI
// ======================

function renderPercentagesEditor() {
  const editor = document.getElementById("percentages-editor");
  editor.innerHTML = "";
  state.categories.forEach(function(cat) {
    const row = document.createElement("div");
    row.className = "percent-row";
    const isFixed = FIXED_CATEGORIES.indexOf(cat.id) !== -1;
    const style = CATEGORY_STYLES[cat.id] || { icon: "📁" };
    row.innerHTML =
      '<label>' + style.icon + ' ' + cat.name + '</label>' +
      '<input type="number" min="0" max="100" value="' + cat.percent + '" data-id="' + cat.id + '">' +
      '<span>%</span>' +
      (isFixed ? '' : '<button class="remove-cat" data-id="' + cat.id + '">×</button>');
    const label = row.querySelector("label");
    label.title = "Clicca per rinominare";
    label.addEventListener("click", function() {
      const newName = prompt("Nuovo nome categoria:", cat.name);
      if (newName && newName.trim()) { cat.name = newName.trim(); saveState(); renderPercentagesEditor(); }
    });
    row.querySelector("input").addEventListener("input", updatePercentTotal);
    if (!isFixed) {
      row.querySelector(".remove-cat").addEventListener("click", function() {
        if (confirm('Rimuovere "' + cat.name + '"?')) {
          state.categories = state.categories.filter(function(c) { return c.id !== cat.id; });
          saveState(); renderPercentagesEditor();
        }
      });
    }
    editor.appendChild(row);
  });
  updatePercentTotal();
  renderSubBudgetEditor();
}

function updatePercentTotal() {
  const inputs = document.querySelectorAll("#percentages-editor input");
  let total = 0;
  inputs.forEach(function(i) { total += Number(i.value) || 0; });
  document.getElementById("percent-total").textContent = total;
  const warning = document.getElementById("percent-warning");
  const saveBtn = document.getElementById("btn-save-percentages");
  if (total === 100) { warning.textContent = "✅"; saveBtn.disabled = false; }
  else if (total < 100) { warning.textContent = "⚠️ Mancano " + (100 - total) + "%"; saveBtn.disabled = true; }
  else { warning.textContent = "⚠️ Riduci del " + (total - 100) + "%"; saveBtn.disabled = true; }
}

// ======================
// SUB-BUDGET EDITOR
// ======================

function renderSubBudgetEditor() {
  const editor = document.getElementById("sub-budget-editor");
  editor.innerHTML = "";
  state.categories.forEach(function(cat) {
    const style = CATEGORY_STYLES[cat.id] || { icon: "📁" };
    const group = document.createElement("div");
    group.className = "sub-budget-group";
    const header = document.createElement("div");
    header.className = "sub-budget-group-header";
    header.innerHTML = '<span>' + style.icon + ' ' + cat.name + ' (' + cat.percent + '%)</span>' +
      '<span class="total-status" data-cat="' + cat.id + '">—</span>';
    group.appendChild(header);

    if (cat.subcategories.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sub-budget-empty";
      empty.textContent = "Nessuna sottocategoria";
      group.appendChild(empty);
    } else {
      cat.subcategories.forEach(function(sub, idx) {
        const row = document.createElement("div");
        row.className = "sub-budget-row";
        const pct = typeof sub.percent === "number" ? sub.percent : 0;
        const isFirst = idx === 0;
        const isLast = idx === cat.subcategories.length - 1;
        row.innerHTML =
          '<div class="reorder">' +
            '<button data-action="up" data-id="' + sub.id + '" data-cat="' + cat.id + '"' + (isFirst ? ' disabled' : '') + '>▲</button>' +
            '<button data-action="down" data-id="' + sub.id + '" data-cat="' + cat.id + '"' + (isLast ? ' disabled' : '') + '>▼</button>' +
          '</div>' +
          '<input type="text" class="sub-icon-input" value="' + (sub.icon || "") + '" maxlength="4" data-id="' + sub.id + '" data-cat="' + cat.id + '" placeholder="📌">' +
          '<label data-id="' + sub.id + '" data-cat="' + cat.id + '">' + sub.name + '</label>' +
          '<input type="number" min="0" max="100" value="' + pct + '" data-id="' + sub.id + '" data-cat="' + cat.id + '">' +
          '<span>%</span>' +
          '<button class="remove-sub" data-id="' + sub.id + '" data-cat="' + cat.id + '">×</button>';

        row.querySelector("label").addEventListener("click", function() {
          const newName = prompt("Nuovo nome sottocategoria:", sub.name);
          if (newName && newName.trim()) {
            sub.name = newName.trim();
            saveState(); renderSubBudgetEditor(); renderHome();
          }
        });

        row.querySelector(".sub-icon-input").addEventListener("input", function(e) {
          sub.icon = e.target.value.trim();
          saveState(); renderHome();
        });

        row.querySelector("input[type='number']").addEventListener("input", function(e) {
          sub.percent = Number(e.target.value) || 0;
          saveState(); updateGroupStatus(cat); renderHome();
        });

        row.querySelector(".remove-sub").addEventListener("click", function() {
          if (confirm('Eliminare "' + sub.name + '"?')) {
            cat.subcategories = cat.subcategories.filter(function(s) { return s.id !== sub.id; });
            saveState(); renderSubBudgetEditor(); renderHome();
          }
        });

        row.querySelectorAll(".reorder button").forEach(function(btn) {
          btn.addEventListener("click", function() {
            const action = btn.dataset.action;
            const i = cat.subcategories.findIndex(function(s) { return s.id === sub.id; });
            if (action === "up" && i > 0) {
              const tmp = cat.subcategories[i - 1];
              cat.subcategories[i - 1] = cat.subcategories[i];
              cat.subcategories[i] = tmp;
            } else if (action === "down" && i < cat.subcategories.length - 1) {
              const tmp = cat.subcategories[i + 1];
              cat.subcategories[i + 1] = cat.subcategories[i];
              cat.subcategories[i] = tmp;
            }
            saveState(); renderSubBudgetEditor(); renderHome();
          });
        });

        group.appendChild(row);
      });
    }

    const addBtn = document.createElement("button");
    addBtn.className = "sub-budget-add";
    addBtn.textContent = "+ Aggiungi sottocategoria";
    addBtn.addEventListener("click", function() {
      const name = prompt("Nome nuova sottocategoria in " + cat.name + ":");
      if (name && name.trim()) {
        cat.subcategories.push({ id: "sub_" + Date.now(), name: name.trim(), icon: "", percent: 0 });
        saveState(); renderSubBudgetEditor(); renderHome();
      }
    });
    group.appendChild(addBtn);
    editor.appendChild(group);
    updateGroupStatus(cat);
  });
}

function updateGroupStatus(cat) {
  const status = document.querySelector('.total-status[data-cat="' + cat.id + '"]');
  if (!status) return;
  if (cat.subcategories.length === 0) { status.textContent = "—"; status.className = "total-status"; return; }
  let total = 0;
  cat.subcategories.forEach(function(s) { total += (typeof s.percent === "number" ? s.percent : 0); });
  status.textContent = total + "%";
  status.className = "total-status " + (total === 100 ? "ok" : "warn");
}

// ======================
// STORICO
// ======================

function renderHistory() {
  const list = document.getElementById("history-list");
  list.innerHTML = "";
  const months = allMonthsWithData();
  if (months.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="emoji">📊</span>Nessun mese con dati ancora</div>';
    return;
  }
  months.forEach(function(mKey) {
    const totalInc = totalIncomeForMonth(mKey);
    const totalSp = totalSpentForMonth(mKey);
    const saved = totalInc - totalSp;
    const closed = isClosedMonth(mKey);
    const card = document.createElement("div");
    card.className = "history-card";
    card.innerHTML =
      '<h3>' + monthLabel(mKey) +
        (closed ? ' <span class="closed-tag">🔒 Chiuso</span>' : ' <span class="open-tag">In corso</span>') +
      '</h3>' +
      '<div class="history-row"><span>Redditi</span><strong>' + formatEuro(totalInc) + '€</strong></div>' +
      '<div class="history-row"><span>Spese</span><strong>' + formatEuro(totalSp) + '€</strong></div>' +
      '<div class="history-row"><span>Risparmiato</span><strong style="color:' + (saved >= 0 ? 'var(--verde-scuro)' : 'var(--rosso)') + '">' + formatEuro(saved) + '€</strong></div>';
    card.addEventListener("click", function() {
      state.currentMonth = mKey; saveState(); renderHome(); showScreen("screen-home");
    });
    list.appendChild(card);
  });
}

// ======================
// DASHBOARD
// ======================

function renderDashboard() {
  const currentKey = currentMonthKey();
  const year = Number(currentKey.split("-")[0]);
  document.getElementById("dash-current-month").textContent = monthLabel(currentKey);
  document.getElementById("dash-year").textContent = year;

  const baseInc = baseIncomeTotal(currentKey);
  const extraInc = extraIncomeTotal(currentKey);
  const totalSp = totalSpentForMonth(currentKey);
  const saved = baseInc + extraInc - totalSp;

  document.getElementById("dash-kpi-base").textContent = formatEuro(baseInc) + "€";
  document.getElementById("dash-kpi-extra").textContent = formatEuro(extraInc) + "€";
  document.getElementById("dash-kpi-spent").textContent = formatEuro(totalSp) + "€";
  const dashSaved = document.getElementById("dash-kpi-saved");
  dashSaved.textContent = formatEuro(saved) + "€";
  dashSaved.style.color = saved >= 0 ? "" : "rgba(255,255,255,0.95)";

  const goal = state.annualGoals[year];
  const goalSection = document.getElementById("annual-goal-section");
  if (goal && goal > 0) {
    goalSection.style.display = "block";
    document.getElementById("annual-goal-year").textContent = year;
    let yearSaved = 0;
    for (let m = 1; m <= 12; m++) {
      const mKey = year + "-" + String(m).padStart(2, "0");
      if (allMonthsWithData().indexOf(mKey) !== -1) {
        yearSaved += totalIncomeForMonth(mKey) - totalSpentForMonth(mKey);
      }
    }
    const pct = Math.min((yearSaved / goal) * 100, 100);
    document.getElementById("annual-goal-fill").style.width = pct + "%";
    document.getElementById("annual-goal-progress").textContent = formatEuro(yearSaved) + "€ / " + formatEuro(goal) + "€";
    document.getElementById("annual-goal-pct").textContent = Math.round((yearSaved / goal) * 100) + "%";
  } else {
    goalSection.style.display = "none";
  }

  const cats = categoriesForMonth(currentKey);
  const catData = cats.slice(0, 3).map(function(cat) {
    return {
      id: cat.id, name: cat.name,
      color: (CATEGORY_STYLES[cat.id] || { color: "#0984e3" }).color,
      value: getSpentForCategoryInMonth(cat.id, currentKey)
    };
  });
  renderDonut(catData);
  renderBarChart(year);
  renderDashMonths(year, currentKey);
}

function renderDonut(data) {
  const container = document.getElementById("donut-chart");
  const legend = document.getElementById("donut-legend");
  const total = data.reduce(function(s, d) { return s + d.value; }, 0);
  if (total === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--testo-soft);font-size:14px;padding:40px 0;">Nessuna spesa registrata</div>';
    legend.innerHTML = "";
    return;
  }
  const size = 200, cx = size / 2, cy = size / 2, r = 70, strokeW = 28;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  let svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">';
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (state.theme === "dark" ? "#24383f" : "#e3ece8") + '" stroke-width="' + strokeW + '"/>';
  data.forEach(function(d) {
    if (d.value <= 0) return;
    const pct = d.value / total;
    const len = pct * circumference;
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + d.color + '" stroke-width="' + strokeW + '" stroke-dasharray="' + len + ' ' + (circumference - len) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
    offset += len;
  });
  const textColor = state.theme === "dark" ? "#8ba5ad" : "#6b7c85";
  const textMain = state.theme === "dark" ? "#e8f4f0" : "#1a2b32";
  svg += '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-size="12" fill="' + textColor + '" font-weight="600">TOTALE</text>';
  svg += '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-size="16" fill="' + textMain + '" font-weight="700">' + formatEuro(total) + '€</text>';
  svg += '</svg>';
  container.innerHTML = svg;
  legend.innerHTML = data.map(function(d) {
    const pct = total > 0 ? Math.round(d.value / total * 100) : 0;
    return '<div class="donut-legend-item">' +
      '<span class="donut-legend-dot" style="background:' + d.color + '"></span>' +
      '<span class="name">' + d.name + ' <span style="color:var(--testo-soft);font-size:12px;">(' + pct + '%)</span></span>' +
      '<span class="val">' + formatEuro(d.value) + '€</span></div>';
  }).join("");
}

function renderBarChart(year) {
  const container = document.getElementById("bar-chart");
  const currentKey = currentMonthKey();
  const currentMonthNum = Number(currentKey.split("-")[1]);
  const months = [];
  for (let m = 1; m <= currentMonthNum; m++) months.push(year + "-" + String(m).padStart(2, "0"));

  let maxTotal = 0;
  const monthData = months.map(function(mKey) {
    let baseSum = 0, svagoSum = 0, rispSum = 0;
    categoriesForMonth(mKey).forEach(function(cat) {
      const spent = getSpentForCategoryInMonth(cat.id, mKey);
      if (cat.id === "base") baseSum = spent;
      else if (cat.id === "svago") svagoSum = spent;
      else if (cat.id === "risparmio") rispSum = spent;
      else baseSum += spent;
    });
    const extraFree = freeExtraTotal(mKey);
    const total = baseSum + svagoSum + rispSum + extraFree;
    if (total > maxTotal) maxTotal = total;
    return { key: mKey, base: baseSum, svago: svagoSum, risparmio: rispSum, extra: extraFree, total: total };
  });
  if (maxTotal === 0) maxTotal = 1;

  let html = "";
  monthData.forEach(function(md) {
    const isCurrent = md.key === currentKey;
    html += '<div class="bar-col' + (isCurrent ? ' current' : '') + '">' +
      '<div class="bar-value">' + (md.total > 0 ? Math.round(md.total) + '€' : '') + '</div>' +
      '<div class="bar-stack">' +
        (md.extra > 0 ? '<div class="bar-seg extra" style="height:' + (md.extra / maxTotal * 100) + '%"></div>' : '') +
        (md.risparmio > 0 ? '<div class="bar-seg risparmio" style="height:' + (md.risparmio / maxTotal * 100) + '%"></div>' : '') +
        (md.svago > 0 ? '<div class="bar-seg svago" style="height:' + (md.svago / maxTotal * 100) + '%"></div>' : '') +
        (md.base > 0 ? '<div class="bar-seg base" style="height:' + (md.base / maxTotal * 100) + '%"></div>' : '') +
      '</div>' +
      '<div class="bar-label">' + monthShortLabel(md.key) + '</div>' +
    '</div>';
  });
  container.innerHTML = html;
}

function renderDashMonths(year, currentKey) {
  const container = document.getElementById("dash-months");
  const currentMonthNum = Number(currentKey.split("-")[1]);
  const months = [];
  for (let m = currentMonthNum; m >= 1; m--) {
    const mKey = year + "-" + String(m).padStart(2, "0");
    if (baseIncomeTotal(mKey) + extraIncomeTotal(mKey) + totalSpentForMonth(mKey) > 0 || isClosedMonth(mKey)) {
      months.push(mKey);
    }
  }
  if (months.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:20px;"><span class="emoji">📅</span>Nessun dato ancora</div>';
    return;
  }
  const chrono = months.slice().reverse();
  const savings = chrono.map(function(mKey) { return totalIncomeForMonth(mKey) - totalSpentForMonth(mKey); });

  let html = "";
  months.forEach(function(mKey, idx) {
    const totalInc = totalIncomeForMonth(mKey);
    const totalSp = totalSpentForMonth(mKey);
    const saved = totalInc - totalSp;
    const extraInc = extraIncomeTotal(mKey);
    const isCurrent = mKey === currentKey;
    const closed = isClosedMonth(mKey);

    const prevIdx = months.length - idx;
    let deltaHtml = "";
    if (prevIdx > 0 && prevIdx < chrono.length) {
      const prevSaved = totalIncomeForMonth(chrono[prevIdx - 1]) - totalSpentForMonth(chrono[prevIdx - 1]);
      if (prevSaved !== 0) {
        const diffPct = Math.round((saved - prevSaved) / Math.abs(prevSaved) * 100);
        if (diffPct > 0) deltaHtml = '<span class="dash-month-delta down">+' + diffPct + '%</span>';
        else if (diffPct < 0) deltaHtml = '<span class="dash-month-delta up">' + diffPct + '%</span>';
      }
    }

    const upto = savings.slice(0, chrono.indexOf(mKey) + 1);
    const spark = sparklineSVG(upto);
    const tagHtml = closed ? '<span class="dash-month-tag closed">🔒 Chiuso</span>' : (isCurrent ? '<span class="dash-month-tag current">In corso</span>' : '');
    const extraRow = extraInc > 0 ? '<div class="dash-month-extra">✨ Extra: ' + formatEuro(extraInc) + '€</div>' : '';

    html += '<div class="dash-month-card' + (isCurrent ? ' current' : '') + '" data-month="' + mKey + '">' +
      '<div class="dash-month-top"><div class="dash-month-name">' + monthLabel(mKey) + ' ' + tagHtml + '</div>' + deltaHtml + '</div>' +
      '<div class="dash-month-rows">' +
        '<div><div class="lbl">Redditi</div><div class="val">' + formatEuro(totalInc) + '€</div></div>' +
        '<div><div class="lbl">Spese</div><div class="val">' + formatEuro(totalSp) + '€</div></div>' +
        '<div><div class="lbl">Risparmiato</div><div class="val ' + (saved >= 0 ? 'pos' : 'neg') + '">' + formatEuro(saved) + '€</div></div>' +
      '</div>' + extraRow +
      '<div class="sparkline-wrap">' + spark + '</div>' +
    '</div>';
  });
  container.innerHTML = html;
  container.querySelectorAll(".dash-month-card").forEach(function(card) {
    card.addEventListener("click", function() {
      state.currentMonth = card.dataset.month;
      saveState(); renderHome(); showScreen("screen-home");
    });
  });
}

function sparklineSVG(values) {
  if (values.length === 0) return "";
  if (values.length === 1) return '<svg viewBox="0 0 100 30" preserveAspectRatio="none"><line x1="0" y1="15" x2="100" y2="15" stroke="#00b894" stroke-width="2"/></svg>';
  const w = 100, h = 30;
  const minV = Math.min.apply(null, values);
  const maxV = Math.max.apply(null, values);
  const range = maxV - minV || 1;
  const points = values.map(function(v, i) {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - minV) / range) * (h - 6) - 3;
    return x + "," + y;
  }).join(" ");
  const lastVal = values[values.length - 1];
  const strokeColor = lastVal >= 0 ? "#00b894" : "#e74c3c";
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
    '<polyline fill="none" stroke="' + strokeColor + '" stroke-width="2" points="' + points + '"/></svg>';
}

// ======================
// EXPORT / IMPORT
// ======================

function exportData() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "budget-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV() {
  const headers = ["Data", "Categoria", "Sottocategoria", "Importo", "Nota"];
  const rows = [headers];
  const sortedExpenses = state.expenses.slice().sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  sortedExpenses.forEach(function(exp) {
    const mKey = monthKeyFromDate(exp.date);
    const cat = getCategoryOfSubcat(exp.subcatId, mKey);
    const sub = cat ? cat.subcategories.find(function(s) { return s.id === exp.subcatId; }) : null;
    const catName = cat ? cat.name : "?";
    const subName = sub ? sub.name : "?";
    const note = (exp.note || "").replace(/"/g, '""');
    rows.push([monthLabel(mKey), catName, subName, exp.amount.toFixed(2).replace(".", ","), note]);
  });
  const csv = rows.map(function(r) {
    return r.map(function(c) {
      const s = String(c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",");
  }).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "budget-spese-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.categories || !Array.isArray(imported.categories)) throw new Error("Formato non valido");
      if (!confirm("Sovrascrivere tutti i dati attuali con quelli importati?")) return;
      state = imported;
      if (!state.incomes) state.incomes = [];
      if (!state.expenses) state.expenses = [];
      if (!state.closedMonths) state.closedMonths = [];
      if (!state.monthSnapshots) state.monthSnapshots = {};
      if (!state.recurringExpenses) state.recurringExpenses = [];
      if (!state.annualGoals) state.annualGoals = {};
      if (!state.theme) state.theme = "light";
      if (!state.currentMonth) state.currentMonth = currentMonthKey();
      state.incomes.forEach(function(inc) {
        if (!inc.type) inc.type = "base";
        if (inc.type === "extra" && inc.extraTarget === undefined) inc.extraTarget = null;
      });
      saveState();
      applyTheme();
      alert("Dati importati con successo!");
      renderHome();
      showScreen("screen-home");
    } catch (err) { alert("Errore importazione: " + err.message); }
  };
  reader.readAsText(file);
}

// ======================
// EVENTI
// ======================

function initEvents() {
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);

  // Auth
  var authBtn = document.getElementById("auth-btn");
  if (authBtn) {
    authBtn.addEventListener("click", function() {
      if (typeof isLoggedIn === "function" && isLoggedIn()) {
        if (confirm("Vuoi uscire dall'account Google? La sincronizzazione verrà disattivata.")) {
          logoutGoogle();
        }
      } else {
        requestLogin();
      }
    });
  }

  document.getElementById("month-prev").addEventListener("click", function() { changeMonth(-1); });
  document.getElementById("month-next").addEventListener("click", function() { changeMonth(1); });
  document.getElementById("month-current").addEventListener("click", openMonthPickerModal);

  document.getElementById("btn-close-month").addEventListener("click", closeCurrentMonth);
  document.getElementById("btn-reopen-month").addEventListener("click", reopenCurrentMonth);

  document.getElementById("btn-add-expense").addEventListener("click", function() {
    document.getElementById("expense-amount").value = "";
    document.getElementById("expense-note").value = "";
    renderSubcatPicker();
    showScreen("screen-add");
  });
  document.getElementById("btn-view-expenses").addEventListener("click", function() { renderExpensesList(); showScreen("screen-expenses"); });
  document.getElementById("btn-view-incomes").addEventListener("click", function() { renderIncomesList(); showScreen("screen-income"); });
  document.getElementById("btn-recurring").addEventListener("click", function() { renderRecurringList(); showScreen("screen-recurring"); });
  document.getElementById("btn-copy-month").addEventListener("click", openCopyMonthModal);
  document.getElementById("btn-settings").addEventListener("click", function() {
    renderPercentagesEditor();
    const year = Number(currentMonthKey().split("-")[0]);
    const goal = state.annualGoals[year] || "";
    document.getElementById("annual-goal-input").value = goal || "";
    showScreen("screen-settings");
  });
  document.getElementById("btn-history").addEventListener("click", function() { renderHistory(); showScreen("screen-history"); });
  document.getElementById("btn-dashboard").addEventListener("click", function() { renderDashboard(); showScreen("screen-dashboard"); });

  document.getElementById("btn-save-expense").addEventListener("click", function() {
    const amount = Number(document.getElementById("expense-amount").value);
    const note = document.getElementById("expense-note").value.trim();
    if (!selectedSubcat || amount <= 0) { alert("Seleziona una sottocategoria e inserisci un importo valido."); return; }
    const parts = state.currentMonth.split("-");
    const dateISO = new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toISOString();
    state.expenses.push({
      id: Date.now().toString(),
      subcatId: selectedSubcat,
      amount: amount,
      date: dateISO,
      note: note
    });
    saveState(); renderHome(); showScreen("screen-home");
  });

  document.getElementById("btn-add-income-base").addEventListener("click", function() { openAddIncomeModal("base"); });
  document.getElementById("btn-add-income-extra").addEventListener("click", function() { openAddIncomeModal("extra"); });

  document.getElementById("btn-add-recurring").addEventListener("click", function() { openRecurringModal(); });
  document.getElementById("btn-apply-recurring").addEventListener("click", applyRecurringToMonth);

  document.getElementById("btn-save-percentages").addEventListener("click", function() {
    const inputs = document.querySelectorAll("#percentages-editor input");
    inputs.forEach(function(i) {
      const cat = state.categories.find(function(c) { return c.id === i.dataset.id; });
      if (cat) cat.percent = Number(i.value) || 0;
    });
    saveState(); renderHome(); showScreen("screen-home");
  });
  document.getElementById("btn-reset-percentages").addEventListener("click", function() {
    const defaults = { base: 50, svago: 30, risparmio: 20 };
    state.categories.forEach(function(c) { if (defaults[c.id] !== undefined) c.percent = defaults[c.id]; });
    saveState(); renderPercentagesEditor();
  });
  document.getElementById("btn-add-category").addEventListener("click", function() {
    const name = document.getElementById("new-cat-name").value.trim();
    const percent = Number(document.getElementById("new-cat-percent").value);
    if (!name || percent <= 0) return;
    const currentTotal = state.categories.reduce(function(s, c) { return s + c.percent; }, 0);
    if (currentTotal + percent > 100) { alert("La somma delle percentuali supererebbe 100%."); return; }
    state.categories.push({ id: "cat_" + Date.now(), name: name, percent: percent, subcategories: [] });
    saveState(); renderPercentagesEditor();
    document.getElementById("new-cat-name").value = "";
    document.getElementById("new-cat-percent").value = "";
  });

  document.getElementById("btn-save-annual-goal").addEventListener("click", function() {
    const year = Number(currentMonthKey().split("-")[0]);
    const val = Number(document.getElementById("annual-goal-input").value);
    if (val > 0) state.annualGoals[year] = val;
    else delete state.annualGoals[year];
    saveState();
    alert("Obiettivo salvato!");
  });

  document.getElementById("btn-export").addEventListener("click", exportData);
  document.getElementById("btn-export-csv").addEventListener("click", exportCSV);
  document.getElementById("btn-import").addEventListener("click", function() { document.getElementById("import-file").click(); });
  document.getElementById("import-file").addEventListener("change", function(e) {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = "";
  });

  document.getElementById("btn-back-from-add").addEventListener("click", function() { renderHome(); showScreen("screen-home"); });
  document.getElementById("btn-back-from-expenses").addEventListener("click", function() { renderHome(); showScreen("screen-home"); });
  document.getElementById("btn-back-from-incomes").addEventListener("click", function() { renderHome(); showScreen("screen-home"); });
  document.getElementById("btn-back-from-recurring").addEventListener("click", function() { renderHome(); showScreen("screen-home"); });
  document.getElementById("btn-back-from-history").addEventListener("click", function() { renderHome(); showScreen("screen-home"); });
  document.getElementById("btn-back-from-settings").addEventListener("click", function() { renderHome(); showScreen("screen-home"); });
  document.getElementById("btn-back-from-dashboard").addEventListener("click", function() { renderHome(); showScreen("screen-home"); });
}

// ======================
// AVVIO
// ======================

function init() {
  loadState();
  applyTheme();
  initEvents();

  // Inizializza auth quando GIS è pronto
  if (typeof initAuth === "function") {
    var tries = 0;
    var waitGoogle = setInterval(function() {
      tries++;
      if (typeof google !== "undefined" && google.accounts && google.accounts.oauth2) {
        clearInterval(waitGoogle);
        initAuth();
      } else if (tries > 20) {
        clearInterval(waitGoogle);
        console.warn("Google Identity Services non disponibile.");
        initAuth();
      }
    }, 250);
  }

  renderHome();
  showScreen("screen-home");
}

document.addEventListener("DOMContentLoaded", init);