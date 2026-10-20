// Lead Broker Blueprint — interactive course player logic
// Vanilla JS, zero dependencies. Loads lessons-data.json, renders sidebar
// + content pane, persists progress to localStorage.

const MODULE_META = {
  1: { title: "What Lead Brokering Actually Is", folder: "Module 1 - What Lead Brokering Actually Is" },
  2: { title: "The Vertical Landscape", folder: "Module 2 - The Vertical Landscape" },
  3: { title: "The Regulatory Landscape", folder: "Module 3 - The Regulatory Landscape" },
  4: { title: "The Buyer Side", folder: "Module 4 - The Buyer Side" },
  5: { title: "The Lead Generation Side", folder: "Module 5 - The Lead Generation Side" },
  6: { title: "Operations and Tooling", folder: "Module 6 - Operations and Tooling" },
  7: { title: "Starting from Zero", folder: "Module 7 - Starting from Zero" },
  8: { title: "Continued Learning", folder: "Module 8 - Continued Learning" },
};

// ---- Progress persistence (localStorage) ----
const PROGRESS_KEY = "lbb_progress_v1";

function getProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function setProgress(state) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(state)); }
  catch (e) { console.warn("Could not save progress:", e); }
}

function isComplete(lessonId) {
  return !!getProgress()[lessonId];
}

function markComplete(lessonId) {
  const p = getProgress();
  p[lessonId] = { completedAt: new Date().toISOString() };
  setProgress(p);
}

function markIncomplete(lessonId) {
  const p = getProgress();
  delete p[lessonId];
  setProgress(p);
}

// ---- Main player state ----
let LESSONS = [];           // flat array of lessons (loaded from JSON)
let LESSONS_BY_ID = {};     // id → lesson
let LESSONS_BY_MODULE = {}; // moduleNum → array of lessons
let currentLessonId = null;

// ---- Boot ----
async function boot() {
  try {
    const resp = await fetch("../assets/lessons-data.json");
    LESSONS = await resp.json();
  } catch (e) {
    document.getElementById("learn-root").innerHTML = `<div style="padding: 40px;"><h2>Couldn't load lesson data</h2><p>${e.message}</p></div>`;
    return;
  }

  // Index lessons
  LESSONS.forEach((l) => {
    const m = parseInt(l.id.split(".")[0], 10);
    LESSONS_BY_ID[l.id] = l;
    if (!LESSONS_BY_MODULE[m]) LESSONS_BY_MODULE[m] = [];
    LESSONS_BY_MODULE[m].push(l);
  });

  // Determine initial lesson: ?lesson=X.Y in URL, else first incomplete, else first lesson
  const urlParams = new URLSearchParams(window.location.search);
  const urlLesson = urlParams.get("lesson");
  if (urlLesson && LESSONS_BY_ID[urlLesson]) {
    currentLessonId = urlLesson;
  } else {
    const firstIncomplete = LESSONS.find((l) => !isComplete(l.id));
    currentLessonId = firstIncomplete ? firstIncomplete.id : LESSONS[0].id;
  }

  render();
  setupKeyboardNav();
}

// ---- Rendering ----
function render() {
  renderSidebar();
  renderContent();
  updateProgressBar();
}

