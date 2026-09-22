import { useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import { MetricBar } from '../components/MetricBar.tsx'
import {
  calculateMuscleNeedScores,
  calculateRecoveryScores,
  calculateRecentMuscleLoad,
  generateWeeklyWorkoutPlans,
  getNextTrainingDate,
  getWeekTrainingDates,
} from '../algorithms/index.ts'
import { exercises, muscleGroups } from '../data/index.ts'
import { resolveMuscleGroups } from '../services/musclePriorities.ts'
import {
  FIREBASE_SYNC_EVENT,
  WORKOUT_HISTORY_UPDATED_EVENT,
} from '../services/index.ts'
import {
  PLANNED_WORKOUTS_UPDATED_EVENT,
  loadPlannedWorkouts,
  savePlannedWorkouts,
} from '../services/plannedWorkouts.ts'
import { loadWorkoutHistory } from '../services/workoutHistory.ts'
import { getTodayDateLabel, getTodayIsoDate } from '../utils/today.ts'

const TODAY_DATE = getTodayIsoDate()
const TODAY_LABEL = getTodayDateLabel()

function getMaxMetricValue(values: number[]) {
  return Math.max(...values, 1)
}

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

function addDays(isoDate: string, offset: number) {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

function getUpcomingTrainingDates(startIsoDate: string, count: number) {
  const upcomingDates: string[] = []
  let cursor = startIsoDate

  while (upcomingDates.length < count) {
    const nextDate =
      upcomingDates.length === 0 ? getNextTrainingDate(cursor) : getNextTrainingDate(addDays(cursor, 1))

    upcomingDates.push(nextDate)
    cursor = nextDate
  }

  return upcomingDates
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
  const [generatorDate, setGeneratorDate] = useState(() => getNextTrainingDate(TODAY_DATE))

  useEffect(() => {
    const syncHomeState = () => {
      setPlannedWorkouts(loadPlannedWorkouts())
      setHistory(loadWorkoutHistory())
    }

    window.addEventListener(PLANNED_WORKOUTS_UPDATED_EVENT, syncHomeState)
    window.addEventListener(WORKOUT_HISTORY_UPDATED_EVENT, syncHomeState)
    window.addEventListener(FIREBASE_SYNC_EVENT, syncHomeState)

    return () => {
      window.removeEventListener(PLANNED_WORKOUTS_UPDATED_EVENT, syncHomeState)
      window.removeEventListener(WORKOUT_HISTORY_UPDATED_EVENT, syncHomeState)
      window.removeEventListener(FIREBASE_SYNC_EVENT, syncHomeState)
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
  const maxRecoveryLoadValue = getMaxMetricValue(recoveryScores.map((item) => item.recentLoad))

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
  const generatorDateOptions = getUpcomingTrainingDates(TODAY_DATE, 6)
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
      generatorDate,
    )

    savePlannedWorkouts(nextPlans)
    setPlannedWorkouts(loadPlannedWorkouts())
    setHistory(loadWorkoutHistory())
    setMessage(
      nextPlans.length > 0
        ? `План пересчитан от ${generatorDate}. Ближайшая сгенерированная тренировка поставлена на ${nextPlans[0].date}.`
        : `После ${generatorDate} в этой неделе больше нет будущих тренировочных дней.`,
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
          Здесь собран обзор ближайшей тренировки, восстановления и текущей нагрузки по мышцам.
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
                Акценты:{' '}
                {nextPlannedWorkout.entries
                  .map((entry) => exerciseMap[entry.exerciseId]?.name ?? entry.exerciseId)
                  .join(', ')}
              </p>

              <div className="selection-reasons-list">
                {nextPlannedWorkout.entries.map((entry, index) => {
                  const exercise = exerciseMap[entry.exerciseId]
                  const reasonKey = `home-${nextPlannedWorkout.id}-${entry.exerciseId}-${index}`

                  return (
                    <div key={reasonKey} className="selection-reasons">
                      <p>
                        {exercise?.name ?? entry.exerciseId} - {entry.selectionScore ?? '-'} / 100
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
              <p>Выбери дату справа, и приложение соберёт план начиная с неё.</p>
            </>
          )}
        </div>

        <div className="home-hero__actions">
          <label className="home-hero__select">
            <span>На какой день добавить тренировку</span>
            <select
              value={generatorDate}
              onChange={(event) => setGeneratorDate(event.target.value)}
            >
              {generatorDateOptions.map((date) => (
                <option key={date} value={date}>
                  {date} ({getDayLabel(date)})
                </option>
              ))}
            </select>
          </label>
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

      <section className="home-panel home-formula">
        <div className="home-panel__header">
          <h3>Формула генерации</h3>
          <p>Ниже показан расчёт, по которому выбираются упражнения внутри одной тренировки.</p>
        </div>
        <div className="home-formula__content">
          <p>
            Генератор оценивает каждое упражнение по нескольким критериям сразу и не берёт его в
            план только потому, что оно сильное само по себе.
          </p>
          <p>
            Сначала система смотрит, какие мышцы уже восстановились, какие недополучили нагрузку за
            последние дни и какие мышцы входят в фокус следующей тренировки.
          </p>
          <p>
            Затем упражнения получают больше очков, если они хорошо нагружают именно эти мышцы,
            дают полезный тренировочный стимул и не создают лишнюю утомляемость.
          </p>
          <p>
            Внутри одной тренировки генератор специально избегает повторов подряд: если следующее
            упражнение снова бьёт по той же основной мышце, той же recovery zone или почти
            повторяет предыдущее движение, его приоритет снижается.
          </p>
          <p>
            В итоге выше поднимаются упражнения, которые лучше совпадают с восстановлением,
            потребностью мышц в нагрузке, фокусом тренировки и при этом делают весь план более
            сбалансированным.
          </p>
          <p>
            <code>
              score = targetedNeed + focusBonus + movementBonus + diversityBonus - fatiguePenalty
            </code>
          </p>
          <p>
            <code>
              targetedNeed = Σ coefficient * max(0, needScore * 0.82 + recoveryScore * 0.24 + max(0, 100 - recentLoad7d * 4) * 0.18 - usedMuscleBias * 10)
            </code>
          </p>
          <p>
            <code>focusBonus = Σ coefficient(top-3 focus muscles) * 18</code>
          </p>
          <p>
            <code>movementBonus = baseEffectiveness * 20</code> для ранних слотов и{' '}
            <code>baseEffectiveness * 18</code> для остальных.
          </p>
          <p>
            <code>diversityBonus = numberOfTargetedMuscles * 2</code>
          </p>
          <p>
            <code>fatiguePenalty = fatigueLevel * 2.5</code>
          </p>
          <p>
            Запрет повторов подряд в одной тренировке: упражнение отклоняется, если оно идёт подряд в той же recovery zone,
            повторяет ту же основную мышцу или даёт слишком большое мышечное пересечение с предыдущим движением.
          </p>
          <p>
            Дополнительно генератор ограничивает число повторов одной primary muscle, одной recovery zone, похожих движений и
            одинакового оборудования в пределах одной тренировки.
          </p>
        </div>
      </section>

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
                <MetricBar
                  value={item.recentLoad}
                  max={maxRecoveryLoadValue}
                  tone="danger"
                  label={`Доля недавней нагрузки: ${item.recentLoad.toFixed(2)}`}
                />
                <p>За день без нагрузки: +{item.dailyRecoveryGain}</p>
                <p>
                  До полного восстановления:{' '}
                  {item.daysToFullRecovery === 0 ? 'сейчас' : `${item.daysToFullRecovery} дн.`}
                </p>
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
