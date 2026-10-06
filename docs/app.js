const $ = (s) => document.querySelector(s);
const view = $('#view');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `$${Number(n).toFixed(2)}`;
let user = JSON.parse(localStorage.getItem('user') || 'null');

async function api(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && user) logout();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
const msg = (el, text, ok) => { el.className = ok ? 'ok' : 'error'; el.textContent = text; };

function logout() {
  localStorage.clear(); user = null; location.hash = '#/login'; route();
}
$('#logout').onclick = logout;

async function refreshNav() {
  $('#who').textContent = user ? user.username : '';
  $('#logout').hidden = !user;
  let n = 0;
  if (user) try { n = (await api('GET', '/cart')).items.reduce((s, i) => s + i.qty, 0); } catch {}
  document.querySelector('[data-testid=cart-count]').textContent = n;
}

// ---------- pages ----------
const pages = {
  login() {
    view.innerHTML = `<div class="card"><h2>Login</h2>
      <input data-testid="login-username" placeholder="Username">
      <input data-testid="login-password" type="password" placeholder="Password">
      <button class="primary" data-testid="login-submit">Login</button>
      <p data-testid="login-message"></p>
      <p class="muted">No account? <a href="#/register" data-testid="goto-register">Register</a><br>Demo: demo / demo123</p></div>`;
    $('[data-testid=login-submit]').onclick = async () => {
      try {
        const r = await api('POST', '/login', { username: $('[data-testid=login-username]').value, password: $('[data-testid=login-password]').value });
        localStorage.setItem('token', r.token); localStorage.setItem('user', JSON.stringify(r.user)); user = r.user;
        location.hash = '#/feed';
      } catch (e) { msg($('[data-testid=login-message]'), e.message); }
    };
  },
  register() {
    view.innerHTML = `<div class="card"><h2>Register</h2>
      <input data-testid="register-username" placeholder="Username">
      <input data-testid="register-password" type="password" placeholder="Password (min 6)">
      <button class="primary" data-testid="register-submit">Create account</button>
      <p data-testid="register-message"></p></div>`;
    $('[data-testid=register-submit]').onclick = async () => {
      try {
        await api('POST', '/register', { username: $('[data-testid=register-username]').value, password: $('[data-testid=register-password]').value });
        msg($('[data-testid=register-message]'), 'Account created. Please login.', true);
        setTimeout(() => (location.hash = '#/login'), 800);
      } catch (e) { msg($('[data-testid=register-message]'), e.message); }
    };
  },

  async feed(_, tab = 'all') {
    const [posts, products] = await Promise.all([api('GET', '/posts' + (tab === 'following' ? '?following=1' : '')), api('GET', '/products')]);
    view.innerHTML = `
      <div class="card"><h3>New post</h3>
        <textarea data-testid="post-text" maxlength="300" placeholder="Share something..."></textarea>
        <select data-testid="post-product"><option value="">No product tag</option>
          ${products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        <button class="primary" data-testid="post-submit">Post</button> <span data-testid="post-message"></span></div>
      <div class="row"><button data-testid="tab-all" ${tab === 'all' ? 'disabled' : ''}>All</button>
        <button data-testid="tab-following" ${tab === 'following' ? 'disabled' : ''}>Following</button></div><br>
      <div data-testid="feed">${posts.length ? posts.map(postHtml).join('') : '<p data-testid="feed-empty">No posts yet.</p>'}</div>`;
    $('[data-testid=tab-all]').onclick = () => pages.feed(null, 'all');
    $('[data-testid=tab-following]').onclick = () => pages.feed(null, 'following');
    $('[data-testid=post-submit]').onclick = async () => {
      try {
        await api('POST', '/posts', { text: $('[data-testid=post-text]').value, productId: Number($('[data-testid=post-product]').value) || null });
        pages.feed(null, tab);
      } catch (e) { msg($('[data-testid=post-message]'), e.message); }
    };
    bindPosts(tab);
  },

  async shop(_, params) {
    const q = new URLSearchParams(params || '');
    const products = await api('GET', '/products?' + q);
    view.innerHTML = `<div class="row"><input data-testid="search-input" placeholder="Search products" value="${esc(q.get('q') || '')}">
      <select data-testid="category-filter">${['', 'electronics', 'fashion', 'home', 'sports'].map((c) => `<option value="${c}" ${q.get('category') === c ? 'selected' : ''}>${c || 'All categories'}</option>`).join('')}</select>
      <button class="primary" data-testid="search-submit">Search</button></div><br>
      <div class="grid" data-testid="product-list">${products.length ? products.map(productHtml).join('') : '<p data-testid="no-results">No products found.</p>'}</div>`;
    $('[data-testid=search-submit]').onclick = () => {
      const p = new URLSearchParams({ q: $('[data-testid=search-input]').value, category: $('[data-testid=category-filter]').value });
      location.hash = '#/shop?' + p;
    };
    bindAddToCart();
  },

  async product(id) {
    const p = await api('GET', '/products/' + id);
    view.innerHTML = `<div class="card" data-testid="product-detail"><img src="${p.image}" alt="${esc(p.name)}">
      <h2 data-testid="product-name">${esc(p.name)}</h2><p data-testid="product-price">${money(p.price)}</p>
      <p data-testid="product-stock">${p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'}</p>
      <button class="primary" data-add="${p.id}" data-testid="add-to-cart" ${p.stock ? '' : 'disabled'}>Add to cart</button>
      <p data-testid="cart-message"></p></div>`;
    bindAddToCart();
  },

  async cart() {
    const { items, subtotal } = await api('GET', '/cart');
    view.innerHTML = `<h2>Cart</h2><div data-testid="cart-items">${items.length ? items.map((i) => `
      <div class="card row" data-testid="cart-item-${i.productId}"><span style="flex:1">${esc(i.product.name)} × <b data-testid="cart-qty-${i.productId}">${i.qty}</b></span>
      <span>${money(i.product.price * i.qty)}</span><button data-remove="${i.productId}" data-testid="cart-remove-${i.productId}">Remove</button></div>`).join('') : '<p data-testid="cart-empty">Your cart is empty.</p>'}</div>
      <p>Subtotal: <b data-testid="cart-subtotal">${money(subtotal)}</b></p>
      ${items.length ? `<div class="card"><h3>Checkout</h3>
        <input data-testid="checkout-address" placeholder="Shipping address">
        <input data-testid="checkout-voucher" placeholder="Voucher (try SAVE10)">
        <button class="primary" data-testid="checkout-submit">Place order</button><p data-testid="checkout-message"></p></div>` : ''}`;
    document.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = async () => { await api('DELETE', '/cart/' + b.dataset.remove); pages.cart(); refreshNav(); }));
    const submit = $('[data-testid=checkout-submit]');
    if (submit) submit.onclick = async () => {
      try {
        const o = await api('POST', '/checkout', { address: $('[data-testid=checkout-address]').value, voucher: $('[data-testid=checkout-voucher]').value });
        location.hash = '#/orders?new=' + o.id;
      } catch (e) { msg($('[data-testid=checkout-message]'), e.message); }
    };
  },

  async orders(_, params) {
    const orders = await api('GET', '/orders');
    const isNew = new URLSearchParams(params || '').get('new');
    view.innerHTML = `<h2>Orders</h2>${isNew ? `<p class="ok" data-testid="order-success">Order #${esc(isNew)} placed successfully!</p>` : ''}
      <div data-testid="order-list">${orders.length ? orders.map((o) => `
      <div class="card" data-testid="order-${o.id}"><b>Order #${o.id}</b> · <span data-testid="order-status-${o.id}">${o.status}</span>
        <ul>${o.items.map((i) => `<li>${esc(i.name)} × ${i.qty}</li>`).join('')}</ul>
        <div class="muted">Discount: ${money(o.discount)}</div><div>Total: <b data-testid="order-total-${o.id}">${money(o.total)}</b></div></div>`).join('') : '<p data-testid="orders-empty">No orders yet.</p>'}</div>`;
  },

  async profile(id) {
    const [u, posts] = await Promise.all([api('GET', '/users/' + id), api('GET', '/posts')]);
    view.innerHTML = `<div class="card" data-testid="profile"><h2 data-testid="profile-name">${esc(u.username)}</h2>
      <p class="muted">${u.role} · <span data-testid="followers-count">${u.followers}</span> followers · <span data-testid="following-count">${u.following}</span> following</p>
      ${u.id !== user.id ? `<button class="primary" data-testid="follow-btn" data-uid="${u.id}">${u.isFollowing ? 'Unfollow' : 'Follow'}</button>` : ''}</div>
      <div data-testid="feed">${posts.filter((p) => p.userId === u.id).map(postHtml).join('')}</div>`;
    const f = $('[data-testid=follow-btn]');
    if (f) f.onclick = async () => { await api('POST', `/users/${u.id}/follow`); pages.profile(id); };
    bindPosts();
  },
};

// ---------- fragments ----------
const productHtml = (p) => `<div class="card" data-testid="product-card-${p.id}">
  <a href="#/product/${p.id}"><img src="${p.image}" alt="${esc(p.name)}"></a>
  <h4 data-testid="product-card-name">${esc(p.name)}</h4><div data-testid="product-card-price">${money(p.price)}</div>
  <div class="muted">${p.stock ? p.stock + ' left' : 'Out of stock'}</div>
  <button class="primary" data-add="${p.id}" data-testid="add-to-cart-${p.id}" ${p.stock ? '' : 'disabled'}>Add to cart</button></div>`;

const postHtml = (p) => `<div class="card post" data-testid="post-${p.id}">
  <b><a href="#/profile/${p.userId}" data-testid="post-author">${esc(p.user.username)}</a></b>
  <p data-testid="post-body">${esc(p.text)}</p>
  ${p.product ? `<div class="card row" data-testid="post-product-${p.id}"><a href="#/product/${p.product.id}">${esc(p.product.name)}</a><span>${money(p.product.price)}</span>
    <button class="primary" data-add="${p.product.id}" data-testid="post-buy-${p.id}" ${p.product.stock ? '' : 'disabled'}>Buy</button></div>` : ''}
  <div class="row"><button data-like="${p.id}" data-testid="like-${p.id}">${p.liked ? '♥ Unlike' : '♡ Like'}</button>
    <span data-testid="like-count-${p.id}">${p.likeCount}</span>
    <button data-toggle-comments="${p.id}" data-testid="comments-toggle-${p.id}">Comments (${p.comments.length})</button></div>
  <div id="comments-${p.id}" data-testid="comments-${p.id}" hidden></div></div>`;

function bindAddToCart() {
  document.querySelectorAll('[data-add]').forEach((b) => (b.onclick = async () => {
    const m = $('[data-testid=cart-message]') || document.createElement('span');
    try { await api('POST', '/cart', { productId: Number(b.dataset.add), qty: 1 }); msg(m, 'Added to cart', true); toast('Added to cart', true); }
    catch (e) { msg(m, e.message); toast(e.message); }
    refreshNav();
  }));
}

function toast(text, ok) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('data-testid', 'toast'); t.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:10px 16px;border-radius:6px;color:#fff'; document.body.append(t); }
  t.style.background = ok ? '#080' : '#c00'; t.textContent = text; t.hidden = false;
  clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 2500);
}

function bindPosts() {
  bindAddToCart();
  document.querySelectorAll('[data-like]').forEach((b) => (b.onclick = async () => {
    const r = await api('POST', `/posts/${b.dataset.like}/like`);
    b.textContent = r.liked ? '♥ Unlike' : '♡ Like';
    $(`[data-testid=like-count-${b.dataset.like}]`).textContent = r.likeCount;
  }));
  document.querySelectorAll('[data-toggle-comments]').forEach((b) => (b.onclick = async () => {
    const id = b.dataset.toggleComments, box = $('#comments-' + id);
    if (!box.hidden) return (box.hidden = true);
    const cs = await api('GET', `/posts/${id}/comments`);
    box.hidden = false;
    box.innerHTML = `<ul data-testid="comment-list-${id}">${cs.map((c) => `<li><b>${esc(c.username)}</b>: ${esc(c.text)}</li>`).join('')}</ul>
      <div class="row"><input data-testid="comment-input-${id}" placeholder="Add a comment"><button data-testid="comment-submit-${id}">Send</button></div>`;
    $(`[data-testid=comment-submit-${id}]`).onclick = async () => {
      try {
        const c = await api('POST', `/posts/${id}/comments`, { text: $(`[data-testid=comment-input-${id}]`).value });
        $(`[data-testid=comment-list-${id}]`).insertAdjacentHTML('beforeend', `<li><b>${esc(c.username)}</b>: ${esc(c.text)}</li>`);
        $(`[data-testid=comment-input-${id}]`).value = '';
        b.textContent = `Comments (${cs.push(c)})`;
      } catch (e) { toast(e.message); }
    };
  }));
}

// ---------- router ----------
async function route() {
  const [, page = 'feed', arg] = location.hash.replace(/\?.*/, '').split('/');
  const params = location.hash.split('?')[1];
  if (!user && !['login', 'register'].includes(page)) return (location.hash = '#/login');
  if (!pages[page]) return (view.innerHTML = '<p data-testid="not-found">Page not found.</p>');
  await refreshNav();
  try { await pages[page](arg, params); } catch (e) { view.innerHTML = `<p class="error" data-testid="page-error">${esc(e.message)}</p>`; }
}
addEventListener('hashchange', route);
route();
