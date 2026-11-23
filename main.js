import * as THREE from 'three';

document.documentElement.classList.add('js');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

/* ---------- Barra compatta + menu a tre pallini ---------- */
const bar = $('#bar'), menu = $('#menu'), menuBtn = $('#menuBtn');
addEventListener('scroll', () => bar.classList.toggle('scrolled', scrollY > 40), { passive: true });
function setMenu(open) {
  menuBtn.setAttribute('aria-expanded', open);
  menuBtn.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
  menu.hidden = !open;
  menu.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}
menuBtn.addEventListener('click', () => setMenu(menu.hidden));
menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

/* ---------- Ingresso: il vicolo (video Higgsfield) scorre con lo scroll, in WebGL ---------- */
const hero = $('#hero'), canvas = $('#gl'), copy = $('.hero-copy'), chapters = $$('.chapter'), prog = $('#prog');
const FRAMES = 71; // fotogrammi del video Higgsfield (media/frames), precaricati: niente seek, niente scatti
const frames = Array.from({ length: FRAMES }, (_, i) => {
  const img = new Image(); img.decoding = 'async';
  img.src = `media/frames/f${String(i + 1).padStart(3, '0')}.jpg`;
  return img;
});

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false }); } catch { canvas.remove(); }

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mkTex = () => { const t = new THREE.Texture(); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; };
  const texA = mkTex(), texB = mkTex();
  const uni = {
    uA: { value: texA }, uB: { value: texB }, uMix: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) }, uMedia: { value: new THREE.Vector2(16, 9) }, uP: { value: 0 }, uVel: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.); }',
    fragmentShader: `
      uniform sampler2D uA, uB; uniform vec2 uRes, uMedia; uniform float uMix, uP, uVel; varying vec2 vUv;
      vec3 tap(vec2 uv){ return mix(texture2D(uA, uv).rgb, texture2D(uB, uv).rgb, uMix); }
      void main(){
        float rs = uRes.x / uRes.y, rm = uMedia.x / uMedia.y;
        vec2 s = rs > rm ? vec2(1., rm / rs) : vec2(rs / rm, 1.);
        vec2 uv = (vUv - .5) * s / (1. + uP * .12) + vec2(.5, .5 + uP * .02);
        vec2 c = uv - .5;
        uv += c * dot(c, c) * uVel * .5;          // leggera lente sulla velocità
        float ab = .012 * abs(uVel);
        vec3 col = vec3(tap(uv + c * ab).r, tap(uv).g, tap(uv - c * ab).b);
        col *= 1. - smoothstep(.35, 1., length(vUv - .5)) * (.35 + uP * .2);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

  let target = 0, p = 0, last = 0, ia = -1, ib = -1, top = 0, span = 1, dirty = true;
  const setTex = (tex, i) => {
    const img = frames[i];
    if (!img.complete || !img.naturalWidth) return false;
    tex.image = img; tex.needsUpdate = true;
    uni.uMedia.value.set(img.naturalWidth, img.naturalHeight);
    return true;
  };
  const measure = () => {
    top = hero.getBoundingClientRect().top + scrollY;
    span = hero.offsetHeight - innerHeight;
    renderer.setSize(innerWidth, innerHeight, false); uni.uRes.value.set(innerWidth, innerHeight);
    dirty = true;
  };
  const readScroll = () => { target = Math.min(1, Math.max(0, (scrollY - top) / span)); };
  addEventListener('resize', () => { measure(); readScroll(); });
  addEventListener('scroll', readScroll, { passive: true });
  frames.forEach(img => img.addEventListener('load', () => { dirty = true; }, { once: true }));
  measure(); readScroll();

  const tick = () => {
    p += (target - p) * (reduced ? 1 : 0.12);
    if (Math.abs(target - p) < 1e-4) p = target;
    const vel = p - last; last = p;
    uni.uVel.value += (Math.max(-.06, Math.min(.06, vel * 3)) - uni.uVel.value) * .15;
    const moving = vel !== 0 || Math.abs(uni.uVel.value) > 1e-4;

    // fotogramma corrente e successivo, sfumati fra loro
    const f = p * (FRAMES - 1), a = Math.floor(f), b = Math.min(FRAMES - 1, a + 1);
    if (a !== ia && setTex(texA, a)) { ia = a; dirty = true; }
    if (b !== ib && setTex(texB, b)) { ib = b; dirty = true; }
    uni.uMix.value = ia === a && ib === b ? f - a : 0;
    uni.uP.value = p;

    if (moving || dirty) {
      copy.style.opacity = Math.max(0, 1 - p * 6);
      copy.style.transform = `translate3d(0,${-p * 140}px,0)`;
      chapters.forEach(el => {
        const at = +el.dataset.at, o = Math.max(0, 1 - Math.abs(p - at) * (at > .8 ? 6 : 7));
        el.style.opacity = at > .8 && p > at ? 1 : o;
        el.style.transform = `translate3d(0,${(at - p) * 100}px,0)`;
      });
      prog.style.transform = `scaleY(${p})`;
      if (scrollY < top + span + innerHeight) renderer.render(scene, cam);
      dirty = false;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- Entrate e parallasse ---------- */
if (window.gsap && !reduced) {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.batch('.reveal', {
    start: 'top 88%', once: true,
    onEnter: els => gsap.to(els, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.08 }),
  });
  gsap.utils.toArray('.bosa-pic img, .bosa-door img, .room-pics img, .casa figure img').forEach(img =>
    gsap.fromTo(img, { scale: 1.15, yPercent: -4 }, { scale: 1, yPercent: 4, ease: 'none', scrollTrigger: { trigger: img, scrub: true } }));
  gsap.from('.foot-name', { yPercent: 50, duration: 1.4, ease: 'power4.out', scrollTrigger: { trigger: '.foot', start: 'top 85%' } });
} else {
  $$('.reveal').forEach(el => { el.style.opacity = 1; el.style.transform = 'none'; });
}

/* ---------- Prenotazione in tre passi (pagamento dimostrativo) ---------- */
const ROOMS = {
  corallo: { name: 'Camera Corallo', price: 75, img: 'img/room-corallo.jpg' },
  lavanda: { name: 'Camera Lavanda', price: 70, img: 'img/room-lavanda.jpg' },
};
const TAX = 2, PET = 10; // ponytail: tariffe d'esempio, da confermare con Anna
const f = $('#flow'), steps = $$('.steps li'), eur = n => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const iso = d => d.toISOString().slice(0, 10);
const day = new Date(); f.in.min = iso(day);
const guests = f.querySelector('output[name=guests]');
let step = 1;

const nights = () => Math.round((new Date(f.out.value) - new Date(f.in.value)) / 864e5) || 0;
const fmt = v => new Date(v).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
function quote() {
  const r = ROOMS[f.room.value], n = nights(), g = +guests.value;
  const lines = n > 0 ? [[`${eur(r.price)} × ${n} ${n === 1 ? 'notte' : 'notti'}`, r.price * n], [`Tassa di soggiorno (${g} × ${n})`, TAX * g * n]] : [];
  if (n > 0 && f.pet.checked) lines.push(['Animale', PET]);
  return { r, n, g, lines, total: lines.reduce((s, l) => s + l[1], 0) };
}
function paint() {
  if (f.in.value) {
    const min = new Date(f.in.value); min.setDate(min.getDate() + 1);
    f.out.min = iso(min);
    if (f.out.value && f.out.value <= f.in.value) f.out.value = iso(min);
  }
  const q = quote();
  $('#sumRoom').textContent = q.r.name;
  if (!$('#sumImg').src.endsWith(q.r.img)) $('#sumImg').src = q.r.img;
  $('#sumDates').textContent = q.n > 0 ? `${fmt(f.in.value)} → ${fmt(f.out.value)} · ${q.g} ${q.g === 1 ? 'ospite' : 'ospiti'}` : 'Scegli le date';
  $('#sumLines').innerHTML = q.lines.map(([k, v]) => `<div><dt>${k}</dt><dd>${eur(v)}</dd></div>`).join('');
  $('#sumTotal').textContent = q.n > 0 ? eur(q.total) : '—';
  $('#live').innerHTML = q.n > 0 ? `${q.n} ${q.n === 1 ? 'notte' : 'notti'} · <b>${eur(q.total)}</b> tasse incluse` : 'Scegli le date per vedere il prezzo';
  $('#payBtn').textContent = q.n > 0 ? `Paga ${eur(q.total)}` : 'Paga';
}
f.addEventListener('input', paint);
f.addEventListener('click', e => {
  const d = e.target.closest('[data-d]');
  if (d) { guests.value = Math.min(3, Math.max(1, +guests.value + +d.dataset.d)); paint(); }
  if (e.target.closest('[data-next]') && valid(step)) go(step + 1);
  if (e.target.closest('[data-back]')) go(step - 1);
  if (e.target.closest('[data-close]')) dlg.close();
});

// Dati e pagamento vivono in una finestra che si apre solo dopo "Prenota"
const dlg = $('#checkout');
dlg.addEventListener('close', () => {
  if (step === 4) { f.reset(); guests.value = 2; $('#payBtn').disabled = false; $$('.flow [aria-invalid]').forEach(el => el.removeAttribute('aria-invalid')); }
  step = 1; paint(); document.body.style.overflow = '';
});
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

function go(n) {
  step = n;
  if (n === 1) { dlg.close(); return; }
  if (!dlg.open) { dlg.showModal(); document.body.style.overflow = 'hidden'; }
  $$('.checkout [data-step]').forEach(el => el.hidden = +el.dataset.step !== n);
  steps.forEach((li, i) => { li.classList.toggle('on', i + 1 === n); li.classList.toggle('ok', i + 1 < n); });
  const first = dlg.querySelector(`[data-step="${n}"] input, [data-step="${n}"] h3`);
  if (first) first.focus();
  dlg.querySelector('.co-main').scrollTop = 0;
}

const luhn = s => [...s].reverse().reduce((t, c, i) => { let d = +c; if (i % 2) { d *= 2; if (d > 9) d -= 9; } return t + d; }, 0) % 10 === 0;
function valid(n) {
  const box = f.querySelector(`[data-step="${n}"]`), err = box.querySelector('.err');
  const bad = (el, msg) => { el.setAttribute('aria-invalid', 'true'); el.focus(); err.textContent = msg; return false; };
  box.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
  err.textContent = '';
  if (n === 1) {
    if (!f.in.value) return bad(f.in, 'Scegli la data di arrivo.');
    if (nights() < 1) return bad(f.out, 'La partenza deve essere almeno il giorno dopo.');
  }
  if (n === 2) {
    if (f.name.value.trim().length < 3) return bad(f.name, 'Scrivi nome e cognome.');
    if (!f.email.checkValidity() || !f.email.value) return bad(f.email, 'Controlla l\'email.');
    if (f.tel.value.replace(/\D/g, '').length < 8) return bad(f.tel, 'Serve un numero di telefono valido.');
  }
  if (n === 3) {
    const num = f.cc.value.replace(/\D/g, ''), [mm, yy] = f.exp.value.split('/').map(Number);
    const now = new Date(), expOk = mm >= 1 && mm <= 12 && (2000 + yy > now.getFullYear() || (2000 + yy === now.getFullYear() && mm >= now.getMonth() + 1));
    if (num.length < 15 || !luhn(num)) return bad(f.cc, 'Il numero della carta non è valido.');
    if (!expOk) return bad(f.exp, 'Controlla la scadenza.');
    if (!/^\d{3,4}$/.test(f.cvc.value)) return bad(f.cvc, 'Il CVC ha 3 o 4 cifre.');
  }
  return true;
}

// Carta: formattazione e anteprima dal vivo
f.cc.addEventListener('input', () => {
  const v = f.cc.value.replace(/\D/g, '').slice(0, 16);
  f.cc.value = v.replace(/(.{4})/g, '$1 ').trim();
  $('#cardShow').textContent = (v + '•'.repeat(16 - v.length)).replace(/(.{4})/g, '$1 ').trim();
  $('#cardBrand').textContent = /^4/.test(v) ? 'Visa' : /^5[1-5]|^2[2-7]/.test(v) ? 'Mastercard' : /^3[47]/.test(v) ? 'American Express' : 'Carta';
});
f.exp.addEventListener('input', () => {
  const v = f.exp.value.replace(/\D/g, '').slice(0, 4);
  f.exp.value = v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v;
  $('#expShow').textContent = f.exp.value || 'MM/AA';
});
f.cvc.addEventListener('input', () => { f.cvc.value = f.cvc.value.replace(/\D/g, ''); });
f.name.addEventListener('input', () => { $('#nameShow').textContent = f.name.value || 'Nome sulla carta'; });

f.addEventListener('submit', e => {
  e.preventDefault();
  if (!valid(3)) return;
  const btn = $('#payBtn'); btn.disabled = true; btn.textContent = 'Pagamento in corso…';
  setTimeout(() => { // demo: nessun addebito, simula la risposta del circuito
    const q = quote();
    $('#code').textContent = 'IDA-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    $('#doneText').textContent = `${f.name.value.split(' ')[0]}, ti aspettiamo in Vico Tendas 3 dal ${fmt(f.in.value)}. ${q.n} ${q.n === 1 ? 'notte' : 'notti'} in ${q.r.name}, ${eur(q.total)} pagati. Anna ti scriverà su ${f.tel.value} il giorno prima dell'arrivo.`;
    go(4);
    steps.forEach(li => { li.classList.remove('on'); li.classList.add('ok'); });
  }, 1400);
});
paint();
