// Rescue Radar — import web page. No build step, no framework: plain
// fetch/DOM only. Access is via a single-use, short-lived, profile-scoped
// bearer token in the URL (?t=...) instead of a real login — see
// supabase/migrations/0006_import_history.sql in the main app repo for the
// security model.

const SUPABASE_URL = "https://bekjorpukzkmiclytsgd.supabase.co";
const BULK_ENTRY_URL = `${SUPABASE_URL}/functions/v1/import-bulk-entry`;
const UPLOAD_URL = `${SUPABASE_URL}/functions/v1/import-upload`;

const ERROR_MESSAGES = {
  invalid_or_used_token: "This link has expired or was already used — ask the app for a new one (Settings → Import history).",
  bad_request: "Something about that request wasn't right.",
};

// Mirrors src/data/catalog.js's CANON_ORDER + EXTRA_CLASSES + CLASS_LABEL —
// hand-duplicated here since this static page has no access to the app's
// source, same convention already used for TRIGGERS in the Edge Functions.
const MED_CLASSES = [
  ["NSAID", "NSAIDs"],
  ["Triptan", "Triptans"],
  ["Gepant", "Gepants"],
  ["Ergot", "Ergots"],
  ["Combination", "Combination"],
  ["Analgesic", "Analgesics"],
  ["Ditan", "Ditans"],
  ["Opioid", "Opioids"],
  ["Antiemetic", "Anti-nausea"],
  ["Other", "Other"],
];

function friendlyError(body) {
  if (!body) return "Something went wrong.";
  return ERROR_MESSAGES[body.error] || body.message || body.error || "Something went wrong.";
}

const token = new URLSearchParams(location.search).get("t");

const els = {
  loading: document.getElementById("loading"),
  invalid: document.getElementById("invalid"),
  invalidMessage: document.getElementById("invalid-message"),
  app: document.getElementById("app"),
  greeting: document.getElementById("greeting"),
  tabUpload: document.getElementById("tab-upload"),
  tabForm: document.getElementById("tab-form"),
  panelUpload: document.getElementById("panel-upload"),
  panelForm: document.getElementById("panel-form"),
  fileInput: document.getElementById("file-input"),
  uploadSubmit: document.getElementById("upload-submit"),
  uploadResult: document.getElementById("upload-result"),
  rows: document.getElementById("rows"),
  addRow: document.getElementById("add-row"),
  newMedName: document.getElementById("new-med-name"),
  newMedCls: document.getElementById("new-med-cls"),
  addMedSubmit: document.getElementById("add-med-submit"),
  addMedResult: document.getElementById("add-med-result"),
  formSubmit: document.getElementById("form-submit"),
  formResult: document.getElementById("form-result"),
  rowTemplate: document.getElementById("row-template"),
};

function showInvalid(message) {
  els.loading.classList.add("hidden");
  els.invalidMessage.textContent = message;
  els.invalid.classList.remove("hidden");
}

let context = null; // { profileName, medications, triggers }

async function init() {
  if (!token) {
    showInvalid("This link is missing its access code.");
    return;
  }
  try {
    const res = await fetch(`${BULK_ENTRY_URL}?t=${encodeURIComponent(token)}`);
    const body = await res.json();
    if (!res.ok) {
      showInvalid(friendlyError(body));
      return;
    }
    context = body;
  } catch (e) {
    showInvalid("Couldn't reach the server. Check your connection and reload this page.");
    return;
  }

  els.greeting.textContent = context.profileName
    ? `Importing history for ${context.profileName}.`
    : "Importing history.";
  els.loading.classList.add("hidden");
  els.app.classList.remove("hidden");

  MED_CLASSES.forEach(([cls, label]) => {
    const opt = document.createElement("option");
    opt.value = cls;
    opt.textContent = label;
    els.newMedCls.appendChild(opt);
  });

  addRow();
}

// ---------- tabs ----------
els.tabUpload.addEventListener("click", () => {
  els.tabUpload.classList.add("active");
  els.tabForm.classList.remove("active");
  els.panelUpload.classList.remove("hidden");
  els.panelForm.classList.add("hidden");
});
els.tabForm.addEventListener("click", () => {
  els.tabForm.classList.add("active");
  els.tabUpload.classList.remove("active");
  els.panelForm.classList.remove("hidden");
  els.panelUpload.classList.add("hidden");
});

// ---------- upload panel ----------
els.uploadSubmit.addEventListener("click", async () => {
  const file = els.fileInput.files[0];
  if (!file) {
    els.uploadResult.textContent = "Choose a file first.";
    els.uploadResult.className = "result error";
    return;
  }
  els.uploadSubmit.disabled = true;
  els.uploadResult.textContent = "Uploading…";
  els.uploadResult.className = "result";
  try {
    const form = new FormData();
    form.append("token", token);
    form.append("file", file);
    const res = await fetch(UPLOAD_URL, { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) throw new Error(friendlyError(body));
    els.uploadResult.textContent = "Got it — you'll see it waiting for review next time you open the app.";
    els.uploadResult.className = "result ok";
    els.fileInput.disabled = true;
    els.uploadSubmit.disabled = true;
  } catch (e) {
    els.uploadResult.textContent = e.message || "Upload failed.";
    els.uploadResult.className = "result error";
    els.uploadSubmit.disabled = false;
  }
});

// ---------- form panel ----------
function addRow() {
  const node = els.rowTemplate.content.cloneNode(true);
  const row = node.querySelector("[data-row]");

  const medsGroup = row.querySelector('[data-field="meds"]');
  (context.medications || []).forEach((m) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = m.id;
    label.appendChild(input);
    label.appendChild(document.createTextNode(m.brand ? `${m.name} (${m.brand})` : m.name));
    medsGroup.appendChild(label);
  });

  const triggersGroup = row.querySelector('[data-field="triggers"]');
  (context.triggers || []).forEach((t) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = t;
    label.appendChild(input);
    label.appendChild(document.createTextNode(t));
    triggersGroup.appendChild(label);
  });

  row.querySelector("[data-remove]").addEventListener("click", () => row.remove());

  els.rows.appendChild(row);
}
els.addRow.addEventListener("click", addRow);

