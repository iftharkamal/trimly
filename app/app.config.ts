export default defineAppConfig({
  ui: {
    // See assets/css/main.css: primary is overridden to black/white ("ink").
    colors: {
      primary: 'zinc',
      neutral: 'zinc',
      success: 'emerald',
      warning: 'amber',
      error: 'red',
      info: 'sky'
    },
    card: {
      slots: {
        root: 'rounded-xl shadow-xs'
      }
    }
  }
})
