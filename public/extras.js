/* H'es chop : ajoute likes, réponses des admins et une PAGE DE CHAT à ton site (utilise tes fonctions existantes) */
(() => {
  const st = document.createElement('style');
  st.textContent = `
.nav button{width:54px}
.lk{display:flex;align-items:center;gap:8px;background:none;border:1px solid var(--line);border-radius:16px;color:var(--tx);padding:10px 16px;margin-top:12px;font:600 14px 'Orbitron',sans-serif}
.lk.on{border-color:#e0405a;color:#ff5c7a}
.rp{margin:8px 0 0;padding:8px 12px;border-left:3px solid var(--cy);background:#ffffff08;border-radius:0 12px 12px 0;color:#aab5cf}.rp b{color:#c9a86a}
#chat{background:radial-gradient(ellipse at 80% 90%,#5b1560,transparent 55%),radial-gradient(ellipse at 0 40%,#1a2a5e,transparent 55%),var(--bg)}
#chat.on{display:flex;flex-direction:column}
#ch{flex:1;min-height:0;overflow-y:auto;padding:14px 18px 8px}
.ms{max-width:82%;margin:0 0 10px;padding:10px 14px;border-radius:18px 18px 18px 6px;background:var(--card);border:1px solid var(--line)}
.ms b{color:var(--cy);font:600 12px 'Orbitron',sans-serif}.ms.ad b{color:#c9a86a}
.ms p{margin:4px 0 0;word-break:break-word;white-space:pre-line}
.ms.me{margin-left:auto;border-radius:18px 18px 6px 18px;background:#0e3a55;border-color:#2a5b8f}
.cfm{display:flex;gap:10px;padding:12px 18px calc(96px + env(safe-area-inset-bottom,0px));background:#080a12ee}
.cfm .ta{flex:1;min-width:0;padding:12px 16px;border-radius:16px}
.cfm .btn{width:auto;margin:0;padding:0 18px;border-radius:16px}
.cfm .btn .ic:last-child{margin:0;opacity:1}`;
  document.head.appendChild(st);

  /* ---------- likes (un par compte) sur chaque fichier ---------- */
  const likes = async () => {
    const cards = $$('#fl .fc');
    if (!cards.length) return;
    const [{ items }, mine] = await Promise.all([
      fetch('/api/items').then(r => r.json()),
      fetch('/api/like?v=' + encodeURIComponent(user)).then(r => r.json()),
    ]);
    const by = Object.fromEntries(items.map(i => [i.id, i.likes]));
    cards.forEach(c => {
      const a = c.querySelector('a.btn');
      if (!a || c.querySelector('.lk')) return;
      const u = new URL(a.href, location.href), id = u.searchParams.get('id') || (u.searchParams.get('start') || '').slice(2);
      if (id in by) c.querySelector('.tx').insertAdjacentHTML('beforeend',
        `<button class="lk${mine.includes(id) ? ' on' : ''}" data-id="${esc(id)}" aria-label="Like">❤ <span>${by[id]}</span></button>`);
    });
  };
  const lf = window.loadFiles;
  if (typeof lf === 'function') window.loadFiles = async () => { await lf(); try { await likes(); } catch {} };
  $('#fl').addEventListener('click', async e => {
    const b = e.target.closest('.lk'); if (!b) return;
    const on = !b.classList.contains('on');
    const r = await post('/api/like', { id: b.dataset.id, v: user, on }).catch(() => null);
    if (!r || !r.ok) return toast('Try again in a moment');
    b.classList.toggle('on', on); b.querySelector('span').textContent = (await r.json()).n;
  });

  /* ---------- commentaires + réponse de l'admin ---------- */
  window.loadComments = async () => {
    const box = $('#cl');
    try {
      const r = await fetch('/api/comments'); if (!r.ok) throw 0;
      const c = await r.json();
      box.innerHTML = c.length ? c.map(x => `<div class="cm"><b>${esc(x.name)}</b><small>${new Date(x.ts).toLocaleDateString()}</small><p>${esc(x.text)}</p>${x.reply ? `<div class="rp"><b>Admin ✔</b> ${esc(x.reply)}</div>` : ''}</div>`).join('')
        : '<div class="cm"><p>No comments yet. Write the first one.</p></div>';
    } catch { box.innerHTML = '<div class="cm"><p>Could not load the comments.</p></div>'; }
  };

  /* ---------- page de chat : écran, bouton du bas, entrée du menu ---------- */
  IC.chat = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>';
  $('.nav').insertAdjacentHTML('beforebegin', `<section class="screen" id="chat"><div class="top"><button class="sq mn" aria-label="Menu"><i data-i="menu"></i></button><h2>CHAT</h2></div><div id="ch"></div><form class="cfm" id="chf"><input class="ta" id="cx" maxlength="300" placeholder="Write a message…" aria-label="Chat message" autocomplete="off" required><button class="btn c" aria-label="Send"><i data-i="send"></i></button></form></section>`);
  $('.nav button[data-go="comments"]').insertAdjacentHTML('afterend', '<button data-go="chat" aria-label="Chat"><i data-i="chat"></i></button>');
  $('#ov .it[data-go="comments"]').insertAdjacentHTML('afterend', '<button class="it" data-go="chat"><span style="background:#2a1a4a;color:#b98bff"><i data-i="chat"></i></span>Chat<i data-i="chev"></i></button>');
  icons();
  NAV.push('chat');
  $('#chat .mn').onclick = openDr;
  const sh = window.show;
  window.show = id => { sh(id); if (id === 'chat') chat(true); };

  let last = '';
  async function chat(force) {
    try {
      const c = await (await fetch('/api/comments?k=chat' + (force ? '&t=' + Date.now() : ''))).json(), k = JSON.stringify(c);
      if (!force && k === last) return;
      last = k;
      const box = $('#ch'), end = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
      box.innerHTML = c.map(x => `<div class="ms${x.admin ? ' ad' : x.name === user ? ' me' : ''}"><b>${esc(x.name)}${x.admin ? ' ✔' : ''}</b><p>${esc(x.text)}</p></div>`).join('')
        || '<div class="ms"><p>No messages yet. Start the chat.</p></div>';
      if (end || force) box.scrollTop = box.scrollHeight;
    } catch {}
  }
  $('#chf').onsubmit = async e => {
    e.preventDefault();
    const i = $('#cx'), t = i.value.trim(); if (!t) return;
    const r = await post('/api/comments?k=chat', { name: user, text: t }).catch(() => null);
    if (!r) return toast('Server unreachable, try again');
    if (!r.ok) return toast((await r.json().catch(() => ({}))).error || 'Something went wrong');
    i.value = ''; chat(true);
  };
  setInterval(() => { if (cur === 'chat' && !document.hidden) chat(); }, 5000);
})();

