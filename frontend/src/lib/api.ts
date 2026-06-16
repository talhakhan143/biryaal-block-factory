import axios from 'axios'

export const TOKEN_KEY = 'bf_token'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1',
  headers: { Accept: 'application/json' },
})

// Attach the Bearer token on every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401, drop the token and bounce to login.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      if (location.pathname !== '/login') {
        location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

// Pull a human message out of a Laravel error response.
export function apiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; errors?: Record<string, string[]> }
    if (data?.errors) {
      return Object.values(data.errors).flat().join(' ')
    }
    return data?.message ?? error.message
  }
  return 'Something went wrong.'
}
