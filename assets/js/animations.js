(function () {
  "use strict";
  window.NX = window.NX || {};

  function initAnimations() {
    const gsap = window.gsap,
      ST = window.ScrollTrigger;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!gsap || !ST || reduced) return;
    gsap.registerPlugin(ST);
    const once = (trigger, start = "top 88%") => ({
      trigger,
      start,
      once: true,
    });

    /* Hero entrance (waits briefly for the preloader) */
    const hero = document.querySelector("[data-hero]");
    if (hero) {
      const tl = gsap.timeline({
        delay: 0.9,
        defaults: { ease: "power3.out" },
      });
      tl.from("[data-hero] .eyebrow", { opacity: 0, y: 16, duration: 0.6 })
        .from(
          "[data-hero] h1 .line",
          { opacity: 0, y: 46, duration: 0.9, stagger: 0.15 },
          "-=.3",
        )
        .from(
          "[data-hero] .hero-sub, [data-hero] .hero-loc",
          { opacity: 0, y: 24, duration: 0.7, stagger: 0.12 },
          "-=.5",
        )
        .from(
          "[data-hero] .btn",
          {
            opacity: 0,
            y: 20,
            duration: 0.6,
            stagger: 0.1,
            clearProps: "transform,opacity",
          },
          "-=.4",
        )
        .from(".hero-canvas", { opacity: 0, duration: 1.6 }, 0.6);
    }

    /* Page hero for inner pages */
    gsap.from(".page-hero .ph-text > *", {
      opacity: 0,
      y: 24,
      duration: 0.8,
      stagger: 0.1,
      ease: "power3.out",
      delay: 0.4,
      clearProps: "transform,opacity",
    });
    gsap.from(".page-hero .ph-art", {
      opacity: 0,
      scale: 0.9,
      duration: 1.1,
      ease: "power3.out",
      delay: 0.5,
      clearProps: "transform,opacity",
    });

    /* Section headings */
    gsap.utils.toArray(".sec-head").forEach((el) => {
      gsap.from(el.children, {
        opacity: 0,
        y: 34,
        duration: 0.8,
        stagger: 0.1,
        ease: "power3.out",
        scrollTrigger: once(el),
      });
    });

    /* Generic reveals */
    gsap.utils.toArray("[data-reveal]").forEach((el) => {
      gsap.from(el, {
        opacity: 0,
        duration: 0.8,
        ease: "power2.out",
        clearProps: "opacity",
        scrollTrigger: once(el),
      });
    });
    gsap.utils.toArray("[data-stagger]").forEach((el) => {
      gsap.from(el.children, {
        opacity: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: "power2.out",
        clearProps: "opacity",
        scrollTrigger: once(el),
      });
    });

    /* Vertical timelines: progress line scrubs with scroll, items reveal one by one */
    gsap.utils.toArray(".vtl").forEach((tl) => {
      const line = tl.querySelector(".vtl-line i");
      if (line)
        gsap.fromTo(
          line,
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: "none",
            scrollTrigger: {
              trigger: tl,
              start: "top 70%",
              end: "bottom 60%",
              scrub: 0.4,
            },
          },
        );
    });

    /* 7-step journey drives the Three.js camera */
    const journey = document.querySelector(".journey");
    if (journey) {
      ST.create({
        trigger: journey,
        start: "top 60%",
        end: "bottom 70%",
        onUpdate: (self) => {
          window.__journeyProgress = self.progress;
        },
      });
    }

    /* Horizontal / step flows */
    gsap.utils.toArray(".flow").forEach((f) => {
      gsap.from(f.children, {
        opacity: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: "power2.out",
        clearProps: "opacity",
        scrollTrigger: once(f),
      });
    });

    /* Deletion particles disappearing into the "secure deletion" node */
    const del = document.querySelector(".del-scene svg");
    if (del) {
      const dots = del.querySelectorAll(".pdot");
      dots.forEach((d, i) => {
        gsap.fromTo(
          d,
          { x: 0, y: ((i % 5) - 2) * 14, opacity: 0, scale: 1 },
          {
            x: 360,
            opacity: 1,
            scale: 0.1,
            duration: 2.6,
            ease: "power1.in",
            repeat: -1,
            delay: i * 0.22,
          },
        );
      });
      gsap.to(del.querySelector(".vault"), {
        opacity: 0.65,
        duration: 1.1,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }

    /* Subtle 3D tilt on pointer devices */
    if (matchMedia("(pointer:fine)").matches) {
      document.querySelectorAll(".tilt").forEach((el) => {
        const rx = gsap.quickTo(el, "rotationX", {
          duration: 0.4,
          ease: "power2.out",
        });
        const ry = gsap.quickTo(el, "rotationY", {
          duration: 0.4,
          ease: "power2.out",
        });
        el.style.transformPerspective = 800;
        el.addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect();
          ry(((e.clientX - r.left) / r.width - 0.5) * 8);
          rx(-((e.clientY - r.top) / r.height - 0.5) * 8);
        });
        el.addEventListener("pointerleave", () => {
          rx(0);
          ry(0);
        });
      });
    }

    /* Recalculate once fonts/images settle */
    addEventListener("load", () => ST.refresh());
  }

  window.NX.initAnimations = initAnimations;
})();
