/* ==========================================================================
   Crawford Boys: Survivor
   A Vampire-Survivors-style browser game starring two super brothers:
     • BOLT  — the lightning kid (red/blue suit, chain-lightning bolts)
     • STAR  — the golden guardian (green/gold suit, orbiting + throwing stars)

   Pure vanilla JS + Canvas. No dependencies. Runs from file://.
   ========================================================================== */
(function () {
  "use strict";

  // ---------------------------------------------------------------- Canvas
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let VW = 0, VH = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    VW = window.innerWidth;
    VH = window.innerHeight;
    canvas.width = Math.floor(VW * DPR);
    canvas.height = Math.floor(VH * DPR);
    canvas.style.width = VW + "px";
    canvas.style.height = VH + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------------------------------------------------------------- Utility
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const now = () => performance.now();
  function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  // ---------------------------------------------------------------- DOM refs
  const el = {
    title: document.getElementById("title"),
    hud: document.getElementById("hud"),
    levelup: document.getElementById("levelup"),
    upgradeCards: document.getElementById("upgrade-cards"),
    paused: document.getElementById("paused"),
    gameover: document.getElementById("gameover"),
    hpFill: document.getElementById("hp-fill"),
    hpLabel: document.getElementById("hp-label"),
    xpFill: document.getElementById("xp-fill"),
    xpLabel: document.getElementById("xp-label"),
    time: document.getElementById("time"),
    kills: document.getElementById("kills"),
    coins: document.getElementById("coins"),
    goTime: document.getElementById("go-time"),
    goKills: document.getElementById("go-kills"),
    goLevel: document.getElementById("go-level"),
    goBest: document.getElementById("go-best"),
    goTitle: document.getElementById("go-title"),
    touchStick: document.getElementById("touch-stick"),
    touchBase: document.getElementById("touch-base"),
    touchKnob: document.getElementById("touch-knob"),
  };

  // ---------------------------------------------------------------- Input
  const keys = Object.create(null);
  const moveDir = { x: 0, y: 0 };
  window.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) e.preventDefault();
    if (e.key.toLowerCase() === "p" || e.key === "Escape") togglePause();
  }, { passive: false });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  // Gamepad support (best effort)
  let gamepadIndex = null;
  window.addEventListener("gamepadconnected", (e) => { gamepadIndex = e.gamepad.index; });
  window.addEventListener("gamepaddisconnected", () => { gamepadIndex = null; });

  // Touch joystick
  let touchId = null;
  const touchOrigin = { x: 0, y: 0 };
  function isTouchDevice() { return "ontouchstart" in window || navigator.maxTouchPoints > 0; }
  canvas.addEventListener("touchstart", (e) => {
    if (State.mode !== "play") return;
    const t = e.changedTouches[0];
    touchId = t.identifier;
    touchOrigin.x = t.clientX; touchOrigin.y = t.clientY;
    el.touchBase.style.left = t.clientX + "px";
    el.touchBase.style.top = t.clientY + "px";
    el.touchBase.style.display = "block";
    el.touchKnob.style.transform = "translate(-50%, -50%)";
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      let dx = t.clientX - touchOrigin.x, dy = t.clientY - touchOrigin.y;
      const len = Math.hypot(dx, dy) || 1;
      const max = 55;
      const cl = Math.min(len, max);
      const nx = dx / len, ny = dy / len;
      moveDir.x = nx * (cl / max);
      moveDir.y = ny * (cl / max);
      el.touchKnob.style.transform = `translate(calc(-50% + ${nx * cl}px), calc(-50% + ${ny * cl}px))`;
      e.preventDefault();
    }
  }, { passive: false });
  function endTouch(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === touchId) {
        touchId = null; moveDir.x = 0; moveDir.y = 0;
        el.touchBase.style.display = "none";
      }
    }
  }
  canvas.addEventListener("touchend", endTouch);
  canvas.addEventListener("touchcancel", endTouch);

  function readInput() {
    let x = 0, y = 0;
    if (keys["w"] || keys["arrowup"]) y -= 1;
    if (keys["s"] || keys["arrowdown"]) y += 1;
    if (keys["a"] || keys["arrowleft"]) x -= 1;
    if (keys["d"] || keys["arrowright"]) x += 1;
    if (x || y) {
      const l = Math.hypot(x, y);
      return { x: x / l, y: y / l };
    }
    // Gamepad
    if (gamepadIndex !== null && navigator.getGamepads) {
      const gp = navigator.getGamepads()[gamepadIndex];
      if (gp) {
        let gx = gp.axes[0] || 0, gy = gp.axes[1] || 0;
        if (Math.abs(gx) < 0.18) gx = 0;
        if (Math.abs(gy) < 0.18) gy = 0;
        if (gx || gy) {
          const l = Math.hypot(gx, gy);
          return { x: gx / l * Math.min(l, 1), y: gy / l * Math.min(l, 1) };
        }
      }
    }
    // Touch
    if (moveDir.x || moveDir.y) return { x: moveDir.x, y: moveDir.y };
    return { x: 0, y: 0 };
  }

  // ================================================================ HEROES
  // Each hero has base stats and a signature weapon.
  const HEROES = {
    bolt: {
      id: "bolt",
      name: "BOLT",
      maxHp: 100,
      speed: 210,
      armor: 0,
      pickup: 110,
      colors: { suit: "#d62828", accent: "#1f5fd6", gold: "#f4b41a", hair: "#3a2417", skin: "#e8b48c" },
      weapon: "chain",
    },
    star: {
      id: "star",
      name: "STAR",
      maxHp: 140,
      speed: 178,
      armor: 3,
      pickup: 95,
      colors: { suit: "#2f7d32", accent: "#14361a", gold: "#f4c430", hair: "#c98a3a", skin: "#eabb92" },
      weapon: "star",
    },
  };

  // ================================================================ ASSETS
  // Hero portraits + the sliced enemy sprite sheet. The game renders these
  // images; if any fails to load it falls back to procedural canvas art.
  function makeImg(src) { const im = new Image(); im.src = src; return im; }
  function imgReady(im) { return !!im && im.complete && im.naturalWidth > 0; }

  const HERO_IMG = { bolt: makeImg("assets/bolt.png"), star: makeImg("assets/star.png") };
  const ENEMY_IMG = [];
  for (let i = 0; i < 19; i++) ENEMY_IMG.push(makeImg("assets/enemy_" + String(i).padStart(2, "0") + ".png"));

  // Which sprites each enemy TYPE can wear (indices into ENEMY_IMG).
  const ENEMY_SPRITES = {
    swarm: [4, 16, 17],            // bat, eyeball, spiked ball
    grunt: [0, 2, 5, 6, 9, 10, 15],// goblin, skeleton, slime, plant, archer, pirate, barrel
    ghost: [3, 12],               // wraith, fire elemental
    brute: [1, 7, 8, 11, 13, 14], // golem, treant, boar, yeti, robot, crystal-skull
    boss: [18],                   // treasure-chest mimic
  };

  // repaint the title thumbnails once hero art arrives
  HERO_IMG.bolt.onload = () => drawHeroThumbs();
  HERO_IMG.star.onload = () => drawHeroThumbs();

  // ================================================================ STATE
  const State = {
    mode: "title", // title | play | levelup | paused | gameover
    hero: null,
    t: 0,           // elapsed seconds
    lastFrame: 0,
    player: null,
    enemies: [],
    projectiles: [],
    gems: [],
    particles: [],
    orbitals: [],
    dmgTexts: [],
    kills: 0,
    coins: 0,
    spawnTimer: 0,
    bossTimer: 0,
    shake: 0,
    upgrades: {},  // id -> level
    weapons: {},   // active weapon ids -> level
  };

  const camera = { x: 0, y: 0 };

  // ================================================================ WEAPONS & UPGRADES
  // Weapons the player can gain / level up. Each has a fire() implementation.
  const WEAPON_DEFS = {
    chain: {
      name: "Chain Bolt", ico: "⚡", max: 8,
      desc: (l) => l === 0 ? "Fire a bolt that chains between foes." : `+1 chain jump, +damage (Lv ${l + 1}).`,
    },
    star: {
      name: "Throwing Star", ico: "🌟", max: 8,
      desc: (l) => l === 0 ? "Hurl piercing stars at the nearest foe." : `+1 star, +pierce (Lv ${l + 1}).`,
    },
    orbit: {
      name: "Orbit Stars", ico: "✴️", max: 6,
      desc: (l) => l === 0 ? "Stars orbit you, smashing anything near." : `+1 orbiting star (Lv ${l + 1}).`,
    },
    nova: {
      name: "Shock Nova", ico: "💥", max: 6,
      desc: (l) => l === 0 ? "Release a shockwave that knocks back the horde." : `Bigger, harder nova (Lv ${l + 1}).`,
    },
    boomerang: {
      name: "Boom-Bolt", ico: "🪃", max: 6,
      desc: (l) => l === 0 ? "A bolt that flies out and returns, hitting twice." : `+1 boomerang (Lv ${l + 1}).`,
    },
  };

  const STAT_DEFS = {
    might:   { name: "Might",       ico: "💪", max: 6, desc: () => "+15% damage on everything." },
    haste:   { name: "Quick Feet",  ico: "👟", max: 5, desc: () => "+10% move speed." },
    cooldown:{ name: "Overclock",   ico: "⏲️", max: 6, desc: () => "-10% attack cooldown." },
    magnet:  { name: "Magnet",      ico: "🧲", max: 4, desc: () => "+35% pickup range." },
    armor:   { name: "Armor",       ico: "🛡️", max: 5, desc: () => "+2 armor (less damage taken)." },
    vigor:   { name: "Vigor",       ico: "❤️", max: 6, desc: () => "+25 max HP and heal a little." },
    regen:   { name: "Regen",       ico: "✨", max: 4, desc: () => "Slowly recover HP over time." },
    area:    { name: "Area",        ico: "🌀", max: 5, desc: () => "+15% attack size / reach." },
  };

  // ================================================================ PLAYER
  function makePlayer(heroId) {
    const h = HEROES[heroId];
    return {
      x: 0, y: 0, r: 16,
      hp: h.maxHp, maxHp: h.maxHp,
      baseSpeed: h.speed,
      armor: h.armor,
      pickupBase: h.pickup,
      face: 1, // facing dir for sprite
      // multipliers from stat upgrades
      dmgMul: 1, speedMul: 1, cdMul: 1, magnetMul: 1, areaMul: 1, regen: 0,
      level: 1, xp: 0, xpNext: 5,
      invuln: 0,
      walkPhase: 0, moving: false,
      hero: h,
    };
  }

  // ================================================================ START / RESET
  function startGame(heroId) {
    State.hero = heroId;
    State.mode = "play";
    State.t = 0;
    State.enemies.length = 0;
    State.projectiles.length = 0;
    State.gems.length = 0;
    State.particles.length = 0;
    State.orbitals.length = 0;
    State.dmgTexts.length = 0;
    State.kills = 0;
    State.coins = 0;
    State.spawnTimer = 0;
    State.bossTimer = 30;
    State.shake = 0;
    State.upgrades = {};
    State.weapons = {};
    State.player = makePlayer(heroId);
    camera.x = 0; camera.y = 0;

    // Signature starting weapon per hero
    State.weapons[HEROES[heroId].weapon] = 1;
    // give each hero a cooldown tracker map
    weaponCooldowns = {};

    el.title.classList.add("hidden");
    el.gameover.classList.add("hidden");
    el.levelup.classList.add("hidden");
    el.paused.classList.add("hidden");
    el.hud.classList.remove("hidden");
    if (isTouchDevice()) el.touchStick.classList.remove("hidden");

    State.lastFrame = now();
  }

  function quitToTitle() {
    State.mode = "title";
    el.paused.classList.add("hidden");
    el.hud.classList.add("hidden");
    el.gameover.classList.add("hidden");
    el.levelup.classList.add("hidden");
    el.title.classList.remove("hidden");
    el.touchStick.classList.add("hidden");
  }

  // ================================================================ ENEMIES
  const ENEMY_TYPES = {
    grunt:  { r: 13, hp: 12, speed: 58,  dmg: 7,  xp: 1, color: "#7a4be0", color2: "#4a2599" },
    swarm:  { r: 9,  hp: 6,  speed: 92,  dmg: 5,  xp: 1, color: "#e05a9a", color2: "#8a2e5f" },
    brute:  { r: 22, hp: 55, speed: 40,  dmg: 16, xp: 4, color: "#c9642e", color2: "#7a3a16" },
    ghost:  { r: 12, hp: 20, speed: 74,  dmg: 9,  xp: 2, color: "#4ec9c9", color2: "#256e6e" },
    boss:   { r: 40, hp: 900, speed: 46, dmg: 26, xp: 40, color: "#222", color2: "#000", boss: true },
  };

  function spawnEnemy(type, ang) {
    const def = ENEMY_TYPES[type];
    const p = State.player;
    // spawn just off-screen around player
    const radius = Math.hypot(VW, VH) * 0.62;
    const a = ang !== undefined ? ang : rand(0, TAU);
    // scale HP with time (difficulty ramp)
    const ramp = 1 + State.t / 70;
    const pool = ENEMY_SPRITES[type] || ENEMY_SPRITES.grunt;
    State.enemies.push({
      type, x: p.x + Math.cos(a) * radius, y: p.y + Math.sin(a) * radius,
      r: def.r, hp: def.hp * ramp, maxHp: def.hp * ramp,
      speed: def.speed * (1 + State.t / 400),
      dmg: def.dmg, xp: def.xp,
      color: def.color, color2: def.color2, boss: !!def.boss,
      imgIdx: pool[randInt(0, pool.length - 1)],
      hitFlash: 0, knock: { x: 0, y: 0 }, phase: rand(0, TAU),
      hitCd: 0,
    });
  }

  function spawnWave(dt) {
    State.spawnTimer -= dt;
    if (State.spawnTimer <= 0) {
      const t = State.t;
      // spawn cadence quickens over time
      State.spawnTimer = clamp(1.15 - t / 240, 0.28, 1.15);
      const count = 1 + Math.floor(t / 45);
      for (let i = 0; i < count; i++) {
        const roll = Math.random();
        let type = "grunt";
        if (t > 25 && roll < 0.28) type = "swarm";
        if (t > 70 && roll > 0.82) type = "brute";
        if (t > 45 && roll > 0.62 && roll < 0.74) type = "ghost";
        spawnEnemy(type);
      }
      // occasional ring swarm
      if (t > 90 && Math.random() < 0.06) {
        for (let i = 0; i < 14; i++) spawnEnemy("swarm", (i / 14) * TAU);
      }
    }
    // boss every ~45s of ramp
    State.bossTimer -= dt;
    if (State.bossTimer <= 0 && State.t > 30) {
      State.bossTimer = 55;
      spawnEnemy("boss");
      floatText(State.player.x, State.player.y - 60, "⚠ BOSS INCOMING", "#ff5a5a", 1.6);
    }
  }

  // ================================================================ WEAPON FIRING
  let weaponCooldowns = {};

  function nearestEnemy(x, y, maxD2) {
    let best = null, bd = maxD2 === undefined ? Infinity : maxD2;
    for (const e of State.enemies) {
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function fireWeapons(dt) {
    const p = State.player;
    for (const wid in State.weapons) {
      const lvl = State.weapons[wid];
      weaponCooldowns[wid] = (weaponCooldowns[wid] || 0) - dt;
      if (weaponCooldowns[wid] > 0) continue;
      const cd = weaponBaseCooldown(wid, lvl) * p.cdMul;
      weaponCooldowns[wid] = cd;
      WEAPON_FIRE[wid](p, lvl);
    }
    updateOrbitals(dt);
  }

  function weaponBaseCooldown(wid, lvl) {
    switch (wid) {
      case "chain": return Math.max(0.55, 1.1 - lvl * 0.05);
      case "star": return Math.max(0.5, 0.95 - lvl * 0.045);
      case "nova": return Math.max(2.4, 4.5 - lvl * 0.3);
      case "boomerang": return Math.max(1.4, 2.4 - lvl * 0.12);
      case "orbit": return 999; // orbit is persistent, managed separately
      default: return 1.2;
    }
  }

  const WEAPON_FIRE = {
    chain(p, lvl) {
      const target = nearestEnemy(p.x, p.y, (700 * p.areaMul) ** 2);
      if (!target) return;
      const dmg = (9 + lvl * 4) * p.dmgMul;
      const jumps = 2 + lvl;
      chainLightning(p.x, p.y, target, dmg, jumps, []);
      weaponCooldowns.__flash = 0.08;
    },
    star(p, lvl) {
      const count = 1 + Math.floor(lvl / 2);
      const target = nearestEnemy(p.x, p.y);
      let baseAng = target ? Math.atan2(target.y - p.y, target.x - p.x) : rand(0, TAU);
      for (let i = 0; i < count; i++) {
        const spread = (i - (count - 1) / 2) * 0.22;
        const a = baseAng + spread;
        State.projectiles.push({
          kind: "star", x: p.x, y: p.y,
          vx: Math.cos(a) * 460, vy: Math.sin(a) * 460,
          r: 11 * p.areaMul, dmg: (8 + lvl * 3) * p.dmgMul,
          life: 1.4, pierce: 1 + lvl, hitSet: new Set(), spin: rand(0, TAU),
          color: p.hero.colors.gold,
        });
      }
    },
    nova(p, lvl) {
      const radius = (120 + lvl * 26) * p.areaMul;
      const dmg = (14 + lvl * 6) * p.dmgMul;
      State.projectiles.push({
        kind: "nova", x: p.x, y: p.y, r: 10, maxR: radius,
        dmg, life: 0.45, hitSet: new Set(), knock: 260,
        color: p.hero.id === "bolt" ? "#7ad0ff" : "#ffe08a",
      });
      addShake(6);
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * TAU;
        spawnParticle(p.x, p.y, Math.cos(a) * 200, Math.sin(a) * 200, 0.4, p.hero.colors.accent, 3);
      }
    },
    boomerang(p, lvl) {
      const count = 1 + Math.floor((lvl - 1) / 2);
      const target = nearestEnemy(p.x, p.y);
      let baseAng = target ? Math.atan2(target.y - p.y, target.x - p.x) : rand(0, TAU);
      for (let i = 0; i < count; i++) {
        const a = baseAng + (i - (count - 1) / 2) * 0.5;
        State.projectiles.push({
          kind: "boomerang", x: p.x, y: p.y,
          vx: Math.cos(a) * 380, vy: Math.sin(a) * 380,
          r: 13 * p.areaMul, dmg: (10 + lvl * 4) * p.dmgMul,
          life: 2.2, t: 0, out: true, spin: 0, hitCd: new Map(),
          color: p.hero.colors.gold,
        });
      }
    },
  };

  function chainLightning(fromX, fromY, target, dmg, jumps, visited) {
    if (!target) return;
    visited.push(target);
    hitEnemy(target, dmg, (target.x - fromX) * 0.02, (target.y - fromY) * 0.02);
    // visual arc
    State.particles.push({ kind: "arc", x1: fromX, y1: fromY, x2: target.x, y2: target.y, life: 0.16, max: 0.16 });
    if (jumps <= 0) return;
    // find next nearest not visited within range
    let best = null, bd = (260) ** 2;
    for (const e of State.enemies) {
      if (visited.includes(e) || e.hp <= 0) continue;
      const d = dist2(target.x, target.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) chainLightning(target.x, target.y, best, dmg * 0.85, jumps - 1, visited);
  }

  // ---------------- Orbitals (Star's signature-adjacent weapon)
  function rebuildOrbitals() {
    const lvl = State.weapons.orbit || 0;
    const count = lvl > 0 ? 1 + lvl : 0;
    State.orbitals.length = 0;
    for (let i = 0; i < count; i++) {
      State.orbitals.push({ ang: (i / count) * TAU });
    }
  }
  function updateOrbitals(dt) {
    if (!State.orbitals.length) return;
    const p = State.player;
    const lvl = State.weapons.orbit || 1;
    const radius = (78 + lvl * 6) * p.areaMul;
    const dmg = (7 + lvl * 3) * p.dmgMul;
    for (const o of State.orbitals) {
      o.ang += dt * 2.6;
      const ox = p.x + Math.cos(o.ang) * radius;
      const oy = p.y + Math.sin(o.ang) * radius;
      o.x = ox; o.y = oy;
      for (const e of State.enemies) {
        if (e.hp <= 0) continue;
        const rr = (e.r + 14) ** 2;
        if (dist2(ox, oy, e.x, e.y) < rr) {
          if (!o.hitMap) o.hitMap = new Map();
          const last = o.hitMap.get(e) || 0;
          if (State.t - last > 0.35) {
            o.hitMap.set(e, State.t);
            hitEnemy(e, dmg, Math.cos(o.ang) * 3, Math.sin(o.ang) * 3);
          }
        }
      }
    }
  }

  // ================================================================ COMBAT
  function hitEnemy(e, dmg, kx, ky) {
    e.hp -= dmg;
    e.hitFlash = 0.12;
    if (kx || ky) { e.knock.x += kx * 6; e.knock.y += ky * 6; }
    floatText(e.x + rand(-6, 6), e.y - e.r - 4, Math.round(dmg), "#ffe08a", 0.6, 0.9);
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    e.dead = true;
    State.kills++;
    // drop XP gem
    State.gems.push({ x: e.x, y: e.y, r: e.boss ? 9 : 5, xp: e.xp, vx: rand(-40, 40), vy: rand(-40, 40), t: 0, boss: e.boss });
    if (e.boss) {
      State.coins += 15;
      addShake(14);
      for (let i = 0; i < 40; i++) {
        const a = rand(0, TAU), sp = rand(60, 260);
        spawnParticle(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.4, 0.9), i % 2 ? "#ffe08a" : e.color, rand(2, 5));
      }
      floatText(e.x, e.y - 40, "BOSS DOWN!", "#ffe08a", 1.4, 1.4);
    } else {
      if (Math.random() < 0.05) State.coins += 1;
      for (let i = 0; i < 6; i++) {
        const a = rand(0, TAU), sp = rand(40, 130);
        spawnParticle(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.25, 0.5), e.color, rand(2, 4));
      }
    }
  }

  function damagePlayer(amount) {
    const p = State.player;
    if (p.invuln > 0) return;
    const reduced = Math.max(1, amount - p.armor);
    p.hp -= reduced;
    p.invuln = 0.6;
    addShake(7);
    floatText(p.x, p.y - p.r - 8, "-" + Math.round(reduced), "#ff5a5a", 0.7, 1.1);
    for (let i = 0; i < 8; i++) {
      const a = rand(0, TAU), sp = rand(60, 160);
      spawnParticle(p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.4, "#ff5a5a", 3);
    }
    if (p.hp <= 0) { p.hp = 0; gameOver(); }
  }

  // ================================================================ PARTICLES / TEXT
  function spawnParticle(x, y, vx, vy, life, color, size) {
    State.particles.push({ kind: "dot", x, y, vx, vy, life, max: life, color, size });
  }
  function floatText(x, y, text, color, life, scale) {
    State.dmgTexts.push({ x, y, text: String(text), color, life: life || 0.7, max: life || 0.7, scale: scale || 1, vy: -34 });
  }
  function addShake(v) { State.shake = Math.min(State.shake + v, 22); }

  // ================================================================ XP / LEVEL UP
  function collectGem(g) {
    const p = State.player;
    p.xp += g.xp;
    if (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = Math.floor(p.xpNext * 1.32 + 3);
      openLevelUp();
    }
  }

  function currentLevel(id) {
    if (WEAPON_DEFS[id]) return State.weapons[id] || 0;
    return State.upgrades[id] || 0;
  }

  function buildUpgradePool() {
    const pool = [];
    // weapons
    for (const id in WEAPON_DEFS) {
      const cur = currentLevel(id);
      if (cur >= WEAPON_DEFS[id].max) continue;
      // new weapons only offered if player has < 5 weapons OR already owns it
      const ownedWeapons = Object.keys(State.weapons).length;
      if (cur === 0 && ownedWeapons >= 5) continue;
      pool.push({ id, kind: "weapon", def: WEAPON_DEFS[id], cur });
    }
    // stats
    for (const id in STAT_DEFS) {
      const cur = currentLevel(id);
      if (cur >= STAT_DEFS[id].max) continue;
      pool.push({ id, kind: "stat", def: STAT_DEFS[id], cur });
    }
    return pool;
  }

  function openLevelUp() {
    State.mode = "levelup";
    const pool = buildUpgradePool();
    // pick 3 distinct
    const choices = [];
    const copy = pool.slice();
    // Weight: prefer leveling existing weapons a bit
    for (let i = 0; i < 3 && copy.length; i++) {
      const idx = randInt(0, copy.length - 1);
      choices.push(copy.splice(idx, 1)[0]);
    }
    if (choices.length === 0) {
      // fallback: heal
      choices.push({ id: "heal", kind: "heal", def: { name: "Recover", ico: "❤️", desc: () => "Heal 40 HP." }, cur: 0 });
    }
    el.upgradeCards.innerHTML = "";
    for (const c of choices) {
      const card = document.createElement("div");
      card.className = "up-card";
      const lvlText = c.kind === "heal" ? "" :
        (c.cur === 0 ? "NEW!" : `LEVEL ${c.cur} → ${c.cur + 1}`);
      card.innerHTML =
        `<div class="up-ico">${c.def.ico}</div>` +
        `<div class="up-name">${c.def.name}</div>` +
        `<div class="up-lvl">${lvlText}</div>` +
        `<div class="up-desc">${c.def.desc(c.cur)}</div>`;
      card.addEventListener("click", () => applyUpgrade(c));
      el.upgradeCards.appendChild(card);
    }
    el.levelup.classList.remove("hidden");
  }

  function applyUpgrade(c) {
    const p = State.player;
    if (c.kind === "weapon") {
      State.weapons[c.id] = (State.weapons[c.id] || 0) + 1;
      if (c.id === "orbit") rebuildOrbitals();
    } else if (c.kind === "stat") {
      State.upgrades[c.id] = (State.upgrades[c.id] || 0) + 1;
      recomputeStats();
    } else if (c.kind === "heal") {
      p.hp = Math.min(p.maxHp, p.hp + 40);
    }
    el.levelup.classList.add("hidden");
    State.mode = "play";
    State.lastFrame = now();
  }

  function recomputeStats() {
    const p = State.player;
    const u = State.upgrades;
    p.dmgMul = 1 + (u.might || 0) * 0.15;
    p.speedMul = 1 + (u.haste || 0) * 0.10;
    p.cdMul = Math.max(0.35, 1 - (u.cooldown || 0) * 0.10);
    p.magnetMul = 1 + (u.magnet || 0) * 0.35;
    p.areaMul = 1 + (u.area || 0) * 0.15;
    p.regen = (u.regen || 0) * 1.2;
    const newMax = p.hero.maxHp + (u.vigor || 0) * 25;
    if (newMax > p.maxHp) p.hp += (newMax - p.maxHp); // heal the gained amount
    p.maxHp = newMax;
    p.armor = p.hero.armor + (u.armor || 0) * 2;
  }

  // ================================================================ GAME OVER
  const BEST_KEY = "crawford_survivor_best";
  function gameOver() {
    State.mode = "gameover";
    el.goTime.textContent = fmtTime(State.t);
    el.goKills.textContent = State.kills;
    el.goLevel.textContent = State.player.level;
    el.goTitle.textContent = State.player.hero.name + " HAS FALLEN";
    // best score persistence
    let best = 0;
    try { best = parseFloat(localStorage.getItem(BEST_KEY) || "0"); } catch (e) {}
    if (State.t > best) {
      best = State.t;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
      el.goBest.textContent = "🏆 New best survival time!";
    } else {
      el.goBest.textContent = "Best: " + fmtTime(best);
    }
    el.gameover.classList.remove("hidden");
    el.touchStick.classList.add("hidden");
  }

  // ================================================================ PAUSE
  function togglePause() {
    if (State.mode === "play") {
      State.mode = "paused";
      el.paused.classList.remove("hidden");
    } else if (State.mode === "paused") {
      State.mode = "play";
      el.paused.classList.add("hidden");
      State.lastFrame = now();
    }
  }

  // ================================================================ UPDATE
  function update(dt) {
    const p = State.player;
    State.t += dt;

    // --- player movement
    const input = readInput();
    p.moving = input.x !== 0 || input.y !== 0;
    if (input.x < 0) p.face = -1; else if (input.x > 0) p.face = 1;
    const spd = p.baseSpeed * p.speedMul;
    p.x += input.x * spd * dt;
    p.y += input.y * spd * dt;
    if (p.moving) p.walkPhase += dt * 10;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

    // camera follows player
    camera.x = p.x - VW / 2;
    camera.y = p.y - VH / 2;

    // --- spawns
    spawnWave(dt);

    // --- weapons
    fireWeapons(dt);

    // --- enemies
    const pickR = (p.pickupBase * p.magnetMul);
    for (const e of State.enemies) {
      if (e.dead) continue;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      // knockback decay
      e.x += e.knock.x; e.y += e.knock.y;
      e.knock.x *= 0.8; e.knock.y *= 0.8;
      // seek player
      let dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
      e.phase += dt * 6;
      // contact damage
      if (e.hitCd > 0) e.hitCd -= dt;
      const touch = (e.r + p.r) * 0.85;
      if (d < touch) {
        if (e.hitCd <= 0) { damagePlayer(e.dmg); e.hitCd = 0.5; }
      }
    }
    // remove dead + separate overlapping (light)
    State.enemies = State.enemies.filter((e) => !e.dead);

    // --- projectiles
    for (const pr of State.projectiles) {
      if (pr.kind === "star") {
        pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt; pr.spin += dt * 14;
        for (const e of State.enemies) {
          if (pr.hitSet.has(e) || e.hp <= 0) continue;
          if (dist2(pr.x, pr.y, e.x, e.y) < (pr.r + e.r) ** 2) {
            pr.hitSet.add(e);
            hitEnemy(e, pr.dmg, pr.vx * 0.006, pr.vy * 0.006);
            pr.pierce--;
            if (pr.pierce <= 0) { pr.life = 0; break; }
          }
        }
      } else if (pr.kind === "boomerang") {
        pr.t += dt; pr.spin += dt * 18;
        // out then return
        const ret = 1.1;
        if (pr.out && pr.t > ret) pr.out = false;
        if (pr.out) { pr.x += pr.vx * dt; pr.y += pr.vy * dt; }
        else {
          const dx = State.player.x - pr.x, dy = State.player.y - pr.y;
          const dd = Math.hypot(dx, dy) || 1;
          pr.x += (dx / dd) * 460 * dt; pr.y += (dy / dd) * 460 * dt;
          if (dd < 18) pr.life = 0;
        }
        pr.life -= dt;
        for (const e of State.enemies) {
          if (e.hp <= 0) continue;
          const last = pr.hitCd.get(e) || 0;
          if (State.t - last < 0.3) continue;
          if (dist2(pr.x, pr.y, e.x, e.y) < (pr.r + e.r) ** 2) {
            pr.hitCd.set(e, State.t);
            hitEnemy(e, pr.dmg, pr.vx * 0.004, pr.vy * 0.004);
          }
        }
      } else if (pr.kind === "nova") {
        pr.life -= dt;
        const prog = 1 - pr.life / 0.45;
        pr.r = pr.maxR * prog;
        for (const e of State.enemies) {
          if (pr.hitSet.has(e) || e.hp <= 0) continue;
          const dd = Math.hypot(pr.x - e.x, pr.y - e.y);
          if (dd < pr.r && dd > pr.r - 40) {
            pr.hitSet.add(e);
            const a = Math.atan2(e.y - pr.y, e.x - pr.x);
            e.knock.x += Math.cos(a) * pr.knock * dt;
            e.knock.y += Math.sin(a) * pr.knock * dt;
            hitEnemy(e, pr.dmg, 0, 0);
          }
        }
      }
    }
    State.projectiles = State.projectiles.filter((pr) => pr.life > 0);

    // --- gems
    for (const g of State.gems) {
      g.t += dt;
      // initial scatter fling settles quickly
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= 0.9; g.vy *= 0.9;
      const dd = Math.hypot(p.x - g.x, p.y - g.y) || 1;
      const a = Math.atan2(p.y - g.y, p.x - g.x);
      // Gems always home toward the player so XP is never stranded off-screen.
      // Gentle drift when far, strong vacuum once inside pickup range.
      let pull;
      if (dd < pickR) pull = clamp(560 - dd, 180, 560);
      else pull = 120;
      g.x += Math.cos(a) * pull * dt;
      g.y += Math.sin(a) * pull * dt;
      if (dd < p.r + g.r + 4) { g.got = true; collectGem(g); }
    }
    State.gems = State.gems.filter((g) => !g.got);

    // --- particles
    for (const pa of State.particles) {
      pa.life -= dt;
      if (pa.kind === "dot") { pa.x += pa.vx * dt; pa.y += pa.vy * dt; pa.vx *= 0.92; pa.vy *= 0.92; }
    }
    State.particles = State.particles.filter((pa) => pa.life > 0);

    // --- damage texts
    for (const d of State.dmgTexts) { d.life -= dt; d.y += d.vy * dt; d.vy *= 0.96; }
    State.dmgTexts = State.dmgTexts.filter((d) => d.life > 0);

    // --- shake decay
    if (State.shake > 0) State.shake = Math.max(0, State.shake - dt * 40);

    updateHUD();
  }

  function updateHUD() {
    const p = State.player;
    el.hpFill.style.width = clamp((p.hp / p.maxHp) * 100, 0, 100) + "%";
    el.hpLabel.textContent = Math.ceil(p.hp) + " / " + p.maxHp;
    el.xpFill.style.width = clamp((p.xp / p.xpNext) * 100, 0, 100) + "%";
    el.xpLabel.textContent = "LV " + p.level;
    el.time.textContent = fmtTime(State.t);
    el.kills.textContent = State.kills;
    el.coins.textContent = State.coins;
  }

  // ================================================================ RENDER
  function render() {
    ctx.clearRect(0, 0, VW, VH);

    // shake offset
    let sx = 0, sy = 0;
    if (State.shake > 0) { sx = rand(-State.shake, State.shake); sy = rand(-State.shake, State.shake); }

    ctx.save();
    ctx.translate(-camera.x + sx, -camera.y + sy);

    drawBackground();

    // gems
    for (const g of State.gems) drawGem(g);

    // enemies
    for (const e of State.enemies) drawEnemy(e);

    // orbitals
    for (const o of State.orbitals) drawOrbital(o);

    // projectiles
    for (const pr of State.projectiles) drawProjectile(pr);

    // player
    drawPlayer(State.player);

    // particles + arcs
    for (const pa of State.particles) drawParticle(pa);

    // floating text
    for (const d of State.dmgTexts) drawFloatText(d);

    ctx.restore();
  }

  // ---- Background: tiled arena grid
  function drawBackground() {
    const grid = 64;
    const x0 = Math.floor(camera.x / grid) * grid;
    const y0 = Math.floor(camera.y / grid) * grid;
    ctx.fillStyle = "#0a0f1e";
    ctx.fillRect(camera.x - 20, camera.y - 20, VW + 40, VH + 40);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.beginPath();
    for (let x = x0; x < camera.x + VW + grid; x += grid) {
      ctx.moveTo(x, camera.y - 20); ctx.lineTo(x, camera.y + VH + 20);
    }
    for (let y = y0; y < camera.y + VH + grid; y += grid) {
      ctx.moveTo(camera.x - 20, y); ctx.lineTo(camera.x + VW + 20, y);
    }
    ctx.stroke();
    // subtle vignette dots
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    for (let x = x0; x < camera.x + VW + grid; x += grid) {
      for (let y = y0; y < camera.y + VH + grid; y += grid) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  }

  function drawGem(g) {
    ctx.save();
    ctx.translate(g.x, g.y);
    const pulse = 1 + Math.sin(State.t * 6 + g.x) * 0.12;
    ctx.scale(pulse, pulse);
    ctx.fillStyle = g.boss ? "#ffd23f" : "#5ad1ff";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    // diamond
    ctx.beginPath();
    ctx.moveTo(0, -g.r); ctx.lineTo(g.r, 0); ctx.lineTo(0, g.r); ctx.lineTo(-g.r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Image-based enemy render (falls back to procedural art if sprite missing).
  function drawEnemy(e) {
    const im = ENEMY_IMG[e.imgIdx];
    const bob = Math.sin(e.phase) * (e.boss ? 3 : 2);
    if (!imgReady(im)) { drawEnemyProcedural(e); return; }

    const targetH = e.r * (e.boss ? 3.0 : 2.85);
    const scale = targetH / im.naturalHeight;
    const w = im.naturalWidth * scale, h = targetH;
    const x = e.x, y = e.y + bob;

    // grounding shadow
    ctx.save();
    ctx.translate(x, e.y + e.r * 0.85);
    ctx.scale(1, 0.4);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.95, 0, TAU); ctx.fill();
    ctx.restore();

    const dx = x - w / 2;
    const dy = (y + e.r) - h; // feet sit on the collision circle's base
    if (e.hitFlash > 0) {
      ctx.save();
      ctx.filter = "brightness(2.6)";
      ctx.drawImage(im, dx, dy, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(im, dx, dy, w, h);
    }
    drawEnemyHpBar(e, dy - 6);
  }

  // ---- original procedural enemy art (fallback) ----
  function drawEnemyProcedural(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    const bob = Math.sin(e.phase) * (e.boss ? 3 : 2);
    ctx.translate(0, bob);

    if (e.boss) { drawBoss(e); ctx.restore(); drawEnemyHpBar(e); return; }

    const flash = e.hitFlash > 0;
    const body = flash ? "#ffffff" : e.color;
    const dark = flash ? "#ffdddd" : e.color2;

    // shadow
    ctx.save();
    ctx.translate(0, e.r * 0.9 - bob);
    ctx.scale(1, 0.4);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.9, 0, TAU); ctx.fill();
    ctx.restore();

    if (e.type === "swarm") {
      // little bat-blob
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.moveTo(-e.r, 0); ctx.lineTo(-e.r * 1.7, -e.r * 0.7); ctx.lineTo(-e.r * 0.6, -e.r * 0.4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(e.r, 0); ctx.lineTo(e.r * 1.7, -e.r * 0.7); ctx.lineTo(e.r * 0.6, -e.r * 0.4); ctx.fill();
    } else if (e.type === "ghost") {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, -e.r * 0.2, e.r, Math.PI, 0);
      ctx.lineTo(e.r, e.r * 0.7);
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(e.r - (i + 0.5) * (e.r / 2), e.r * (i % 2 ? 0.5 : 0.9));
      }
      ctx.lineTo(-e.r, e.r * 0.7);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      // grunt / brute — round goon body
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(0, e.r * 0.3, e.r * 0.85, 0.15, Math.PI - 0.15); ctx.fill();
      // spikes for brute
      if (e.type === "brute") {
        ctx.fillStyle = dark;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + e.phase * 0.2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
          ctx.lineTo(Math.cos(a) * e.r * 1.35, Math.sin(a) * e.r * 1.35);
          ctx.lineTo(Math.cos(a + 0.25) * e.r, Math.sin(a + 0.25) * e.r);
          ctx.fill();
        }
      }
    }
    // eyes
    ctx.fillStyle = "#fff";
    const eo = e.r * 0.32;
    ctx.beginPath(); ctx.arc(-eo, -e.r * 0.15, e.r * 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(eo, -e.r * 0.15, e.r * 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(-eo, -e.r * 0.15, e.r * 0.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(eo, -e.r * 0.15, e.r * 0.1, 0, TAU); ctx.fill();

    ctx.restore();
    drawEnemyHpBar(e);
  }

  function drawBoss(e) {
    const flash = e.hitFlash > 0;
    // shadow
    ctx.save();
    ctx.translate(0, e.r * 0.9);
    ctx.scale(1, 0.4);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
    ctx.restore();

    // big armored goon
    ctx.fillStyle = flash ? "#fff" : "#2a2a38";
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
    ctx.fillStyle = flash ? "#fdd" : "#161620";
    ctx.beginPath(); ctx.arc(0, e.r * 0.25, e.r * 0.9, 0.1, Math.PI - 0.1); ctx.fill();
    // horns
    ctx.fillStyle = "#c0392b";
    ctx.beginPath(); ctx.moveTo(-e.r * 0.7, -e.r * 0.6); ctx.lineTo(-e.r * 1.1, -e.r * 1.2); ctx.lineTo(-e.r * 0.4, -e.r * 0.85); ctx.fill();
    ctx.beginPath(); ctx.moveTo(e.r * 0.7, -e.r * 0.6); ctx.lineTo(e.r * 1.1, -e.r * 1.2); ctx.lineTo(e.r * 0.4, -e.r * 0.85); ctx.fill();
    // glowing eyes
    ctx.fillStyle = "#ff3b3b";
    ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(-e.r * 0.32, -e.r * 0.1, e.r * 0.16, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(e.r * 0.32, -e.r * 0.1, e.r * 0.16, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawEnemyHpBar(e, topY) {
    if (e.hp >= e.maxHp) return;
    const w = e.boss ? 90 : e.r * 2;
    const h = e.boss ? 7 : 3;
    const x = e.x - w / 2;
    const y = topY !== undefined ? topY : e.y - e.r - (e.boss ? 20 : 8);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = e.boss ? "#ff5a5a" : "#7ef08a";
    ctx.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), h);
  }

  function drawOrbital(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(State.t * 5);
    drawStarShape(0, 0, 13, 6.5, 5, "#f4c430", "#b8860b");
    ctx.restore();
  }

  function drawProjectile(pr) {
    if (pr.kind === "star") {
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(pr.spin);
      drawStarShape(0, 0, pr.r, pr.r * 0.5, 5, pr.color, "#b8860b");
      ctx.restore();
    } else if (pr.kind === "boomerang") {
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(pr.spin);
      ctx.strokeStyle = pr.color; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.shadowColor = pr.color; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(-pr.r, pr.r * 0.4); ctx.lineTo(0, -pr.r * 0.6); ctx.lineTo(pr.r, pr.r * 0.4);
      ctx.stroke();
      ctx.restore();
    } else if (pr.kind === "nova") {
      ctx.save();
      const a = clamp(pr.life / 0.45, 0, 1);
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = pr.color; ctx.lineWidth = 8;
      ctx.shadowColor = pr.color; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = a * 0.25;
      ctx.fillStyle = pr.color;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawParticle(pa) {
    if (pa.kind === "arc") {
      const a = clamp(pa.life / pa.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = "#bfe4ff";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#7ad0ff"; ctx.shadowBlur = 12;
      // jagged lightning
      ctx.beginPath();
      ctx.moveTo(pa.x1, pa.y1);
      const segs = 5;
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const mx = pa.x1 + (pa.x2 - pa.x1) * t + rand(-10, 10);
        const my = pa.y1 + (pa.y2 - pa.y1) * t + rand(-10, 10);
        ctx.lineTo(mx, my);
      }
      ctx.lineTo(pa.x2, pa.y2);
      ctx.stroke();
      ctx.restore();
    } else {
      const a = clamp(pa.life / pa.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = pa.color;
      ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.size * a, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawFloatText(d) {
    const a = clamp(d.life / d.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = d.color;
    ctx.font = `800 ${14 * d.scale}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 3;
    ctx.strokeText(d.text, d.x, d.y);
    ctx.fillText(d.text, d.x, d.y);
    ctx.restore();
  }

  // ---------------- Star shape helper
  function drawStarShape(cx, cy, outer, inner, points, fill, stroke) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (points * 2)) * TAU - Math.PI / 2;
      ctx[i === 0 ? "moveTo" : "lineTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.shadowColor = fill; ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  // ================================================================ HERO SPRITE
  // Procedural chibi superhero (fallback when the portrait image is missing).
  function drawHeroSpriteProcedural(g, x, y, hero, opts) {
    opts = opts || {};
    const c = hero.colors;
    const s = opts.scale || 1;      // overall scale
    const face = opts.face || 1;
    const walk = opts.walk || 0;    // walk phase
    const flick = opts.invuln ? (Math.floor(State.t * 20) % 2 === 0) : false;

    g.save();
    g.translate(x, y);
    g.scale(face * s, s);
    if (flick) g.globalAlpha = 0.45;

    // shadow
    g.save();
    g.translate(0, 20);
    g.scale(1, 0.35);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fill();
    g.restore();

    const legSwing = Math.sin(walk) * 4;
    const armSwing = Math.sin(walk) * 3;

    // cape (behind)
    g.fillStyle = c.accent;
    g.beginPath();
    g.moveTo(-8, -14);
    g.quadraticCurveTo(-18 - Math.abs(legSwing), 4, -10 + legSwing * 0.5, 20);
    g.lineTo(8, 18);
    g.quadraticCurveTo(14, 0, 8, -14);
    g.closePath();
    g.fill();

    // ---- legs (boots)
    g.fillStyle = c.accent;
    g.fillRect(-7, 8 + legSwing, 5, 12);       // left boot
    g.fillRect(2, 8 - legSwing, 5, 12);        // right boot
    // boot lightning/star trim
    g.fillStyle = c.gold;
    g.fillRect(-7, 8 + legSwing, 5, 2);
    g.fillRect(2, 8 - legSwing, 5, 2);

    // ---- body (suit torso)
    g.fillStyle = c.suit;
    roundRect(g, -8, -8, 16, 18, 5); g.fill();

    // chest emblem
    g.save();
    g.translate(0, -1);
    if (hero.id === "bolt") {
      // gold circle + lightning
      g.fillStyle = c.gold;
      g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
      g.fillStyle = c.accent;
      g.beginPath();
      g.moveTo(-1.5, -3.2); g.lineTo(1.6, -0.6); g.lineTo(0.2, -0.2);
      g.lineTo(1.8, 3.2); g.lineTo(-1.6, 0.2); g.lineTo(0, -0.2);
      g.closePath(); g.fill();
    } else {
      // gold star
      drawStarShapeOn(g, 0, 0, 5, 2.3, 5, c.gold);
    }
    g.restore();

    // belt
    g.fillStyle = c.gold;
    g.fillRect(-8, 8, 16, 3);
    g.fillStyle = c.suit;
    g.fillRect(-1.5, 8, 3, 3);

    // ---- arms
    g.fillStyle = c.suit;
    g.save(); g.translate(-8, -6); g.rotate(armSwing * 0.05);
    roundRect(g, -3, 0, 4, 12, 2); g.fill();
    g.fillStyle = c.accent; g.fillRect(-3, 9, 4, 3); // glove
    g.restore();
    g.fillStyle = c.suit;
    g.save(); g.translate(8, -6); g.rotate(-armSwing * 0.05);
    roundRect(g, -1, 0, 4, 12, 2); g.fill();
    g.fillStyle = c.accent; g.fillRect(-1, 9, 4, 3); // glove
    g.restore();

    // ---- head
    g.fillStyle = c.skin;
    g.beginPath(); g.arc(0, -16, 8, 0, TAU); g.fill();
    // hair
    g.fillStyle = c.hair;
    if (hero.id === "bolt") {
      // spiky
      g.beginPath();
      g.moveTo(-8, -18);
      for (let i = 0; i < 5; i++) {
        const bx = -7 + i * 3.5;
        g.lineTo(bx + 1.5, -26 - (i % 2) * 2);
        g.lineTo(bx + 3.5, -19);
      }
      g.lineTo(8, -18);
      g.closePath(); g.fill();
    } else {
      // tidy swept hair
      g.beginPath();
      g.arc(0, -19, 8, Math.PI, TAU);
      g.quadraticCurveTo(7, -22, 2, -21);
      g.quadraticCurveTo(-3, -24, -8, -19);
      g.closePath(); g.fill();
    }
    // mask
    g.fillStyle = c.accent;
    roundRect(g, -7, -18, 14, 5, 2.5); g.fill();
    // eyes (white slits in mask)
    g.fillStyle = "#fff";
    g.beginPath(); g.ellipse(-3.2, -15.5, 1.8, 2.1, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(3.2, -15.5, 1.8, 2.1, 0, 0, TAU); g.fill();
    g.fillStyle = "#3a2a1a";
    g.beginPath(); g.arc(-2.8, -15.5, 0.9, 0, TAU); g.fill();
    g.beginPath(); g.arc(3.6, -15.5, 0.9, 0, TAU); g.fill();
    // smile
    g.strokeStyle = "#7a3b2e"; g.lineWidth = 1; g.beginPath();
    g.arc(0, -11.5, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();

    g.restore();
  }

  // star helper that draws on an arbitrary context (used inside sprite)
  function drawStarShapeOn(g, cx, cy, outer, inner, points, fill) {
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (points * 2)) * TAU - Math.PI / 2;
      g[i === 0 ? "moveTo" : "lineTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawPlayer(p) {
    // glow ring when low hp
    if (p.hp / p.maxHp < 0.3) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(State.t * 8) * 0.15;
      ctx.strokeStyle = "#ff5a5a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 10, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    const im = HERO_IMG[p.hero.id];
    if (!imgReady(im)) {
      drawHeroSpriteProcedural(ctx, p.x, p.y - 6, p.hero, {
        scale: 1.35, face: p.face, walk: p.walkPhase, invuln: p.invuln > 0,
      });
      return;
    }
    const H = 64;
    const scale = H / im.naturalHeight;
    const w = im.naturalWidth * scale;
    const bob = p.moving ? -Math.abs(Math.sin(p.walkPhase)) * 3 : Math.sin(State.t * 2) * -1.5;

    // grounding shadow
    ctx.save();
    ctx.translate(p.x, p.y + p.r * 0.7);
    ctx.scale(1, 0.4);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.arc(0, 0, p.r * 0.9, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y + bob);
    if (p.invuln > 0 && Math.floor(State.t * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    if (p.face < 0) ctx.scale(-1, 1);
    ctx.drawImage(im, -w / 2, -H * 0.72, w, H); // body centred on the point, feet below
    ctx.restore();
  }

  // ================================================================ HERO THUMBS (title)
  function drawHeroThumbs() {
    document.querySelectorAll(".hero-thumb").forEach((cv) => {
      const heroId = cv.getAttribute("data-hero");
      const g = cv.getContext("2d");
      g.clearRect(0, 0, cv.width, cv.height);
      const im = HERO_IMG[heroId];
      if (imgReady(im)) {
        const pad = 8;
        const s = Math.min((cv.height - pad * 2) / im.naturalHeight, (cv.width - pad * 2) / im.naturalWidth);
        const w = im.naturalWidth * s, h = im.naturalHeight * s;
        g.drawImage(im, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
      } else {
        g.save();
        g.translate(cv.width / 2, cv.height * 0.72);
        g.scale(3.4, 3.4);
        drawHeroSpriteProcedural(g, 0, 0, HEROES[heroId], { scale: 1, face: 1, walk: 0 });
        g.restore();
      }
    });
  }

  // ================================================================ MAIN LOOP
  function frame() {
    const t = now();
    let dt = (t - State.lastFrame) / 1000;
    State.lastFrame = t;
    dt = Math.min(dt, 0.05); // clamp big frame gaps

    if (State.mode === "play") {
      update(dt);
      render();
    } else if (State.mode === "levelup" || State.mode === "paused") {
      // keep last frame drawn (freeze)
      render();
    }
    requestAnimationFrame(frame);
  }

  // ================================================================ WIRE UP UI
  document.querySelectorAll(".pick-btn").forEach((b) => {
    b.addEventListener("click", () => startGame(b.getAttribute("data-hero")));
  });
  document.getElementById("pause-btn").addEventListener("click", togglePause);
  document.getElementById("resume-btn").addEventListener("click", togglePause);
  document.getElementById("quit-btn").addEventListener("click", quitToTitle);
  document.getElementById("retry-btn").addEventListener("click", () => {
    el.gameover.classList.add("hidden");
    el.title.classList.remove("hidden");
    State.mode = "title";
  });

  // show best time on title
  try {
    const best = parseFloat(localStorage.getItem(BEST_KEY) || "0");
    if (best > 0) {
      const hint = document.querySelector(".controls-hint");
      if (hint) hint.innerHTML += `<br>🏆 Best survival: <strong>${fmtTime(best)}</strong>`;
    }
  } catch (e) {}

  drawHeroThumbs();
  State.lastFrame = now();
  requestAnimationFrame(frame);
})();
