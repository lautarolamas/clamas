(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const PAGE_SIZE = 9;
  const state = {
    works: [],
    categories: [],
    filter: 'all',
    visible: PAGE_SIZE,
    site: { whatsapp: '5491127231155', whatsappDisplay: '11 2723-1155', instagram: '', instagramHandle: '' },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const NS = 'http://www.w3.org/2000/svg';

  /** Crea elementos DOM de forma segura (sin innerHTML con datos). */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid);
    return n;
  }

  function icon(id, cls) {
    const svg = document.createElementNS(NS, 'svg');
    if (cls) svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#' + id);
    svg.append(use);
    return svg;
  }

  /* ───────────── WhatsApp ───────────── */
  const waLink = (text) =>
    `https://wa.me/${state.site.whatsapp}?text=${encodeURIComponent(text)}`;
  const DEFAULT_MSG = 'Hola! Vi su página web y quiero pedir un presupuesto.';

  function applySite() {
    document.querySelectorAll('[data-wa]').forEach((a) => { a.href = waLink(DEFAULT_MSG); });
    const num = $('#wa-number'); if (num) num.textContent = state.site.whatsappDisplay;
    const ig = $('#ig-link'); if (ig && state.site.instagram) ig.href = state.site.instagram;
    const handle = $('#ig-handle'); if (handle && state.site.instagramHandle) handle.textContent = state.site.instagramHandle;
  }

  /* ───────────── Header / menú ───────────── */
  const header = $('.site-header');
  const nav = $('#nav');
  const burger = $('#burger');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 12);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  function setMenu(open) {
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  }
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });

  $('#year').textContent = new Date().getFullYear();

  /* ───────────── Animación de entrada ───────────── */
  const revealIO = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    : null;
  document.querySelectorAll('.reveal').forEach((n, i) => {
    n.style.transitionDelay = `${(i % 3) * 70}ms`;
    revealIO ? revealIO.observe(n) : n.classList.add('in');
  });

  /* ───────────── Filtros + grilla ───────────── */
  const filtersEl = $('#filters');
  const gridEl = $('#grid');
  const moreEl = $('#more');
  const emptyEl = $('#empty');

  const catName = (id) => (state.categories.find((c) => c.id === id) || {}).name;
  const cover = (w) => w.after[0] || w.before[0];

  function renderFilters() {
    filtersEl.replaceChildren();
    if (!state.categories.length) { filtersEl.hidden = true; return; }
    filtersEl.hidden = false;
    const mk = (id, label, count) => el('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(state.filter === id),
      onclick: () => { state.filter = id; state.visible = PAGE_SIZE; renderFilters(); renderGrid(); },
    }, label, count != null ? el('em', { text: String(count) }) : null);
    filtersEl.append(mk('all', 'Todos', state.works.length));
    for (const c of state.categories) filtersEl.append(mk(c.id, c.name, c.count));
  }

  function card(w, i) {
    const cats = w.categories.map(catName).filter(Boolean).slice(0, 2);
    const hasBoth = w.before.length && w.after.length;
    const loc = w.locationText
      ? el('p', { class: 'card-loc' }, icon('i-pin'), el('span', { text: w.locationText }))
      : w.mapsUrl
        ? el('p', { class: 'card-loc' }, icon('i-pin'), el('span', { text: 'Ver ubicación en el mapa' }))
        : null;
    return el('a', { class: 'card', href: `#obra-${w.id}`, style: `animation-delay:${Math.min(i, 8) * 60}ms`, 'aria-label': `Ver obra: ${w.title}` },
      el('div', { class: 'card-media' },
        el('img', { src: cover(w), alt: w.title, loading: 'lazy', decoding: 'async' }),
        hasBoth ? el('span', { class: 'tag-ba', text: 'Antes y después' }) : null),
      el('div', { class: 'card-body' },
        cats.length ? el('div', { class: 'card-cats' }, cats.map((c) => el('span', { text: c }))) : null,
        el('h3', { text: w.title }),
        loc));
  }

  function filtered() {
    return state.filter === 'all' ? state.works : state.works.filter((w) => w.categories.includes(state.filter));
  }

  function renderGrid() {
    const list = filtered();
    gridEl.replaceChildren(...list.slice(0, state.visible).map(card));
    moreEl.hidden = list.length <= state.visible;
    emptyEl.hidden = list.length > 0;
    emptyEl.textContent = state.works.length
      ? 'Todavía no hay trabajos en esta categoría.'
      : 'Muy pronto vamos a mostrar acá nuestros trabajos.';
  }
  $('#more-btn').addEventListener('click', () => { state.visible += PAGE_SIZE; renderGrid(); });

  /* ───────────── Modal de obra ───────────── */
  const modal = $('#modal');
  const tabsEl = $('#m-tabs');
  const stageEl = $('#m-stage');
  const thumbsEl = $('#m-thumbs');
  const infoEl = $('#m-info');
  const m = { work: null, tab: 'after', idx: 0, opener: null, fromLink: false };

  const setOf = (tab) => (tab === 'before' ? m.work.before : m.work.after);

  function renderModal() {
    const w = m.work;
    const hasBefore = w.before.length > 0;
    const hasAfter = w.after.length > 0;
    const pairs = Math.min(w.before.length, w.after.length);

    // pestañas
    const tabs = [];
    if (pairs) tabs.push(['compare', 'Comparar']);
    if (hasBefore) tabs.push(['before', 'Antes', w.before.length]);
    if (hasAfter) tabs.push(['after', 'Después', w.after.length]);
    tabsEl.replaceChildren(...tabs.map(([id, label, n]) => el('button', {
      type: 'button', role: 'tab', 'aria-selected': String(m.tab === id),
      onclick: () => { m.tab = id; m.idx = 0; renderModal(); },
    }, label, n > 1 ? el('em', { text: `(${n})` }) : null)));
    tabsEl.hidden = tabs.length < 2;

    // escenario
    stageEl.replaceChildren();
    thumbsEl.replaceChildren();
    if (m.tab === 'compare') {
      m.idx = Math.min(m.idx, pairs - 1);
      const range = el('input', { type: 'range', min: '0', max: '100', value: '50', 'aria-label': 'Deslizá para comparar el antes y el después' });
      const box = el('div', { class: 'compare' },
        el('img', { class: 'img-after', src: w.after[m.idx], alt: `Después: ${w.title}`, draggable: 'false' }),
        el('img', { class: 'img-before', src: w.before[m.idx], alt: `Antes: ${w.title}`, draggable: 'false' }),
        el('span', { class: 'lbl l', text: 'Antes' }),
        el('span', { class: 'lbl r', text: 'Después' }),
        el('div', { class: 'handle' }),
        range);
      range.addEventListener('input', () => box.style.setProperty('--pos', range.value + '%'));
      stageEl.append(box);
      if (pairs > 1) addArrows(pairs);
    } else {
      const list = setOf(m.tab);
      m.idx = Math.min(m.idx, list.length - 1);
      stageEl.append(el('img', {
        class: 'main', src: list[m.idx], draggable: 'false',
        alt: `${m.tab === 'before' ? 'Antes' : 'Después'} ${m.idx + 1}: ${w.title}`,
      }));
      if (list.length > 1) {
        addArrows(list.length);
        thumbsEl.append(...list.map((src, i) => el('button', {
          type: 'button', 'aria-label': `Foto ${i + 1}`, 'aria-current': String(i === m.idx),
          onclick: () => { m.idx = i; renderModal(); },
        }, el('img', { src, alt: '', loading: 'lazy' }))));
      }
    }
  }

  function addArrows(total) {
    const go = (d) => { m.idx = (m.idx + d + total) % total; renderModal(); };
    stageEl.append(
      el('button', { class: 'arrow prev', type: 'button', 'aria-label': 'Foto anterior', onclick: () => go(-1) }, icon('i-chev-l')),
      el('button', { class: 'arrow next', type: 'button', 'aria-label': 'Foto siguiente', onclick: () => go(1) }, icon('i-chev-r')),
      el('span', { class: 'counter', text: `${m.idx + 1} / ${total}` }));
    stageEl.dataset.total = String(total);
  }

  function renderInfo() {
    const w = m.work;
    const cats = w.categories.map(catName).filter(Boolean);
    const locRows = [];
    if (w.locationText) {
      locRows.push(el('div', { class: 'row' }, icon('i-pin'), el('div', {}, el('small', { text: 'Ubicación' }), w.locationText)));
    }
    if (w.mapsUrl) {
      if (!w.locationText) locRows.push(el('div', { class: 'row' }, icon('i-pin'), el('div', {}, el('small', { text: 'Ubicación' }), 'Mirá dónde se hizo esta obra')));
      locRows.push(el('a', { class: 'btn btn-ghost btn-sm', href: w.mapsUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Ver en Google Maps', icon('i-arrow', 'ico')));
    }
    const msg = `Hola! Vi la obra "${w.title}" en su página y quiero consultar por un trabajo parecido.`;
    infoEl.replaceChildren(
      cats.length ? el('div', { class: 'card-cats' }, cats.map((c) => el('span', { text: c }))) : null,
      el('h2', { id: 'm-title', text: w.title }),
      w.description ? el('p', { class: 'm-desc', text: w.description }) : null,
      locRows.length ? el('div', { class: 'm-loc' }, locRows) : null,
      el('div', { class: 'm-cta' },
        el('a', { class: 'btn btn-gold', href: waLink(msg), target: '_blank', rel: 'noopener noreferrer' }, icon('i-wa', 'ico'), 'Quiero algo así')));
  }

  function showModal(w) {
    m.work = w;
    m.tab = w.before.length && w.after.length ? 'compare' : (w.after.length ? 'after' : 'before');
    m.idx = 0;
    if (!modal.hidden) { renderModal(); renderInfo(); return; }
    m.opener = document.activeElement;
    renderModal();
    renderInfo();
    modal.hidden = false;
    document.documentElement.classList.add('lock');
    $('.modal-panel', modal).scrollTop = 0;
    $('.modal-close', modal).focus({ preventScroll: true });
  }

  function hideModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.documentElement.classList.remove('lock');
    stageEl.replaceChildren();
    if (m.opener && document.contains(m.opener)) m.opener.focus({ preventScroll: true });
    m.opener = null;
  }

  function requestClose() {
    if (modal.hidden) return;
    if (m.fromLink) {
      // se abrió desde un link directo: no hay "atrás" dentro del sitio
      m.fromLink = false;
      history.replaceState(null, '', location.pathname + location.search + '#trabajos');
      hideModal();
    } else {
      history.back(); // hashchange cierra el modal
    }
  }

  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) requestClose(); });

  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && stageEl.dataset.total > 1 && e.target.tagName !== 'INPUT') {
      const arrow = $(e.key === 'ArrowLeft' ? '.arrow.prev' : '.arrow.next', stageEl);
      if (arrow) arrow.click();
    }
    if (e.key === 'Tab') { // mantener el foco dentro del modal
      const f = [...modal.querySelectorAll('a[href], button, input')].filter((n) => !n.disabled && n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // deslizar con el dedo para pasar de foto
  let touchX = null;
  stageEl.addEventListener('touchstart', (e) => { touchX = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  stageEl.addEventListener('touchend', (e) => {
    if (touchX == null || m.tab === 'compare') return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) { const a = $(dx < 0 ? '.arrow.next' : '.arrow.prev', stageEl); if (a) a.click(); }
  }, { passive: true });

  /* ───────────── Ruta (#obra-ID) ───────────── */
  function route(initial) {
    const hit = location.hash.match(/^#obra-([\w-]+)$/);
    const work = hit && state.works.find((w) => w.id === hit[1]);
    if (work) {
      if (initial) m.fromLink = true;
      showModal(work);
    } else {
      hideModal();
    }
  }
  window.addEventListener('hashchange', () => route(false));

  /* ───────────── Datos ───────────── */
  async function load() {
    try {
      const [site, data] = await Promise.all([
        fetch('/api/site').then((r) => r.json()),
        fetch('/api/works').then((r) => r.json()),
      ]);
      Object.assign(state.site, site);
      state.works = data.works || [];
      state.categories = data.categories || [];
    } catch (err) {
      gridEl.replaceChildren();
      emptyEl.hidden = false;
      emptyEl.textContent = 'No pudimos cargar los trabajos. Recargá la página en unos segundos.';
      return;
    }
    applySite();
    renderFilters();
    renderGrid();
    if (location.hash.startsWith('#obra-')) route(true);
  }
  load();
})();
