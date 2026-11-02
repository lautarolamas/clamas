(() => {
  'use strict';

  const app = document.getElementById('app');
  const layer = document.getElementById('layer');
  const toasts = document.getElementById('toasts');
  const NS = 'http://www.w3.org/2000/svg';
  const state = { works: [], cats: [] };

  const uid = () => Math.random().toString(36).slice(2, 10);

  /** Crea elementos DOM sin usar innerHTML con datos del usuario. */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'value') n.value = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid);
    return n;
  }

  const PATHS = {
    plus: 'M12 5v14M5 12h14',
    edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    tag: 'M3 12V4h8l10 10-8 8L3 12ZM8 8h.01',
    link: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h11',
    x: 'M6 6l12 12M18 6 6 18',
    left: 'm15 5-7 7 7 7',
    right: 'm9 5 7 7-7 7',
    camera: 'M3 7h4l2-3h6l2 3h4v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    check: 'm5 12 5 5 9-10',
  };
  function icon(name) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', PATHS[name]);
    svg.append(p);
    return svg;
  }

  function toast(msg, type = 'ok') {
    const t = el('div', { class: 'toast ' + type, text: msg });
    toasts.append(t);
    setTimeout(() => t.remove(), 3800);
  }

  /* ───────────── API ───────────── */
  async function api(method, url, body, raw) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (raw) {
      opts.body = raw;
      opts.headers['Content-Type'] = raw.type || 'application/octet-stream';
    } else if (body !== undefined && body !== null) {
      opts.body = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (_) {
      throw new Error('No hay conexión. Revisá tu internet y probá de nuevo.');
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* sin cuerpo */ }
    if (res.status === 401 && !url.endsWith('/login')) {
      showLogin('Tu sesión venció. Volvé a ingresar.');
      throw Object.assign(new Error('auth'), { silent: true });
    }
    if (!res.ok) throw new Error((data && data.error) || 'Algo salió mal (error ' + res.status + '). Probá de nuevo.');
    return data;
  }

  /* ───────────── Capas (modales) ───────────── */
  const stack = [];
  function openLayer(node, onEscape) {
    layer.append(node);
    stack.push({ node, onEscape });
    document.documentElement.classList.add('lock');
  }
  function closeLayer(node) {
    const i = stack.findIndex((s) => s.node === node);
    if (i >= 0) stack.splice(i, 1);
    node.remove();
    if (!stack.length) document.documentElement.classList.remove('lock');
  }
  function closeAllLayers() {
    while (stack.length) closeLayer(stack[stack.length - 1].node);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) stack[stack.length - 1].onEscape();
  });

  function confirmBox({ title, text, ok = 'Aceptar', cancel = 'Cancelar', danger = false }) {
    return new Promise((resolve) => {
      let node;
      const done = (v) => { closeLayer(node); resolve(v); };
      node = el('div', { class: 'overlay center' },
        el('div', { class: 'backdrop', onclick: () => done(false) }),
        el('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
          el('h3', { text: title }),
          text ? el('p', { text }) : null,
          el('div', { class: 'dialog-actions' },
            el('button', { class: 'btn btn-line', type: 'button', text: cancel, onclick: () => done(false) }),
            el('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-gold'), type: 'button', text: ok, onclick: () => done(true) }))));
      openLayer(node, () => done(false));
      node.querySelector('.dialog-actions .btn:last-child').focus();
    });
  }

  /* ───────────── Login ───────────── */
  function showLogin(message) {
    closeAllLayers();
    const err = el('p', { class: 'form-error', role: 'alert', hidden: !message, text: message || '' });
    const user = el('input', { class: 'input', name: 'username', type: 'text', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
    const pass = el('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'current-password', required: true });
    const toggle = el('button', { type: 'button', text: 'Mostrar', onclick: () => {
      const show = pass.type === 'password';
      pass.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Ocultar' : 'Mostrar';
    } });
    const submit = el('button', { class: 'btn btn-gold', type: 'submit', text: 'Ingresar' });

    const form = el('form', { class: 'login-card', onsubmit: async (e) => {
      e.preventDefault();
      err.hidden = true;
      submit.disabled = true;
      submit.textContent = 'Ingresando…';
      try {
        await api('POST', '/api/admin/login', { user: user.value, password: pass.value });
        await load();
      } catch (ex) {
        if (ex.silent) return;
        err.textContent = ex.message;
        err.hidden = false;
        submit.disabled = false;
        submit.textContent = 'Ingresar';
        pass.select();
      }
    } },
      el('img', { src: '/img/logo-192.png', alt: 'Logo', width: 108, height: 108 }),
      el('h1', { text: 'Panel de obras' }),
      el('p', { class: 'muted', text: 'Ingresá para cargar y editar tus trabajos.' }),
      err,
      el('div', { class: 'field' }, el('label', { text: 'Usuario' }), user),
      el('div', { class: 'field' }, el('label', { text: 'Contraseña' }), el('div', { class: 'pw' }, pass, toggle)),
      submit);
    app.replaceChildren(el('main', { class: 'login' }, form));
    user.focus();
  }

  /* ───────────── Tablero ───────────── */
  const catName = (id) => (state.cats.find((c) => c.id === id) || {}).name;
  const cover = (w) => w.after[0] || w.before[0];
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

  async function load() {
    const data = await api('GET', '/api/admin/works');
    state.works = data.works;
    state.cats = data.categories;
    renderDashboard();
  }

  function renderDashboard() {
    const demoCount = state.works.filter((w) => w.demo).length;

    const topbar = el('header', { class: 'topbar' }, el('div', { class: 'wrap' },
      el('div', { class: 'tb-brand' },
        el('img', { src: '/img/logo-192.png', alt: '' }),
        el('div', {}, el('b', { text: 'PANEL DE OBRAS' }), el('small', { text: 'Cambio de imagen de tu casa' }))),
      el('div', { class: 'tb-actions' },
        el('a', { class: 'btn btn-line btn-sm', href: '/', target: '_blank', rel: 'noopener', 'aria-label': 'Ver el sitio web' }, icon('link'), el('span', { text: 'Ver sitio' })),
        el('button', { class: 'btn btn-line btn-sm', type: 'button', 'aria-label': 'Salir del panel', onclick: logout }, icon('logout'), el('span', { text: 'Salir' })))));

    const head = el('div', { class: 'dash-head' },
      el('h1', {}, 'Mis ', el('span', { class: 'gold', text: 'obras' })),
      el('div', { class: 'actions' },
        el('button', { class: 'btn btn-line', type: 'button', onclick: openCategories }, icon('tag'), 'Categorías'),
        el('button', { class: 'btn btn-gold', type: 'button', onclick: () => openEditor(null) }, icon('plus'), 'Nueva obra')));

    const banner = demoCount
      ? el('div', { class: 'banner' },
          el('p', { text: `Hay ${demoCount} ${demoCount === 1 ? 'obra de ejemplo' : 'obras de ejemplo'} con fotos ilustradas, solo para mostrar cómo se ve el sitio. Cuando subas las tuyas, borralas todas juntas.` }),
          el('button', { class: 'btn btn-ghost-danger btn-sm', type: 'button', onclick: removeDemos }, icon('trash'), 'Borrar ejemplos'))
      : null;

    const list = state.works.length
      ? el('div', { class: 'list' }, state.works.map(workRow))
      : el('div', { class: 'empty-state' },
          el('h2', { text: 'Todavía no cargaste obras' }),
          el('p', { text: 'Subí las fotos del antes y el después y aparecen en tu página web.' }),
          el('button', { class: 'btn btn-gold', type: 'button', onclick: () => openEditor(null) }, icon('plus'), 'Cargar mi primera obra'));

    app.replaceChildren(topbar, el('main', { class: 'wrap dash' }, head, banner, list));
  }

  function workRow(w) {
    const cats = w.categories.map(catName).filter(Boolean);
    const place = w.locationText || (w.mapsUrl ? 'Con link de Google Maps' : '');
    return el('article', { class: 'work' },
      el('div', { class: 'work-thumb' },
        el('img', { src: cover(w), alt: '', loading: 'lazy' }),
        w.demo ? el('span', { class: 'demo-tag', text: 'Ejemplo' }) : null),
      el('div', { class: 'work-main' },
        el('h3', { text: w.title }),
        cats.length ? el('div', { class: 'chips' }, cats.map((c) => el('span', { class: 'tag', text: c }))) : null,
        el('p', { class: 'meta', text: `${w.before.length} antes · ${w.after.length} después · ${fmtDate(w.createdAt)}${place ? ' · ' + place : ''}` })),
      el('div', { class: 'work-actions' },
        el('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: () => openEditor(w) }, icon('edit'), 'Editar'),
        el('button', { class: 'btn btn-ghost-danger btn-sm', type: 'button', onclick: () => removeWork(w) }, icon('trash'), 'Eliminar')));
  }

  async function removeWork(w) {
    const ok = await confirmBox({
      title: '¿Eliminar esta obra?',
      text: `"${w.title}" se va a borrar de tu página junto con todas sus fotos. No se puede deshacer.`,
      ok: 'Sí, eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api('DELETE', `/api/admin/works/${w.id}`);
      toast('Obra eliminada');
      await load();
    } catch (e) { if (!e.silent) toast(e.message, 'warn'); }
  }

  async function removeDemos() {
    const ok = await confirmBox({
      title: '¿Borrar las obras de ejemplo?',
      text: 'Se borran solo las obras marcadas como "Ejemplo". Las que cargaste vos no se tocan.',
      ok: 'Borrar ejemplos',
      danger: true,
    });
    if (!ok) return;
    try {
      await api('DELETE', '/api/admin/demo-works');
      toast('Ejemplos eliminados');
      await load();
    } catch (e) { if (!e.silent) toast(e.message, 'warn'); }
  }

  async function logout() {
    try { await api('POST', '/api/admin/logout'); } catch (_) { /* da igual */ }
    showLogin();
  }

  /* ───────────── Gestor de categorías ───────────── */
  function openCategories() {
    let node;
    const close = async () => { closeLayer(node); await load().catch(() => {}); };
    const listEl = el('div', { class: 'cat-list' });
    const countOf = (id) => state.works.filter((w) => w.categories.includes(id)).length;

    function renderList() {
      listEl.replaceChildren(...state.cats.map((c) => {
        const input = el('input', { class: 'input', type: 'text', maxlength: 40, value: c.name, 'aria-label': `Nombre de la categoría ${c.name}` });
        const commit = async () => {
          const name = input.value.trim();
          if (!name || name === c.name) { input.value = c.name; return; }
          try {
            const { category } = await api('PUT', `/api/admin/categories/${c.id}`, { name });
            c.name = category.name;
            input.value = c.name;
            toast('Categoría actualizada');
          } catch (e) {
            input.value = c.name;
            if (!e.silent) toast(e.message, 'warn');
          }
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
        const n = countOf(c.id);
        return el('div', { class: 'cat-row' },
          input,
          el('small', { text: `${n} ${n === 1 ? 'obra' : 'obras'}` }),
          el('button', { class: 'btn btn-ghost-danger icon-btn', type: 'button', 'aria-label': `Eliminar categoría ${c.name}`, onclick: async () => {
            const ok = await confirmBox({
              title: `¿Eliminar "${c.name}"?`,
              text: n ? `Se quita de ${n} ${n === 1 ? 'obra' : 'obras'}. Las obras no se borran.` : 'Esta categoría no se usa en ninguna obra.',
              ok: 'Eliminar', danger: true,
            });
            if (!ok) return;
            try {
              await api('DELETE', `/api/admin/categories/${c.id}`);
              state.cats = state.cats.filter((x) => x.id !== c.id);
              state.works.forEach((w) => { w.categories = w.categories.filter((id) => id !== c.id); });
              renderList();
              toast('Categoría eliminada');
            } catch (e) { if (!e.silent) toast(e.message, 'warn'); }
          } }, icon('trash')));
      }));
      if (!state.cats.length) listEl.append(el('p', { class: 'muted', text: 'Todavía no hay categorías. Agregá la primera acá abajo.' }));
    }

    const newInput = el('input', { class: 'input', type: 'text', maxlength: 40, placeholder: 'Nueva categoría (ej: Baños, Cercos…)', 'aria-label': 'Nombre de la nueva categoría' });
    const add = async () => {
      const name = newInput.value.trim();
      if (!name) return;
      try {
        const { category, existed } = await api('POST', '/api/admin/categories', { name });
        if (existed) toast('Esa categoría ya existe', 'warn');
        else { state.cats.push(category); toast('Categoría agregada'); }
        newInput.value = '';
        renderList();
      } catch (e) { if (!e.silent) toast(e.message, 'warn'); }
    };
    newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    node = el('div', { class: 'overlay center' },
      el('div', { class: 'backdrop', onclick: close }),
      el('div', { class: 'dialog wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Categorías' },
        el('h3', { text: 'Categorías' }),
        el('p', { class: 'muted', text: 'Son las etiquetas con las que la gente filtra tus trabajos en la página. Tocá un nombre para cambiarlo.' }),
        listEl,
        el('div', { class: 'add-row' }, newInput, el('button', { class: 'btn btn-gold', type: 'button', onclick: add }, icon('plus'), 'Agregar')),
        el('div', { class: 'dialog-actions' }, el('button', { class: 'btn btn-line', type: 'button', text: 'Listo', onclick: close }))));
    renderList();
    openLayer(node, close);
  }

  /* ───────────── Editor de obra ───────────── */
  const MAX_SIDE = 1500;

  /** Achica y comprime la foto en el celular antes de subirla. */
  async function compress(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale);
      const h = Math.round(bmp.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      if (blob) return blob;
    } catch (_) { /* seguimos con el original */ }
    if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= 15 * 1024 * 1024) return file;
    throw new Error('Esa foto no se pudo procesar. Probá con otra.');
  }

  // cola de subida: 2 fotos a la vez
  let active = 0;
  const pending = [];
  function enqueue(fn) { pending.push(fn); pump(); }
  function pump() {
    while (active < 2 && pending.length) {
      active += 1;
      pending.shift()().finally(() => { active -= 1; pump(); });
    }
  }

  function openEditor(work) {
    const ed = {
      id: work ? work.id : null,
      title: work ? work.title : '',
      description: work ? work.description : '',
      cats: new Set(work ? work.categories : []),
      locationText: work ? work.locationText : '',
      mapsUrl: work ? work.mapsUrl : '',
      before: [],
      after: [],
      dirty: false,
    };
    ed.locMode = ed.locationText && ed.mapsUrl ? 'both' : ed.mapsUrl ? 'maps' : 'text';
    for (const side of ['before', 'after']) {
      ed[side] = (work ? work[side] : []).map((url) => ({ key: uid(), url, file: url.split('/').pop(), status: 'ok' }));
    }

    let node;
    const blobs = [];
    const renderers = {};
    const markDirty = () => { ed.dirty = true; };

    /* — título — */
    const titleInput = el('input', { class: 'input', type: 'text', maxlength: 120, placeholder: 'Ej: Pérgola de madera con deck', value: ed.title, 'aria-required': 'true',
      oninput: () => { ed.title = titleInput.value; } });

    /* — descripción — */
    const counter = el('span', { class: 'counter', text: `${ed.description.length}/800` });
    const descInput = el('textarea', { class: 'input', rows: 4, maxlength: 800, placeholder: 'Contá en pocas palabras qué se hizo en esta obra…',
      oninput: () => { ed.description = descInput.value; counter.textContent = `${descInput.value.length}/800`; } }, ed.description);

    /* — categorías — */
    const pick = el('div', { class: 'pick' });
    const renderCats = () => {
      pick.replaceChildren(...state.cats.map((c) => el('button', {
        class: 'pill', type: 'button', 'aria-pressed': String(ed.cats.has(c.id)),
        onclick: () => { ed.cats.has(c.id) ? ed.cats.delete(c.id) : ed.cats.add(c.id); markDirty(); renderCats(); },
      }, c.name)));
      if (!state.cats.length) pick.append(el('p', { class: 'hint', text: 'Todavía no hay categorías. Creá la primera acá abajo.' }));
    };
    const newCat = el('input', { class: 'input', type: 'text', maxlength: 40, placeholder: 'Nueva categoría (ej: Baños)', 'aria-label': 'Nueva categoría' });
    const addCat = async () => {
      const name = newCat.value.trim();
      if (!name) return;
      try {
        const { category, existed } = await api('POST', '/api/admin/categories', { name });
        if (!existed) state.cats.push(category);
        ed.cats.add(category.id);
        newCat.value = '';
        markDirty();
        renderCats();
      } catch (e) { if (!e.silent) toast(e.message, 'warn'); }
    };
    newCat.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } });

    /* — ubicación — */
    const locBox = el('div', { class: 'loc-fields' });
    const segBox = el('div', { class: 'seg', role: 'group', 'aria-label': 'Cómo indicar la ubicación' });
    const textField = () => el('div', { class: 'field' },
      el('label', { text: 'Dirección o zona' }),
      el('input', { class: 'input', type: 'text', maxlength: 160, placeholder: 'Ej: Villa Devoto, Buenos Aires', value: ed.locationText,
        oninput: (e) => { ed.locationText = e.target.value; markDirty(); } }));
    const mapsField = () => el('div', { class: 'field' },
      el('label', { text: 'Link de Google Maps' }),
      el('input', { class: 'input', type: 'url', inputmode: 'url', autocapitalize: 'none', maxlength: 600, placeholder: 'https://maps.app.goo.gl/…', value: ed.mapsUrl,
        oninput: (e) => { ed.mapsUrl = e.target.value; markDirty(); } }),
      el('p', { class: 'hint', text: 'Abrí el lugar en Google Maps, tocá "Compartir", copiá el link y pegalo acá.' }));
    const renderLoc = () => {
      segBox.replaceChildren(...[['text', 'Escribir dirección'], ['maps', 'Link de Maps'], ['both', 'Las dos']].map(([id, label]) =>
        el('button', { type: 'button', 'aria-pressed': String(ed.locMode === id), text: label, onclick: () => { ed.locMode = id; markDirty(); renderLoc(); } })));
      locBox.replaceChildren(
        ...(ed.locMode === 'text' || ed.locMode === 'both' ? [textField()] : []),
        ...(ed.locMode === 'maps' || ed.locMode === 'both' ? [mapsField()] : []));
    };

    /* — fotos — */
    const saveBtn = el('button', { class: 'btn btn-gold', type: 'submit', text: 'Guardar obra' });
    const uploading = () => [...ed.before, ...ed.after].some((i) => i.status === 'uploading');
    const refreshSave = () => {
      const busy = uploading();
      saveBtn.disabled = busy;
      saveBtn.textContent = busy ? 'Subiendo fotos…' : 'Guardar obra';
    };

    function addFiles(side, files) {
      for (const f of files) {
        if (!f.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)) {
          toast(`"${f.name}" no es una foto`, 'warn');
          continue;
        }
        const url = URL.createObjectURL(f);
        blobs.push(url);
        const item = { key: uid(), url, file: null, status: 'uploading' };
        ed[side].push(item);
        markDirty();
        enqueue(async () => {
          try {
            const blob = await compress(f);
            const res = await api('POST', '/api/admin/upload', null, blob);
            item.file = res.file;
            item.status = 'ok';
          } catch (e) {
            item.status = 'error';
            item.msg = e.silent ? 'Sesión vencida' : e.message;
          }
          renderers[side]();
          refreshSave();
        });
      }
      renderers[side]();
      refreshSave();
    }

    function tile(side, item, i) {
      const list = ed[side];
      const isCover = (side === 'after' && i === 0) || (side === 'before' && i === 0 && !ed.after.length);
      const move = (d) => { const j = i + d; [list[i], list[j]] = [list[j], list[i]]; markDirty(); renderers[side](); };
      return el('div', { class: 'tile ' + (item.status === 'ok' ? '' : item.status) },
        el('img', { src: item.url, alt: `Foto ${i + 1}` }),
        isCover ? el('span', { class: 'cover', text: 'Portada' }) : null,
        item.status === 'uploading' ? el('div', { class: 'status' }, el('div', {}, el('div', { class: 'spin' }), 'Subiendo…')) : null,
        item.status === 'error' ? el('div', { class: 'status', text: item.msg || 'No se pudo subir' }) : null,
        el('div', { class: 'ctl' },
          el('button', { type: 'button', 'aria-label': 'Mover a la izquierda', disabled: i === 0, onclick: () => move(-1) }, icon('left')),
          el('button', { class: 'rm', type: 'button', 'aria-label': 'Quitar foto', onclick: () => { list.splice(i, 1); markDirty(); renderers[side](); refreshSave(); } }, icon('trash')),
          el('button', { type: 'button', 'aria-label': 'Mover a la derecha', disabled: i === list.length - 1, onclick: () => move(1) }, icon('right'))));
    }

    function zone(side, title, sub) {
      const grid = el('div', { class: 'tiles' });
      const input = el('input', { class: 'sr-only', type: 'file', accept: 'image/*', multiple: true, onchange: () => { addFiles(side, [...input.files]); input.value = ''; } });
      const drop = el('label', { class: 'drop' }, icon('camera'), el('b', { text: 'Agregar fotos' }), el('span', { text: 'Tocá acá para elegirlas de tu celular o computadora' }), input);
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(side, [...e.dataTransfer.files]); });
      renderers[side] = () => {
        grid.replaceChildren(...ed[side].map((it, i) => tile(side, it, i)));
        // el "Antes" muestra la portada solo si no hay "Después"
        if (side === 'after' && renderers.before) renderers.before();
      };
      renderers[side]();
      return el('section', { class: 'field' }, el('div', { class: 'field-head' }, el('h3', { text: title }), el('p', { class: 'hint', text: sub })), grid, drop);
    }

    const section = (n, label, ...body) => el('section', { class: 'field' },
      el('div', { class: 'step-title' }, el('span', { class: 'n', text: String(n) }), el('h3', { text: label })), ...body);

    /* — armado — */
    const errBox = el('p', { class: 'form-error', role: 'alert', hidden: true });
    const showErr = (msg, focusEl) => {
      errBox.textContent = msg;
      errBox.hidden = false;
      errBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (focusEl) focusEl.focus();
    };

    const close = () => {
      closeLayer(node);
      blobs.forEach((u) => URL.revokeObjectURL(u));
    };
    const attemptClose = async () => {
      if (ed.dirty) {
        const ok = await confirmBox({ title: '¿Salir sin guardar?', text: 'Vas a perder los cambios que hiciste en esta obra.', ok: 'Salir sin guardar', cancel: 'Seguir editando', danger: true });
        if (!ok) return;
      }
      close();
    };

    const form = el('form', { class: 'sheet-panel', novalidate: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': work ? 'Editar obra' : 'Nueva obra', onsubmit: async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      if (!ed.title.trim()) return showErr('Poné un título para la obra.', titleInput);
      if (uploading()) return showErr('Esperá un momento: todavía se están subiendo fotos.');
      if ([...ed.before, ...ed.after].some((i) => i.status === 'error')) return showErr('Hay fotos que no se pudieron subir. Quitalas o volvé a agregarlas.');
      const files = (side) => ed[side].map((i) => i.file);
      if (!files('before').length && !files('after').length) return showErr('Subí al menos una foto (del antes o del después).');
      const useText = ed.locMode === 'text' || ed.locMode === 'both';
      const useMaps = ed.locMode === 'maps' || ed.locMode === 'both';
      const payload = {
        title: ed.title,
        description: ed.description,
        categories: [...ed.cats],
        locationText: useText ? ed.locationText : '',
        mapsUrl: useMaps ? ed.mapsUrl : '',
        before: files('before'),
        after: files('after'),
      };
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando…';
      try {
        if (ed.id) await api('PUT', `/api/admin/works/${ed.id}`, payload);
        else await api('POST', '/api/admin/works', payload);
        ed.dirty = false;
        close();
        toast('Obra guardada ✔');
        await load();
      } catch (ex) {
        if (!ex.silent) showErr(ex.message);
        refreshSave();
      }
    } },
      el('div', { class: 'sheet-head' },
        el('h2', { text: work ? 'Editar obra' : 'Nueva obra' }),
        el('button', { class: 'btn btn-line icon-btn', type: 'button', 'aria-label': 'Cerrar', onclick: attemptClose }, icon('x'))),
      el('div', { class: 'sheet-body' },
        section(1, 'Título', titleInput),
        section(2, 'Descripción breve', descInput, counter),
        section(3, 'Categorías', el('p', { class: 'hint', text: 'Elegí las que correspondan. Así la gente puede filtrar tus trabajos.' }), pick,
          el('div', { class: 'add-row' }, newCat, el('button', { class: 'btn btn-line', type: 'button', onclick: addCat }, icon('plus'), 'Crear'))),
        section(4, '¿Dónde fue la obra?', el('p', { class: 'hint', text: 'Opcional. Podés escribir la zona o pegar un link de Google Maps.' }), segBox, locBox),
        section(5, 'Fotos', zone('before', 'Antes', 'Cómo estaba. Podés subir varias.'), zone('after', 'Después', 'Cómo quedó. La primera es la portada.'))),
      el('div', { class: 'sheet-foot' },
        errBox,
        el('button', { class: 'btn btn-line', type: 'button', text: 'Cancelar', onclick: attemptClose }),
        saveBtn));

    form.addEventListener('input', () => { markDirty(); errBox.hidden = true; });

    node = el('div', { class: 'overlay sheet' }, el('div', { class: 'backdrop' }), form);
    renderCats();
    renderLoc();
    refreshSave();
    openLayer(node, attemptClose);
    if (!work) titleInput.focus({ preventScroll: true });
  }

  /* ───────────── Arranque ───────────── */
  (async () => {
    try {
      const me = await api('GET', '/api/admin/me');
      if (me.authenticated) await load();
      else showLogin();
    } catch (e) {
      if (!e.silent) showLogin();
    }
  })();
})();
