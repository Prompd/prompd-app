export const storage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
  },
  set(key: string, val: string | null) {
    try {
      if (val === null) localStorage.removeItem(key)
      else localStorage.setItem(key, val)
    } catch {}
  }
}

