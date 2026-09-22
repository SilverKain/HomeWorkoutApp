import { useEffect, useMemo, useState } from 'react'
import { ExerciseVisual } from '../components/ExerciseVisual.tsx'
import { MetricBar } from '../components/MetricBar.tsx'
import {
  calculateMuscleNeedScores,
  calculateRecoveryScores,
  calculateWorkoutMuscleLoad,
  summarizeWorkoutMuscleLoad,
} from '../algorithms/index.ts'
import { exercises, muscleGroups } from '../data/index.ts'
import {
  PLANNED_WORKOUTS_UPDATED_EVENT,
  loadPlannedWorkouts,
  removePlannedWorkoutByDate,
  removePlannedWorkoutExercise,
  upsertPlannedWorkoutEntry,
} from '../services/plannedWorkouts.ts'
import { FIREBASE_SYNC_EVENT } from '../services/firebaseTrainingSync.ts'
import {
  loadWorkoutHistory,
  removeWorkoutHistoryExercise,
  upsertWorkoutHistoryEntry,
  WORKOUT_HISTORY_UPDATED_EVENT,
} from '../services/workoutHistory.ts'
import { resolveMuscleGroups } from '../services/musclePriorities.ts'
import type {
  EffortLevel,
  PlannedWorkoutEntry,
  WorkoutExerciseEntry,
  WorkoutHistoryEntry,
} from '../types/workout.ts'
import {
  effortLabels,
  getEntryAverageRir,
  normalizeSetEfforts,
} from '../utils/effort.ts'
import { getTodayIsoDate } from '../utils/today.ts'
import { createWorkoutDraft, createWorkoutEntry } from '../utils/workoutDraft.ts'

const REST_DURATION_SECONDS = 30

function formatRestSeconds(value: number) {
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getCompletedSets(entry: WorkoutExerciseEntry) {
  return Math.min(entry.completedSets ?? (entry.completed ? entry.sets : 0), entry.sets)
}

function getRestProgressWidth(secondsLeft: number) {
  return Math.max(
    0,
    Math.min(100, ((REST_DURATION_SECONDS - secondsLeft) / REST_DURATION_SECONDS) * 100),
  )
}

function getMaxMetricValue(values: number[]) {
  return Math.max(...values, 1)
}

function getExerciseMuscleNames(
  entryMuscles: Partial<Record<string, number>>,
  availableMuscles: typeof muscleGroups,
) {
  return Object.entries(entryMuscles)
    .filter(([, coefficient]) => (coefficient ?? 0) >= 0.2)
    .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0))
    .map(([muscleId]) => availableMuscles.find((muscle) => muscle.id === muscleId)?.name ?? muscleId)
}

function getRecoveryExplanation(score: number, recentLoad: number) {
  if (score >= 80) {
    return 'Мышца хорошо восстановилась и готова к новой нагрузке.'
  }

  if (score >= 60) {
    return recentLoad >= 18
      ? 'Мышца уже была заметно напряжена и сейчас ещё частично восстанавливается.'
      : 'Мышца в рабочем состоянии, но повторный сильный акцент лучше дозировать.'
  }

  return 'Мышца недавно получила хорошую нагрузку и сейчас больше нуждается в отдыхе, чем в новой тренировке.'
}

function getNeedExplanation(score: number, recoveryScore: number, recentLoad7d: number) {
  if (score >= 75 && recoveryScore >= 65) {
    return 'Мышца восстановилась и сейчас особенно нуждается в тренировке.'
  }

  if (recentLoad7d >= 18 && recoveryScore < 60) {
    return 'Мышца уже была хорошо напряжена и пока не в приоритете для новой нагрузки.'
  }

  if (score >= 60) {
    return 'Мышце можно дать работу, но без слишком большого объёма.'
  }

  return 'Сейчас отдельный акцент на эту мышцу не нужен: приоритет у других зон или ей ещё нужно восстановление.'
}

function createDraftFromEntries(entries: WorkoutExerciseEntry[], title = 'Тренировка на сегодня') {
  return {
    title,
    entries: entries.map((entry) => ({
      ...entry,
      completed: entry.completed ?? false,
      completedSets: Math.min(entry.completedSets ?? (entry.completed ? entry.sets : 0), entry.sets),
      setEfforts: normalizeSetEfforts(entry),
    })),
  }
}

