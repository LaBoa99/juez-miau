// Juez Miau · caja: tema, pisadas, gatito vivo, la etiqueta que se califica sola, marcador, terminal y banda.
(() => {
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const onSight = (el, fn, threshold = 0.35) => {
    if (!el) return;
    new IntersectionObserver((entries, obs) => {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      fn(el);
    }, { threshold }).observe(el);
  };

  // Tema: "light" | "dark" | "system" (por defecto). El <head> ya lo aplicó antes de pintar.
  let saved = 'system';
  try { saved = localStorage.getItem('theme') || 'system'; } catch {}
  for (const input of document.querySelectorAll('input[name="theme"]')) {
    input.checked = input.value === saved;
    input.addEventListener('change', () => {
      if (input.value === 'system') root.removeAttribute('data-theme');
      else root.dataset.theme = input.value;
      try { localStorage.setItem('theme', input.value); } catch {}
    });
  }

  // Checklist de la máquina: las palomitas se recuerdan en este navegador.
  for (const box of document.querySelectorAll('[data-check]')) {
    const key = `check:${box.dataset.check}`;
    try { box.checked = localStorage.getItem(key) === '1'; } catch {}
    box.addEventListener('change', () => { try { localStorage.setItem(key, box.checked ? '1' : '0'); } catch {} });
  }

  // Banda: se duplica el contenido para que la animación de -50% dé la vuelta sin salto.
  const belt = document.querySelector('[data-belt]');
  if (belt) belt.append(...[...belt.children].map((n) => n.cloneNode(true)));

  // Pisadas: un camino que baja por el margen; cada huella aparece cuando el scroll llega a ella.
  const paws = document.createElement('div');
  paws.className = 'paws';
  paws.setAttribute('aria-hidden', 'true');
  document.body.append(paws);
  let prints = [];
  const layPaws = () => {
    paws.innerHTML = '';
    // Se mide el contenido real (hasta el pie), no el scrollHeight: ese incluiría a las propias pisadas y crecería sin fin.
    const foot = document.querySelector('.foot');
    const docH = foot.offsetTop + foot.offsetHeight;
    paws.style.height = `${docH}px`;
    const vw = document.documentElement.clientWidth;
    const margin = (vw - Math.min(vw - 32, 1216)) / 2;
    const wide = margin >= 70;
    const size = wide ? 26 : 30;
    const step = wide ? 118 : 112;
    // Recorrido en S: el centro del camino oscila de lado a lado; en móvil cruza todo el ancho.
    const mid = wide ? margin * 0.5 : vw / 2;
    const amp = wide ? Math.max(margin * 0.3, 14) : vw / 2 - size;
    const period = wide ? 900 : 1100;
    for (let y = 760, i = 0; y < docH - 160; y += step, i++) {
      const center = mid + Math.sin(y / period * Math.PI * 2) * amp;
      const slope = Math.cos(y / period * Math.PI * 2) * amp * 2 * Math.PI / period;
      const heading = 180 + Math.atan(slope) * 180 / Math.PI * -1;
      const foot = (i % 2 ? 1 : -1) * (wide ? 11 : 8);
      const p = document.createElement('span');
      p.className = 'pawprint';
      p.style.cssText = `--s:${size}px; left:${center + foot - size / 2}px; top:${y}px; rotate:${heading}deg`;
      paws.append(p);
    }
    prints = [...paws.children];
    showPaws();
  };
  const showPaws = () => {
    const edge = still ? Infinity : scrollY + innerHeight * 0.82;
    for (const p of prints) if (!p.classList.contains('on') && p.offsetTop < edge) p.classList.add('on');
  };
  let ticking = false;
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { showPaws(); ticking = false; }); } }, { passive: true });
  let resizeTimer;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layPaws, 200); });
  addEventListener('load', layPaws);

  if (still) return;

  // Al entrar en pantalla: la cinta se desenrolla, los sellos se estampan en orden y el rastreo avanza paso a paso.
  root.classList.add('motion');
  const groups = new Map();
  document.querySelectorAll('.stampable').forEach((el) => {
    const g = el.closest('ul, .label') || el;
    groups.set(g, (groups.get(g) || 0) + 1);
    el.style.setProperty('--d', `${(groups.get(g) - 1) * 140}ms`);
  });
  // Una cinta enrollada no tiene área visible, así que se vigila su contenedor.
  document.querySelectorAll('.tape, .stampable, .track').forEach((el) => {
    onSight(el.matches('.tape') ? el.parentElement : el, () => {
      el.classList.add('is-in');
      if (el.matches('.track')) el.querySelectorAll('li').forEach((li, i) => setTimeout(() => li.classList.add('is-in'), 250 + i * 380));
    }, 0.2);
  });

  // Cintas y sello: el texto corre sin fin. Se repite la frase hasta cubrir el ancho y se duplica para que -50% cierre sin salto.
  const runTapes = () => document.querySelectorAll('.tape, .seal').forEach((band) => {
    const span = band.querySelector('span');
    band.dataset.text ||= span.textContent.trim().replace(/\s*·$/, '') + ' · ';
    const unit = band.dataset.text;
    let n = 1;
    span.textContent = unit;
    while (span.offsetWidth < band.clientWidth && n < 40) { n++; span.textContent = unit.repeat(n); }
    span.textContent = unit.repeat(n * 2);
    span.style.animationDuration = `${span.offsetWidth / 2 / 60}s`; // 60 px por segundo
  });
  runTapes();
  addEventListener('load', runTapes);
  let tapeTimer;
  addEventListener('resize', () => { clearTimeout(tapeTimer); tapeTimer = setTimeout(runTapes, 250); });

  // Gatito vivo: parpadea de vez en cuando; el inspector voltea hacia el cursor.
  for (const cat of document.querySelectorAll('[data-cat]')) {
    const blink = () => {
      cat.classList.remove('blink'); void cat.offsetWidth; cat.classList.add('blink');
      setTimeout(blink, 2600 + Math.random() * 3600);
    };
    setTimeout(blink, 1200 + Math.random() * 2000);
  }
  const follow = document.querySelector('[data-follow]');
  if (follow && matchMedia('(pointer: fine)').matches) {
    const area = follow.closest('section');
    area.addEventListener('pointermove', (e) => {
      const r = follow.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (innerWidth / 2)));
      const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (innerHeight / 2)));
      follow.style.setProperty('--fx', `${dx * 10}px`);
      follow.style.setProperty('--fy', `${dy * 8}px`);
      follow.style.setProperty('--fr', `${dx * 7}deg`);
    });
    area.addEventListener('pointerleave', () => ['--fx', '--fy', '--fr'].forEach((v) => follow.style.removeProperty(v)));
  }

  // Marcador: el HTML trae el final. Al verlo, Quetzal Greedy resuelve B en el minuto 107, sube al primer lugar y la cinta lo sella.
  const board = document.querySelector('[data-board]');
  const seal = document.querySelector('.seal');
  if (board) {
    const climber = board.querySelector('[data-climb]');
    const late = climber.querySelector('[data-late]');
    const pen = climber.querySelector('[data-pen]');
    const solved = climber.querySelector('.solved');
    const renumber = () => [...board.rows].forEach((tr, i) => { tr.cells[0].textContent = i + 1; });
    // Estado previo: tercero con A, C y D; 190 de penalización.
    late.classList.remove('y'); pen.textContent = '190'; solved.setAttribute('aria-label', 'A, C y D resueltos');
    board.rows[2].after(climber); renumber();
    onSight(board.closest('.label'), async () => {
      await wait(900);
      late.classList.add('y', 'flash');
      setTimeout(() => late.classList.remove('flash'), 300);
      for (let n = 190; n <= 297; n += 9) { pen.textContent = Math.min(n, 297); await wait(28); }
      pen.textContent = '297';
      solved.setAttribute('aria-label', 'A, B, C y D resueltos');
      await wait(250);
      // FLIP: se mide antes y después del cambio de orden y se anima la diferencia.
      const rows = [...board.rows];
      const before = new Map(rows.map((tr) => [tr, tr.getBoundingClientRect().top]));
      board.prepend(climber); renumber();
      climber.classList.add('is-moving');
      for (const tr of rows) {
        const dy = before.get(tr) - tr.getBoundingClientRect().top;
        if (dy) tr.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      }
      await wait(900);
      climber.classList.remove('is-moving');
      await wait(400);
      seal.classList.add('is-in');
    }, 0.6);
  } else if (seal) seal.classList.add('is-in');

  // Terminal: el comando se teclea y los servicios aparecen uno por uno.
  onSight(document.querySelector('[data-type]'), async (pre) => {
    const [first, ...rest] = pre.innerHTML.split('\n');
    const cmd = 'docker compose up -d --build';
    const prompt = first.slice(0, first.indexOf(cmd));
    pre.innerHTML = `${prompt}<span class="caret"></span>`;
    await wait(500);
    for (let i = 1; i <= cmd.length; i++) {
      pre.innerHTML = `${prompt}${cmd.slice(0, i)}<span class="caret"></span>`;
      await wait(38 + Math.random() * 50);
    }
    await wait(450);
    let shown = first;
    for (const line of rest) { shown += `\n${line}`; pre.innerHTML = shown; await wait(320); }
  }, 0.6);

  // Notificación que llega al terminar el juicio del inicio.
  const notify = () => {
    const src = document.querySelector('.toast');
    if (!src) return;
    const pop = src.cloneNode(true);
    pop.classList.add('toast--pop');
    pop.classList.remove('taped');
    pop.setAttribute('aria-hidden', 'true');
    pop.removeAttribute('role'); pop.removeAttribute('aria-label');
    document.body.append(pop);
    const close = () => { pop.classList.remove('is-in'); setTimeout(() => pop.remove(), 600); };
    pop.addEventListener('click', close);
    void pop.offsetWidth; // fija la posición de salida antes de animar la entrada
    pop.classList.add('is-in');
    setTimeout(close, 4800);
  };

  // Etiqueta del envío: el HTML trae el estado final; con movimiento, se juzga caso por caso al verla.
  const run = document.querySelector('[data-run]');
  if (!run) return;
  const crate = run.closest('.crate');
  const cases = [...run.querySelectorAll('[data-cases] i')];
  const count = run.querySelector('[data-count]');
  const stamp = run.querySelector('[data-stamp]');
  const status = document.querySelector('[data-status]');
  const final = status.textContent;

  onSight(run, async () => {
    crate.classList.add('is-judging');
    run.querySelector('[data-cases]').classList.add('is-running');
    cases.forEach((c) => c.classList.remove('on'));
    stamp.classList.remove('is-on'); stamp.classList.add('is-hidden');
    count.textContent = '00/12';
    status.textContent = 'Juzgando el envío…';
    await wait(500);
    for (let i = 0; i < cases.length; i++) {
      cases[i].classList.add('on');
      count.textContent = `${String(i + 1).padStart(2, '0')}/12`;
      await wait(110 + Math.random() * 120);
    }
    await wait(180);
    stamp.classList.remove('is-hidden'); stamp.classList.add('is-on');
    crate.classList.remove('is-judging');
    status.textContent = final;
    await wait(500);
    notify();
  }, 0.5);
})();
