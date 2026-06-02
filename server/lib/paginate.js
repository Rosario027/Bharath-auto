// Split line items into A4 pages. Mirrored on the client so the preview,
// print, PDF and Word all break pages at the same points.
//
// Uses a weight model: a line costs 1 + extra for long (wrapping) descriptions.
// The last page reserves room for the totals block so it never overflows.
export function paginateItems(items = [], opts = {}) {
  const firstCap = opts.firstCap ?? 12;   // page 1 also carries the bill-to block
  const midCap = opts.midCap ?? 20;       // continuation pages have a slim header
  const reserve = opts.reserve ?? 7;      // weight reserved for the totals block
  const weight = (it) => 1 + Math.floor(((it.description || '').length) / 60);

  const pages = [];
  let cur = [];
  let w = 0;
  let cap = firstCap;
  for (const it of items) {
    const iw = Math.max(1, weight(it));
    if (cur.length && w + iw > cap) {
      pages.push(cur);
      cur = [];
      w = 0;
      cap = midCap;
    }
    cur.push(it);
    w += iw;
  }
  if (cur.length || pages.length === 0) pages.push(cur);

  // Make sure the totals block fits on the final page; otherwise add one.
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
