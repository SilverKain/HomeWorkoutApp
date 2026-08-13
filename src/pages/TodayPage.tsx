import { useEffect, useMemo, useState } from 'react'
import { ExerciseVisual } from '../components/ExerciseVisual.tsx'
import { MetricBar } from '../components/MetricBar.tsx'
import {
  calculateMuscleNeedScores,
  calculateRecoveryScores,
  calculateWorkoutMuscleLoad,
  generateWeeklyWorkoutPlans,
  getProgressionSuggestion,
  summarizeWorkoutMuscleLoad,
} from '../algorithms/index.ts'
import { exerciseVariantMap, exercises, muscleGroups } from '../data/index.ts'
import {
  loadPlannedWorkouts,
  removePlannedWorkoutByDate,
  savePlannedWorkouts,
} from '../services/plannedWorkouts.ts'
import {
  loadWorkoutHistory,
  saveWorkoutHistoryEntry,
} from '../services/workoutHistory.ts'
import { resolveMuscleGroups } from '../services/musclePriorities.ts'
import type {
  PlannedWorkoutEntry,
  WorkoutExerciseEntry,
  WorkoutHistoryEntry,
} from '../types/workout.ts'
import { createWorkoutDraft, createWorkoutEntry } from '../utils/workoutDraft.ts'

const TODAY_DATE = '2026-08-12'
const REST_DURATION_SECONDS = 30

