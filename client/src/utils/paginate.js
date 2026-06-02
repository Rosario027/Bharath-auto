// Split line items into A4 pages. Mirrors server/lib/paginate.js
export function paginateItems(items = [], opts = {}) {
  const firstCap = opts.firstCap ?? 12;
  const midCap = opts.midCap ?? 20;
  const reserve = opts.reserve ?? 7;
  const weight = (it) => 1 + Math.floor(((it.description || '').length) / 60);

  const pages = [];
  let cur = [];
  let w = 0;
  let cap = firstCap;
  for (const it of items) {
    const iw = Math.max(1, weight(it));
    if (cur.length && w + iw > cap) {
      pages.push(cur); cur = []; w = 0; cap = midCap;
    }
    cur.push(it); w += iw;
  }
  if (cur.length || pages.length === 0) pages.push(cur);

  const lastCap = pages.length === 1 ? firstCap : midCap;
  const lastW = pages[pages.length - 1].reduce((s, it) => s + Math.max(1, weight(it)), 0);
  if (lastW + reserve > lastCap) pages.push([]);

  return pages.map((pageItems, i) => ({
    items: pageItems,
    index: i,
    isFirst: i === 0,
    isLast: i === pages.length - 1,
    pageTotal: pageItems.reduce((s, it) => s + (Number(it.total) || 0), 0),
  }));
}
export default paginateItems;
