import { useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import { muscleGroups } from '../data/index.ts'
import {
  loadMusclePriorityOverrides,
  resolveMuscleGroups,
  saveMusclePriorityOverrides,
  type MusclePriorityOverrides,
} from '../services/musclePriorities.ts'
import type { MuscleGroup, MusclePriority } from '../types/muscles.ts'

interface SettingsPageProps {
  firebaseUser: User | null
  syncStatus: string
  onGoogleSignIn: () => Promise<void>
  onSignOut: () => Promise<void>
}

const priorityLabels: Record<MusclePriority, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
}

function getPriorityDescription(priority: MusclePriority) {
  if (priority === 'high') {
    return 'Мышца будет чаще подниматься в Need Score и генераторе.'
  }

  if (priority === 'low') {
    return 'Мышца будет встречаться реже, но не исчезнет из программы.'
  }

  return 'Мышца участвует в генерации без дополнительного смещения.'
}

export function SettingsPage({
  firebaseUser,
  syncStatus,
  onGoogleSignIn,
  onSignOut,
}: SettingsPageProps) {
  const [priorityOverrides, setPriorityOverrides] = useState<MusclePriorityOverrides>(
    () => loadMusclePriorityOverrides(),
  )
  const [authMessage, setAuthMessage] = useState('')
  const resolvedMuscleGroups = useMemo(() => {
    return resolveMuscleGroups(muscleGroups).map((muscle) => ({
      ...muscle,
      priority: priorityOverrides[muscle.id] ?? muscle.priority,
    }))
  }, [priorityOverrides])

  const highPriorityCount = resolvedMuscleGroups.filter(
    (muscle) => muscle.priority === 'high',
  ).length
  const lowPriorityCount = resolvedMuscleGroups.filter(
    (muscle) => muscle.priority === 'low',
  ).length

  function updatePriority(muscleId: MuscleGroup['id'], priority: MusclePriority) {
    const nextOverrides: MusclePriorityOverrides = {
      ...priorityOverrides,
      [muscleId]: priority,
    }

    setPriorityOverrides(nextOverrides)
    saveMusclePriorityOverrides(nextOverrides)
  }

  function resetPriorities() {
    setPriorityOverrides({})
    saveMusclePriorityOverrides({})
  }

  async function handleGoogleSignIn() {
    try {
      setAuthMessage('')
      await onGoogleSignIn()
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Не удалось войти через Google.')
    }
  }

  async function handleSignOut() {
    try {
      setAuthMessage('')
      await onSignOut()
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Не удалось выйти из аккаунта.')
    }
  }

  return (
    <section className="page-card">
      <div className="page-card__header">
        <h2 className="page-card__title">Настройки</h2>
        <p className="page-card__text">
          Здесь можно войти в Google-аккаунт для общей синхронизации между телефоном
          и ПК, а также задать приоритеты мышц для генератора программы.
        </p>
      </div>

      <div className="page-card__grid">
        <article className="info-tile info-tile--account">
          <strong>Аккаунт</strong>
          <p>
            {firebaseUser?.isAnonymous
              ? 'Сейчас используется временная анонимная сессия.'
              : firebaseUser?.email ?? 'Google-аккаунт подключён'}
          </p>
        </article>
        <article className="info-tile info-tile--account">
          <strong>Синхронизация</strong>
          <p>{syncStatus}</p>
        </article>
        <article className="info-tile">
          <strong>Высокий приоритет</strong>
          <p>{highPriorityCount} мышц сейчас получают дополнительный акцент.</p>
        </article>
        <article className="info-tile">
          <strong>Низкий приоритет</strong>
          <p>{lowPriorityCount} мышц тренируются реже, но остаются в плане.</p>
        </article>
      </div>

      <div className="settings-auth-panel">
        <div className="settings-auth-panel__content">
          <h3 className="settings-auth-panel__title">Google-аккаунт</h3>
          <p className="settings-auth-panel__text">
            Войди в один и тот же Google-аккаунт на телефоне и на ПК, чтобы обе
            версии приложения читали и обновляли общие тренировки, планы и настройки.
          </p>
          <p className="settings-auth-panel__meta">
            Текущий пользователь:{' '}
            {firebaseUser?.isAnonymous
              ? 'анонимная сессия'
              : firebaseUser?.email ?? firebaseUser?.uid ?? 'не определён'}
          </p>
          {authMessage ? (
            <p className="settings-auth-panel__meta">{authMessage}</p>
          ) : null}
        </div>

        <div className="settings-auth-panel__actions">
          <button
            type="button"
            className="settings-auth-button settings-auth-button--google"
            onClick={handleGoogleSignIn}
          >
            Войти через Google
          </button>
          <button
            type="button"
            className="settings-auth-button settings-auth-button--secondary"
            onClick={handleSignOut}
          >
            Выйти
          </button>
        </div>
      </div>

      <div className="settings-priority-panel">
        <div className="settings-priority-panel__header">
          <h3 className="settings-priority-panel__title">Приоритеты мышц</h3>
          <button
            type="button"
            className="settings-priority-panel__reset"
            onClick={resetPriorities}
          >
            Сбросить к обычным
          </button>
        </div>

        <div className="settings-priority-list">
          {resolvedMuscleGroups.map((muscle) => (
            <article key={muscle.id} className="settings-priority-card">
              <div>
                <strong>{muscle.name}</strong>
                <p>{getPriorityDescription(muscle.priority)}</p>
              </div>

              <div className="settings-priority-options">
                {(['low', 'normal', 'high'] as MusclePriority[]).map((priority) => (
                  <button
                    key={`${muscle.id}-${priority}`}
                    type="button"
                    className={`settings-priority-option${
                      muscle.priority === priority
                        ? ' settings-priority-option--active'
                        : ''
                    }`}
                    onClick={() => updatePriority(muscle.id, priority)}
                  >
                    {priorityLabels[priority]}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
