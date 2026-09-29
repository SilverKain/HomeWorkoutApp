import { useEffect, useState, type ReactElement } from 'react'
import type { User } from 'firebase/auth'
import { AppLayout } from './components/AppLayout.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { TodayPage } from './pages/TodayPage.tsx'
import { CalendarPage } from './pages/CalendarPage.tsx'
import { ExercisesPage } from './pages/ExercisesPage.tsx'
import { ProgressPage } from './pages/ProgressPage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { navigationItems, type NavigationId } from './types/navigation.ts'
import {
  FIREBASE_SYNC_EVENT,
  FIREBASE_SYNC_ERROR_EVENT,
  bootstrapFirebaseTrainingCache,
  getCurrentFirebaseUser,
  signInWithGoogle,
  signOutFromFirebase,
  subscribeToFirebaseAuth,
  subscribeToFirebaseTrainingState,
} from './services/index.ts'
import { getTodayIsoDate } from './utils/today.ts'
import './App.css'

function App() {
  const [activePage, setActivePage] = useState<NavigationId>('home')
  const [selectedWorkoutDate, setSelectedWorkoutDate] = useState(() => getTodayIsoDate())
  const [syncVersion, setSyncVersion] = useState(0)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(() => getCurrentFirebaseUser())
  const [syncStatus, setSyncStatus] = useState('Синхронизация подключается...')

  useEffect(() => {
    let unsubscribeSnapshots: (() => void) | null = null
    let generation = 0

    const handleSync = () => setSyncVersion((value) => value + 1)
    const handleSyncError = () => {
      setSyncStatus('Не удалось синхронизировать данные. Проверь подключение и обнови страницу.')
    }

    window.addEventListener(FIREBASE_SYNC_EVENT, handleSync)
    window.addEventListener(FIREBASE_SYNC_ERROR_EVENT, handleSyncError)

    const unsubscribeAuth = subscribeToFirebaseAuth((user) => {
      const currentGeneration = ++generation
      unsubscribeSnapshots?.()
      unsubscribeSnapshots = null
      setFirebaseUser(user)
      setSyncStatus(user ? 'Синхронизация подключается...' : 'Локальный режим')
      if (!user) return

      void (async () => {
        const result = await bootstrapFirebaseTrainingCache(user.uid)
        if (currentGeneration !== generation) return
        if (!result.synced) {
          handleSyncError()
          return
        }
        const unsubscribe = await subscribeToFirebaseTrainingState(user.uid)
        if (currentGeneration !== generation) {
          unsubscribe()
          return
        }
        unsubscribeSnapshots = unsubscribe
        setSyncStatus(user.isAnonymous
          ? 'Для синхронизации телефона и ПК войди в один Google-аккаунт на обоих устройствах.'
          : 'Синхронизация аккаунта подключена')
      })().catch(() => {
        if (currentGeneration === generation) handleSyncError()
      })
    })

    return () => {
      generation++
      unsubscribeAuth()
      unsubscribeSnapshots?.()
      window.removeEventListener(FIREBASE_SYNC_EVENT, handleSync)
      window.removeEventListener(FIREBASE_SYNC_ERROR_EVENT, handleSyncError)
    }
  }, [])

  function openCalendarDate(date: string) {
    setSelectedWorkoutDate(date)
    setActivePage('calendar')
  }

  async function handleGoogleSignIn() {
    const result = await signInWithGoogle()
    setSyncStatus(
      result.mode === 'redirect'
        ? 'Продолжаем вход через Google...'
        : 'Аккаунт Google подключён',
    )
  }

  async function handleSignOut() {
    await signOutFromFirebase()
    setSyncStatus('Переключено на локальную анонимную сессию')
  }

  const pageMap: Record<NavigationId, ReactElement> = {
    home: (
      <HomePage
        onOpenCalendarDate={openCalendarDate}
        firebaseUser={firebaseUser}
        syncStatus={syncStatus}
        key={`home-${syncVersion}`}
      />
    ),
    today: (
      <TodayPage
        selectedDate={selectedWorkoutDate}
        key={`today-${syncVersion}`}
      />
    ),
    calendar: (
      <CalendarPage
        selectedDate={selectedWorkoutDate}
        onSelectDate={setSelectedWorkoutDate}
        key={`calendar-${syncVersion}`}
      />
    ),
    exercises: <ExercisesPage />,
    progress: <ProgressPage key={`progress-${syncVersion}`} />,
    settings: (
      <SettingsPage
        firebaseUser={firebaseUser}
        syncStatus={syncStatus}
        onGoogleSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
        key={`settings-${syncVersion}`}
      />
    ),
  }

  return (
    <AppLayout
      activePage={activePage}
      items={navigationItems}
      onNavigate={setActivePage}
    >
      {pageMap[activePage]}
    </AppLayout>
  )
}

export default App
