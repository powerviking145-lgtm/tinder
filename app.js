/* ================== СОСТОЯНИЕ ================== */
const S = {
  queue: [],        // очередь id
  cart: {},         // {id: qty}
  liked: [],        // id лайкнутых
  taste: {},        // {tag: score}
  history: [],      // для undo: {id, dir}
};
const byId = id => PRODUCTS.find(p => p.id === id);
const $ = s => document.querySelector(s);

/* ================== ПОМОЩНИКИ ================== */
const money = v => {
  const [r, k] = v.toFixed(2).split('.');
  const rr = r.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rr}<span class="kop">,${k} ₽</span>`;
};
const plain = v => v.toFixed(2).replace('.', ',') + ' ₽';

function save() {
  localStorage.setItem('swipeEat', JSON.stringify({
    cart: S.cart, liked: S.liked, taste: S.taste, queue: S.queue
  }));
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem('swipeEat'));
    if (d && d.queue && d.queue.length) Object.assign(S, d);
  } catch (e) {}
}

/* ================== ОЧЕРЕДЬ / РЕКОМЕНДАЦИИ ================== */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function initQueue() {
  S.queue = shuffle(PRODUCTS.map(p => p.id));
}
function score(p) {
  return p.t.reduce((s, t) => s + (S.taste[t] || 0), 0);
}
/* после лайка — двигаем похожие товары ближе к началу колоды */
function resort() {
  const head = S.queue.slice(0, 1);
  const tail = S.queue.slice(1)
    .map(id => byId(id))
    .sort((a, b) => score(b) - score(a))
    .map(p => p.id);
  S.queue = [...head, ...tail];
}

/* ================== РЕНДЕР КАРТОЧЕК ================== */
const deck = $('#deck');

function cardHTML(p, isReco) {
  const off = p.o ? Math.round((1 - p.p / p.o) * 100) : 0;
  const media = p.img
    ? `<img src="${p.img}" alt="">`
    : `<div class="emoji">${p.e}</div>`;
  return `
    ${off ? `<div class="disc">−${off}%</div>` : ''}
    ${isReco ? `<div class="reco">✨ Вам понравится</div>` : ''}
    <div class="stamp l">В КОРЗИНУ</div>
    <div class="stamp n">МИМО</div>
    <div class="imgwrap">
      <div class="ph" style="background:${p.c}">${media}</div>
    </div>
    <div class="meta">
      <div class="rate"><span class="st">★</span>${p.r}
        <span class="unit">${p.b}</span></div>
      <div class="name">${p.n}</div>
      <div class="desc">${p.d}</div>
      <div class="prow">
        <div class="price ${p.o ? 'sale' : ''}">${money(p.p)}</div>
        ${p.o ? `<div class="old">${plain(p.o)}</div>` : ''}
        <button class="addbtn" data-add="${p.id}">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
    </div>`;
}

function render() {
  deck.innerHTML = '';
  const ids = S.queue.slice(0, 2).reverse(); // нижняя, потом верхняя
  ids.forEach((id, i) => {
    const p = byId(id);
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = id;
    const isTop = i === ids.length - 1;
    el.innerHTML = cardHTML(p, isTop && score(p) >= 2);
    if (!isTop) el.style.transform = 'scale(.96) translateY(8px)';
    deck.appendChild(el);
    if (isTop) attachDrag(el);
  });
  $('#empty').classList.toggle('show', S.queue.length === 0);
  if (!S.queue.length) {
    $('#emptyTxt').textContent =
      `В корзине ${cartCount()} товаров на ${plain(cartTotal())}`;
  }
  updateUI();
}

/* ================== СВАЙПЫ ================== */
function attachDrag(el) {
  let sx = 0, sy = 0, dx = 0, dy = 0, drag = false;
  const L = el.querySelector('.stamp.l'), N = el.querySelector('.stamp.n');

  el.addEventListener('pointerdown', e => {
    if (e.target.closest('[data-add]')) return;
    drag = true; sx = e.clientX; sy = e.clientY;
    el.setPointerCapture(e.pointerId);
    el.style.transition = 'none';
  });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    el.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
    L.style.opacity = Math.max(0, Math.min(1, dx / 90));
    N.style.opacity = Math.max(0, Math.min(1, -dx / 90));
  });
  const end = () => {
    if (!drag) return;
    drag = false;
    el.style.transition = 'transform .3s ease, opacity .3s';
    if (Math.abs(dx) > 95) fly(el, dx > 0 ? 1 : -1);
    else {
      el.style.transform = '';
      L.style.opacity = N.style.opacity = 0;
    }
    dx = dy = 0;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function fly(el, dir) {
  const id = +el.dataset.id;
  el.style.transform = `translate(${dir * 700}px,${dir * 60}px) rotate(${dir * 40}deg)`;
  el.style.opacity = 0;
  setTimeout(() => decide(id, dir), 180);
}

function swipe(dir) {
  const top = deck.lastElementChild;
  if (top && top.classList.contains('card')) fly(top, dir);
}

/* ================== РЕШЕНИЕ ================== */
function decide(id, dir) {
  const p = byId(id);
  S.queue = S.queue.filter(x => x !== id);
  S.history.push({ id, dir });
  if (dir > 0) {
    S.cart[id] = (S.cart[id] || 0) + 1;
    if (!S.liked.includes(id)) S.liked.push(id);
    p.t.forEach(t => S.taste[t] = (S.taste[t] || 0) + 2);
    resort();
  } else {
    p.t.forEach(t => S.taste[t] = (S.taste[t] || 0) - 0.5);
  }
  save(); render();
}

function undo() {
  const h = S.history.pop();
  if (!h) return;
  const p = byId(h.id);
  if (h.dir > 0) {
    if (S.cart[h.id] > 1) S.cart[h.id]--; else delete S.cart[h.id];
    S.liked = S.liked.filter(x => x !== h.id);
    p.t.forEach(t => S.taste[t] = (S.taste[t] || 0) - 2);
  } else {
    p.t.forEach(t => S.taste[t] = (S.taste[t] || 0) + 0.5);
  }
  S.queue.unshift(h.id);
  save(); render();
}

/* ================== КОРЗИНА ================== */
const cartCount = () => Object.values(S.cart).reduce((a, b) => a + b, 0);
const cartTotal = () => Object.entries(S.cart)
  .reduce((s, [id, q]) => s + byId(+id).p * q, 0);
const savedTotal = () => Object.entries(S.cart)
  .reduce((s, [id, q]) => { const p = byId(+id); return s + (p.o ? (p.o - p.p) * q : 0); }, 0);

function updateUI() {
  $('#cartCnt').textContent = cartCount();
  $('#cartSum').textContent = Math.round(cartTotal()) + ' ₽';
  $('#likeDot').textContent = S.liked.length;
  $('#total').innerHTML = money(cartTotal());
  $('#savedPill').textContent = 'Выгода ' + Math.round(savedTotal()) + ' ₽';
  const seen = PRODUCTS.length - S.queue.length;
  $('#progress').textContent = `Просмотрено ${seen} из ${PRODUCTS.length}`;
}

function rowHTML(p, mode) {
  const q = S.cart[p.id] || 0;
  const media = p.img ? `<img src="${p.img}">` : p.e;
  const ctrl = mode === 'cart'
    ? `<div class="qty">
         <button data-minus="${p.id}">−</button><span>${q}</span>
         <button data-plus="${p.id}">+</button>
       </div>`
    : `<button class="mini" data-plus="${p.id}">${q ? 'Ещё' : 'В корзину'}</button>`;
  return `<div class="row">
      <div class="thumb" style="background:${p.c}">${media}</div>
      <div class="rn"><b>${p.n}</b><small>${p.b}</small></div>
      <div class="rp">${plain(p.p)}</div>
      ${ctrl}
    </div>`;
}

let tab = 'cart';
function renderList() {
  const list = $('#list');
  if (tab === 'cart') {
    const ids = Object.keys(S.cart).map(Number);
    list.innerHTML = ids.length
      ? ids.map(id => rowHTML(byId(id), 'cart')).join('')
      : `<div class="hint">Корзина пуста.<br>Свайпай карточки вправо 👉</div>`;
  } else {
    const recs = PRODUCTS
      .filter(p => !S.cart[p.id])
      .map(p => ({ p, s: score(p) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 10)
      .map(x => x.p);
    list.innerHTML = S.liked.length
      ? recs.map(p => rowHTML(p, 'reco')).join('')
      : `<div class="hint">Лайкни пару товаров —<br>и мы подберём похожие ✨</div>`;
  }
  updateUI();
}

/* ================== ШТОРКА ================== */
function openSheet(t){
  tab = t || tab;
  document.querySelectorAll('.tab').forEach(b=>
    b.classList.toggle('active', b.dataset.tab===tab));
  renderList();
  $('#sheet').classList.add('show');
  $('#overlay').classList.add('show');
}
function closeSheet(){
  $('#sheet').classList.remove('show');
  $('#overlay').classList.remove('show');
}

/* ================== СОБЫТИЯ ================== */
$('#btnNo').onclick   = ()=> swipe(-1);
$('#btnYes').onclick  = ()=> swipe(1);
$('#btnUndo').onclick = undo;

$('#openCart').onclick = ()=> openSheet('cart');
$('#btnInfo').onclick  = ()=> openSheet('reco');
$('#overlay').onclick  = closeSheet;

$('#restart').onclick = ()=>{
  initQueue(); S.history = []; save(); render();
};

$('#btnPay').onclick = ()=>{
  if(!cartCount()) return;
  alert('Заказ на ' + plain(cartTotal()) + ' оформлен 🎉\nЭто демо — оплата не подключена.');
};

document.querySelectorAll('.tab').forEach(b=>{
  b.onclick = ()=> openSheet(b.dataset.tab);
});

/* кнопка «+» на карточке — добавить не свайпая */
deck.addEventListener('click', e=>{
  const b = e.target.closest('[data-add]');
  if(!b) return;
  swipe(1);
});

/* +/− в списке корзины */
$('#list').addEventListener('click', e=>{
  const plus  = e.target.closest('[data-plus]');
  const minus = e.target.closest('[data-minus]');
  if(plus){
    const id = +plus.dataset.plus;
    S.cart[id] = (S.cart[id]||0) + 1;
    if(!S.liked.includes(id)) S.liked.push(id);
    S.queue = S.queue.filter(x=> x!==id);
  }
  if(minus){
    const id = +minus.dataset.minus;
    if(S.cart[id] > 1) S.cart[id]--; else delete S.cart[id];
  }
  if(plus || minus){ save(); renderList(); render(); }
});

/* клавиатура для теста на десктопе */
document.addEventListener('keydown', e=>{
  if(e.key==='ArrowRight') swipe(1);
  if(e.key==='ArrowLeft')  swipe(-1);
  if(e.key==='ArrowDown')  undo();
  if(e.key==='Escape')     closeSheet();
});

/* свайп вниз по шторке — закрыть */
(function(){
  const sh = $('#sheet'); let y0=null;
  sh.addEventListener('touchstart', e=>{ y0 = e.touches[0].clientY; }, {passive:true});
  sh.addEventListener('touchmove', e=>{
    if(y0===null) return;
    const dy = e.touches[0].clientY - y0;
    if(dy > 90 && $('#list').scrollTop <= 0){ closeSheet(); y0 = null; }
  }, {passive:true});
  sh.addEventListener('touchend', ()=> y0 = null);
})();

/* запрет зума двойным тапом */
let lastTap = 0;
document.addEventListener('touchend', e=>{
  const now = Date.now();
  if(now - lastTap < 300) e.preventDefault();
  lastTap = now;
}, {passive:false});

/* ================== СТАРТ ================== */
load();
if(!S.queue.length) initQueue();
render();