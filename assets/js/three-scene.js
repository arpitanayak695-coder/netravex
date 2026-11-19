(function () {
  "use strict";
  window.NX = window.NX || {};
  if (typeof THREE === "undefined") return; // CDN unavailable: static fallbacks stay visible
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(pointer: fine)").matches;
  const lowEnd =
    innerWidth < 768 ||
    (navigator.hardwareConcurrency || 8) <= 4 ||
    (navigator.deviceMemory || 8) <= 2;
  const Q = {
    particles: lowEnd ? 140 : 480,
    nodes: lowEnd ? 16 : 34,
    dpr: Math.min(window.devicePixelRatio || 1, lowEnd ? 1.25 : 1.75),
  };
  const CYAN = 0x19d8ff,
    BLUE = 0x1a8cff,
    TEAL = 0x19c8b5;
  const LEGACY = parseInt(THREE.REVISION, 10) < 155; // old (r149) lights use much smaller intensities

  function webglAvailable() {
    try {
      const c = document.createElement("canvas");
      return !!(
        window.WebGLRenderingContext &&
        (c.getContext("webgl2") || c.getContext("webgl"))
      );
    } catch (e) {
      return false;
    }
  }

  /* ---------- shared manager ---------- */
  const scenes = [];
  let raf = 0,
    last = 0;
  const pointer = { x: 0, y: 0 };

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    let any = false;
    for (const s of scenes) {
      if (!s.visible) continue;
      any = true;
      s.api.update(now / 1000, dt, s);
      s.renderer.render(s.scene, s.camera);
    }
    if (!any) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  function wake() {
    if (reduced || raf || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  let glowTex;
  function glowTexture() {
    if (glowTex) return glowTex;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d"),
      grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.25, "rgba(120,230,255,.8)");
    grd.addColorStop(1, "rgba(25,216,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
    return glowTex;
  }

  /* ---------- builders ---------- */
  const lineMat = (color, opacity = 0.9) =>
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

  function shieldShape() {
    const s = new THREE.Shape();
    s.moveTo(0, 1.2);
    s.bezierCurveTo(0.3, 1.0, 0.65, 0.9, 1.0, 0.9);
    s.lineTo(1.0, 0.15);
    s.bezierCurveTo(1.0, -0.5, 0.5, -1.0, 0, -1.35);
    s.bezierCurveTo(-0.5, -1.0, -1.0, -0.5, -1.0, 0.15);
    s.lineTo(-1.0, 0.9);
    s.bezierCurveTo(-0.65, 0.9, -0.3, 1.0, 0, 1.2);
    return s;
  }

  function buildShield() {
    const g = new THREE.Group();
    const shape = shieldShape();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.06,
      bevelSegments: 3,
      curveSegments: 24,
    });
    geo.center();
    g.add(
      new THREE.Mesh(
        geo,
        new THREE.MeshPhysicalMaterial({
          color: 0x0b5f94,
          emissive: 0x06406a,
          emissiveIntensity: 0.7,
          transparent: true,
          opacity: 0.2,
          roughness: 0.15,
          metalness: 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    g.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 28),
        lineMat(CYAN, 0.95),
      ),
    );
    const inner = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(shape.getPoints(64)),
      lineMat(BLUE, 0.7),
    );
    inner.scale.setScalar(0.78);
    inner.position.set(0, -0.02, 0.2);
    g.add(inner);
    const inner2 = inner.clone();
    inner2.position.z = -0.2;
    g.add(inner2);
    return g;
  }

  function buildLock() {
    const g = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(0.62, 0.5, 0.2);
    g.add(
      new THREE.Mesh(
        bodyGeo,
        new THREE.MeshStandardMaterial({
          color: 0x0a7f9c,
          emissive: TEAL,
          emissiveIntensity: 0.45,
          transparent: true,
          opacity: 0.55,
        }),
      ),
    );
    g.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(bodyGeo),
        lineMat(0x9bf3ff, 1),
      ),
    );
    const sh = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.035, 12, 32, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x9bf3ff }),
    );
    sh.position.y = 0.25;
    g.add(sh);
    const key = new THREE.Mesh(
      new THREE.CircleGeometry(0.055, 20),
      new THREE.MeshBasicMaterial({ color: 0x03101f }),
    );
    key.position.set(0, 0.03, 0.105);
    g.add(key);
    const slot = new THREE.Mesh(
      new THREE.PlaneGeometry(0.03, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x03101f }),
    );
    slot.position.set(0, -0.06, 0.105);
    g.add(slot);
    return g;
  }

  function makeParticles(count, rMin, rMax, size, color) {
    const pos = new Float32Array(count * 3),
      seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = rMin + Math.random() * (rMax - rMin),
        th = Math.random() * Math.PI * 2,
        ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 1.1;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      seed[i] = Math.random() * 6.28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size,
        map: glowTexture(),
        color,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    pts.userData = { base: pos.slice(), seed };
    return pts;
  }
  function driftParticles(p, t, amp = 0.08) {
    const a = p.geometry.attributes.position.array,
      b = p.userData.base,
      s = p.userData.seed;
    for (let i = 0; i < s.length; i++) {
      a[i * 3] = b[i * 3] + Math.sin(t * 0.4 + s[i]) * amp;
      a[i * 3 + 1] = b[i * 3 + 1] + Math.cos(t * 0.5 + s[i]) * amp;
    }
    p.geometry.attributes.position.needsUpdate = true;
  }

  /* nodes on a shell + links between near neighbours + travelling packets */
  function makeNetwork(count, rMin, rMax, linkDist, color, packetCount) {
    const g = new THREE.Group(),
      pts = [];
    for (let i = 0; i < count; i++) {
      const r = rMin + Math.random() * (rMax - rMin),
        th = Math.random() * Math.PI * 2,
        ph = Math.acos(2 * Math.random() - 1);
      pts.push(
        new THREE.Vector3(
          r * Math.sin(ph) * Math.cos(th),
          r * Math.cos(ph) * 1.05,
          r * Math.sin(ph) * Math.sin(th),
        ),
      );
    }
    const nodeGeo = new THREE.BufferGeometry().setFromPoints(pts);
    g.add(
      new THREE.Points(
        nodeGeo,
        new THREE.PointsMaterial({
          size: 0.32,
          map: glowTexture(),
          color: 0xaef0ff,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
    const seg = [],
      edges = [];
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++) {
        if (pts[i].distanceTo(pts[j]) < linkDist) {
          seg.push(pts[i], pts[j]);
          edges.push([i, j]);
        }
      }
    g.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(seg),
        lineMat(color, 0.22),
      ),
    );
    const packets = [];
    const pk = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(
        new Array(packetCount).fill(0).map(() => new THREE.Vector3()),
      ),
      new THREE.PointsMaterial({
        size: 0.22,
        map: glowTexture(),
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    for (let i = 0; i < packetCount && edges.length; i++)
      packets.push({
        e: edges[(Math.random() * edges.length) | 0],
        t: Math.random(),
        v: 0.2 + Math.random() * 0.3,
      });
    g.add(pk);
    g.userData.tick = (dt) => {
      const arr = pk.geometry.attributes.position.array;
      packets.forEach((p, i) => {
        p.t += dt * p.v;
        if (p.t > 1) {
          p.t = 0;
          p.e = edges[(Math.random() * edges.length) | 0];
        }
        const a = pts[p.e[0]],
          b = pts[p.e[1]];
        arr[i * 3] = a.x + (b.x - a.x) * p.t;
        arr[i * 3 + 1] = a.y + (b.y - a.y) * p.t;
        arr[i * 3 + 2] = a.z + (b.z - a.z) * p.t;
      });
      pk.geometry.attributes.position.needsUpdate = true;
    };
    return g;
  }

  /* particles / network spread through a unit box [-1,1]x[-1,1]x[-.5,.5] (scaled to the viewport by the caller) */
  function makeBoxParticles(count, size, color) {
    const pos = new Float32Array(count * 3),
      seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * 2 - 1;
      pos[i * 3 + 1] = Math.random() * 2 - 1;
      pos[i * 3 + 2] = Math.random() - 0.5;
      seed[i] = Math.random() * 6.28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size,
        map: glowTexture(),
        color,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    pts.userData = { base: pos.slice(), seed };
    return pts;
  }
  function makeNetworkBox(cols, rows, color, packetCount) {
    /* One connected, evenly spread mesh covering the whole hero: grid nodes (jittered) joined to their right/down/diagonal neighbours. Kept faint on purpose. */
    const g = new THREE.Group(),
      pts = [],
      edges = [],
      idx = (c, r) => r * cols + c;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x =
          -1.08 +
          (c + 0.5) * (2.16 / cols) +
          (Math.random() - 0.5) * (1.2 / cols);
        const y =
          -1.08 +
          (r + 0.5) * (2.16 / rows) +
          (Math.random() - 0.5) * (1.2 / rows);
        pts.push(new THREE.Vector3(x, y, Math.random() - 0.5));
      }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (c + 1 < cols) edges.push([idx(c, r), idx(c + 1, r)]);
        if (r + 1 < rows) edges.push([idx(c, r), idx(c, r + 1)]);
        if (c + 1 < cols && r + 1 < rows && Math.random() < 0.45)
          edges.push(
            Math.random() < 0.5
              ? [idx(c, r), idx(c + 1, r + 1)]
              : [idx(c + 1, r), idx(c, r + 1)],
          );
      }
    g.add(
      new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.PointsMaterial({
          size: 0.2,
          map: glowTexture(),
          color: 0xaef0ff,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
    const seg = [];
    edges.forEach((e) => seg.push(pts[e[0]], pts[e[1]]));
    g.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(seg),
        lineMat(color, 0.09),
      ),
    );
    const pk = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(
        new Array(packetCount).fill(0).map(() => new THREE.Vector3()),
      ),
      new THREE.PointsMaterial({
        size: 0.2,
        map: glowTexture(),
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const packets = [];
    for (let i = 0; i < packetCount; i++)
      packets.push({
        e: edges[(Math.random() * edges.length) | 0],
        t: Math.random(),
        v: 0.15 + Math.random() * 0.25,
      });
    g.add(pk);
    g.userData.tick = (dt) => {
      const arr = pk.geometry.attributes.position.array;
      packets.forEach((p, i) => {
        p.t += dt * p.v;
        if (p.t > 1) {
          p.t = 0;
          p.e = edges[(Math.random() * edges.length) | 0];
        }
        const a = pts[p.e[0]],
          b = pts[p.e[1]];
        arr[i * 3] = a.x + (b.x - a.x) * p.t;
        arr[i * 3 + 1] = a.y + (b.y - a.y) * p.t;
        arr[i * 3 + 2] = a.z + (b.z - a.z) * p.t;
      });
      pk.geometry.attributes.position.needsUpdate = true;
    };
    return g;
  }
  function addLights(scene) {
    scene.add(new THREE.AmbientLight(0x6aa8ff, 0.8));
    const l1 = new THREE.PointLight(CYAN, LEGACY ? 1.1 : 60, 0, 2);
    l1.position.set(3, 2, 4);
    scene.add(l1);
    const l2 = new THREE.PointLight(BLUE, LEGACY ? 0.8 : 40, 0, 2);
    l2.position.set(-3, -2, 3);
    scene.add(l2);
    return [l1, l2];
  }
  function sphereNode(r, color) {
    const g = new THREE.Group();
    g.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(r, 20, 20),
        new THREE.MeshBasicMaterial({ color }),
      ),
    );
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: CYAN,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.scale.setScalar(r * 7);
    g.add(halo);
    g.userData.halo = halo;
    return g;
  }

  /* ---------- decorative page-hero scenes (one variant per page) ---------- */
  function wire(geo, color, op) {
    return new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      lineMat(color || CYAN, op || 0.5),
    );
  }
  function ringMesh(r, color, op) {
    return new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.008, 8, 140),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op }),
    );
  }
  const V = {
    about(g, anim) {
      g.add(wire(new THREE.IcosahedronGeometry(1.5, 1), CYAN, 0.55));
      g.add(sphereNode(0.18, 0xffffff));
      const r1 = ringMesh(2.4, CYAN, 0.45);
      r1.rotation.x = 1.2;
      g.add(r1);
      const r2 = ringMesh(3.1, BLUE, 0.4);
      r2.rotation.set(0.4, 0.6, 0);
      g.add(r2);
      const sats = [0, 1, 2].map(() => {
        const n = sphereNode(0.12, 0xffffff);
        g.add(n);
        return n;
      });
      anim.push((t) =>
        sats.forEach((n, i) => {
          const a = t * 0.6 + i * 2.09,
            r = i % 2 ? 3.1 : 2.4;
          n.position
            .set(Math.cos(a) * r, 0, Math.sin(a) * r)
            .applyEuler(i % 2 ? r2.rotation : r1.rotation);
        }),
      );
    },
    dpdp(g, anim) {
      const boxes = [2, 0, -2].map((y, i) => {
        const b = new THREE.Group();
        b.position.y = y;
        b.add(
          wire(
            new THREE.BoxGeometry(1.1, 1.1, 1.1),
            i === 1 ? CYAN : BLUE,
            0.75,
          ),
        );
        b.add(sphereNode(0.2, 0xffffff));
        g.add(b);
        return b;
      });
      g.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 1.45, 0),
            new THREE.Vector3(0, 0.55, 0),
            new THREE.Vector3(0, -0.55, 0),
            new THREE.Vector3(0, -1.45, 0),
          ]),
          lineMat(CYAN, 0.8),
        ),
      );
      const ring = ringMesh(2.7, BLUE, 0.35);
      ring.rotation.x = 1.45;
      g.add(ring);
      const pk = sphereNode(0.1, 0xffffff);
      g.add(pk);
      anim.push((t) => {
        boxes.forEach((b, i) => {
          b.rotation.y = t * 0.4 + i;
        });
        pk.position.y = 2 - ((t * 0.5) % 1) * 4;
        ring.rotation.z = t * 0.1;
      });
    },
    readiness(g, anim) {
      const k = wire(new THREE.TorusKnotGeometry(1.5, 0.38, 90, 10), CYAN, 0.5);
      g.add(k);
      g.add(sphereNode(0.2, 0xffffff));
      const r = ringMesh(2.9, BLUE, 0.35);
      r.rotation.x = 1.1;
      g.add(r);
      const orb = sphereNode(0.1, 0xffffff);
      g.add(orb);
      anim.push((t) => {
        k.rotation.x = t * 0.2;
        k.rotation.y = t * 0.15;
        const a = t * 0.9;
        orb.position.set(
          Math.cos(a) * 2.9,
          Math.sin(a) * 2.9 * Math.cos(1.1),
          Math.sin(a) * 2.9 * Math.sin(1.1),
        );
      });
    },
    security(g, anim) {
      const cubes = [
        [2.1, 0.9, -0.5, 0.7],
        [-2, -0.8, 0.4, 0.8],
        [1.2, -1.8, 0.6, 0.55],
        [-1.4, 1.7, -0.3, 0.6],
      ].map(([x, y, z, s], i) => {
        const c = new THREE.Group();
        c.position.set(x, y, z);
        c.add(wire(new THREE.BoxGeometry(s, s, s), i % 2 ? TEAL : CYAN, 0.85));
        c.add(
          new THREE.Mesh(
            new THREE.BoxGeometry(s * 0.5, s * 0.5, s * 0.5),
            new THREE.MeshBasicMaterial({
              color: CYAN,
              transparent: true,
              opacity: 0.22,
            }),
          ),
        );
        g.add(c);
        return c;
      });
      const big = wire(new THREE.BoxGeometry(1.5, 1.5, 1.5), CYAN, 0.8);
      g.add(big);
      const lock = buildLock();
      lock.scale.setScalar(0.8);
      g.add(lock);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(4 * 6), 3),
      );
      g.add(new THREE.LineSegments(lg, lineMat(CYAN, 0.35)));
      anim.push((t) => {
        big.rotation.set(t * 0.3, t * 0.4, 0);
        const arr = lg.attributes.position.array;
        cubes.forEach((c, i) => {
          c.rotation.set(t * (0.3 + i * 0.1), t * 0.5, 0);
          arr.set([0, 0, 0, c.position.x, c.position.y, c.position.z], i * 6);
        });
        lg.attributes.position.needsUpdate = true;
      });
    },
    rights(g, anim) {
      g.add(wire(new THREE.OctahedronGeometry(2, 0), CYAN, 0.6));
      g.add(sphereNode(0.22, 0xffffff));
      const verts = [
          [2, 0, 0],
          [-2, 0, 0],
          [0, 2, 0],
          [0, -2, 0],
          [0, 0, 2],
          [0, 0, -2],
        ],
        seg = [];
      const nodes = verts.map((v) => {
        const n = sphereNode(0.14, 0xffffff);
        n.position.set(v[0], v[1], v[2]);
        g.add(n);
        seg.push(new THREE.Vector3(), new THREE.Vector3(v[0], v[1], v[2]));
        return n;
      });
      g.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(seg),
          lineMat(CYAN, 0.35),
        ),
      );
      anim.push((t) => {
        g.rotation.x = t * 0.12;
        nodes.forEach((n, i) => {
          n.userData.halo.material.opacity = 0.5 + 0.5 * Math.sin(t * 1.5 + i);
        });
      });
    },
    response(g, anim) {
      g.rotation.x = -1;
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6, 0),
        new THREE.MeshBasicMaterial({ color: 0xff6b6b, wireframe: true }),
      );
      g.add(core);
      const rings = [0, 1, 2].map(() => {
        const r = ringMesh(1, 0xff6b6b, 0.5);
        g.add(r);
        return r;
      });
      g.add(ringMesh(3.2, CYAN, 0.35));
      const sweep = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(),
          new THREE.Vector3(3.2, 0, 0),
        ]),
        lineMat(CYAN, 0.9),
      );
      g.add(sweep);
      g.userData.speed = 0;
      anim.push((t) => {
        core.rotation.y = t;
        core.rotation.x = t * 0.6;
        rings.forEach((r, i) => {
          const p = (t * 0.4 + i / 3) % 1;
          r.scale.setScalar(0.5 + p * 3);
          r.material.opacity = 0.55 * (1 - p);
        });
        sweep.rotation.z = -t * 1.2;
      });
    },
    roadmap(g, anim) {
      const pts = [
        [-3, -2, 0],
        [-1, -0.7, 0.6],
        [1, 0.7, -0.4],
        [3, 2, 0.3],
      ].map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      const curve = new THREE.CatmullRomCurve3(pts);
      g.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 80, 0.03, 6, false),
          new THREE.MeshBasicMaterial({
            color: CYAN,
            transparent: true,
            opacity: 0.5,
          }),
        ),
      );
      const nodes = pts.map((p) => {
        const n = new THREE.Group();
        n.position.copy(p);
        const s = sphereNode(0.16, 0xffffff);
        n.add(s);
        const dg = new THREE.CylinderGeometry(0.55, 0.55, 0.05, 32),
          d = new THREE.Mesh(
            dg,
            new THREE.MeshBasicMaterial({
              color: 0x0a6aa0,
              transparent: true,
              opacity: 0.45,
            }),
          );
        d.position.y = -0.3;
        n.add(d);
        const e = new THREE.LineSegments(
          new THREE.EdgesGeometry(dg),
          lineMat(CYAN, 0.8),
        );
        e.position.y = -0.3;
        n.add(e);
        g.add(n);
        return s;
      });
      const pk = sphereNode(0.1, 0xffffff);
      g.add(pk);
      g.rotation.x = 0.25;
      g.userData.speed = 0.06;
      anim.push((t) => {
        const u = (t * 0.1) % 1;
        pk.position.copy(curve.getPoint(u));
        nodes.forEach((s, i) =>
          s.scale.setScalar(1 + (Math.abs(u * 3 - i) < 0.4 ? 0.8 : 0)),
        );
      });
    },
    contact(g, anim) {
      g.add(wire(new THREE.SphereGeometry(2, 18, 12), CYAN, 0.35));
      const P = [];
      for (let i = 0; i < 8; i++) {
        const y = 1 - (i / 7) * 2,
          r = Math.sqrt(1 - y * y),
          a = i * 2.4;
        P.push(
          new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(
            2,
          ),
        );
      }
      const arcs = [];
      P.forEach((p, i) => {
        const n = sphereNode(0.1, 0xffffff);
        n.position.copy(p);
        g.add(n);
        const q = P[(i + 3) % 8],
          mid = p.clone().add(q).multiplyScalar(0.5).multiplyScalar(1.6),
          c = new THREE.QuadraticBezierCurve3(p, mid, q);
        g.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(c.getPoints(40)),
            lineMat(CYAN, 0.45),
          ),
        );
        arcs.push(c);
      });
      const pk = arcs.slice(0, 4).map(() => {
        const n = sphereNode(0.07, 0xffffff);
        g.add(n);
        return n;
      });
      anim.push((t) =>
        pk.forEach((n, i) =>
          n.position.copy(arcs[i].getPoint((t * 0.2 + i * 0.25) % 1)),
        ),
      );
    },
  };

  /* ---------- scene definitions ---------- */
  const defs = {
    hero(ctx) {
      /* Full-section scene: the shield sits on the .scene-wrap column (right on desktop,
       above the text on mobile); particles + network fill the WHOLE hero. */
      const FOV = 42,
        CAMZ = 9;
      ctx.camera.position.set(0, 0, CAMZ);
      const lights = addLights(ctx.scene);
      const core = new THREE.Group();
      ctx.scene.add(core);
      const spin = new THREE.Group();
      core.add(spin);
      spin.add(buildShield());
      const lock = buildLock();
      lock.position.set(0, -0.05, 0.05);
      spin.add(lock);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.7, 0.008, 8, 120),
        new THREE.MeshBasicMaterial({
          color: CYAN,
          transparent: true,
          opacity: 0.45,
        }),
      );
      ring.rotation.x = Math.PI / 2.4;
      core.add(ring);
      const field = new THREE.Group();
      ctx.scene.add(field);
      const dust = makeBoxParticles(Q.particles, 0.07, 0x8fe9ff);
      field.add(dust);
      const net = makeNetworkBox(
        lowEnd ? 6 : 10,
        lowEnd ? 4 : 6,
        CYAN,
        lowEnd ? 5 : 12,
      );
      field.add(net);
      const wrap = ctx.host.querySelector(".scene-wrap");
      ctx.onResize = (w, h) => {
        const visH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAMZ,
          ppu = h / visH;
        field.scale.set(((visH * (w / h)) / 2) * 1.08, (visH / 2) * 1.08, 3);
        const wr = wrap && wrap.getBoundingClientRect(),
          hr = ctx.host.getBoundingClientRect();
        if (wr && wr.width) {
          core.position.set(
            (wr.left - hr.left + wr.width / 2 - w / 2) / ppu,
            -(wr.top - hr.top + wr.height / 2 - h / 2) / ppu,
            0,
          );
          core.scale.setScalar(
            (Math.min(wr.width, wr.height) * 0.95) / ppu / 3.5,
          );
        }
      };
      let px = 0,
        py = 0,
        hover = false,
        hs = 1,
        base = 1;
      if (wrap) {
        wrap.addEventListener("pointerenter", () => {
          hover = true;
        });
        wrap.addEventListener("pointerleave", () => {
          hover = false;
        });
      }
      const baseResize = ctx.onResize;
      ctx.onResize = (w, h) => {
        baseResize(w, h);
        base = core.scale.x;
      };
      return {
        update(t, dt) {
          px += ((finePointer ? pointer.x : 0) - px) * 0.05;
          py += ((finePointer ? pointer.y : 0) - py) * 0.05;
          spin.rotation.y += dt * (hover ? 0.95 : 0.5); // always turning, slowly; a little faster on hover
          spin.rotation.x = -py * 0.15;
          spin.position.y = Math.sin(t * 0.8) * 0.08;
          hs += ((hover ? 1.07 : 1) - hs) * 0.08;
          core.scale.setScalar(base * hs);
          lights[0].intensity = (LEGACY ? 1.1 : 60) * (hover ? 1.6 : 1);
          ring.rotation.z = t * 0.12;
          field.rotation.y = px * 0.06;
          field.rotation.x = -py * 0.04;
          lights[0].position.set(
            Math.cos(t * 0.6) * 4,
            2,
            Math.sin(t * 0.6) * 4 + 2,
          );
          driftParticles(dust, t, 0.02);
          net.userData.tick(dt);
        },
      };
    },

    page(ctx) {
      const FOV = 42,
        CAMZ = 9,
        variant = ctx.canvas.dataset.variant || "about";
      ctx.camera.position.set(0, 0, CAMZ);
      addLights(ctx.scene);
      const root = new THREE.Group();
      ctx.scene.add(root);
      const spin = new THREE.Group();
      root.add(spin);
      const anim = [];
      (V[variant] || V.about)(spin, anim);
      const field = makeBoxParticles(lowEnd ? 50 : 130, 0.06, 0x8fe9ff);
      ctx.scene.add(field);
      ctx.onResize = (w, h) => {
        const visH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAMZ,
          visW = (visH * w) / h,
          wide = w >= 900;
        field.scale.set((visW / 2) * 1.05, (visH / 2) * 1.05, 3);
        root.position.set(wide ? visW * 0.2 : 0, 0, 0);
        root.scale.setScalar(
          wide ? Math.min(1.1, h / 400) : Math.min(0.8, w / 480),
        );
      };
      let px = 0,
        py = 0;
      return {
        update(t, dt) {
          px += ((finePointer ? pointer.x : 0) - px) * 0.05;
          py += ((finePointer ? pointer.y : 0) - py) * 0.05;
          const sp = spin.userData.speed;
          spin.rotation.y += dt * (sp === undefined ? 0.15 : sp);
          root.rotation.y = px * 0.25;
          root.rotation.x = -py * 0.12;
          anim.forEach((f) => f(t, dt));
          driftParticles(field, t, 0.02);
        },
      };
    },

    journey(ctx) {
      /* Calm geodesic sphere (right side, behind the timeline). The 7 journey nodes light up
       and a route extends across the sphere as the reader scrolls through the steps. */
      const FOV = 42,
        CAMZ = 9;
      ctx.camera.position.set(0, 0, CAMZ);
      addLights(ctx.scene);
      const root = new THREE.Group();
      ctx.scene.add(root);
      const ico = new THREE.IcosahedronGeometry(2.4, 2);
      root.add(
        new THREE.LineSegments(
          new THREE.WireframeGeometry(ico),
          lineMat(CYAN, 0.22),
        ),
      );
      root.add(
        new THREE.Mesh(
          new THREE.IcosahedronGeometry(2.36, 2),
          new THREE.MeshBasicMaterial({
            color: 0x06304f,
            transparent: true,
            opacity: 0.4,
          }),
        ),
      );
      const nodes = [],
        routePts = [];
      for (let i = 0; i < 7; i++) {
        const y = 1 - (i / 6) * 2,
          r = Math.sqrt(1 - y * y),
          a = i * 2.4;
        const p = new THREE.Vector3(
          Math.cos(a) * r,
          y,
          Math.sin(a) * r,
        ).multiplyScalar(2.45);
        const n = sphereNode(0.09, 0xffffff);
        n.position.copy(p);
        root.add(n);
        nodes.push(n);
        routePts.push(p);
      }
      const route = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(routePts),
        lineMat(0x9bf3ff, 1),
      );
      root.add(route);
      const r1 = new THREE.Mesh(
        new THREE.TorusGeometry(3.2, 0.008, 8, 140),
        new THREE.MeshBasicMaterial({
          color: CYAN,
          transparent: true,
          opacity: 0.4,
        }),
      );
      r1.rotation.x = 1.2;
      ctx.scene.add(r1);
      const r2 = new THREE.Mesh(
        new THREE.TorusGeometry(3.8, 0.006, 8, 140),
        new THREE.MeshBasicMaterial({
          color: BLUE,
          transparent: true,
          opacity: 0.35,
        }),
      );
      r2.rotation.set(0.5, 0.4, 0);
      ctx.scene.add(r2);
      const dust = makeParticles(lowEnd ? 60 : 180, 3, 6.5, 0.07, 0x8fe9ff);
      ctx.scene.add(dust);
      ctx.onResize = (w, h) => {
        const visW =
          2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAMZ * (w / h);
        const x = w > 1100 ? visW * 0.27 : 0;
        [root, r1, r2, dust].forEach((o) => (o.position.x = x));
      };
      let prog = 0;
      return {
        update(t) {
          prog += ((window.__journeyProgress || 0) - prog) * 0.06;
          const idx = Math.round(prog * 6);
          root.rotation.y = t * 0.08 + prog * 2.4;
          root.rotation.x = 0.25;
          r1.rotation.z = t * 0.1;
          r2.rotation.z = -t * 0.07;
          nodes.forEach((n, i) => {
            n.scale.setScalar(i === idx ? 2 : i < idx ? 1.2 : 0.8);
            n.userData.halo.material.opacity = i <= idx ? 1 : 0.25;
          });
          route.geometry.setDrawRange(0, Math.max(1, idx + 1));
          driftParticles(dust, t);
        },
      };
    },

    security(ctx) {
      /* Light stage. Big glossy shield + lock in the middle; the six core controls orbit as LABELLED blue/teal pins,
       the three advanced practices as LABELLED amber pins on an outer ring. Hover an item in the control map
       (or the scene) to spotlight it. Drag to rotate, click for a pulse. */
      const CAMZ = 9.5;
      ctx.camera.position.set(0, 0.3, CAMZ);
      ctx.scene.add(new THREE.AmbientLight(0xffffff, LEGACY ? 0.9 : 1.5));
      const key = new THREE.DirectionalLight(0xffffff, LEGACY ? 1.1 : 2.2);
      key.position.set(3, 5, 6);
      ctx.scene.add(key);
      const fill = new THREE.PointLight(0x4aa8ff, LEGACY ? 0.7 : 30, 0, 2);
      fill.position.set(-4, -1, 4);
      ctx.scene.add(fill);
      const root = new THREE.Group();
      ctx.scene.add(root);
      const hero = new THREE.Group();
      root.add(hero);

      const shape = shieldShape();
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.3,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.08,
        bevelSegments: 4,
        curveSegments: 28,
      });
      geo.center();
      hero.add(
        new THREE.Mesh(
          geo,
          new THREE.MeshPhysicalMaterial({
            color: 0x0e5bb5,
            metalness: 0.3,
            roughness: 0.3,
            clearcoat: 1,
            clearcoatRoughness: 0.15,
          }),
        ),
      );
      hero.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, 28),
          new THREE.LineBasicMaterial({ color: 0x9be8ff }),
        ),
      );
      const panelGeo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.06,
        bevelEnabled: false,
        curveSegments: 28,
      });
      panelGeo.center();
      const white = new THREE.MeshStandardMaterial({
        color: 0xf5f9ff,
        metalness: 0.1,
        roughness: 0.35,
      });
      const dark = new THREE.MeshBasicMaterial({ color: 0x0b3a6e });
      [1, -1].forEach((sd) => {
        const panel = new THREE.Mesh(
          panelGeo,
          new THREE.MeshStandardMaterial({
            color: 0x1f8fe8,
            metalness: 0.2,
            roughness: 0.4,
          }),
        );
        panel.scale.setScalar(0.78);
        panel.position.z = sd * 0.245;
        hero.add(panel);
        const lock = new THREE.Group();
        lock.add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.16), white));
        const sh = new THREE.Mesh(
          new THREE.TorusGeometry(0.19, 0.045, 12, 32, Math.PI),
          white,
        );
        sh.position.y = 0.25;
        lock.add(sh);
        const kh = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20), dark);
        kh.position.set(0, 0.03, 0.085);
        lock.add(kh);
        const ks = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.12), dark);
        ks.position.set(0, -0.06, 0.085);
        lock.add(ks);
        lock.position.set(0, -0.05, sd * 0.37);
        if (sd < 0) lock.rotation.y = Math.PI;
        hero.add(lock);
      });
      const BASE = 1.55;
      hero.scale.setScalar(BASE);

      const mkOrbit = (r, tilt, color, op) => {
        const m = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.012, 8, 160),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: op,
          }),
        );
        m.rotation.x = Math.PI / 2 - tilt;
        root.add(m);
        return m;
      };
      const orbit1 = mkOrbit(3.0, 0.3, 0x1a8cff, 0.35),
        orbit2 = mkOrbit(4.0, -0.25, 0xffb84d, 0.4);

      /* canvas-drawn name tags (sprites always face the camera) */
      const tag = (text, css) => {
        const c = document.createElement("canvas");
        c.width = 360;
        c.height = 90;
        const g = c.getContext("2d");
        const x = 6,
          y = 8,
          w = 348,
          h = 70,
          r = 35;
        g.shadowColor = "rgba(10,50,110,.28)";
        g.shadowBlur = 10;
        g.shadowOffsetY = 3;
        g.fillStyle = "rgba(255,255,255,.98)";
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
        g.fill();
        g.shadowColor = "transparent";
        g.fillStyle = css;
        g.beginPath();
        g.arc(x + 34, y + h / 2, 11, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#0b2a4f";
        g.font = '600 30px Saira, "Segoe UI", sans-serif';
        g.textBaseline = "middle";
        g.fillText(text, x + 56, y + h / 2 + 1);
        return new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(c),
            transparent: true,
          }),
        );
      };
      const defs2 = [
        ["Encryption", "#1a8cff", 0x1a8cff, 3.0, 0.3, 0.42],
        ["Masking", "#19b8d8", 0x19b8d8, 3.0, 0.3, 0.42],
        ["Access control", "#19c8b5", 0x19c8b5, 3.0, 0.3, 0.42],
        ["Activity logs", "#4aa8ff", 0x4aa8ff, 3.0, 0.3, 0.42],
        ["Backups", "#1a8cff", 0x1a8cff, 3.0, 0.3, 0.42],
        ["Vendor safeguards", "#19b8d8", 0x19b8d8, 3.0, 0.3, 0.42],
        ["Vulnerability checks", "#f0a020", 0xf0a020, 4.0, -0.25, -0.3],
        ["Secure transfer", "#f0a020", 0xf0a020, 4.0, -0.25, -0.3],
        ["Monitoring & testing", "#f0a020", 0xf0a020, 4.0, -0.25, -0.3],
      ];
      const sats = defs2.map((d, i) => {
        const g = new THREE.Group(),
          core = i < 6,
          n = core ? 6 : 3,
          k = core ? i : i - 6;
        const pin = new THREE.Mesh(
          core
            ? new THREE.SphereGeometry(0.17, 24, 24)
            : new THREE.OctahedronGeometry(0.24, 0),
          new THREE.MeshStandardMaterial({
            color: d[2],
            metalness: 0.2,
            roughness: 0.35,
          }),
        );
        g.add(pin);
        const lab = tag(d[0], d[1]);
        lab.scale.set(1.8, 0.45, 1);
        lab.position.set(0, 0.5, 0);
        g.add(lab);
        root.add(g);
        return {
          g,
          pin,
          lab,
          r: d[3],
          a: (k / n) * Math.PI * 2 + (core ? 0 : 0.5),
          tilt: d[4],
          sp: d[5] * (core ? 1 : 1),
        };
      });

      /* soft floor shadow, faint blue dust (normal blending so it reads on light) and a click pulse */
      const sc = document.createElement("canvas");
      sc.width = sc.height = 128;
      const sg = sc.getContext("2d"),
        gr = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(10,50,110,.35)");
      gr.addColorStop(1, "rgba(10,50,110,0)");
      sg.fillStyle = gr;
      sg.fillRect(0, 0, 128, 128);
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(5, 5),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(sc),
          transparent: true,
          depthWrite: false,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -2.6;
      root.add(floor);
      const N = lowEnd ? 30 : 70,
        dp = new Float32Array(N * 3),
        dseed = new Float32Array(N);
      for (let q = 0; q < N; q++) {
        dp[q * 3] = (Math.random() - 0.5) * 10.4;
        dp[q * 3 + 1] = (Math.random() - 0.5) * 6;
        dp[q * 3 + 2] = (Math.random() - 0.5) * 4;
        dseed[q] = Math.random() * 6.28;
      }
      const dgeo = new THREE.BufferGeometry();
      dgeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
      const dust = new THREE.Points(
        dgeo,
        new THREE.PointsMaterial({
          size: 0.09,
          map: glowTexture(),
          color: 0x2a8fe0,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        }),
      );
      dust.userData = { base: dp.slice(), seed: dseed };
      root.add(dust);
      const pulse = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.02, 8, 120),
        new THREE.MeshBasicMaterial({
          color: 0x19a8ff,
          transparent: true,
          opacity: 0,
        }),
      );
      pulse.rotation.x = Math.PI / 2;
      root.add(pulse);

      ctx.onResize = (w, h) => root.scale.setScalar(Math.min(1, w / h / 1.45));
      let rot = 0,
        vel = 0,
        dragging = false,
        lx = 0,
        sx = 0,
        pt = -1,
        hover = false,
        hs = 1,
        px = 0,
        focus = -1;
      document.querySelectorAll(".ctrl-map li[data-ctrl]").forEach((li) => {
        const on = () => {
            focus = +li.dataset.ctrl;
          },
          off = () => {
            focus = -1;
          };
        li.addEventListener("mouseenter", on);
        li.addEventListener("mouseleave", off);
        li.addEventListener("focus", on);
        li.addEventListener("blur", off);
      });
      const cv = ctx.canvas;
      cv.addEventListener("pointerdown", (e) => {
        dragging = true;
        lx = sx = e.clientX;
        try {
          cv.setPointerCapture(e.pointerId);
        } catch (err) {
          /* ignore */
        }
      });
      cv.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - lx;
        lx = e.clientX;
        rot += dx * 0.012;
        vel = dx * 0.004;
      });
      cv.addEventListener("pointerup", (e) => {
        if (dragging && Math.abs(e.clientX - sx) < 4) pt = 0;
        dragging = false;
      });
      cv.addEventListener("pointercancel", () => {
        dragging = false;
      });
      cv.addEventListener("pointerenter", () => {
        hover = true;
      });
      cv.addEventListener("pointerleave", () => {
        hover = false;
      });
      return {
        update(t, dt) {
          vel *= 0.94;
          rot += dragging ? 0 : dt * 0.45 + vel;
          hs += ((hover ? 1.04 : 1) - hs) * 0.08;
          hero.rotation.y = rot;
          hero.position.y = Math.sin(t * 0.9) * 0.1;
          hero.scale.setScalar(BASE * hs);
          px += ((finePointer && !dragging ? pointer.x : 0) - px) * 0.05;
          root.rotation.y = px * 0.1;
          orbit1.rotation.z = t * 0.08;
          orbit2.rotation.z = -t * 0.06;
          const sl = focus >= 0 ? 0.12 : 1;
          sats.forEach((s, i) => {
            s.a += dt * s.sp * sl;
            s.g.position.set(
              Math.cos(s.a) * s.r,
              Math.sin(s.a) * s.r * Math.sin(s.tilt),
              Math.sin(s.a) * s.r * Math.cos(s.tilt),
            );
            const on = focus < 0 || focus === i,
              big = focus === i ? 1.3 : 1;
            s.lab.material.opacity +=
              ((on ? 1 : 0.22) - s.lab.material.opacity) * 0.15;
            s.lab.scale.set(1.8 * big, 0.45 * big, 1);
            s.pin.scale.setScalar(big);
            s.pin.rotation.y = t * 0.8;
          });
          if (pt >= 0) {
            pt += dt;
            const p = pt / 1.4;
            if (p >= 1) {
              pt = -1;
              pulse.material.opacity = 0;
            } else {
              pulse.scale.setScalar(1.5 + p * 3.5);
              pulse.material.opacity = 0.6 * (1 - p);
            }
          }
          driftParticles(dust, t, 0.06);
        },
      };
    },

    governance(ctx) {
      ctx.camera.position.set(0, 0, 9);
      addLights(ctx.scene);
      const root = new THREE.Group();
      root.rotation.x = 0.9;
      ctx.scene.add(root);
      const hubWrap = new THREE.Group();
      ctx.scene.add(hubWrap);
      const hubShield = buildShield();
      hubShield.scale.setScalar(0.55);
      hubWrap.add(hubShield);
      const hubLock = buildLock();
      hubLock.scale.setScalar(0.55);
      hubLock.position.set(0, -0.03, 0.03);
      hubWrap.add(hubLock);
      const nodes = [],
        seg = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2,
          n = sphereNode(0.18, 0xffffff);
        n.position.set(Math.cos(a) * 3, 0, Math.sin(a) * 3);
        root.add(n);
        nodes.push(n);
        seg.push(new THREE.Vector3(), n.position.clone());
        const b = ((i + 1) / 6) * Math.PI * 2;
        seg.push(
          n.position.clone(),
          new THREE.Vector3(Math.cos(b) * 3, 0, Math.sin(b) * 3),
        );
      }
      root.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(seg),
          lineMat(CYAN, 0.35),
        ),
      );
      const outer = new THREE.Mesh(
        new THREE.TorusGeometry(4.1, 0.008, 8, 140),
        new THREE.MeshBasicMaterial({
          color: BLUE,
          transparent: true,
          opacity: 0.4,
        }),
      );
      root.add(outer);
      const dust = makeParticles(lowEnd ? 70 : 200, 3, 6, 0.07, 0x8fe9ff);
      ctx.scene.add(dust);
      const packet = sphereNode(0.1, 0xffffff);
      root.add(packet);
      return {
        update(t) {
          root.rotation.y = t * 0.12;
          hubWrap.rotation.y = Math.sin(t * 0.6) * 0.5;
          hubWrap.position.y = Math.sin(t) * 0.06;
          const a = t * 0.6;
          packet.position.set(Math.cos(a) * 3, 0, Math.sin(a) * 3);
          nodes.forEach((n, i) => {
            const d = Math.abs(
              (((a - (i / 6) * Math.PI * 2) % 6.283) + 6.283) % 6.283,
            );
            n.userData.halo.material.opacity = d < 0.5 || d > 5.8 ? 1 : 0.5;
          });
          driftParticles(dust, t);
        },
      };
    },
  };

  /* ---------- mounting ---------- */
  function mount(canvas) {
    const name = canvas.dataset.scene,
      def = defs[name];
    if (!def) return;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !lowEnd,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch (e) {
      return;
    }
    renderer.setPixelRatio(Q.dpr);
    renderer.setClearColor(0x000000, 0);
    const host = canvas.parentElement;
    const ctx = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(42, 1, 0.1, 100),
      onResize: null,
      host,
      canvas,
    };
    const api = def(ctx);
    const s = {
      renderer,
      scene: ctx.scene,
      camera: ctx.camera,
      api,
      visible: false,
      canvas,
    };
    const resize = () => {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      if (s.camera.isPerspectiveCamera) {
        s.camera.aspect = w / h;
        s.camera.updateProjectionMatrix();
      }
      if (ctx.onResize) ctx.onResize(w, h);
      if (reduced && s.visible) {
        api.update(0, 0, s);
        renderer.render(s.scene, s.camera);
      }
    };
    s.ro = new ResizeObserver(resize);
    s.ro.observe(host);
    addEventListener("load", resize); // re-measure once fonts/layout settle
    s.io = new IntersectionObserver(
      ([e]) => {
        s.visible = e.isIntersecting;
        if (s.visible) {
          resize();
          wake();
        }
      },
      { rootMargin: "100px" },
    );
    s.io.observe(host);
    resize();
    scenes.push(s);
    host.classList.add("webgl-on");
    if (!reduced)
      canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        s.visible = false;
        host.classList.remove("webgl-on");
      });
  }

  function onPointer(e) {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  }
  function onVisibility() {
    if (!document.hidden) wake();
  }

  function dispose() {
    cancelAnimationFrame(raf);
    raf = 0;
    scenes.forEach((s) => {
      s.ro.disconnect();
      s.io.disconnect();
      s.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material)
          [].concat(o.material).forEach((m) => {
            if (m.map && m.map !== glowTex) m.map.dispose();
            m.dispose();
          });
      });
      s.renderer.dispose();
    });
    scenes.length = 0;
    removeEventListener("pointermove", onPointer);
    document.removeEventListener("visibilitychange", onVisibility);
  }

  function initScenes() {
    if (typeof THREE === "undefined") return false;
    const canvases = document.querySelectorAll("canvas[data-scene]");
    if (!canvases.length || !webglAvailable()) return false;
    canvases.forEach(mount);
    if (finePointer)
      addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", dispose, { once: true });
    return true;
  }

  window.NX.initScenes = initScenes;
})();