function renderSidebar() {
  const sidebar = document.getElementById("sidebar-modules");
  if (!sidebar) return;

  let html = "";
  for (let m = 1; m <= 8; m++) {
    const meta = MODULE_META[m];
    const moduleLessons = LESSONS_BY_MODULE[m] || [];
    const completedInModule = moduleLessons.filter((l) => isComplete(l.id)).length;
    const total = moduleLessons.length;
    const isActiveModule = currentLessonId && currentLessonId.startsWith(m + ".");

    html += `<div class="sb-module ${isActiveModule ? "sb-module-active" : ""}">
      <div class="sb-module-head">
        <div class="sb-module-num">${m}</div>
        <div class="sb-module-meta">
          <div class="sb-module-title">${escapeHtml(meta.title)}</div>
          <div class="sb-module-stats">${completedInModule}/${total} lessons</div>
        </div>
      </div>
      <ul class="sb-lessons">`;
    moduleLessons.forEach((l) => {
      const active = l.id === currentLessonId;
      const done = isComplete(l.id);
      const icon = done ? "✓" : "○";
      const iconClass = done ? "sb-icon-done" : "sb-icon-todo";
      html += `<li class="sb-lesson ${active ? "sb-lesson-active" : ""}" data-lesson-id="${l.id}">
        <span class="sb-icon ${iconClass}">${icon}</span>
        <span class="sb-lesson-id">${l.id}</span>
        <span class="sb-lesson-title">${escapeHtml(l.title)}</span>
      </li>`;
    });
    html += "</ul></div>";
  }
  sidebar.innerHTML = html;

  // Wire clicks
  sidebar.querySelectorAll(".sb-lesson").forEach((el) => {
    el.addEventListener("click", () => {
      currentLessonId = el.getAttribute("data-lesson-id");
      render();
      scrollContentToTop();
      updateURLForCurrent();
    });
  });
}

function renderContent() {
  const lesson = LESSONS_BY_ID[currentLessonId];
  if (!lesson) return;
  const moduleNum = parseInt(lesson.id.split(".")[0], 10);
  const meta = MODULE_META[moduleNum];
  const pdfPath = `../${encodeURIComponent(meta.folder)}/Lessons/Module%20${moduleNum}%20-%20Written%20Curriculum.pdf`;
  const done = isComplete(lesson.id);
  const idx = LESSONS.findIndex((l) => l.id === currentLessonId);
  const prev = idx > 0 ? LESSONS[idx - 1] : null;
  const next = idx < LESSONS.length - 1 ? LESSONS[idx + 1] : null;

  const contentEl = document.getElementById("content-pane");
  contentEl.innerHTML = `
    <div class="lp-breadcrumb">
      <span class="lp-bc-module">Module ${moduleNum} — ${escapeHtml(meta.title)}</span>
      <span class="lp-bc-sep">›</span>
      <span class="lp-bc-lesson">Lesson ${lesson.id}</span>
    </div>
    <h1 class="lp-title">${escapeHtml(lesson.title)}</h1>

    ${lesson.lo ? `
    <div class="lp-objective">
      <div class="lp-objective-label">Learning objective</div>
      <p>${escapeHtml(lesson.lo)}</p>
    </div>` : ""}

    ${lesson.summary ? `
    <div class="lp-summary">
      <h2>Key takeaway</h2>
      <p>${escapeHtml(lesson.summary)}</p>
    </div>` : ""}

    <div class="lp-pdf-cta">
      <h2>Full lesson content</h2>
      <p>The complete lesson text — examples, citations, and supporting detail — is in the Module ${moduleNum} curriculum PDF. Open it to read the full text of Lesson ${lesson.id} in context with the surrounding lessons.</p>
      <div class="lp-pdf-buttons">
        <a class="btn btn-primary" href="${pdfPath}" target="_blank" rel="noopener">Open Module ${moduleNum} curriculum (PDF) →</a>
        <a class="btn btn-ghost" href="../members/module-${moduleNum}.html">View module overview</a>
      </div>
    </div>

    <div class="lp-actions">
      ${done
        ? `<button class="btn btn-ghost lp-action-toggle" onclick="toggleLessonComplete()">✓ Completed — mark as not done</button>`
        : `<button class="btn btn-primary lp-action-toggle" onclick="completeAndAdvance()">Mark complete${next ? ` & continue to ${next.id}` : ""} →</button>`}
    </div>

    <div class="lp-nav">
      ${prev ? `<button class="lp-nav-btn lp-nav-prev" onclick="goToLesson('${prev.id}')"><span class="lp-nav-arrow">←</span><span><div class="lp-nav-label">Previous</div><div class="lp-nav-title">${escapeHtml(prev.id + " · " + prev.title)}</div></span></button>` : "<div></div>"}
      ${next ? `<button class="lp-nav-btn lp-nav-next" onclick="goToLesson('${next.id}')"><span><div class="lp-nav-label">Next</div><div class="lp-nav-title">${escapeHtml(next.id + " · " + next.title)}</div></span><span class="lp-nav-arrow">→</span></button>` : "<div></div>"}
    </div>
  `;
}

