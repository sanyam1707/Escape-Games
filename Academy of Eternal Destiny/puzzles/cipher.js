/* cipher: Cipher Wheel. Two rings of letters; turn the inner ring with the arrows and confirm when it matches the clue.
   game.json: puzzles.<key> = { help, shift:<1-25 the right turn>, word:"coded word shown on the lock", confirm?, wrongText?, noPenalty? }
   At turn s the inner letter under outer letter X is X-s. Write the clue as "under the rune L sits I" (shift 3). */
G360.panel('cipher', (b, h, m, P, a) => {
  const { E, S } = a; const st = (S.ps[h.id] = S.ps[h.id] || { s: 0 }), L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (P.help) b.append(E('p', 'help', P.help));
  if (P.word) { const w = E('div', 'opt', '<span style="letter-spacing:.35em;font-size:26px">' + P.word + '</span>'); w.style.marginBottom = '8px'; b.append(w); }
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '-50 -50 100 100'); svg.style.cssText = 'width:100%;max-width:340px;display:block;margin:0 auto';
  const ring = (r, f) => [...L].map((c, i) => `<text transform="rotate(${i * 360 / 26}) translate(0,${-r})" font-size="${f}" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-weight="700">${c}</text>`).join('');
  svg.innerHTML = '<g style="color:var(--papyrus)"><circle r="47" fill="var(--bg2)" stroke="var(--edge2)" stroke-width="1.5"/>' + ring(41.5, 6) + '</g><g id="inr" style="color:var(--gold);transition:transform .35s"><circle r="35" fill="var(--bg3)" stroke="var(--edge2)" stroke-width="1.5"/><circle r="22" fill="var(--bg)" stroke="var(--edge)"/>' + ring(29, 6.4) + '</g><path d="M-3 -50L3 -50L0 -45z" fill="var(--gold)"/>';
  const inr = svg.querySelector('#inr'), msg = E('div', 'msg'), ok = a.mkConfirm(P.confirm), lab = E('div', 'msg'); lab.style.cssText = 'text-align:center;color:var(--sand)';
  const draw = () => { inr.style.transform = 'rotate(' + (st.s * 360 / 26) + 'deg)'; lab.textContent = 'Outer A sits over inner ' + L[(26 - st.s) % 26]; };
  const turn = (d) => { st.s = (st.s + d + 26) % 26; msg.textContent = ''; draw(); };
  const l = E('button', 'btn ghost', '↶'), r = E('button', 'btn ghost', '↷'); l.setAttribute('aria-label', 'turn left'); r.setAttribute('aria-label', 'turn right'); l.onclick = () => turn(-1); r.onclick = () => turn(1);
  ok.onclick = () => { if (st.s === P.shift) return a.solve(h, m); a.wrong([ok], msg, P.wrongText || '', { free: P.noPenalty }); };
  const row = E('div', 'row'); row.append(l, ok, r); b.append(svg, lab, msg, row); draw(); a.applyLock(ok, ok.dataset.label);
}, (P) => (Number.isInteger(P.shift) && P.shift > 0 && P.shift < 26 ? [] : ['shift must be 1-25']));
