/* venn: sort tokens into zones (e.g. Hero / Both / Villain). Tap a token, then tap a zone (or tap the tray to take it back).
   game.json: puzzles.<key> = { help, zones:[{id,label}] (2-3 zones), tokens:[{id,label,zone}], wrongText?, confirm?, noPenalty? } */
G360.panel('venn', (b, h, m, P, a) => {
  const { E, S } = a; const st = (S.ps[h.id] = S.ps[h.id] || { pl: {} }); let sel = null;
  if (P.help) b.append(E('p', 'help', P.help));
  const zw = E('div', 'pgrid'), tray = E('div', 'row'), msg = E('div', 'msg'), ok = a.mkConfirm(P.confirm);
  zw.style.gridTemplateColumns = 'repeat(' + P.zones.length + ',1fr)'; tray.style.flexWrap = 'wrap';
  const chip = (t) => { const c = E('button', 'opt' + (sel === t.id ? ' sel' : ''), '<span>' + t.label + '</span>'); c.style.cssText = 'padding:6px 10px;font-size:13px;min-height:44px'; c.onclick = (e) => { e.stopPropagation(); if (sel && sel !== t.id && st.pl[t.id]) return put(sel, st.pl[t.id]); sel = sel === t.id ? null : t.id; draw(); }; return c; };   /* a held trait tapped onto a placed one joins its circle */
  const put = (id, z) => { if (!id) return; if (z) st.pl[id] = z; else delete st.pl[id]; sel = null; msg.textContent = ''; draw(); };
  function draw() {
    zw.innerHTML = ''; tray.innerHTML = '';
    P.zones.forEach((z) => {
      const d = E('div', 'opt', '<span style="letter-spacing:.06em">' + z.label + '</span>'); d.style.cssText = 'justify-content:flex-start;min-height:150px;gap:5px;padding:8px 4px;cursor:pointer'; d.onclick = () => put(sel, z.id);
      P.tokens.filter((t) => st.pl[t.id] === z.id).forEach((t) => d.append(chip(t))); zw.append(d);
    });
    P.tokens.filter((t) => !st.pl[t.id]).forEach((t) => tray.append(chip(t)));
    tray.onclick = () => put(sel, null); tray.style.minHeight = '48px';
    ok.disabled = P.tokens.some((t) => !st.pl[t.id]) || Date.now() < S.lockUntil;
  }
  ok.onclick = () => { if (P.tokens.every((t) => st.pl[t.id] === t.zone)) return a.solve(h, m); a.wrong([ok], msg, P.wrongText || '', { free: P.noPenalty }); };
  const row = E('div', 'row'); row.append(ok); b.append(zw, tray, msg, row); draw(); a.applyLock(ok, ok.dataset.label);
}, (P) => {
  const e = [], zs = (P.zones || []).map((z) => z.id); if (zs.length < 2) e.push('needs 2+ zones');
  (P.tokens || []).forEach((t) => { if (!zs.includes(t.zone)) e.push('token ' + t.id + ' has an unknown zone'); }); if (!(P.tokens || []).length) e.push('needs tokens'); return e;
});
