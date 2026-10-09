/** Signs out of this device, forgets loaded data and goes to the sign-in page. */
export function useSignOut() {
  const signingOut = ref(false)

  async function signOut() {
    signingOut.value = true
    await authClient.signOut()
    clearNuxtData()
    await navigateTo('/auth/login')
  }

  return { signingOut, signOut }
}
