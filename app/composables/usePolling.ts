/**
 * Calls `task` every `intervalMs` while the tab is visible, and immediately
 * when the tab becomes visible again. Client only; stops with the component.
 */
export function usePolling(task: () => unknown, intervalMs: number) {
  let timer: ReturnType<typeof setInterval> | undefined

  function runIfVisible() {
    if (document.visibilityState === 'visible') {
      task()
    }
  }

  onMounted(() => {
    timer = setInterval(runIfVisible, intervalMs)
    document.addEventListener('visibilitychange', runIfVisible)
  })

  onBeforeUnmount(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', runIfVisible)
  })
}
