  // ----------------------------------------------------------
  // PARTNER TIPS — Dynamic partner selector
  // Paste this block inside the outer IIFE in script.js,
  // right before the closing })();
  // Only runs on articles containing .partner-tips elements.
  // ----------------------------------------------------------

  window.addEventListener("DOMContentLoaded", () => {
    const partnerSections = document.querySelectorAll(".partner-tips[data-partner]");
    if (!partnerSections.length) return;

    // Group partners by LOB, preserving document order
    const lobs = new Map();
    const allPartners = [];

    partnerSections.forEach((section) => {
      const id = section.getAttribute("data-partner");
      const name = section.getAttribute("data-partner-name") || id;
      const lob = section.getAttribute("data-lob") || "Other";
      if (!lobs.has(lob)) lobs.set(lob, []);
      lobs.get(lob).push({ id, name, section });
      allPartners.push({ id, name, lob, section });
    });

    // Read initial selection from URL
    const selected = new Set();
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("partners");
    if (fromUrl) {
      fromUrl.split(",").forEach((id) => {
        if (allPartners.some((p) => p.id === id.trim())) {
          selected.add(id.trim());
        }
      });
    }

    // Build the selector UI
    const container = document.getElementById("partner-selector") ||
      (() => {
        const div = document.createElement("div");
        div.id = "partner-selector";
        const articleBody = document.querySelector(".article-body");
        if (articleBody) articleBody.prepend(div);
        return div;
      })();

    const statusEl = document.getElementById("partner-status") ||
      (() => {
        const p = document.createElement("p");
        p.id = "partner-status";
        container.after(p);
        return p;
      })();

    statusEl.setAttribute("aria-live", "polite");
    statusEl.setAttribute("aria-atomic", "true");

    const fieldset = document.createElement("fieldset");
    fieldset.className = "pt-fieldset";
    const legend = document.createElement("legend");
    legend.className = "pt-legend";
    legend.textContent = "Select your partners";
    fieldset.appendChild(legend);

    const hint = document.createElement("p");
    hint.className = "pt-hint";
    hint.textContent = "Toggle the partners this carrier has live — the reference below updates automatically.";
    fieldset.appendChild(hint);

    const lobContainer = document.createElement("div");
    lobContainer.className = "pt-lob-groups";

    lobs.forEach((partners, lobName) => {
      const group = document.createElement("div");
      group.className = "pt-lob-group";

      const label = document.createElement("div");
      label.className = "pt-lob-label";
      label.textContent = lobName;
      group.appendChild(label);

      const options = document.createElement("div");
      options.className = "pt-lob-options";

      partners.forEach((p) => {
        const lbl = document.createElement("label");
        lbl.className = "pt-toggle" + (selected.has(p.id) ? " pt-checked" : "");

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = p.id;
        cb.checked = selected.has(p.id);
        cb.setAttribute("aria-label", p.name);

        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(" " + p.name));
        options.appendChild(lbl);
      });

      group.appendChild(options);
      lobContainer.appendChild(group);
    });

    fieldset.appendChild(lobContainer);

    // Controls row
    const controls = document.createElement("div");
    controls.className = "pt-controls";

    const selectAllBtn = document.createElement("button");
    selectAllBtn.type = "button";
    selectAllBtn.className = "pt-btn";
    selectAllBtn.textContent = "Select all";
    controls.appendChild(selectAllBtn);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "pt-btn";
    clearBtn.textContent = "Clear";
    controls.appendChild(clearBtn);

    fieldset.appendChild(controls);
    container.appendChild(fieldset);

    // Mark page as JS-active so CSS can hide sections by default
    container.closest(".article-body")?.classList.add("pt-active");

    function render() {
      let visibleCount = 0;

      allPartners.forEach((p) => {
        const show = selected.has(p.id);
        p.section.classList.toggle("pt-visible", show);
        if (show) visibleCount++;
      });

      // Update checkbox visuals
      fieldset.querySelectorAll(".pt-toggle").forEach((toggle) => {
        const cb = toggle.querySelector("input");
        cb.checked = selected.has(cb.value);
        toggle.classList.toggle("pt-checked", cb.checked);
      });

      // Status text
      if (visibleCount === 0) {
        statusEl.textContent = "No partners selected — select one or more above to see their details.";
      } else if (visibleCount === 1) {
        statusEl.textContent = "Showing tips for 1 partner";
      } else {
        statusEl.textContent = "Showing tips for " + visibleCount + " partners";
      }

      // Update URL
      const ids = allPartners.filter((p) => selected.has(p.id)).map((p) => p.id);
      const newParams = new URLSearchParams(window.location.search);
      if (ids.length) {
        newParams.set("partners", ids.join(","));
      } else {
        newParams.delete("partners");
      }
      const qs = newParams.toString();
      const url = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
      history.replaceState(null, "", url);
    }

    // Event listeners
    fieldset.addEventListener("change", (e) => {
      if (e.target.tagName !== "INPUT") return;
      if (e.target.checked) {
        selected.add(e.target.value);
      } else {
        selected.delete(e.target.value);
      }
      render();
    });

    selectAllBtn.addEventListener("click", () => {
      allPartners.forEach((p) => selected.add(p.id));
      render();
    });

    clearBtn.addEventListener("click", () => {
      selected.clear();
      render();
    });

    render();
  });
