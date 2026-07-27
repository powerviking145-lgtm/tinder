/* ============================================================
   SwipeEat — логика + анимации
   ============================================================ */

/* ================== СОСТОЯНИЕ ================== */
const S = {
  queue: [],      // очередь id
  cart: {},       // {id: qty}
  liked: [],      // id лайкнутых
  taste: {},      // {tag: score}
  history: []     // {id, dir} для undo
};

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const byId = id => PRODUCTS.find(p => p.id === id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================== ФОРМАТ ЦЕН ================== */
const money = v => {
  const [r, k] = v.toFixed(2).split('.');
  return `${r.replace(/\B(?=(\d{3})+(?!\d))/g,' ')}<span class="kop">,${k} ₽</span>`;
};
const plain = v => v.toFixed(2).replace('.', ',') + ' ₽';

/* ================== ХРАНИЛИЩЕ ================== */
function save(){
  localStorage.setItem('swipeEat', JSON.stringify({
    cart:S.cart, liked:S.liked, taste:S.taste, queue:S.queue, history:S.history
  }));
}
function load(){
  try{
    const d = JSON.parse(localStorage.getItem('swipeEat'));
    if(d && Array.isArray(d.queue) && d.queue.length) Object.assign(S, d);
  }catch(e){}
}

/* ================== ОЧЕРЕДЬ / ВКУС ================== */
function shuffle(a){
  for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function initQueue(){ S.queue = shuffle(PRODUCTS.map(p=>p.id)); }
function score(p){ return p.t.reduce((s,t)=> s + (S.taste[t]||0), 0); }

/* похожее — ближе к началу, но верхние 2 карты не трогаем (чтоб не мигало) */
function resort(){
  const head = S.queue.slice(0,2);
  const tail = S.queue.slice(2)
    .map(byId).sort((a,b)=> score(b)-score(a)).map(p=>p.id);
  S.queue = [...head, ...tail];
}

/* ================== ТАКТИЛЬНАЯ ОТДАЧА ================== */
const buzz = ms => { try{ navigator.vibrate && navigator.vibrate(ms); }catch(e){} };

/* ================== РЕНДЕР КАРТОЧЕК ================== */
const deck = $('#deck');
const fx   = $('#fx');

function cardHTML(p, isReco){
  const off = p.o ? Math.round((1 - p.p/p.o)*100) : 0;
  const media = p.img ? `<img src="${p.img}" alt="">` : `<div class="emoji">${p.e}</div>`;
  return `
    <div class="tint l"></div><div class="tint n"></div>
    <div class="act l"><svg viewBox="0 0 24 24"><circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2 3h3l2.6 11.5h11L21 7H6"/></svg></div>
    <div class="act n"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></div>
    ${off ? `<div class="disc">−${off}%</div>` : ''}
    ${isReco ? `<div class="reco">✨ Вам понравится</div>` : ''}
    <div class="imgwrap">
      <div class="ph" style="background:${p.c}">${media}</div>
    </div>
    <div class="meta">
      <div class="rate"><span class="st">★</span>${p.r}<span class="unit">${p.b}</span></div>
      <div class="name">${p.n}</div>
      <div class="desc">${p.d}</div>
      <div class="prow">
        <div class="price ${p.o?'sale':''}">${money(p.p)}</div>
        ${p.o ? `<div class="old">${plain(p.o)}</div>` : ''}
        <button class="addbtn" data-add="${p.id}" aria-label="В корзину">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
    </div>`;
}

let animateTop = false;   // анимировать появление верхней карты
let undoTop    = false;   // верхняя карта «влетает» назад

function render(){
  deck.innerHTML = '';
  const ids = S.queue.slice(0,3).reverse();   // сначала дальняя

  ids.forEach((id,i)=>{
    const p  = byId(id);
    const isTop = (i === ids.length-1);
    const el = document.createElement('div');
    el.className = 'card' + (isTop ? ' top' : '');
    el.dataset.id  = id;
    el.dataset.pos = String(ids.length-1-i);
    el.innerHTML   = cardHTML(p, isTop && score(p) >= 2);

    if(isTop && !RM){
      if(undoTop) el.classList.add('undoIn');
      else if(animateTop) el.classList.add('in');
    }
    deck.appendChild(el);
    if(isTop) attachDrag(el);
  });

  animateTop = undoTop = false;

  const done = S.queue.length === 0;
  $('#empty').classList.toggle('show', done);
  if(done) $('#emptyTxt').textContent =
    `В корзине ${cartCount()} товаров на ${plain(cartTotal())}`;

  updateUI();
}

/* ================== СВАЙП: ЖЕСТ ================== */
const TH = 92;   // порог решения, px

function attachDrag(el){
  const TL = el.querySelector('.tint.l'), TN = el.querySelector('.tint.n');
  const AL = el.querySelector('.act.l'),  AN = el.querySelector('.act.n');
  const btnY = $('#btnYes'), btnN = $('#btnNo');

  let sx=0, sy=0, dx=0, dy=0, drag=false, t0=0, lastX=0, vx=0;

  const paint = ()=>{
    const k = clamp(dx/TH, -1, 1);
    el.style.transform =
      `translate(${dx}px,${dy*.35}px) rotate(${dx/20}deg) scale(${1-Math.abs(k)*.02})`;
    TL.style.opacity = clamp(k,0,1);
    TN.style.opacity = clamp(-k,0,1);
    AL.style.opacity = clamp(k*1.25,0,1);
    AN.style.opacity = clamp(-k*1.25,0,1);
    AL.style.transform = `scale(${.35+clamp(k,0,1)*.75}) rotate(${-12*clamp(k,0,1)}deg)`;
    AN.style.transform = `scale(${.35+clamp(-k,0,1)*.75}) rotate(${12*clamp(-k,0,1)}deg)`;
    btnY.classList.toggle('hot', k > .55);
    btnN.classList.toggle('hot', k < -.55);
    /* вторая карта подтягивается */
    const next = el.previousElementSibling;
    if(next){
      const t = Math.abs(k);
      next.style.transform = `scale(${.945+t*.055}) translateY(${12-t*12}px)`;
      next.style.opacity = .96 + t*.04;
    }
  };

  el.addEventListener('pointerdown', e=>{
    if(e.target.closest('[data-add]')) return;
    drag = true; sx = lastX = e.clientX; sy = e.clientY; t0 = performance.now();
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    el.classList.remove('settle','snap','in','undoIn');
    el.style.transition = 'none';
  });

  el.addEventListener('pointermove', e=>{
    if(!drag) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    const dt = performance.now() - t0;
    if(dt > 16){ vx = (e.clientX - lastX)/dt*16; lastX = e.clientX; t0 = performance.now(); }
    paint();
    if(Math.abs(dx) > TH && Math.abs(dx) - Math.abs(dx)%TH === TH) buzz(8);
  });

  const end = ()=>{
    if(!drag) return;
    drag = false;
    el.classList.remove('dragging');
    btnY.classList.remove('hot'); btnN.classList.remove('hot');
    el.style.transition = '';

    const go = Math.abs(dx) > TH || Math.abs(vx) > 11;
    if(go){
      fly(el, (dx || vx) > 0 ? 1 : -1, vx);
    }else{
      el.classList.add('snap');
      el.style.transform = '';
      [TL,TN,AL,AN].forEach(n=> n.style.opacity = 0);
      const next = el.previousElementSibling;
      if(next){
        next.classList.add('settle');
        next.style.transform = 'scale(.945) translateY(12px)';
        next.style.opacity = '';
      }
    }
    dx = dy = vx = 0;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/* ================== СВАЙП: ВЫЛЕТ ================== */
let busy = false;

function fly(el, dir, vx=0){
  if(busy) return; busy = true;
  const id = +el.dataset.id;
  el.classList.add('fly');
  el.style.transform =
    `translate(${dir*(window.innerWidth+240)}px,${60+Math.abs(vx)*6}px) rotate(${dir*38}deg)`;
  el.style.opacity = 0;

  const next = el.previousElementSibling;
  if(next){ next.classList.add('settle'); next.style.transform=''; next.style.opacity=''; }

  if(dir > 0){ burst(el); flyToCart(el, byId(id)); buzz(22); }
  else buzz(10);

  setTimeout(()=>{ busy=false; decide(id, dir); }, RM?0:190);
}

function swipe(dir){
  const top = deck.querySelector('.card.top');
  if(top && !busy){
    $(dir>0 ? '#btnYes' : '#btnNo').classList.add('kick');
    setTimeout(()=> $$('.cbtn').forEach(b=>b.classList.remove('kick')), 420);
    fly(top, dir);
  }
}

/* ================== РЕШЕНИЕ / UNDO ================== */
function decide(id, dir){
  const p = byId(id);
  S.queue = S.queue.filter(x => x !== id);
  S.history.push({id, dir});

  if(dir > 0){
    S.cart[id] = (S.cart[id]||0) + 1;
    if(!S.liked.includes(id)) S.liked.push(id);
    p.t.forEach(t => S.taste[t] = (S.taste[t]||0) + 2);
    resort();
  }else{
    p.t.forEach(t => S.taste[t] = (S.taste[t]||0) - .5);
  }
  animateTop = true;
  save(); render();
  if(dir > 0){ pulseCart(); bumpPill(); }
}

function undo(){
  const h = S.history.pop();
  if(!h) return;
  const p = byId(h.id);
  if(h.dir > 0){
    if(S.cart[h.id] > 1) S.cart[h.id]--; else delete S.cart[h.id];
    S.liked = S.liked.filter(x => x !== h.id);
    p.t.forEach(t => S.taste[t] = (S.taste[t]||0) - 2);
  }else{
    p.t.forEach(t => S.taste[t] = (S.taste[t]||0) + .5);
  }
  S.queue.unshift(h.id);
  undoTop = true;
  buzz(14);
  save(); render();
}

/* ================== ЭФФЕКТЫ ================== */
/* конфетти из центра карточки */
function burst(el){
  if(RM) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  const set = ['🎉','✨','🥕','🍏','⭐','🟢','🍋','💚'];
  for(let i=0;i<16;i++){
    const s = document.createElement('div');
    s.className = 'pt';
    s.textContent = set[i % set.length];
    s.style.left = cx+'px'; s.style.top = cy+'px';
    s.style.fontSize = (13 + Math.random()*16)+'px';
    fx.appendChild(s);
    const a = Math.random()*Math.PI*2, d = 90 + Math.random()*190;
    s.animate([
      {transform:'translate(-50%,-50%) scale(.3) rotate(0deg)', opacity:1},
      {transform:`translate(${Math.cos(a)*d-20}px,${Math.sin(a)*d-40}px) scale(1.1) rotate(${(Math.random()*2-1)*420}deg)`, opacity:1, offset:.55},
      {transform:`translate(${Math.cos(a)*d}px,${Math.sin(a)*d+190}px) scale(.55) rotate(${(Math.random()*2-1)*640}deg)`, opacity:0}
    ],{duration:900+Math.random()*500, easing:'cubic-bezier(.2,.7,.3,1)'})
     .onfinish = ()=> s.remove();
  }
}

/* товар «улетает» в иконку корзины */
function flyToCart(el, p){
  if(RM) return;
  const ph = el.querySelector('.ph');
  const target = $('#openCart') || $('.tb.cart');
  if(!ph || !target) return;
  const a = ph.getBoundingClientRect(), b = target.getBoundingClientRect();

  const f = document.createElement('div');
  f.className = 'flyer';
  f.style.background = p.c;
  f.style.left = (a.left + a.width/2 - 27)+'px';
  f.style.top  = (a.top  + a.height/2 - 27)+'px';
  f.innerHTML  = p.img ? `<img src="${p.img}">` : p.e;
  document.body.appendChild(f);

  const dx = (b.left + b.width/2) - (a.left + a.width/2);
  const dy = (b.top  + b.height/2) - (a.top + a.height/2);

  f.animate([
    {transform:'translate(0,0) scale(1.15)', opacity:1},
    {transform:`translate(${dx*.55}px,${dy*.32 - 130}px) scale(.85)`, opacity:1, offset:.55},
    {transform:`translate(${dx}px,${dy}px) scale(.18)`, opacity:.2}
  ],{duration:620, easing:'cubic-bezier(.35,.05,.4,1)'})
   .onfinish = ()=>{ f.remove(); pulseCart(); };
}

function pulseCart(){
  const ic = $('.cartico'), c = $('#cartCnt');
  if(ic){ ic.classList.remove('jump'); void ic.offsetWidth; ic.classList.add('jump'); }
  if(c){ c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
}
function bumpPill(){
  const p = $('#savedPill');
  if(!p) return;
  p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump');
}
/* волна от кнопки */
function ripple(btn){
  if(RM) return;
  const r = btn.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'ripple';
  d.style.width = d.style.height = r.width*3+'px';
  d.style.left = (r.left + r.width/2 - r.width*1.5)+'px';
  d.style.top  = (r.top  + r.height/2 - r.width*1.5)+'px';
  document.body.appendChild(d);
  d.animate([{transform:'scale(.2)',opacity:.9},{transform:'scale(1)',opacity:0}],
            {duration:520, easing:'ease-out'}).onfinish = ()=> d.remove();
}

/* ================== КОРЗИНА: СЧЁТ ================== */
const cartCount = () => Object.values(S.cart).reduce((a,b)=>a+b,0);
const cartTotal = () => Object.entries(S.cart).reduce((s,[id,q])=> s + byId(+id).p*q, 0);
const savedTotal= () => Object.entries(S.cart).reduce((s,[id,q])=>{
  const p = byId(+id); return s + (p.o ? (p.o-p.p)*q : 0);
},0);

let prevTotal = -1;
function updateUI(){
  const cnt = cartCount(), tot = cartTotal();
  const set = (sel,val,html)=>{ const n=$(sel); if(n){ html? n.innerHTML=val : n.textContent=val; } };

  set('#cartCnt', cnt);
  set('#cartSum', Math.round(tot)+' ₽');
  set('#likeDot', S.liked.length);
  set('#total', money(tot), true);
  set('#savedPill', 'Выгода '+Math.round(savedTotal())+' ₽');

  const seen = PRODUCTS.length - S.queue.length;
  set('#progress', `Просмотрено ${seen} из ${PRODUCTS.length}`);
  const fill = $('#progFill');
  if(fill) fill.style.width = (seen/PRODUCTS.length*100)+'%';

  const t = $('#total');
  if(t && prevTotal !== -1 && tot !== prevTotal){
    t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
  }
  prevTotal = tot;
}

/* ================== СПИСОК В ШТОРКЕ ================== */
function rowHTML(p, mode){
  const q = S.cart[p.id] || 0;
  const media = p.img ? `<img src="${p.img}">` : p.e;
  const ctrl = mode === 'cart'
    ? `<div class="qty">
         <button data-minus="${p.id}">−</button><span>${q}</span>
         <button data-plus="${p.id}">+</button></div>`
    : `<button class="mini" data-plus="${p.id}">${q?'Ещё':'В корзину'}</button>`;
  return `<div class="row" data-row="${p.id}" style="animation-delay:${Math.random()*.12}s">
      <div class="thumb" style="background:${p.c}">${media}</div>
      <div class="rn"><b>${p.n}</b><small>${p.b}</small></div>
      <div class="rp">${plain(p.p)}</div>${ctrl}
    </div>`;
}

let tab = 'cart';
function renderList(){
  const list = $('#list');
  if(!list) return;
  if(tab === 'cart'){
    const ids = Object.keys(S.cart).map(Number);
    list.innerHTML = ids.length
      ? ids.map(id=> rowHTML(byId(id),'cart')).join('')
      : `<div class="hint">Корзина пуста.<br>Свайпай карточки вправо 👉</div>`;
  }else{
    const recs = PRODUCTS.filter(p=> !S.cart[p.id])
      .map(p=>({p,s:score(p)})).sort((a,b)=> b.s-a.s).slice(0,10).map(x=>x.p);
    list.innerHTML = S.liked.length
      ? recs.map(p=> rowHTML(p,'reco')).join('')
      : `<div class="hint">Лайкни пару товаров —<br>и мы подберём похожие ✨</div>`;
  }
  updateUI();
}

/* ================== ШТОРКА ================== */
function openSheet(t){
  tab = t || tab;
  $$('.tab').forEach(b=> b.classList.toggle('active', b.dataset.tab === tab));
  renderList();
  $('#sheet').classList.add('show');
  $('#overlay').classList.add('show');
}
function closeSheet(){
  $('#sheet').classList.remove('show');
  $('#overlay').classList.remove('show');
}

/* ================== СОБЫТИЯ ================== */
const on = (sel, ev, fn) => { const n = $(sel); if(n) n.addEventListener(ev, fn); };

on('#btnNo','click',   e => { ripple(e.currentTarget); swipe(-1); });
on('#btnYes','click',  e => { ripple(e.currentTarget); swipe(1);  });
on('#btnUndo','click', undo);

on('#openCart','click', () => openSheet('cart'));
on('#btnInfo','click',  () => openSheet('reco'));
on('#overlay','click',  closeSheet);

on('#restart','click', () => {
  initQueue(); S.history = []; animateTop = true; save(); render();
});

on('#btnPay','click', e => {
  if(!cartCount()) return;
  ripple(e.currentTarget);
  buzz(30);
  alert('Заказ на ' + plain(cartTotal()) + ' оформлен 🎉\nЭто демо — оплата не подключена.');
});

$$('.tab').forEach(b => b.addEventListener('click', () => openSheet(b.dataset.tab)));

/* «+» на карточке — добавить, не свайпая */
deck.addEventListener('click', e => {
  if(e.target.closest('[data-add]')) swipe(1);
});

/* +/− в списке шторки */
on('#list','click', e => {
  const plus  = e.target.closest('[data-plus]');
  const minus = e.target.closest('[data-minus]');
  if(!plus && !minus) return;

  if(plus){
    const id = +plus.dataset.plus;
    S.cart[id] = (S.cart[id] || 0) + 1;
    if(!S.liked.includes(id)) S.liked.push(id);
    byId(id).t.forEach(t => S.taste[t] = (S.taste[t] || 0) + 1);
    S.queue = S.queue.filter(x => x !== id);
    buzz(12); pulseCart();
  }

  if(minus){
    const id = +minus.dataset.minus;
    if(S.cart[id] > 1) S.cart[id]--;
    else {
      delete S.cart[id];
      const row = $(`[data-row="${id}"]`);
      if(row && !RM){
        row.classList.add('out');
        setTimeout(() => { save(); renderList(); render(); }, 280);
        return;
      }
    }
    buzz(8);
  }

  save(); renderList(); render();
});

/* клавиатура (десктоп) */
document.addEventListener('keydown', e => {
  if(e.key === 'ArrowRight') swipe(1);
  if(e.key === 'ArrowLeft')  swipe(-1);
  if(e.key === 'ArrowDown')  undo();
  if(e.key === 'Escape')     closeSheet();
});

/* свайп вниз по шторке — закрыть */
(function(){
  const sh = $('#sheet'); if(!sh) return;
  let y0 = null;
  sh.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, {passive:true});
  sh.addEventListener('touchmove', e => {
    if(y0 === null) return;
    const dy = e.touches[0].clientY - y0;
    if(dy > 90 && $('#list').scrollTop <= 0){ closeSheet(); y0 = null; }
  }, {passive:true});
  sh.addEventListener('touchend', () => y0 = null);
})();

/* запрет зума двойным тапом */
let lastTap = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if(now - lastTap < 300) e.preventDefault();
  lastTap = now;
}, {passive:false});

/* ================== СТАРТ ================== */
load();
if(!S.queue.length) initQueue();
animateTop = true;
render();