// Creates the medication immediately (a separate request, before any day
// entries reference it) so entries only ever need to point at real ids —
// avoids the complexity of resolving a not-yet-created medication's id
// inside the same submission that also saves day entries. Only applies to
// rows added *after* this point via addRow(); already-open rows don't
// retroactively grow a checkbox for it — a deliberate, small scope call
// (add your medications before filling in days, or just add another row).
els.addMedSubmit.addEventListener("click", async () => {
  const name = els.newMedName.value.trim();
  const cls = els.newMedCls.value;
  if (!name) {
    els.addMedResult.textContent = "Enter a medication name first.";
    els.addMedResult.className = "result error";
    return;
  }
  els.addMedSubmit.disabled = true;
  els.addMedResult.textContent = "Adding…";
  els.addMedResult.className = "result";
  try {
    const res = await fetch(BULK_ENTRY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newMedication: { name, cls } }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(friendlyError(body));
    context.medications = [...(context.medications || []), body.medication];
    els.newMedName.value = "";
    els.addMedResult.textContent = `Added "${name}" — it'll show up on new day rows.`;
    els.addMedResult.className = "result ok";
  } catch (e) {
    els.addMedResult.textContent = e.message || "Couldn't add that medication.";
    els.addMedResult.className = "result error";
  } finally {
    els.addMedSubmit.disabled = false;
  }
});

function readRow(rowEl) {
  const date = rowEl.querySelector('[data-field="date"]').value;
  const medIds = Array.from(rowEl.querySelectorAll('[data-field="meds"] input:checked')).map((i) => i.value);
  const triggers = Array.from(rowEl.querySelectorAll('[data-field="triggers"] input:checked')).map((i) => i.value);
  const nmh = rowEl.querySelector('[data-field="nmh"]').checked;
  const note = rowEl.querySelector('[data-field="note"]').value;
  return { date, medIds, triggers, nmh, note };
}

// Only ever resubmits rows that haven't already succeeded — the Edge
// Function only marks the token used once every entry in a submission
// succeeds, specifically so this partial-retry works. Resubmitting an
// already-"ok" row isn't just wasted work, it can double-count doses for
// dose-limited medication classes, so rows marked done are skipped, not
// just visually greyed out.
els.formSubmit.addEventListener("click", async () => {
  const rowEls = Array.from(els.rows.querySelectorAll("[data-row]:not(.done)"));
  const entries = [];
  const rowByDate = {};
  for (const rowEl of rowEls) {
    const entry = readRow(rowEl);
    if (!entry.date) {
      const status = rowEl.querySelector("[data-status]");
      status.textContent = "Pick a date for this row.";
      status.className = "row-status error";
      return;
    }
    entries.push(entry);
    rowByDate[entry.date] = rowEl;
  }
  if (entries.length === 0) {
    els.formResult.textContent = "Nothing left to submit.";
    els.formResult.className = "result";
    return;
  }

  els.formSubmit.disabled = true;
  els.formSubmit.textContent = "Submitting…";
  els.formResult.textContent = "";

  try {
    const res = await fetch(BULK_ENTRY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, entries }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(friendlyError(body));

    let okCount = 0;
    let errorCount = 0;
    for (const result of body.results) {
      const rowEl = rowByDate[result.date];
      if (!rowEl) continue;
      const status = rowEl.querySelector("[data-status]");
      if (result.status === "ok") {
        okCount++;
        status.textContent = "Saved.";
        status.className = "row-status ok";
        rowEl.classList.add("done");
        rowEl.querySelectorAll("input, textarea, button").forEach((el) => (el.disabled = true));
      } else {
        errorCount++;
        status.textContent = result.message || "Couldn't save this day.";
        status.className = "row-status error";
      }
    }

    if (body.allOk) {
      els.formResult.textContent = `Imported ${okCount} day${okCount === 1 ? "" : "s"}. This link is now used up.`;
      els.formResult.className = "result ok";
      els.addRow.classList.add("hidden");
      els.formSubmit.classList.add("hidden");
    } else {
      els.formResult.textContent = `Saved ${okCount}, ${errorCount} failed — fix and try again.`;
      els.formResult.className = "result error";
      els.formSubmit.disabled = false;
      els.formSubmit.textContent = "Retry failed days";
    }
  } catch (e) {
    els.formResult.textContent = e.message || "Submit failed.";
    els.formResult.className = "result error";
    els.formSubmit.disabled = false;
    els.formSubmit.textContent = "Submit";
  }
});

init();
