import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ currentUser: null as { uid: string } | null }))
vi.mock('firebase/app', () => ({
  getApps: () => [{}], getApp: () => ({}), initializeApp: () => ({}),
}))
vi.mock('firebase/auth', () => ({
  getAuth: () => auth,
  GoogleAuthProvider: vi.fn(),
  getRedirectResult: async () => null,
  onAuthStateChanged: (_auth: unknown, callback: (user: null) => void) => {
    queueMicrotask(() => callback(null))
    return () => undefined
  },
  signInAnonymously: async () => {
    auth.currentUser = { uid: 'anonymous' }
    return { user: auth.currentUser }
  },
  signInWithPopup: vi.fn(), signInWithRedirect: vi.fn(), signOut: vi.fn(),
}))
vi.mock('firebase/firestore', () => ({ getFirestore: vi.fn() }))
vi.mock('firebase/storage', () => ({ getStorage: vi.fn() }))
import { initializeFirebaseAuthSession } from './firebase.ts'
beforeEach(() => {
  for (const key of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID']) {
    vi.stubEnv(`VITE_FIREBASE_${key}`, 'test')
  }
  auth.currentUser = null
})
afterEach(() => vi.unstubAllEnvs())
it('uses the current account after an anonymous session and a cross-tab account change', async () => {
  expect((await initializeFirebaseAuthSession())?.uid).toBe('anonymous')
  auth.currentUser = { uid: 'google-account' }
  expect((await initializeFirebaseAuthSession())?.uid).toBe('google-account')
  auth.currentUser = { uid: 'other-google-account' }
  expect((await initializeFirebaseAuthSession())?.uid).toBe('other-google-account')
})
