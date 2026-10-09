// The shop's QR code as SVG (on screen, on the poster) and as PNG (download, share).
import { renderSVG } from 'uqr'

/** Dark on white, whatever the theme, so every phone camera reads it. */
export function shopQrSvg(link: string): string {
  return renderSVG(link, { ecc: 'M', border: 2, blackColor: '#09090b', whiteColor: '#ffffff' })
}

/** The QR code as a square PNG of `size` pixels (browser only). */
export async function shopQrPng(link: string, size = 1024): Promise<Blob> {
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(shopQrSvg(link))}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas is not available')
  }
  // Crisp modules, not blurred edges.
  context.imageSmoothingEnabled = false
  context.drawImage(image, 0, 0, size, size)
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not make the image'))), 'image/png')
  })
}
