import { calculateEffectivenessScores } from '../algorithms/index.ts'
import { exercises, muscleGroups } from '../data/index.ts'
import { resolveMuscleGroups } from '../services/musclePriorities.ts'
import { loadWorkoutHistory } from '../services/workoutHistory.ts'
import { getEffortSummary } from '../utils/effort.ts'
import { getTodayIsoDate } from '../utils/today.ts'

const TODAY_DATE = getTodayIsoDate()

interface ExerciseHistoryPoint {
  date: string
  reps: number
  sets: number
  effortSummary: string
}

function buildExerciseHistoryMap() {
  const history = loadWorkoutHistory()
  const map = new Map<string, ExerciseHistoryPoint[]>()

  for (const workout of [...history].sort((left, right) => left.date.localeCompare(right.date))) {
    for (const entry of workout.entries) {
      if (!entry.completed) {
        continue
      }

      const current = map.get(entry.exerciseId) ?? []
      current.push({
        date: workout.date,
        reps: entry.reps,
        sets: entry.sets,
        effortSummary: getEffortSummary(entry),
      })
      map.set(entry.exerciseId, current)
    }
  }

  return { history, map }
}

export function ProgressPage() {
  const resolvedMuscleGroups = resolveMuscleGroups(muscleGroups)
  const { history, map: exerciseHistoryMap } = buildExerciseHistoryMap()
  const effectivenessItems = calculateEffectivenessScores(
    history,
    exercises,
    resolvedMuscleGroups,
    TODAY_DATE,
  )
  const exerciseItemsWithHistory = effectivenessItems.filter((item) => item.usageCount > 0)
  const activeHistoryCount = history.filter((workout) =>
    workout.entries.some((entry) => entry.completed),
  ).length
  const goodProgressCount = effectivenessItems.filter((item) => item.goodProgress).length

  return (
    <section className="page-card progress-page">
      <div className="page-card__header">
        <h2 className="page-card__title">Прогресс</h2>
        <p className="page-card__text">
          Здесь видно историю выполнений, лучший результат, последнее выполнение и текущую
          оценку полезности упражнения.
        </p>
      </div>

      <div className="progress-summary">
        <article className="progress-summary-card">
          <strong>Тренировок в истории</strong>
          <p>{activeHistoryCount}</p>
        </article>
        <article className="progress-summary-card">
          <strong>Упражнений с историей</strong>
          <p>{exerciseItemsWithHistory.length}</p>
        </article>
        <article className="progress-summary-card">
          <strong>С хорошим прогрессом</strong>
          <p>{goodProgressCount}</p>
        </article>
      </div>

      <div className="progress-score-list">
        {exerciseItemsWithHistory.map((item) => {
          const exerciseHistory = exerciseHistoryMap.get(item.exerciseId) ?? []
          const bestPoint = [...exerciseHistory].sort((left, right) => {
            if (right.reps !== left.reps) {
              return right.reps - left.reps
            }

            return right.sets - left.sets
          })[0]
          const lastPoint = exerciseHistory.at(-1)
          const historyLine = exerciseHistory.map((point) => point.reps).join(', ')

          return (
            <article key={item.exerciseId} className="progress-score-card">
              <div className="progress-score-card__header">
                <div>
                  <strong>{item.exerciseName}</strong>
                  <p>
                    Использований: {item.usageCount}
                    {item.lastUsedDate
                      ? ` • Последний раз: ${item.lastUsedDate}`
                      : ' • Пока не выполнялось'}
                  </p>
                </div>
                <div className="progress-score-card__badges">
                  {item.goodProgress ? (
                    <span className="progress-score-card__status">Хороший прогресс</span>
                  ) : null}
                  <span className="progress-score-card__badge">{item.score}/100</span>
                </div>
              </div>

              <div className="progress-history-panel">
                <p>
                  <strong>История:</strong> {historyLine || 'пока нет выполнений'}
                </p>
                <p>
                  <strong>Лучший результат:</strong>{' '}
                  {bestPoint
                    ? `${bestPoint.reps} повторений • ${bestPoint.sets} подхода • ${bestPoint.date}`
                    : 'ещё не зафиксирован'}
                </p>
                <p>
                  <strong>Последнее выполнение:</strong>{' '}
                  {lastPoint
                    ? `${lastPoint.reps} повторений • ${lastPoint.sets} подхода • усилие ${lastPoint.effortSummary} • ${lastPoint.date}`
                    : 'ещё не было'}
                </p>
              </div>

              <div className="progress-score-card__metrics">
                <p>Прогресс: {item.progressScore}</p>
                <p>Качество подходов: {item.qualityScore}</p>
                <p>Оценка усилия: {item.rirScore}</p>
                <p>Частота: {item.frequencyScore}</p>
                <p>Потребность мышц: {item.muscleNeedScore}</p>
                <p>Штраф за застой: {item.plateauPenalty}</p>
                <p>Штраф за частое повторение без прогресса: {item.overusePenalty}</p>
                <p>Штраф за утомление: {item.fatiguePenalty}</p>
                <p>
                  Серия прогресса:{' '}
                  {item.goodProgress
                    ? `${item.goodProgressStreak} выполнения, +${item.progressGain} повторений`
                    : 'пока не подтверждена'}
                </p>
              </div>

              <div className="progress-score-card__reasons">
                {item.reasons.map((reason) => (
                  <span
                    key={`${item.exerciseId}-${reason}`}
                    className="progress-score-card__reason"
                  >
                    {reason}
                  </span>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
