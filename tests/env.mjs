// Môi trường giả lập tối thiểu để chạy các module của app trong Node (không có trình duyệt thật).
// Mọi file *.test.mjs đều `import './env.mjs'` TRƯỚC khi nạp module của app.
// Môi trường giả lập tối thiểu (không có trình duyệt thật)
export const store = new Map();
const L = {};
globalThis.localStorage = {
  getItem: k => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
  clear: () => store.clear(),
  get length() { return store.size; },
  key: i => [...store.keys()][i] ?? null
};
globalThis.window = globalThis;
globalThis.addEventListener = (t, f) => { (L[t] = L[t] || []).push(f); };
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = e => { (L[e.type] || []).forEach(f => f(e)); return true; };
globalThis.Event = class { constructor(t) { this.type = t; } };
globalThis.CustomEvent = class extends Event { constructor(t, o) { super(t); this.detail = o && o.detail; } };

export const els = {};                 // id → phần tử giả
export const made = [];                // phần tử tạo bằng createElement
export const alerts = [];
export function mkEl(id) {
  const el = { id, value: '', style: {}, children: [], dataset: {}, _cls: new Set(),
    classList: { add(c){el._cls.add(c);}, remove(c){el._cls.delete(c);}, contains(c){return el._cls.has(c);}, toggle(c){el._cls.has(c)?el._cls.delete(c):el._cls.add(c);} },
    appendChild(c){ el.children.push(c); return c; }, insertBefore(c){ return c; }, prepend(){}, append(){},
    parentNode: { appendChild(c){ return c; }, insertBefore(c){ return c; } }, remove(){}, setAttribute(){}, addEventListener(){}, removeEventListener(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; }, closest(){ return null; }, focus(){}, click(){},
    set textContent(v){ el._t = v; }, get textContent(){ return el._t; }, set innerText(v){ el._t = v; }, get innerText(){ return el._t; }, innerHTML: '' };
  return el;
}
globalThis.document = {
  getElementById: id => els[id] || ((globalThis.__autoEls && !/^dialog/.test(id)) ? (els[id] = mkEl(id)) : null),
  createElement: tag => { const e = mkEl(null); e.tag = tag; made.push(e); return e; },
  addEventListener(){}, removeEventListener(){},
  body: { appendChild(){}, classList: { add(){}, remove(){} } },
  documentElement: { setAttribute(){}, getAttribute(){ return null; } },
  querySelector: () => null, querySelectorAll: () => [],
  visibilityState: 'visible'
};
globalThis.alert = m => { alerts.push(['alert', m]); };
globalThis.confirm = m => { alerts.push(['confirm', m]); return globalThis.__confirmAnswer ?? false; };

// requestAnimationFrame cho các đoạn render có animation
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);

// updateAllViews() được debounce ~60ms: chờ nó chạy xong trước khi test kết thúc,
// nếu không lỗi DOM giả lập sẽ nổ sau khi test đã đóng.
export const flush = () => new Promise(r => setTimeout(r, 140));
