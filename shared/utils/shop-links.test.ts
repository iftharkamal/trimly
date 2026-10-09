import { renderSVG } from 'uqr'
import { describe, expect, it } from 'vitest'
import { shopJoinUrl, shopPageUrl } from './shop-links'

describe('shop links', () => {
  it('point to the shop page, and the QR link opens the join form', () => {
    expect(shopPageUrl('https://trimly.in', 'faisal-barber')).toBe('https://trimly.in/shop/faisal-barber')
    expect(shopJoinUrl('https://trimly.in', 'faisal-barber')).toBe('https://trimly.in/shop/faisal-barber?join=1')
  })

  it('tolerate a trailing slash or spaces in the configured address', () => {
    expect(shopJoinUrl(' https://trimly.in/ ', 'kochi-cuts')).toBe('https://trimly.in/shop/kochi-cuts?join=1')
  })

  it('make a scannable QR code (an SVG) for the link', () => {
    const svg = renderSVG(shopJoinUrl('https://trimly.in', 'faisal-barber'), { ecc: 'M', border: 2 })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('</svg>')
  })
})
