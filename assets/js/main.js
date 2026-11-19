(function () {
  "use strict";
  document.documentElement.classList.add("js");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Preloader: removed as soon as the window has loaded (max ~1.5 s, CSS also auto-hides it) */
  function hidePreloader() {
    const pl = document.getElementById("preloader");
    if (!pl) return;
    pl.classList.add("done");
    setTimeout(() => pl.remove(), 500);
  }
  const minWait = new Promise((r) => setTimeout(r, reduced ? 0 : 700));
  const loaded =
    document.readyState === "complete"
      ? Promise.resolve()
      : new Promise((r) => addEventListener("load", r, { once: true }));
  Promise.all([minWait, loaded]).then(hidePreloader);
  setTimeout(hidePreloader, 1500);

  /* Header style on scroll + back-to-top */
  function initHeader() {
    const header = document.querySelector(".site-header");
    const toTop = document.querySelector(".to-top");
    const bar = document.querySelector(".scroll-progress i");
    const onScroll = () => {
      const y = window.scrollY;
      header && header.classList.toggle("scrolled", y > 24);
      toTop && toTop.classList.toggle("show", y > 700);
      if (bar) {
        const max = document.documentElement.scrollHeight - innerHeight;
        bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      }
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    toTop &&
      toTop.addEventListener("click", () =>
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }),
      );
  }

  /* Mobile menu */
  function initMenu() {
    const btn = document.querySelector(".nav-toggle");
    const menu = document.getElementById("mobile-menu");
    if (!btn || !menu) return;
    const set = (open) => {
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menu.classList.toggle("open", open);
      document.body.classList.toggle("menu-open", open);
      menu.toggleAttribute("inert", !open);
    };
    set(false);
    btn.addEventListener("click", () =>
      set(btn.getAttribute("aria-expanded") !== "true"),
    );
    menu.addEventListener("click", (e) => {
      if (e.target.closest("a")) set(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") {
        set(false);
        btn.focus();
      }
    });
    matchMedia("(min-width:1181px)").addEventListener(
      "change",
      (e) => e.matches && set(false),
    );
  }

  /* Subtle page transition — plain navigation, no SPA router */
  function initTransitions() {
    if (reduced) return;
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (
        !a ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      if (a.target && a.target !== "_self") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !/\.html?$|\/$/.test(url.pathname))
        return;
      if (url.pathname === location.pathname && url.hash) return;
      e.preventDefault();
      document.body.classList.add("leaving");
      setTimeout(() => {
        location.href = url.href;
      }, 220);
    });
    addEventListener("pageshow", (e) => {
      if (e.persisted) document.body.classList.remove("leaving");
    });
  }

  function boot() {
    initHeader();
    initMenu();
    initTransitions();
    const NX = window.NX || {};
    if (NX.initInteractions) NX.initInteractions();
    if (NX.initAnimations) {
      try {
        NX.initAnimations();
      } catch (e) {
        console.warn("Animations unavailable", e);
      }
    }
    if (NX.initScenes) {
      try {
        NX.initScenes();
      } catch (e) {
        console.warn("3D scenes unavailable, showing static fallback.", e);
      }
    }
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
