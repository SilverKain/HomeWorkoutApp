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
  bootstrapFirebaseTrainingCache,
  getCurrentFirebaseUser,
  signInWithGoogle,
  signOutFromFirebase,
  subscribeToFirebaseAuth,
  subscribeToFirebaseTrainingState,
} from './services/index.ts'
import './App.css'

function App() {
  const [activePage, setActivePage] = useState<NavigationId>('home')
  const [calendarSelectedDate, setCalendarSelectedDate] = useState('2026-08-12')
  const [syncVersion, setSyncVersion] = useState(0)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(() => getCurrentFirebaseUser())
  const [syncStatus, setSyncStatus] = useState('Синхронизация подключается...')

  useEffect(() => {
    let unsubscribeSnapshots: (() => void) | null = null

    const unsubscribeAuth = subscribeToFirebaseAuth((user) => {
      setFirebaseUser(user)
      setSyncStatus(user ? 'Синхронизация аккаунта активна' : 'Локальный режим')

      void bootstrapFirebaseTrainingCache().then(() => {
        setSyncVersion((value) => value + 1)
      })

      void subscribeToFirebaseTrainingState().then((unsubscribe) => {
        unsubscribeSnapshots?.()
        unsubscribeSnapshots = unsubscribe
      })
    })

    const handleSync = () => {
      setSyncVersion((value) => value + 1)
      setSyncStatus('Данные синхронизированы')
    }

    window.addEventListener(FIREBASE_SYNC_EVENT, handleSync)

    return () => {
      unsubscribeAuth()
      unsubscribeSnapshots?.()
      window.removeEventListener(FIREBASE_SYNC_EVENT, handleSync)
    }
  }, [])

  function openCalendarDate(date: string) {
    setCalendarSelectedDate(date)
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
    today: <TodayPage key={`today-${syncVersion}`} />,
    calendar: (
      <CalendarPage
        selectedDate={calendarSelectedDate}
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
