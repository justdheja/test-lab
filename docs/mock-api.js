// In-browser mock backend: intercepts fetch('/api/...'), state persisted in localStorage.
// Reset: window.__lab.reset()  or open the app with ?reset=1
(() => {
  const KEY = 'lab-db';
  const VOUCHERS = { SAVE10: 0.1, SAVE20: 0.2 };
  const img = (n) => `https://picsum.photos/seed/${n}/300/200`;
  const seed = () => ({
    users: [
      { id: 1, username: 'demo', password: 'demo123', role: 'buyer', following: [2] },
      { id: 2, username: 'seller', password: 'seller123', role: 'seller', following: [] },
      { id: 3, username: 'blocked', password: 'blocked123', role: 'buyer', following: [], blocked: true },
    ],
    products: [
      { id: 1, name: 'Wireless Earbuds', price: 25, stock: 10, category: 'electronics', sellerId: 2, image: img('earbuds') },
      { id: 2, name: 'Running Shoes', price: 60, stock: 5, category: 'fashion', sellerId: 2, image: img('shoes') },
      { id: 3, name: 'Ceramic Mug', price: 8, stock: 50, category: 'home', sellerId: 2, image: img('mug') },
      { id: 4, name: 'Yoga Mat', price: 20, stock: 0, category: 'sports', sellerId: 2, image: img('yoga') },
      { id: 5, name: 'Desk Lamp', price: 30, stock: 3, category: 'home', sellerId: 2, image: img('lamp') },
    ],
    posts: [
      { id: 1, userId: 2, text: 'Just restocked our best-selling earbuds!', productId: 1, likes: [], comments: [], at: Date.now() - 6e4 },
      { id: 2, userId: 2, text: 'Last pairs of running shoes, grab them fast.', productId: 2, likes: [], comments: [], at: Date.now() - 3e4 },
    ],
    carts: {}, orders: [], sessions: {},
    nextId: { post: 3, order: 1, user: 4, comment: 1 },
  });

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { return seed(); } };
  const save = (db) => localStorage.setItem(KEY, JSON.stringify(db));
  const reset = () => { localStorage.removeItem(KEY); save(seed()); };
  if (new URLSearchParams(location.search).has('reset')) reset();
  window.__lab = { reset };

  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const fail = (status, message) => { throw new HttpError(status, message); };
  const pub = (u) => ({ id: u.id, username: u.username, role: u.role });
  const find = (arr, id) => arr.find((x) => x.id === Number(id));

  // each route: [method, regex, auth, handler(ctx)] -> data | [status, data]
  const routes = [
    ['POST', /^\/register$/, false, ({ db, body: { username, password } }) => {
      if (!username || !password) fail(400, 'Username and password required');
      if (password.length < 6) fail(400, 'Password must be at least 6 characters');
      if (db.users.some((u) => u.username === username)) fail(409, 'Username already taken');
      const u = { id: db.nextId.user++, username, password, role: 'buyer', following: [] };
      db.users.push(u);
      return [201, pub(u)];
    }],
    ['POST', /^\/login$/, false, ({ db, body: { username, password } }) => {
      const u = db.users.find((x) => x.username === username && x.password === password);
      if (!u) fail(401, 'Invalid username or password');
      if (u.blocked) fail(403, 'Account is blocked');
      const token = crypto.randomUUID();
      db.sessions[token] = u.id;
      return { token, user: pub(u) };
    }],
    ['GET', /^\/me$/, true, ({ me }) => pub(me)],

    ['GET', /^\/products$/, false, ({ db, query }) => {
      const q = (query.get('q') || '').toLowerCase(), c = query.get('category') || '';
      return db.products.filter((p) => p.name.toLowerCase().includes(q) && (!c || p.category === c));
    }],
    ['GET', /^\/products\/(\d+)$/, false, ({ db, m }) => find(db.products, m[1]) || fail(404, 'Product not found')],

    ['GET', /^\/posts$/, true, ({ db, me, query }) => {
      let posts = db.posts;
      if (query.get('following') === '1') posts = posts.filter((p) => me.following.includes(p.userId));
      return [...posts].sort((a, b) => b.at - a.at).map((p) => ({ ...postView(db, p), liked: p.likes.includes(me.id) }));
    }],
    ['POST', /^\/posts$/, true, ({ db, me, body: { text, productId } }) => {
      if (!text || !text.trim()) fail(400, 'Text required');
      if (text.length > 280) fail(400, 'Text max 280 characters');
      const post = { id: db.nextId.post++, userId: me.id, text, productId: productId || null, likes: [], comments: [], at: Date.now() };
      db.posts.push(post);
      return [201, postView(db, post)];
    }],
    ['POST', /^\/posts\/(\d+)\/like$/, true, ({ db, me, m }) => {
      const p = find(db.posts, m[1]) || fail(404, 'Post not found');
      const i = p.likes.indexOf(me.id);
      i < 0 ? p.likes.push(me.id) : p.likes.splice(i, 1);
      return { liked: i < 0, likeCount: p.likes.length };
    }],
    ['GET', /^\/posts\/(\d+)\/comments$/, true, ({ db, m }) => (find(db.posts, m[1]) || fail(404, 'Post not found')).comments],
    ['POST', /^\/posts\/(\d+)\/comments$/, true, ({ db, me, m, body: { text } }) => {
      const p = find(db.posts, m[1]) || fail(404, 'Post not found');
      if (!text || !text.trim()) fail(400, 'Comment required');
      const c = { id: db.nextId.comment++, username: me.username, text };
      p.comments.push(c);
      return [201, c];
    }],
    ['GET', /^\/users\/(\d+)$/, true, ({ db, me, m }) => {
      const u = find(db.users, m[1]) || fail(404, 'User not found');
      return { ...pub(u), followers: db.users.filter((x) => x.following.includes(u.id)).length, following: u.following.length, isFollowing: me.following.includes(u.id) };
    }],
    ['POST', /^\/users\/(\d+)\/follow$/, true, ({ db, me, m }) => {
      const t = find(db.users, m[1]) || fail(404, 'User not found');
      if (t.id === me.id) fail(400, 'Cannot follow yourself');
      const i = me.following.indexOf(t.id);
      i < 0 ? me.following.push(t.id) : me.following.splice(i, 1);
      return { following: i < 0 };
    }],

    ['GET', /^\/cart$/, true, ({ db, me }) => cartView(db, me.id)],
    ['POST', /^\/cart$/, true, ({ db, me, body: { productId, qty = 1 } }) => {
      const p = find(db.products, productId) || fail(404, 'Product not found');
      if (!Number.isInteger(qty) || qty < 1) fail(400, 'Invalid quantity');
      const cart = (db.carts[me.id] ||= []), line = cart.find((i) => i.productId === p.id);
      const total = (line ? line.qty : 0) + qty;
      if (total > p.stock) fail(409, `Only ${p.stock} in stock`);
      line ? (line.qty = total) : cart.push({ productId: p.id, qty });
      return cartView(db, me.id);
    }],
    ['DELETE', /^\/cart\/(\d+)$/, true, ({ db, me, m }) => {
      db.carts[me.id] = (db.carts[me.id] || []).filter((i) => i.productId !== Number(m[1]));
      return cartView(db, me.id);
    }],
    ['POST', /^\/checkout$/, true, ({ db, me, body: { address, voucher } }) => {
      const { items, subtotal } = cartView(db, me.id);
      if (!items.length) fail(400, 'Cart is empty');
      if (!address || !address.trim()) fail(400, 'Address required');
      let rate = 0;
      if (voucher) {
        rate = VOUCHERS[voucher.toUpperCase()];
        if (rate === undefined) fail(400, 'Invalid voucher');
      }
      for (const i of items) if (i.qty > i.product.stock) fail(409, `${i.product.name} out of stock`);
      items.forEach((i) => (find(db.products, i.productId).stock -= i.qty));
      const order = {
        id: db.nextId.order++, userId: me.id, address, status: 'PAID',
        items: items.map((i) => ({ name: i.product.name, price: i.product.price, qty: i.qty })),
        subtotal, discount: +(subtotal * rate).toFixed(2), total: +(subtotal * (1 - rate)).toFixed(2), at: Date.now(),
      };
      db.orders.push(order);
      db.carts[me.id] = [];
      return [201, order];
    }],
    ['GET', /^\/orders$/, true, ({ db, me }) => db.orders.filter((o) => o.userId === me.id).reverse()],
    ['POST', /^\/reset$/, false, () => { reset(); return { ok: true }; }],
  ];

  function postView(db, p) {
    return { ...p, user: pub(find(db.users, p.userId)), product: p.productId ? find(db.products, p.productId) : null, likeCount: p.likes.length };
  }
  function cartView(db, uid) {
    const items = (db.carts[uid] || []).map((i) => ({ ...i, product: find(db.products, i.productId) }));
    return { items, subtotal: items.reduce((s, i) => s + i.product.price * i.qty, 0) };
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const idx = url.pathname.indexOf('/api/');
    if (idx < 0) return realFetch(input, init);
    const path = url.pathname.slice(idx + 4), method = (init.method || 'GET').toUpperCase();
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    await new Promise((r) => setTimeout(r, 80)); // fake latency, handy for wait/retry practice
    const db = load();
    try {
      for (const [rm, re, auth, handler] of routes) {
        const m = rm === method && path.match(re);
        if (!m) continue;
        let me;
        if (auth) {
          const token = ((init.headers || {}).Authorization || '').replace('Bearer ', '');
          me = find(db.users, db.sessions[token]);
          if (!me) return reply(401, { error: 'Unauthorized' });
        }
        const body = init.body ? JSON.parse(init.body) : {};
        const out = handler({ db, me, m, body, query: url.searchParams });
        save(db);
        return Array.isArray(out) && typeof out[0] === 'number' ? reply(out[0], out[1]) : reply(200, out);
      }
      return reply(404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof HttpError) return reply(e.status, { error: e.message });
      throw e;
    }
  };
})();