function formatRestSeconds(value: number) {
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function TodayPage() {
  const resolvedMuscleGroups = useMemo(() => resolveMuscleGroups(muscleGroups), [])
  const starterExercises = useMemo(() => exercises.slice(0, 4), [])
  const [draft, setDraft] = useState(() => createWorkoutDraft(starterExercises))
  const [exerciseToAdd, setExerciseToAdd] = useState(exercises[0]?.id ?? '')
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>(() =>
    loadWorkoutHistory(),
  )
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkoutEntry[]>(
    () => loadPlannedWorkouts(),
  )
  const [saveMessage, setSaveMessage] = useState('')
  const [restExerciseId, setRestExerciseId] = useState<string | null>(null)
  const [restSecondsLeft, setRestSecondsLeft] = useState(0)

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
  const availableExercises = exercises.filter(
    (exercise) => !selectedExerciseIds.has(exercise.id),
  )
  const currentLoadMap = calculateWorkoutMuscleLoad(draft.entries, exerciseMap)
  const loadSummary = summarizeWorkoutMuscleLoad(currentLoadMap, resolvedMuscleGroups)
  const topLoadSummary = loadSummary.slice(0, 6)
  const maxLoadValue = Math.max(...topLoadSummary.map((item) => item.load), 1)
  const recoveryScores = calculateRecoveryScores(
    history,
    exerciseMap,
    resolvedMuscleGroups,
    TODAY_DATE,
    draft.entries,
  ).slice(0, 6)
  const needScores = calculateMuscleNeedScores(
    history,
    exerciseMap,
    resolvedMuscleGroups,
    TODAY_DATE,
    draft.entries,
  ).slice(0, 6)
  const currentWeekPlans = plannedWorkouts
    .filter((plan) => plan.date >= TODAY_DATE)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 3)

  const completedEntries = draft.entries.filter((entry) => entry.completed)
  const completedCount = completedEntries.length
  const completedExerciseNames = completedEntries
    .map((entry) => exerciseMap[entry.exerciseId]?.name ?? entry.exerciseId)
    .slice(0, 6)

  function updateEntry(
    exerciseId: string,
    updater: (entry: WorkoutExerciseEntry) => WorkoutExerciseEntry,
  ) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      entries: currentDraft.entries.map((entry) =>
        entry.exerciseId === exerciseId ? updater(entry) : entry,
      ),
    }))
  }

  function removeEntry(exerciseId: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      entries: currentDraft.entries.filter((entry) => entry.exerciseId !== exerciseId),
    }))

    if (restExerciseId === exerciseId) {
      setRestExerciseId(null)
      setRestSecondsLeft(0)
    }
  }

  function addExercise() {
    if (!exerciseToAdd || selectedExerciseIds.has(exerciseToAdd)) {
      return
    }

    setDraft((currentDraft) => ({
      ...currentDraft,
      entries: [...currentDraft.entries, createWorkoutEntry(exerciseToAdd)],
    }))

    const nextAvailable = availableExercises.find(
      (exercise) => exercise.id !== exerciseToAdd,
    )
    setExerciseToAdd(nextAvailable?.id ?? '')
  }

  function toggleExerciseComplete(exerciseId: string) {
    const currentEntry = draft.entries.find((entry) => entry.exerciseId === exerciseId)

    if (!currentEntry) {
      return
    }

    const nextCompleted = !currentEntry.completed

    updateEntry(exerciseId, (entry) => ({
      ...entry,
      completed: nextCompleted,
    }))

    if (nextCompleted) {
      setRestExerciseId(exerciseId)
      setRestSecondsLeft(REST_DURATION_SECONDS)
    } else if (restExerciseId === exerciseId) {
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

  function generateWeeklyPlan() {
    const nextPlans = generateWeeklyWorkoutPlans(
      exercises,
      resolvedMuscleGroups,
      history,
      TODAY_DATE,
    )

    savePlannedWorkouts(nextPlans)
    setPlannedWorkouts(loadPlannedWorkouts())
    setSaveMessage(
      `Сгенерирован недельный план. Дат: ${nextPlans.length}. Ближайшая тренировка: ${nextPlans[0]?.date ?? 'нет'}.`,
    )
  }

  function saveWorkout() {
    if (draft.entries.length === 0) {
      setSaveMessage('Нечего сохранять: добавь хотя бы одно упражнение.')
      return
    }

    const savedEntry = saveWorkoutHistoryEntry({
      date: TODAY_DATE,
      title: draft.title,
      entries: draft.entries,
    })

    const nextHistory = [savedEntry, ...history]
    const recalculatedPlans = generateWeeklyWorkoutPlans(
      exercises,
      resolvedMuscleGroups,
      nextHistory,
      TODAY_DATE,
    )

    removePlannedWorkoutByDate(TODAY_DATE)
    savePlannedWorkouts(recalculatedPlans)
    setHistory(nextHistory)
    setPlannedWorkouts(loadPlannedWorkouts())
    setSaveMessage(
      recalculatedPlans.length > 0
        ? `Тренировка за ${TODAY_DATE} сохранена. План на ${recalculatedPlans[0].date} пересчитан по реальным результатам.`
        : `Тренировка за ${TODAY_DATE} сохранена. Будущих тренировок на эту неделю уже не осталось.`,
    )
  }

  return (
    <section className="page-card">
      <div className="page-card__header">
        <h2 className="page-card__title">Сегодня</h2>
        <p className="page-card__text">
          Здесь можно собрать тренировку, отмечать выполнение упражнений и
          запускать 30-секундный отдых между подходами.
        </p>
      </div>

      <div className="page-card__grid">
        <article className="info-tile">
          <strong>Тренировка</strong>
          <p>{draft.title}</p>
        </article>
        <article className="info-tile">
          <strong>Дата</strong>
          <p>{TODAY_DATE}</p>
        </article>
        <article className="info-tile">
          <strong>Выполнено</strong>
          <p>
            {completedCount} из {draft.entries.length} упражнений отмечены как
            завершённые.
          </p>
        </article>
        <article className="info-tile">
          <strong>План недели</strong>
          <p>
            {currentWeekPlans.length > 0
              ? `Запланировано тренировок: ${currentWeekPlans.length}`
              : 'Пока не сгенерирован'}
          </p>
        </article>
      </div>

      <div className="workout-session-summary">
        <div className="workout-session-summary__content">
          <strong>Статус выполнения</strong>
          <p>
            {completedExerciseNames.length > 0
              ? `Готово: ${completedExerciseNames.join(', ')}`
              : 'Пока ни одно упражнение не отмечено как выполненное.'}
          </p>
        </div>
        <div className="workout-session-summary__rest">
          <strong>Перерыв</strong>
          <p>
            {restExerciseId
              ? `${exerciseMap[restExerciseId]?.name ?? 'Упражнение'}: ${formatRestSeconds(restSecondsLeft)}`
              : 'Таймер отдыха не запущен'}
          </p>
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

            const progressionSuggestion = getProgressionSuggestion(
              exercise,
              history,
              entry,
              exerciseMap,
            )
            const currentVariant = exerciseVariantMap[exercise.id]
            const isRestActive = restExerciseId === entry.exerciseId && restSecondsLeft > 0

            return (
              <article
                key={entry.exerciseId}
                className={`workout-entry-card${
                  entry.completed ? ' workout-entry-card--completed' : ''
                }`}
              >
                <div className="workout-entry-card__hero">
                  <ExerciseVisual exercise={exercise} compact />

                  <div className="workout-entry-card__header">
                    <div>
                      <div className="workout-entry-card__title-row">
                        <strong>
                          {index + 1}. {exercise.name}
                        </strong>
                        <span
                          className={`workout-entry-card__badge${
                            entry.completed
                              ? ' workout-entry-card__badge--completed'
                              : ''
                          }`}
                        >
                          {entry.completed ? 'Выполнено' : 'В процессе'}
                        </span>
                      </div>
                      <p>{exercise.equipment}</p>
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

                <div className="workout-entry-card__stats">
                  <div className="workout-entry-card__stat">
                    <strong>Текущая цель</strong>
                    <p>
                      {entry.sets} x {entry.reps}, RIR {entry.rir}
                    </p>
                  </div>
                  <div className="workout-entry-card__stat">
                    <strong>Тип движения</strong>
                    <p>{exercise.movementType}</p>
                  </div>
                </div>

                <div className="workout-entry-card__fields">
                  <label className="workout-number-field">
                    <span>Подходы</span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={entry.sets}
                      onChange={(event) =>
                        updateEntry(entry.exerciseId, (current) => ({
                          ...current,
                          sets: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                    />
                  </label>

                  <label className="workout-number-field">
                    <span>Повторения</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={entry.reps}
                      onChange={(event) =>
                        updateEntry(entry.exerciseId, (current) => ({
                          ...current,
                          reps: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                    />
                  </label>

                  <label className="workout-number-field">
                    <span>RIR</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={entry.rir}
                      onChange={(event) =>
                        updateEntry(entry.exerciseId, (current) => ({
                          ...current,
                          rir: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="workout-entry-card__actions">
                  <button
                    type="button"
                    className={`workout-entry-card__complete-button${
                      entry.completed
                        ? ' workout-entry-card__complete-button--completed'
                        : ''
                    }`}
                    onClick={() => toggleExerciseComplete(entry.exerciseId)}
                  >
                    {entry.completed ? 'Снять выполнение' : 'Отметить выполненным'}
                  </button>

                  <button
                    type="button"
                    className="workout-rest-button"
                    onClick={() => startRestTimer(entry.exerciseId)}
                  >
                    Перерыв 30 секунд
                  </button>
                </div>

                <div className="workout-rest-panel">
                  <strong>
                    {isRestActive
                      ? `Отдых идёт: ${formatRestSeconds(restSecondsLeft)}`
                      : 'Готово к следующему подходу'}
                  </strong>
                  <p>
                    {isRestActive
                      ? 'Таймер запущен для текущего упражнения.'
                      : 'После подхода можно запустить отдых одной кнопкой.'}
                  </p>
                </div>

                <div className="progression-hint">
                  <strong>{progressionSuggestion.label}</strong>
                  <p>{progressionSuggestion.description}</p>
                  <p>
                    Цель без увеличения веса: {progressionSuggestion.targetSets} x{' '}
                    {progressionSuggestion.targetReps}, RIR{' '}
                    {progressionSuggestion.targetRir}
                  </p>
                  {currentVariant ? (
                    <p>
                      Цепочка сложности: {currentVariant.label} • шаг{' '}
                      {currentVariant.level}
                      {currentVariant.nextExerciseId
                        ? ' • следующий вариант откроется после достаточного прогресса'
                        : ' • это верхний вариант цепочки'}
                    </p>
                  ) : null}
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
              <p>
                Отметь упражнения как выполненные, и приложение покажет, какие
                мышцы получили больше всего объёма.
              </p>
            </div>
          )}
        </div>

        <div className="recovery-panel">
          <h3 className="recovery-panel__title">Recovery Score 0-100</h3>
          <p className="recovery-panel__text">
            Это внутренняя оценка приложения, а не медицинский показатель: после
            нагрузки значение снижается, а со временем восстанавливается.
          </p>
          <div className="recovery-panel__list">
            {recoveryScores.map((item) => (
              <article key={item.muscleId} className="recovery-card">
                <strong>{item.muscleName}</strong>
                <p>Recovery Score: {item.score}</p>
                <MetricBar
                  value={item.score}
                  tone="success"
                  label={`Восстановление: ${item.score}/100`}
                />
                <p>Недавняя нагрузка: {item.recentLoad.toFixed(2)}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="need-score-panel">
          <h3 className="need-score-panel__title">Muscle Need Score</h3>
          <p className="need-score-panel__text">
            Показатель показывает, насколько сильно мышце нужна следующая
            тренировка с учётом недавней нагрузки, восстановления и приоритета.
          </p>
          <div className="need-score-panel__list">
            {needScores.map((item) => (
              <article key={item.muscleId} className="need-score-card">
                <strong>{item.muscleName}</strong>
                <p>Need Score: {item.score}</p>
                <p>Recovery Score: {item.recoveryScore}</p>
                <MetricBar
                  value={item.score}
                  tone="warm"
                  label={`Потребность: ${item.score}/100`}
                />
                <p>Нагрузка за 7 дней: {item.recentLoad7d.toFixed(2)}</p>
                <p>
                  Последняя тренировка:{' '}
                  {item.lastTrainedDate ? item.lastTrainedDate : 'ещё не было'}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="generator-panel">
          <h3 className="generator-panel__title">Недельный генератор</h3>
          <button
            type="button"
            className="generator-panel__button"
            onClick={generateWeeklyPlan}
          >
            Сгенерировать неделю Пн / Ср / Пт
          </button>
          {currentWeekPlans.length > 0 ? (
            <div className="generator-week-list">
              {currentWeekPlans.map((plan) => (
                <article key={plan.id} className="generator-plan-card">
                  <strong>{plan.title}</strong>
                  <p>Дата: {plan.date}</p>
                  <p>Упражнений: {plan.entries.length}</p>
                  {plan.entries.slice(0, 2).map((plannedEntry, index) => {
                    const exercise = exerciseMap[plannedEntry.exerciseId]

                    return (
                      <p key={`${plan.id}-${plannedEntry.exerciseId}-${index}`}>
                        {exercise?.name ?? plannedEntry.exerciseId}:{' '}
                        {plannedEntry.progressionHint ?? 'без подсказки'}
                      </p>
                    )
                  })}
                </article>
              ))}
            </div>
          ) : null}
        </div>

        <div className="workout-save-panel">
          <button
            type="button"
            className="workout-save-panel__button"
            onClick={saveWorkout}
          >
            Сохранить тренировку
          </button>
          <p className="workout-save-panel__message">{saveMessage}</p>
        </div>

        <div className="workout-history">
          <h3 className="workout-history__title">Последние сохранённые тренировки</h3>
          {history.length > 0 ? (
            <div className="workout-history__list">
              {history.slice(0, 5).map((entry) => (
                <article key={entry.id} className="workout-history-card">
                  <strong>{entry.title}</strong>
                  <p>Дата: {entry.date}</p>
                  <p>Упражнений: {entry.entries.length}</p>
                  <p>
                    Выполнено: {entry.entries.filter((item) => item.completed).length} из{' '}
                    {entry.entries.length}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="exercise-empty">
              <strong>История пока пуста</strong>
              <p>
                После сохранения тренировки она останется доступной и после
                перезапуска приложения.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
