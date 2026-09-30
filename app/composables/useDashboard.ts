/** The signed-in owner's shop and today's numbers. Await it so the first render has them. */
export async function useDashboard() {
  const { data, status, error, refresh } = await useFetch('/api/dashboard', {
    key: 'dashboard',
    transform: response => response.data
  })

  return { dashboard: data, status, error, refresh }
}
