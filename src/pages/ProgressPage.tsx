import { useState } from 'react'
import { ExerciseVisual } from '../components/ExerciseVisual.tsx'
import { exercises } from '../data/index.ts'
import { loadWorkoutHistory } from '../services/workoutHistory.ts'
import { getEffortSummary } from '../utils/effort.ts'

function formatWorkoutDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`)

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatWorkoutTitle(title: string, isoDate: string) {
  const generatedPrefix = `Сгенерированная тренировка на ${isoDate}`

  if (title === generatedPrefix) {
    return 'Тренировка'
  }

  return title.replace(/^Сгенерированная тренировка на\s+/u, '')
}

export function ProgressPage() {
  const exerciseMap = Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise]))
  const history = [...loadWorkoutHistory()]
    .filter((workout) => workout.entries.some((entry) => entry.completed))
    .sort((left, right) => right.date.localeCompare(left.date))
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  const completedExerciseCount = history.reduce(
    (total, workout) => total + workout.entries.filter((entry) => entry.completed).length,
    0,
  )
  const uniqueExerciseCount = new Set(
    history.flatMap((workout) =>
      workout.entries.filter((entry) => entry.completed).map((entry) => entry.exerciseId),
    ),
  ).size

  function toggleDate(date: string) {
    setExpandedDate((current) => (current === date ? null : date))
  }

  return (
    <section className="page-card progress-page">
      <div className="page-card__header">
        <h2 className="page-card__title">Прогресс</h2>
        <p className="page-card__text">
          Здесь история теперь собрана по датам: список закрыт по умолчанию, а по нажатию можно
          раскрыть тренировку и посмотреть, какие упражнения были выполнены в этот день.
        </p>
      </div>

      <div className="progress-summary">
        <article className="progress-summary-card">
          <strong>Тренировок в истории</strong>
          <p>{history.length}</p>
        </article>
        <article className="progress-summary-card">
          <strong>Выполненных упражнений</strong>
          <p>{completedExerciseCount}</p>
        </article>
        <article className="progress-summary-card">
          <strong>Уникальных упражнений</strong>
          <p>{uniqueExerciseCount}</p>
        </article>
      </div>

      <div className="progress-date-list">
        {history.length > 0 ? (
          history.map((workout) => {
            const completedEntries = workout.entries.filter((entry) => entry.completed)
            const isExpanded = expandedDate === workout.date

            return (
              <article key={workout.id} className="progress-date-card">
                <button
                  type="button"
                  className={`progress-date-card__toggle${
                    isExpanded ? ' progress-date-card__toggle--open' : ''
                  }`}
                  onClick={() => toggleDate(workout.date)}
                  aria-expanded={isExpanded}
                >
                  <div className="progress-date-card__heading">
                    <strong>{formatWorkoutDate(workout.date)}</strong>
                    <p>
                      {formatWorkoutTitle(workout.title, workout.date)} • упражнений выполнено: {completedEntries.length}
                    </p>
                  </div>
                  <span className="progress-date-card__chevron" aria-hidden="true">
                    {isExpanded ? '−' : '+'}
                  </span>
                </button>

                {isExpanded ? (
                  <div className="progress-date-card__content">
                    {completedEntries.map((entry, index) => {
                      const exercise = exerciseMap[entry.exerciseId]

                      return (
                        <article
                          key={`${workout.id}-${entry.exerciseId}-${index}`}
                          className="progress-date-exercise"
                        >
                          {exercise ? (
                            <ExerciseVisual exercise={exercise} size="compact" showOverlay={false} />
                          ) : null}
                          <div className="progress-date-exercise__content">
                            <strong>{exercise?.name ?? entry.exerciseId}</strong>
                            <p>
                              Схема: {entry.sets}x{entry.reps}
                            </p>
                            <p>Усилие: {getEffortSummary(entry)}</p>
                            <p>
                              Завершено подходов: {entry.completedSets ?? (entry.completed ? entry.sets : 0)} из{' '}
                              {entry.sets}
                            </p>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ) : null}
              </article>
            )
          })
        ) : (
          <article className="progress-date-card progress-date-card--empty">
            <strong>История пока пуста</strong>
            <p>После сохранённых тренировок здесь появится список дат с раскрытием упражнений.</p>
          </article>
        )}
      </div>
    </section>
  )
}