function createTodayDraft(selectedDate: string) {
  const historyEntry = loadWorkoutHistory().find((entry) => entry.date === selectedDate)

  if (historyEntry) {
    return createDraftFromEntries(historyEntry.entries, historyEntry.title)
  }

  const plannedEntry = loadPlannedWorkouts().find((entry) => entry.date === selectedDate)

  if (plannedEntry) {
    return createDraftFromEntries(plannedEntry.entries, plannedEntry.title)
  }

  return createWorkoutDraft([])
}

interface TodayPageProps {
  selectedDate?: string
}

export function TodayPage({ selectedDate: controlledSelectedDate }: TodayPageProps) {
  const todayDate = getTodayIsoDate()
  const selectedDate = controlledSelectedDate ?? todayDate
  const resolvedMuscleGroups = useMemo(() => resolveMuscleGroups(muscleGroups), [])
  const [draft, setDraft] = useState(() => createTodayDraft(selectedDate))
  const [exerciseToAdd, setExerciseToAdd] = useState(exercises[0]?.id ?? '')
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>(() => loadWorkoutHistory())
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkoutEntry[]>(
    () => loadPlannedWorkouts(),
  )
  const [saveMessage, setSaveMessage] = useState('')
  const [restExerciseId, setRestExerciseId] = useState<string | null>(null)
  const [restSecondsLeft, setRestSecondsLeft] = useState(0)

  useEffect(() => {
    const syncTodayState = () => {
      setHistory(loadWorkoutHistory())
      setPlannedWorkouts(loadPlannedWorkouts())
      setDraft(createTodayDraft(selectedDate))
    }

    window.addEventListener(PLANNED_WORKOUTS_UPDATED_EVENT, syncTodayState)
    window.addEventListener(WORKOUT_HISTORY_UPDATED_EVENT, syncTodayState)
    window.addEventListener(FIREBASE_SYNC_EVENT, syncTodayState)

    return () => {
      window.removeEventListener(PLANNED_WORKOUTS_UPDATED_EVENT, syncTodayState)
      window.removeEventListener(WORKOUT_HISTORY_UPDATED_EVENT, syncTodayState)
      window.removeEventListener(FIREBASE_SYNC_EVENT, syncTodayState)
    }
  }, [selectedDate])

  useEffect(() => {
    if (restSecondsLeft <= 0) {
      if (restExerciseId) {
        setRestExerciseId(null)
      }
      return
    }

    const timeoutId = window.setTimeout(() => {
      setRestSecondsLeft((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearTimeout(timeoutId)
  }, [restExerciseId, restSecondsLeft])

  const exerciseMap = useMemo(
    () => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise])),
    [],
  )
  const selectedExerciseIds = new Set(draft.entries.map((entry) => entry.exerciseId))
  const availableExercises = exercises.filter((exercise) => !selectedExerciseIds.has(exercise.id))
  const selectedHistoryEntry = history.find((entry) => entry.date === selectedDate)
  const selectedPlannedEntry = plannedWorkouts.find((entry) => entry.date === selectedDate)
  const pendingRecoveryEntries = selectedHistoryEntry ? [] : draft.entries
  const currentLoadMap = calculateWorkoutMuscleLoad(draft.entries, exerciseMap)
  const loadSummary = summarizeWorkoutMuscleLoad(currentLoadMap, resolvedMuscleGroups)
  const topLoadSummary = loadSummary.slice(0, 6)
  const maxLoadValue = Math.max(...topLoadSummary.map((item) => item.load), 1)
  const recoveryScores = calculateRecoveryScores(
    history,
    exerciseMap,
    resolvedMuscleGroups,
    selectedDate,
    pendingRecoveryEntries,
  ).slice(0, 6)
  const needScores = calculateMuscleNeedScores(
    history,
    exerciseMap,
    resolvedMuscleGroups,
    selectedDate,
    pendingRecoveryEntries,
  ).slice(0, 6)
  const maxRecoveryLoadValue = getMaxMetricValue(recoveryScores.map((item) => item.recentLoad))

  const completedEntries = draft.entries.filter((entry) => entry.completed)
  const completedCount = completedEntries.length
  const completedExerciseNames = completedEntries
    .map((entry) => exerciseMap[entry.exerciseId]?.name ?? entry.exerciseId)
    .slice(0, 6)
  const allExercisesCompleted =
    draft.entries.length > 0 &&
    draft.entries.every((entry) => getCompletedSets(entry) >= entry.sets)

  function persistDraft(nextDraft: typeof draft) {
    if (selectedHistoryEntry) {
      const nextHistory = upsertWorkoutHistoryEntry({
        date: selectedDate,
        title: nextDraft.title,
        entries: nextDraft.entries,
      })
      setHistory(nextHistory)
      return
    }

    if (nextDraft.entries.length === 0) {
      const nextPlans = removePlannedWorkoutByDate(selectedDate)
      setPlannedWorkouts(nextPlans)
      return
    }

    const nextPlans = upsertPlannedWorkoutEntry({
      id: selectedPlannedEntry?.id ?? `planned-${selectedDate}`,
      date: selectedDate,
      title: nextDraft.title,
      entries: nextDraft.entries,
      source: selectedPlannedEntry?.source ?? 'manual',
      weekKey: selectedPlannedEntry?.weekKey,
    })
    setPlannedWorkouts(nextPlans)
  }

  function updateEntry(
    exerciseId: string,
    updater: (entry: WorkoutExerciseEntry) => WorkoutExerciseEntry,
  ) {
    setDraft((currentDraft) => {
      const nextDraft = {
        ...currentDraft,
        entries: currentDraft.entries.map((entry) =>
          entry.exerciseId === exerciseId ? updater(entry) : entry,
        ),
      }
      persistDraft(nextDraft)
      return nextDraft
    })
  }

  function removeEntry(exerciseId: string) {
    if (selectedHistoryEntry) {
      const nextHistory = removeWorkoutHistoryExercise(selectedDate, exerciseId)
      setHistory(nextHistory)
    } else if (selectedPlannedEntry) {
      const nextPlans = removePlannedWorkoutExercise(selectedDate, exerciseId)
      setPlannedWorkouts(nextPlans)
    }

    setDraft((currentDraft) => {
      const nextDraft = {
        ...currentDraft,
        entries: currentDraft.entries.filter((entry) => entry.exerciseId !== exerciseId),
      }

      if (!selectedHistoryEntry && !selectedPlannedEntry) {
        persistDraft(nextDraft)
      }

      return nextDraft
    })

    if (restExerciseId === exerciseId) {
      setRestExerciseId(null)
      setRestSecondsLeft(0)
    }
  }

  function addExercise() {
    if (!exerciseToAdd || selectedExerciseIds.has(exerciseToAdd)) {
      return
    }

    setDraft((currentDraft) => {
      const nextDraft = {
        ...currentDraft,
        entries: [...currentDraft.entries, createWorkoutEntry(exerciseToAdd)],
      }
      persistDraft(nextDraft)
      return nextDraft
    })

    const nextAvailable = availableExercises.find((exercise) => exercise.id !== exerciseToAdd)
    setExerciseToAdd(nextAvailable?.id ?? '')
  }

  function updateSetEffort(exerciseId: string, setIndex: number, effort: EffortLevel) {
    updateEntry(exerciseId, (current) => {
      const nextSetEfforts = normalizeSetEfforts(current)
      nextSetEfforts[setIndex] = effort

      return {
        ...current,
        setEfforts: nextSetEfforts,
        rir: getEntryAverageRir({
          ...current,
          setEfforts: nextSetEfforts,
        }),
      }
    })
  }

  function updateCompletedSets(exerciseId: string, nextCompletedSets: number) {
    const currentEntry = draft.entries.find((entry) => entry.exerciseId === exerciseId)

    if (!currentEntry) {
      return
    }

    const currentCompletedSets = getCompletedSets(currentEntry)
    const clampedCompletedSets = Math.max(0, Math.min(nextCompletedSets, currentEntry.sets))
    const nextCompleted = clampedCompletedSets >= currentEntry.sets

    updateEntry(exerciseId, (entry) => ({
      ...entry,
      completedSets: clampedCompletedSets,
      completed: nextCompleted,
    }))

    if (clampedCompletedSets > currentCompletedSets && clampedCompletedSets < currentEntry.sets) {
      setRestExerciseId(exerciseId)
      setRestSecondsLeft(REST_DURATION_SECONDS)
      return
    }

    if (restExerciseId === exerciseId) {
      setRestExerciseId(null)
      setRestSecondsLeft(0)
    }
  }

  function startRestTimer(exerciseId: string) {
    setRestExerciseId(exerciseId)
    setRestSecondsLeft(REST_DURATION_SECONDS)
  }

  function stopRestTimer() {
    setRestExerciseId(null)
    setRestSecondsLeft(0)
  }

  function completeWorkout() {
    if (draft.entries.length === 0) {
      setSaveMessage('Нечего сохранять: добавь хотя бы одно упражнение.')
      return
    }

    if (!allExercisesCompleted) {
      setSaveMessage('Сначала заверши все упражнения, потом тренировка запишется в прогресс.')
      return
    }

    const nextHistory = upsertWorkoutHistoryEntry({
      date: selectedDate,
      title: draft.title,
      entries: draft.entries,
    })

    removePlannedWorkoutByDate(selectedDate)
    setHistory(nextHistory)
    setPlannedWorkouts(loadPlannedWorkouts())
    setSaveMessage(
      selectedDate === todayDate
        ? `Тренировка за ${todayDate} сохранена.`
        : `Тренировка за ${selectedDate} сохранена.`,
    )
    setSaveMessage(
      selectedDate === todayDate
        ? `Тренировка за ${todayDate} завершена и записана в прогресс.`
        : `Тренировка за ${selectedDate} завершена и записана в прогресс.`,
    )
  }

  return (
    <section className="page-card">
      <div className="page-card__header">
        <h2 className="page-card__title">Сегодня</h2>
        <p className="page-card__text">
          Здесь можно собрать тренировку, отмечать выполненные подходы и видеть, какие мышцы уже хорошо поработали, а какие
          ещё можно нагружать.
        </p>
      </div>

      <div className="page-card__grid">
        <article className="info-tile">
          <strong>Тренировка</strong>
          <p>{draft.title}</p>
        </article>
        <article className="info-tile">
          <strong>Дата</strong>
          <p>{selectedDate}</p>
        </article>
        <article className="info-tile">
          <strong>Выполнено</strong>
          <p>
            {completedCount} из {draft.entries.length} упражнений отмечены как завершённые.
          </p>
        </article>
        <article className="info-tile">
          <strong>Статус дня</strong>
          <p>
            {draft.entries.length > 0
              ? `В тренировке сейчас ${draft.entries.length} упражнений.`
              : 'На этот день упражнения ещё не добавлены.'}
          </p>
        </article>
      </div>

      <div className="workout-session-summary">
        <div className="workout-session-summary__content">
          <strong>Статус выполнения</strong>
          <p>
            {completedExerciseNames.length > 0
              ? `Готово: ${completedExerciseNames.join(', ')}`
              : 'Пока ни одно упражнение не завершено полностью.'}
          </p>
        </div>
        <div className="workout-session-summary__rest">
          <strong>Перерыв</strong>
          <p>
            {restExerciseId
              ? `${exerciseMap[restExerciseId]?.name ?? 'Упражнение'}: ${formatRestSeconds(restSecondsLeft)}`
              : 'Таймер отдыха не запущен'}
          </p>
          <div className="workout-rest-progress" aria-hidden="true">
            <div
              className="workout-rest-progress__fill"
              style={{
                width: `${restExerciseId ? getRestProgressWidth(restSecondsLeft) : 0}%`,
              }}
            />
          </div>
          {restExerciseId ? (
            <button
              type="button"
              className="workout-rest-button workout-rest-button--secondary"
              onClick={stopRestTimer}
            >
              Остановить таймер
            </button>
          ) : null}
        </div>
      </div>

      <div className="workout-builder">
        <div className="workout-builder__controls">
          <label className="exercise-muscle-select">
            <span>Добавить упражнение</span>
            <select
              value={exerciseToAdd}
              onChange={(event) => setExerciseToAdd(event.target.value)}
              disabled={availableExercises.length === 0}
            >
              {availableExercises.length > 0 ? (
                availableExercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))
              ) : (
                <option value="">Все упражнения уже добавлены</option>
              )}
            </select>
          </label>

          <button
            type="button"
            className="workout-builder__add-button"
            onClick={addExercise}
            disabled={availableExercises.length === 0 || !exerciseToAdd}
          >
            Добавить в тренировку
          </button>
        </div>

        <div className="workout-entry-list">
          {draft.entries.map((entry, index) => {
            const exercise = exerciseMap[entry.exerciseId]

            if (!exercise) {
              return null
            }

            const completedSets = getCompletedSets(entry)
            const isRestActive = restExerciseId === entry.exerciseId && restSecondsLeft > 0
            const setEfforts = normalizeSetEfforts(entry)
            const latestCompletedSetIndex = completedSets > 0 ? completedSets - 1 : null
            const usedMuscles = getExerciseMuscleNames(exercise.muscles, resolvedMuscleGroups)

            return (
              <article
                key={entry.exerciseId}
                className={`workout-entry-card${
                  entry.completed ? ' workout-entry-card--completed' : ''
                }`}
              >
                <div className="workout-entry-card__hero">
                  <ExerciseVisual exercise={exercise} size="large" showOverlay={false} />

                  <div className="workout-entry-card__header">
                    <div>
                      <div className="workout-entry-card__title-row">
                        <strong>
                          {index + 1}. {exercise.name}
                        </strong>
                        <span className="workout-entry-card__scheme">
                          {entry.sets}x{entry.reps}
                        </span>
                        <span
                          className={`workout-entry-card__badge${
                            entry.completed ? ' workout-entry-card__badge--completed' : ''
                          }`}
                        >
                          {entry.completed ? 'Выполнено' : 'В процессе'}
                        </span>
                      </div>
                      <p>{exercise.equipment}</p>
                      <p>Мышцы: {usedMuscles.length > 0 ? usedMuscles.join(', ') : 'Не указаны'}</p>
                    </div>

                    <button
                      type="button"
                      className="workout-entry-card__remove"
                      onClick={() => removeEntry(entry.exerciseId)}
                    >
                      Убрать
                    </button>
                  </div>
                </div>

                <div className="workout-set-progress">
                  <div className="workout-set-progress__chips">
                    {Array.from({ length: entry.sets }, (_, setIndex) => {
                      const isCompletedSet = setIndex < completedSets

                      return (
                        <button
                          key={`${entry.exerciseId}-set-${setIndex + 1}`}
                          type="button"
                          className={`workout-set-progress__chip${
                            isCompletedSet ? ' workout-set-progress__chip--completed' : ''
                          }`}
                          onClick={() =>
                            updateCompletedSets(
                              entry.exerciseId,
                              isCompletedSet ? setIndex : setIndex + 1,
                            )
                          }
                        >
                          {setIndex + 1}
                        </button>
                      )
                    })}
                  </div>

                  <div className="workout-effort-grid">
                    {latestCompletedSetIndex != null ? (
                      <div className="workout-effort-row">
                        <span className="workout-effort-row__label">
                          Оцени последний выполненный подход: {latestCompletedSetIndex + 1}
                        </span>
                        <div className="workout-effort-row__options">
                          {(['easy', 'medium', 'hard'] as EffortLevel[]).map((effort) => (
                            <button
                              key={`${entry.exerciseId}-${latestCompletedSetIndex + 1}-${effort}`}
                              type="button"
                              className={`workout-effort-chip${
                                setEfforts[latestCompletedSetIndex] === effort
                                  ? ' workout-effort-chip--active'
                                  : ''
                              }`}
                              onClick={() =>
                                updateSetEffort(entry.exerciseId, latestCompletedSetIndex, effort)
                              }
                            >
                              {effortLabels[effort]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="workout-entry-card__actions">
                  <button
                    type="button"
                    className={`workout-rest-button${
                      isRestActive ? ' workout-rest-button--active' : ''
                    }`}
                    onClick={() =>
                      isRestActive ? stopRestTimer() : startRestTimer(entry.exerciseId)
                    }
                  >
                    <span
                      className="workout-rest-button__fill"
                      style={{
                        width: `${isRestActive ? getRestProgressWidth(restSecondsLeft) : 0}%`,
                      }}
                      aria-hidden="true"
                    />
                    <span className="workout-rest-button__content">
                      {isRestActive
                        ? `Отдых: ${formatRestSeconds(restSecondsLeft)}`
                        : 'Перерыв 30 секунд'}
                    </span>
                  </button>
                </div>
              </article>
            )
          })}
        </div>

        <div className="muscle-load-panel">
          <h3 className="muscle-load-panel__title">Нагрузка по мышцам</h3>
          {topLoadSummary.length > 0 ? (
            <div className="muscle-load-panel__list">
              {topLoadSummary.map((item) => (
                <article key={item.muscleId} className="muscle-load-card">
                  <strong>{item.muscleName}</strong>
                  <p>Нагрузка: {item.load.toFixed(2)}</p>
                  <MetricBar
                    value={item.load}
                    max={maxLoadValue}
                    tone="cool"
                    label={`Относительная нагрузка: ${item.load.toFixed(2)}`}
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className="exercise-empty">
              <strong>Нагрузка пока не посчитана</strong>
              <p>Отмечай подходы, и приложение покажет, какие мышцы получили больше объёма.</p>
            </div>
          )}
        </div>

        <div className="recovery-panel">
          <h3 className="recovery-panel__title">Состояние восстановления мышц</h3>
          <p className="recovery-panel__text">
            Высокий показатель означает, что мышца уже восстановилась. Низкий означает, что она недавно была хорошо напряжена и
            сейчас больше нуждается в отдыхе.
          </p>
          <div className="recovery-panel__list">
            {recoveryScores.map((item) => (
              <article key={item.muscleId} className="recovery-card">
                <strong>{item.muscleName}</strong>
                <p>Готовность к нагрузке: {item.score}/100</p>
                <MetricBar
                  value={item.score}
                  tone="success"
                  label={`Восстановление: ${item.score}/100`}
                />
                <p>{getRecoveryExplanation(item.score, item.recentLoad)}</p>
                <p>Недавняя нагрузка: {item.recentLoad.toFixed(2)}</p>
                <MetricBar
                  value={item.recentLoad}
                  max={maxRecoveryLoadValue}
                  tone="danger"
                  label={`Доля недавней нагрузки: ${item.recentLoad.toFixed(2)}`}
                />
              </article>
            ))}
          </div>
        </div>

        <div className="need-score-panel">
          <h3 className="need-score-panel__title">Какие мышцы сейчас больше нуждаются в тренировке</h3>
          <p className="need-score-panel__text">
            Здесь выше оказываются мышцы, которые уже успели восстановиться и при этом недополучили недавнюю нагрузку.
          </p>
          <div className="need-score-panel__list">
            {needScores.map((item) => (
              <article key={item.muscleId} className="need-score-card">
                <strong>{item.muscleName}</strong>
                <p>Потребность в нагрузке: {item.score}/100</p>
                <p>Текущее восстановление: {item.recoveryScore}/100</p>
                <MetricBar
                  value={item.score}
                  tone="warm"
                  label={`Потребность: ${item.score}/100`}
                />
                <p>{getNeedExplanation(item.score, item.recoveryScore, item.recentLoad7d)}</p>
                <p>Нагрузка за 7 дней: {item.recentLoad7d.toFixed(2)}</p>
                <p>Последняя тренировка: {item.lastTrainedDate ? item.lastTrainedDate : 'ещё не было'}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="workout-save-panel">
          <button
            type="button"
            className="workout-save-panel__button"
            onClick={completeWorkout}
            disabled={!allExercisesCompleted}
          >
            Завершить тренировку
          </button>
          <p className="workout-save-panel__message">
            {saveMessage ||
              (allExercisesCompleted
                ? 'Все упражнения завершены. Нажми кнопку, чтобы записать тренировку в прогресс.'
                : '')}
          </p>
        </div>
      </div>
    </section>
  )
}