function updateProgressBar() {
  const done = LESSONS.filter((l) => isComplete(l.id)).length;
  const total = LESSONS.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const fill = document.getElementById("progress-fill");
  const label = document.getElementById("progress-label");
  if (fill) fill.style.width = pct + "%";
  if (label) label.textContent = `${done} of ${total} lessons complete · ${pct}%`;
}

function updateURLForCurrent() {
  const url = new URL(window.location.href);
  url.searchParams.set("lesson", currentLessonId);
  window.history.replaceState({}, "", url.toString());
}

function scrollContentToTop() {
  const pane = document.getElementById("content-pane-wrapper");
  if (pane) pane.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: "instant" });
}

// ---- Actions exposed to inline handlers ----
window.completeAndAdvance = function () {
  if (!currentLessonId) return;
  markComplete(currentLessonId);
  const idx = LESSONS.findIndex((l) => l.id === currentLessonId);
  const next = LESSONS[idx + 1];
  if (next) {
    currentLessonId = next.id;
    render();
    scrollContentToTop();
    updateURLForCurrent();
  } else {
    // Last lesson — re-render to show completed state
    render();
    showCompletionConfetti();
  }
};

window.toggleLessonComplete = function () {
  if (!currentLessonId) return;
  if (isComplete(currentLessonId)) {
    markIncomplete(currentLessonId);
  } else {
    markComplete(currentLessonId);
  }
  render();
};

window.goToLesson = function (lessonId) {
  if (!LESSONS_BY_ID[lessonId]) return;
  currentLessonId = lessonId;
  render();
  scrollContentToTop();
  updateURLForCurrent();
};

// ---- Keyboard navigation ----
function setupKeyboardNav() {
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const idx = LESSONS.findIndex((l) => l.id === currentLessonId);
    if (e.key === "ArrowRight" && idx < LESSONS.length - 1) {
      e.preventDefault();
      goToLesson(LESSONS[idx + 1].id);
    } else if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      goToLesson(LESSONS[idx - 1].id);
    } else if (e.key === " " && e.shiftKey === false) {
      // Space marks complete + advance
      e.preventDefault();
      completeAndAdvance();
    }
  });
}

// ---- Celebration on full completion ----
function showCompletionConfetti() {
  const all = LESSONS.every((l) => isComplete(l.id));
  if (!all) return;
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(11,14,20,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#fff;text-align:center;padding:40px;";
  overlay.innerHTML = `
    <div style="font-size:6rem;color:#FF6B1A;margin-bottom:20px;">✓</div>
    <h1 style="font-size:2.5rem;margin:0 0 12px;">You finished the Blueprint.</h1>
    <p style="font-size:1.15rem;max-width:520px;line-height:1.6;color:rgba(255,255,255,0.8);">All 60 lessons complete. Now do the work. The operators making real money in this business have done the same reps you just finished — and kept going. — Lorenzo</p>
    <button style="margin-top:30px;padding:14px 28px;background:#FF6B1A;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:1rem;cursor:pointer;" onclick="this.parentElement.remove()">Close</button>
  `;
  document.body.appendChild(overlay);
}

// ---- Util ----
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- Sidebar toggle (mobile) ----
window.toggleSidebar = function () {
  document.body.classList.toggle("sidebar-open");
};

// Boot when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
