/*
 * Motion layer: screenshot crossfades (GSAP + ScrollTrigger) and the Vanta fog
 * behind the profile. All of it is optional. Without JavaScript, with reduced
 * motion, or with the pause button pressed, every card keeps its first
 * screenshot and the hero keeps its static gradient.
 */
(() => {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduce.matches || !window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  const KEY = "dp-motion";
  const toggle = document.querySelector(".motion-toggle");
  const heroBg = document.getElementById("hero-bg");
  let paused = false;
  try { paused = localStorage.getItem(KEY) === "off"; } catch (e) { /* storage blocked: default to playing */ }

  /* Screenshot loops: each image holds, then the next fades in over it and settles. */

  const HOLD = 2.6;
  const FADE = 0.9;
  const loops = [];

  const sync = (loop) => {
    if (loop.inView && !paused && !document.hidden) loop.tl.play();
    else loop.tl.pause();
  };

  document.querySelectorAll("[data-loop]").forEach((stack, index) => {
    const imgs = Array.from(stack.querySelectorAll("img"));
    if (imgs.length < 2) return;

    gsap.set(imgs, { autoAlpha: 0, zIndex: 1 });
    gsap.set(imgs[0], { autoAlpha: 1, zIndex: 2 });

    const tl = gsap.timeline({ repeat: -1, paused: true });
    imgs.forEach((img, k) => {
      const next = imgs[(k + 1) % imgs.length];
      const at = k * (HOLD + FADE) + HOLD;
      tl.set(img, { zIndex: 1 }, at)
        .set(next, { zIndex: 2 }, at)
        .fromTo(next, { autoAlpha: 0, scale: 1.04 },
          { autoAlpha: 1, scale: 1, duration: FADE, ease: "power2.out", immediateRender: false }, at)
        .set(img, { autoAlpha: 0 }, at + FADE);
    });
    // Shorten the first hold a little per card so neighbours don't switch in step.
    tl.time((index % 3) * 0.8);

    const loop = { tl, inView: false };
    loops.push(loop);

    ScrollTrigger.create({
      trigger: stack,
      start: "top bottom",
      end: "bottom top",
      onToggle: (self) => { loop.inView = self.isActive; sync(loop); },
    });

    const card = stack.closest("a, article");
    if (card && window.matchMedia("(hover: hover)").matches) {
      card.addEventListener("pointerenter", () => { if (!paused) tl.restart(); });
    }
  });

  /* Vanta fog: loaded after the page is up, never on Save-Data or without WebGL. */

  let vanta = null;
  let loading = null;
  let heroVisible = true;

  const load = (src) => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  const webgl = () => {
    try {
      const canvas = document.createElement("canvas");
      return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch (e) {
      return false;
    }
  };

  const syncVanta = () => {
    if (!vanta) return;
    window.cancelAnimationFrame(vanta.req);
    if (!paused && heroVisible && !document.hidden) vanta.animationLoop();
  };

  const startVanta = () => {
    if (vanta || loading || !heroBg || paused) return;
    const connection = navigator.connection;
    if ((connection && connection.saveData) || !webgl()) return;
    loading = load("vendor/three.r134.min.js")
      .then(() => load("vendor/vanta.fog.min.js"))
      .then(() => {
        if (!window.VANTA || !window.VANTA.FOG) return;
        const dpr = window.devicePixelRatio || 1;
        vanta = window.VANTA.FOG({
          el: heroBg,
          THREE: window.THREE,
          mouseControls: false,
          touchControls: false,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          scale: dpr,              // render at 1x: the fog is soft anyway
          scaleMobile: dpr / 0.75, // and a little lower on phones
          highlightColor: 0xffffff,
          midtoneColor: 0xe3d0ae,
          lowlightColor: 0xb2c3df,
          baseColor: 0xfaf8f3,
          blurFactor: 0.56,
          speed: 1.1,
          zoom: 0.7,
        });
        requestAnimationFrame(() => requestAnimationFrame(() => heroBg.classList.add("is-live")));
        syncVanta();
      })
      .catch(() => { /* keep the static gradient */ })
      .finally(() => { loading = null; });
  };

  ScrollTrigger.create({
    trigger: ".hero",
    start: "top bottom",
    end: "bottom top",
    onToggle: (self) => { heroVisible = self.isActive; syncVanta(); },
  });

  const kick = () => {
    const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 250));
    idle(startVanta, { timeout: 2000 });
  };
  if (document.readyState === "complete") kick();
  else window.addEventListener("load", kick, { once: true });

  /* Pause control (WCAG 2.2.2): one button stops every loop and the fog. */

  const render = () => {
    toggle.dataset.paused = String(paused);
    const label = paused ? "Play motion" : "Pause motion";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  };

  const apply = () => {
    loops.forEach(sync);
    if (paused) syncVanta();
    else if (vanta) syncVanta();
    else startVanta();
  };

  if (toggle) {
    toggle.hidden = false;
    render();
    toggle.addEventListener("click", () => {
      paused = !paused;
      try { localStorage.setItem(KEY, paused ? "off" : "on"); } catch (e) { /* not persisted */ }
      render();
      apply();
    });
  }

  document.addEventListener("visibilitychange", apply);
  reduce.addEventListener("change", (event) => {
    if (!event.matches) return;
    paused = true;
    if (toggle) render();
    apply();
  });
})();
