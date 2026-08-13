import { useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import { MetricBar } from '../components/MetricBar.tsx'
import {
  calculateMuscleNeedScores,
  calculateRecoveryScores,
  calculateRecentMuscleLoad,
  generateWeeklyWorkoutPlans,
  getWeekTrainingDates,
} from '../algorithms/index.ts'
import { exercises, muscleGroups } from '../data/index.ts'
import { resolveMuscleGroups } from '../services/musclePriorities.ts'
import {
  PLANNED_WORKOUTS_UPDATED_EVENT,
  loadPlannedWorkouts,
  savePlannedWorkouts,
} from '../services/plannedWorkouts.ts'
import { loadWorkoutHistory } from '../services/workoutHistory.ts'
import { getTodayDateLabel, getTodayIsoDate } from '../utils/today.ts'

const TODAY_DATE = getTodayIsoDate()
const TODAY_LABEL = getTodayDateLabel()

const trainingDayLabels: Record<string, string> = {
  0: 'Вс',
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
}

interface HomePageProps {
  onOpenCalendarDate: (date: string) => void
  firebaseUser: User | null
  syncStatus: string
}

function getExerciseMap() {
  return Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise]))
}

function getDayLabel(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`)
  return trainingDayLabels[date.getDay()] ?? isoDate
}

function getWeekStatusLabel(
  date: string,
  historyDates: Set<string>,
  plannedDates: Set<string>,
) {
  if (historyDates.has(date)) {
    return '✓'
  }

  if (date === TODAY_DATE) {
    return 'Сегодня'
  }

  if (plannedDates.has(date)) {
    return 'Запланировано'
  }

  if (date < TODAY_DATE) {
    return 'Пропущено'
  }

  return 'Без плана'
}

function getAccountLabel(firebaseUser: User | null) {
  if (!firebaseUser) {
    return 'Подключение аккаунта...'
  }

  if (firebaseUser.isAnonymous) {
    return 'Локальная анонимная сессия'
  }

  return firebaseUser.displayName ?? firebaseUser.email ?? 'Аккаунт подключён'
}

function getAccountHint(firebaseUser: User | null) {
  if (!firebaseUser) {
    return 'Подготавливаем синхронизацию данных.'
  }

  if (firebaseUser.isAnonymous) {
    return 'Для общей синхронизации на телефоне и ПК войди через Google в настройках.'
  }

  return 'Данные тренировки будут доступны на всех устройствах с этим аккаунтом.'
}

export function HomePage({
  onOpenCalendarDate,
  firebaseUser,
  syncStatus,
}: HomePageProps) {
  const resolvedMuscleGroups = useMemo(() => resolveMuscleGroups(muscleGroups), [])
  const exerciseMap = useMemo(() => getExerciseMap(), [])
  const [history, setHistory] = useState(() => loadWorkoutHistory())
  const [plannedWorkouts, setPlannedWorkouts] = useState(() => loadPlannedWorkouts())
  const [message, setMessage] = useState('')
  const [expandedReasonKey, setExpandedReasonKey] = useState<string | null>(null)

  useEffect(() => {
    const handlePlannedWorkoutsUpdated = () => {
      setPlannedWorkouts(loadPlannedWorkouts())
      setHistory(loadWorkoutHistory())
    }

    window.addEventListener(
      PLANNED_WORKOUTS_UPDATED_EVENT,
      handlePlannedWorkoutsUpdated,
    )

    return () => {
      window.removeEventListener(
        PLANNED_WORKOUTS_UPDATED_EVENT,
        handlePlannedWorkoutsUpdated,
      )
    }
  }, [])

  const nextPlannedWorkout = useMemo(() => {
    return [...plannedWorkouts]
      .filter((workout) => workout.date >= TODAY_DATE)
      .sort((left, right) => left.date.localeCompare(right.date))[0]
  }, [plannedWorkouts])

  const recoveryScores = calculateRecoveryScores(
    history,
    exerciseMap,
    resolvedMuscleGroups,
    TODAY_DATE,
  ).slice(0, 6)

  const needScores = calculateMuscleNeedScores(
    history,
    exerciseMap,
    resolvedMuscleGroups,
    TODAY_DATE,
  ).slice(0, 6)

  const recentLoadMap = calculateRecentMuscleLoad(history, exerciseMap, TODAY_DATE)
  const loadSummary = resolvedMuscleGroups
    .map((muscle) => ({
      muscleId: muscle.id,
      muscleName: muscle.name,
      load: Number((recentLoadMap[muscle.id] ?? 0).toFixed(2)),
    }))
    .filter((item) => item.load > 0)
    .sort((left, right) => right.load - left.load)
    .slice(0, 6)

  const maxLoadValue = Math.max(...loadSummary.map((item) => item.load), 1)
  const musclesNeedingWork = needScores.slice(0, 3)
  const completedWorkoutCount = history.filter((workout) =>
    workout.entries.some((entry) => entry.completed),
  ).length
  const weekDates = getWeekTrainingDates(TODAY_DATE)
  const historyDates = new Set(history.map((entry) => entry.date))
  const plannedDates = new Set(plannedWorkouts.map((entry) => entry.date))
  const weekStatusItems = weekDates.map((date) => ({
    date,
    dayLabel: getDayLabel(date),
    statusLabel: getWeekStatusLabel(date, historyDates, plannedDates),
  }))

  function generateWorkout() {
    const nextPlans = generateWeeklyWorkoutPlans(
      exercises,
      resolvedMuscleGroups,
      history,
      TODAY_DATE,
    )

    savePlannedWorkouts(nextPlans)
    setPlannedWorkouts(loadPlannedWorkouts())
    setHistory(loadWorkoutHistory())
    setMessage(
      nextPlans.length > 0
        ? `Создан недельный план. Ближайшая тренировка запланирована на ${nextPlans[0].date}.`
        : 'На этой неделе больше не осталось будущих тренировочных дней.',
    )
  }

  function toggleReasonKey(key: string) {
    setExpandedReasonKey((current) => (current === key ? null : key))
  }

  return (
    <section className="page-card home-page">
      <div className="page-card__header">
        <h2 className="page-card__title">Главная</h2>
        <p className="page-card__text">
          Здесь собран обзор ближайшей тренировки, восстановления и текущей
          нагрузки по мышцам.
        </p>
      </div>

      <div className="home-hero">
        <div className="home-hero__content">
          <span className="home-hero__eyebrow">Сгенерированная тренировка</span>
          {nextPlannedWorkout ? (
            <>
              <h3>{nextPlannedWorkout.title}</h3>
              <p>Дата: {nextPlannedWorkout.date}</p>
              <p>Упражнений: {nextPlannedWorkout.entries.length}</p>
              <p>
                Первые акценты:{' '}
                {nextPlannedWorkout.entries
                  .slice(0, 3)
                  .map((entry) => exerciseMap[entry.exerciseId]?.name ?? entry.exerciseId)
                  .join(', ')}
              </p>

              <div className="selection-reasons-list">
                {nextPlannedWorkout.entries.slice(0, 3).map((entry, index) => {
                  const exercise = exerciseMap[entry.exerciseId]
                  const reasonKey = `home-${nextPlannedWorkout.id}-${entry.exerciseId}-${index}`

                  return (
                    <div key={reasonKey} className="selection-reasons">
                      <p>
                        {exercise?.name ?? entry.exerciseId} — {entry.selectionScore ?? '—'}/100
                      </p>
                      {entry.selectionReasons && entry.selectionReasons.length > 0 ? (
                        <>
                          <button
                            type="button"
                            className="selection-reasons__button"
                            onClick={() => toggleReasonKey(reasonKey)}
                          >
                            Почему выбрано?
                          </button>
                          {expandedReasonKey === reasonKey ? (
                            <div className="selection-reasons__panel">
                              {entry.selectionReasons.map((reason) => (
                                <p key={`${reasonKey}-${reason}`}>{reason}</p>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <h3>План пока не создан</h3>
              <p>На {TODAY_LABEL} будущая тренировка ещё не сохранена.</p>
              <p>Нажми кнопку справа, и приложение соберёт неделю Пн / Ср / Пт.</p>
            </>
          )}
        </div>

        <div className="home-hero__actions">
          <button
            type="button"
            className="home-hero__button"
            onClick={generateWorkout}
          >
            Создать тренировку
          </button>
          <p className="home-hero__message">{message}</p>
        </div>
      </div>

      <div className="page-card__grid">
        <article className="info-tile info-tile--account">
          <strong>Аккаунт</strong>
          <p>{getAccountLabel(firebaseUser)}</p>
          <p className="info-tile__meta">{syncStatus}</p>
          <p className="info-tile__meta">{getAccountHint(firebaseUser)}</p>
        </article>
        <article className="info-tile">
          <strong>Тренировок в истории</strong>
          <p>{completedWorkoutCount}</p>
        </article>
        <article className="info-tile">
          <strong>Ближайшая дата</strong>
          <p>{nextPlannedWorkout?.date ?? 'Пока не запланирована'}</p>
        </article>
        <article className="info-tile">
          <strong>Мышц в приоритете</strong>
          <p>{musclesNeedingWork.length}</p>
        </article>
        <article className="info-tile">
          <strong>Активных зон нагрузки</strong>
          <p>{loadSummary.length}</p>
        </article>
      </div>

      <div className="home-week-strip" aria-label="Статусы недели">
        {weekStatusItems.map((item) => (
          <button
            key={item.date}
            type="button"
            className={`home-week-chip${
              item.date === TODAY_DATE ? ' home-week-chip--today' : ''
            }`}
            onClick={() => onOpenCalendarDate(item.date)}
          >
            <strong>{item.dayLabel}</strong>
            <span>{item.statusLabel}</span>
          </button>
        ))}
      </div>

      <div className="home-dashboard">
        <section className="home-panel">
          <div className="home-panel__header">
            <h3>Потребность мышц в нагрузке</h3>
            <p>Какие мышцы сейчас больше всего нуждаются в работе.</p>
          </div>
          <div className="home-stat-list">
            {needScores.map((item) => (
              <article key={item.muscleId} className="home-stat-card">
                <strong>{item.muscleName}</strong>
                <p>Потребность: {item.score}</p>
                <p>Восстановление: {item.recoveryScore}</p>
                <MetricBar
                  value={item.score}
                  tone="warm"
                  label={`Потребность в работе: ${item.score}/100`}
                />
                <p>Последняя тренировка: {item.lastTrainedDate ?? 'ещё не было'}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-panel">
          <div className="home-panel__header">
            <h3>Уровень восстановления</h3>
            <p>Оценка восстановления по самым актуальным мышцам.</p>
          </div>
          <div className="home-stat-list">
            {recoveryScores.map((item) => (
              <article key={item.muscleId} className="home-stat-card">
                <strong>{item.muscleName}</strong>
                <p>Восстановление: {item.score}</p>
                <MetricBar
                  value={item.score}
                  tone="success"
                  label={`Восстановление: ${item.score}/100`}
                />
                <p>Недавняя нагрузка: {item.recentLoad.toFixed(2)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-panel">
          <div className="home-panel__header">
            <h3>Нагрузка по мышцам</h3>
            <p>Что уже получило больше всего объёма в недавней истории.</p>
          </div>
          <div className="home-stat-list">
            {loadSummary.length > 0 ? (
              loadSummary.map((item) => (
                <article key={item.muscleId} className="home-stat-card">
                  <strong>{item.muscleName}</strong>
                  <p>Нагрузка: {item.load}</p>
                  <MetricBar
                    value={item.load}
                    max={maxLoadValue}
                    tone="cool"
                    label={`Доля недавней нагрузки: ${item.load}`}
                  />
                </article>
              ))
            ) : (
              <article className="home-stat-card home-stat-card--empty">
                <strong>Нагрузка пока не накоплена</strong>
                <p>После первых сохранённых тренировок здесь появится объём по мышцам.</p>
              </article>
            )}
          </div>
        </section>

        <section className="home-panel">
          <div className="home-panel__header">
            <h3>Фокус следующей тренировки</h3>
            <p>Быстрый ориентир для ближайшего занятия.</p>
          </div>
          <div className="home-focus-list">
            {musclesNeedingWork.map((item) => (
              <article key={item.muscleId} className="home-focus-card">
                <strong>{item.muscleName}</strong>
                <p>{item.score}/100</p>
                <MetricBar
                  value={item.score}
                  tone="warm"
                  label="Фокус следующей тренировки"
                />
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}
