// Public links to a shop's customer page, for QR codes, posters and sharing.

function base(siteUrl: string): string {
  return siteUrl.trim().replace(/\/+$/, '')
}

/** The shop's customer page: "https://trimly.in/shop/faisal-barber". */
export function shopPageUrl(siteUrl: string, slug: string): string {
  return `${base(siteUrl)}/shop/${encodeURIComponent(slug)}`
}

/** What the shop's QR code points to: the customer page with the join form open. */
export function shopJoinUrl(siteUrl: string, slug: string): string {
  return `${shopPageUrl(siteUrl, slug)}?join=1`
}
