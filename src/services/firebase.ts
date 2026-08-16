import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredFirebaseKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

let cachedApp: FirebaseApp | null = null
let authReadyPromise: Promise<User | null> | null = null
let redirectHandledPromise: Promise<void> | null = null

function getMissingFirebaseKeys() {
  return requiredFirebaseKeys.filter((key) => !import.meta.env[key])
}

export function isFirebaseConfigured() {
  return getMissingFirebaseKeys().length === 0
}

export function getFirebaseConfigError() {
  const missingKeys = getMissingFirebaseKeys()

  if (missingKeys.length === 0) {
    return null
  }

  return `Firebase не настроен. Заполни переменные окружения: ${missingKeys.join(', ')}`
}

function createFirebaseApp(): FirebaseApp {
  const configError = getFirebaseConfigError()

  if (configError) {
    throw new Error(configError)
  }

  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
}

export function getFirebaseApp() {
  if (!cachedApp) {
    cachedApp = createFirebaseApp()
  }

  return cachedApp
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp())
}

export function getFirebaseDb() {
  return getFirestore(getFirebaseApp())
}

export function getFirebaseStorage() {
  return getStorage(getFirebaseApp())
}

export function getCurrentFirebaseUser() {
  if (!isFirebaseConfigured()) {
    return null
  }

  return getFirebaseAuth().currentUser
}

export function getCurrentFirebaseUserId() {
  return getCurrentFirebaseUser()?.uid ?? null
}

async function waitForInitialAuthState() {
  return new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
      unsubscribe()
      resolve(user)
    })
  })
}

async function ensureRedirectResultHandled() {
  if (!redirectHandledPromise) {
    redirectHandledPromise = getRedirectResult(getFirebaseAuth())
      .then(() => undefined)
      .catch(() => undefined)
  }

  return redirectHandledPromise
}

export async function initializeFirebaseAuthSession() {
  if (!isFirebaseConfigured()) {
    return null
  }

  if (!authReadyPromise) {
    authReadyPromise = (async () => {
      await ensureRedirectResultHandled()
      const auth = getFirebaseAuth()
      const existingUser = auth.currentUser ?? (await waitForInitialAuthState())

      if (existingUser) {
        return existingUser
      }

      const credentials = await signInAnonymously(auth)
      return credentials.user
    })().catch((error) => {
      authReadyPromise = null
      throw error
    })
  }

  return authReadyPromise
}

export function subscribeToFirebaseAuth(listener: (user: User | null) => void) {
  if (!isFirebaseConfigured()) {
    listener(null)
    return () => undefined
  }

  return onAuthStateChanged(getFirebaseAuth(), listener)
}

export async function signInWithGoogle() {
  if (!isFirebaseConfigured()) {
    throw new Error(getFirebaseConfigError() ?? 'Firebase is not configured')
  }

  const auth = getFirebaseAuth()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })

  try {
    const credentials = await signInWithPopup(auth, provider)
    authReadyPromise = Promise.resolve(credentials.user)
    return {
      mode: 'popup' as const,
      user: credentials.user,
    }
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : ''
    const shouldFallbackToRedirect =
      code === 'auth/popup-blocked' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/operation-not-supported-in-this-environment'

    if (!shouldFallbackToRedirect) {
      throw error
    }

    await signInWithRedirect(auth, provider)
    return {
      mode: 'redirect' as const,
      user: null,
    }
  }
}

export async function signOutFromFirebase() {
  if (!isFirebaseConfigured()) {
    return null
  }

  await signOut(getFirebaseAuth())
  authReadyPromise = null
  return initializeFirebaseAuthSession()
}
