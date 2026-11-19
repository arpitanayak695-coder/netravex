(function () {
  "use strict";
  window.NX = window.NX || {};

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* Accordions: <div class="acc"><button class="acc-btn">…</button><div class="acc-panel">…</div></div> */
  function initAccordions() {
    $$(".acc").forEach((acc, i) => {
      const btn = $(".acc-btn", acc),
        panel = $(".acc-panel", acc);
      if (!btn || !panel) return;
      const id =
        panel.id || `acc-${i}-${Math.random().toString(36).slice(2, 6)}`;
      panel.id = id;
      btn.setAttribute("aria-controls", id);
      btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("click", () => {
        const open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!open));
        panel.classList.toggle("open", !open);
      });
    });
  }

  /* Tabs (arrow-key navigation) */
  function initTabs() {
    $$("[data-tabs]").forEach((root) => {
      const tabs = $$('[role="tab"]', root),
        panels = tabs.map((t) =>
          document.getElementById(t.getAttribute("aria-controls")),
        );
      const select = (i, focus) => {
        tabs.forEach((t, k) => {
          t.setAttribute("aria-selected", String(k === i));
          t.tabIndex = k === i ? 0 : -1;
        });
        panels.forEach((p, k) => p && (p.hidden = k !== i));
        if (focus) tabs[i].focus();
      };
      tabs.forEach((t, i) => {
        t.addEventListener("click", () => select(i));
        t.addEventListener("keydown", (e) => {
          const n = tabs.length;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            select((i + 1) % n, true);
          }
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            select((i - 1 + n) % n, true);
          }
          if (e.key === "Home") {
            e.preventDefault();
            select(0, true);
          }
          if (e.key === "End") {
            e.preventDefault();
            select(n - 1, true);
          }
        });
      });
      select(
        Math.max(
          0,
          tabs.findIndex((t) => t.getAttribute("aria-selected") === "true"),
        ),
      );
    });
  }

  /* Generic "pressed buttons that fill a detail box" (roles, stages, governance loop) */
  function initDetailPickers() {
    $$("[data-picker]").forEach((root) => {
      const out = document.getElementById(root.dataset.picker); // optional separate detail box
      const btns = $$("[data-title]", root);
      const show = (b) => {
        btns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        if (out) {
          out.innerHTML =
            '<div class="notice"><strong></strong><span></span></div>';
          $("strong", out).textContent = b.dataset.title;
          $("span", out).textContent = b.dataset.text;
        }
      };
      btns.forEach((b) => b.addEventListener("click", () => show(b)));
      if (btns[0]) show(btns[0]);
    });
  }

  /* Rights example reveal */
  function initExample() {
    $$("[data-example-toggle]").forEach((btn) => {
      const panel = document.getElementById(btn.getAttribute("aria-controls"));
      btn.addEventListener("click", () => {
        const open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!open));
        panel.hidden = open;
        btn.querySelector("span").textContent = open
          ? "View example"
          : "Hide example";
      });
    });
  }

  /* Data inventory: filter by "where it may live"; mobile cards expand */
  function initInventory() {
    const chips = $$(".chip[data-place]");
    if (!chips.length) return;
    const rows = $$(".dt tbody tr");
    const apply = () => {
      const active = chips
        .filter((c) => c.getAttribute("aria-pressed") === "true")
        .map((c) => c.dataset.place);
      rows.forEach((r) => {
        const places = (r.dataset.places || "").split(" ");
        const hit = active.some((p) => places.includes(p));
        r.classList.toggle("dim", active.length > 0 && !hit);
        r.classList.toggle("hit", active.length > 0 && hit);
        $$("li[data-p]", r).forEach((li) =>
          li.classList.toggle("match", active.includes(li.dataset.p)),
        );
      });
    };
    chips.forEach((c) =>
      c.addEventListener("click", () => {
        c.setAttribute(
          "aria-pressed",
          String(c.getAttribute("aria-pressed") !== "true"),
        );
        apply();
      }),
    );
    const clear = $("[data-clear-places]");
    clear &&
      clear.addEventListener("click", () => {
        chips.forEach((c) => c.setAttribute("aria-pressed", "false"));
        apply();
      });
    $$(".row-toggle").forEach((b) =>
      b.addEventListener("click", () => {
        const tr = b.closest("tr"),
          open = tr.classList.toggle("open");
        b.setAttribute("aria-expanded", String(open));
      }),
    );
  }

  /* Checklists with progress bars */
  function initChecklists() {
    $$("[data-checklist]").forEach((root) => {
      const boxes = $$('input[type="checkbox"]', root),
        bar = $(".progress i", root),
        label = $(".progress-label", root);
      const update = () => {
        const done = boxes.filter((b) => b.checked).length;
        if (bar) bar.style.width = `${(done / boxes.length) * 100}%`;
        if (label) label.textContent = `${done} of ${boxes.length} complete`;
      };
      boxes.forEach((b) => b.addEventListener("change", update));
      update();
    });
  }

  /* Contact form */
  function initForm() {
    const form = $("#enquiry-form");
    if (!form) return;
    const status = $("#form-status"),
      btn = $('button[type="submit"]', form),
      label = $(".btn-label", btn);
    const cfg = window.NETRAVEX_CONFIG || {};
    const rules = {
      name: (v) =>
        v.length < 2 ? "Please enter your name (at least 2 characters)." : "",
      organisation: (v) => (!v ? "Please enter your organisation." : ""),
      email: (v) =>
        !v
          ? "Please enter your email address."
          : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
            ? "That email address doesn’t look right. Example: name@organisation.in"
            : "",
      phone: (v) =>
        v && !/^\+?[0-9 ()\-]{7,18}$/.test(v)
          ? "Use digits, spaces, + or - only (7–18 characters), or leave this blank."
          : "",
      message: (v) =>
        v.length < 10
          ? "Please tell us a little about your needs (at least 10 characters)."
          : "",
    };
    const check = (el) => {
      const err = rules[el.name] ? rules[el.name](el.value.trim()) : "";
      const wrap = el.closest(".field");
      wrap.classList.toggle("invalid", !!err);
      el.setAttribute("aria-invalid", String(!!err));
      $(".err", wrap).textContent = err;
      return !err;
    };
    const fields = $$("input[name], textarea[name]", form).filter(
      (el) => rules[el.name],
    );
    fields.forEach((el) => {
      el.addEventListener("blur", () => check(el));
      el.addEventListener(
        "input",
        () => el.closest(".field").classList.contains("invalid") && check(el),
      );
    });
    const show = (kind, msg) => {
      status.className = `form-status show ${kind}`;
      status.textContent = msg;
    };
    let submitting = false;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submitting) return; // prevent duplicate submission
      status.className = "form-status";
      const results = fields.map(check);
      if (results.includes(false)) {
        fields[results.indexOf(false)].focus();
        show("bad", "Please fix the highlighted fields and try again.");
        return;
      }
      if ($('[name="website"]', form).value) return; // honeypot: silently ignore bots
      submitting = true;
      btn.disabled = true;
      btn.classList.add("loading");
      label.textContent = "Sending…";
      const payload = Object.fromEntries(
        fields.map((f) => [f.name, f.value.trim()]),
      );
      try {
        await new Promise((r) => setTimeout(r, 800));
        show("ok", "Thank you! Your enquiry form has been submitted.");
        form.reset();
        fields.forEach((f) => f.closest(".field").classList.remove("invalid"));
      } catch (err) {
        show(
          "bad",
          "Sorry, we couldn’t send your enquiry just now. Please try again in a moment.",
        );
      } finally {
        submitting = false;
        btn.disabled = false;
        btn.classList.remove("loading");
        label.textContent = "Send Enquiry";
      }
    });
  }

  /* Steppers: click a step (or use Prev/Next / arrow keys) to read it; earlier steps glow as "done" */
  function initSteppers() {
    $$("[data-stepper]").forEach((root) => {
      const steps = $$(".st-step", root),
        panels = $$(".st-panel", root);
      const prev = $("[data-prev]", root),
        next = $("[data-next]", root),
        bar = $(".st-progress i", root),
        count = $(".st-count", root);
      let cur = 0;
      const go = (i, focus) => {
        cur = Math.max(0, Math.min(steps.length - 1, i));
        steps.forEach((s, k) => {
          s.setAttribute("aria-selected", String(k === cur));
          s.classList.toggle("done", k < cur);
          s.tabIndex = k === cur ? 0 : -1;
        });
        panels.forEach((p, k) => {
          p.hidden = k !== cur;
        });
        prev.disabled = cur === 0;
        next.disabled = cur === steps.length - 1;
        bar.style.width = `${((cur + 1) / steps.length) * 100}%`;
        count.textContent = `Step ${cur + 1} of ${steps.length}`;
        if (focus) steps[cur].focus();
      };
      steps.forEach((s, i) => {
        s.addEventListener("click", () => go(i));
        s.addEventListener("keydown", (e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            go(i + 1, true);
          }
          if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            go(i - 1, true);
          }
        });
      });
      prev.addEventListener("click", () => go(cur - 1));
      next.addEventListener("click", () => go(cur + 1));
      go(0);
    });
  }

  function initTimelines() {
    const items = $$(".vtl-item");
    if (!items.length) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach((i) => i.classList.add("lit"));
      return;
    }
    const enter = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("lit");
            enter.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -18% 0px", threshold: 0.15 },
    );
    const band = new IntersectionObserver(
      (es) =>
        es.forEach((e) =>
          e.target.classList.toggle("is-active", e.isIntersecting),
        ),
      { rootMargin: "-38% 0px -38% 0px", threshold: 0 },
    );
    items.forEach((i) => {
      enter.observe(i);
      band.observe(i);
    });
  }

  function initInteractions() {
    initAccordions();
    initTabs();
    initDetailPickers();
    initExample();
    initInventory();
    initChecklists();
    initForm();
    initSteppers();
    initTimelines();
  }
  window.NX.initInteractions = initInteractions;
})();
