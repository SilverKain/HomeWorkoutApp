import { useEffect, useMemo, useState } from 'react'
import { ExerciseVisual } from '../components/ExerciseVisual.tsx'
import { exercises } from '../data/index.ts'
import {
  PLANNED_WORKOUTS_UPDATED_EVENT,
  loadPlannedWorkouts,
  removePlannedWorkoutExercise,
} from '../services/plannedWorkouts.ts'
import {
  loadWorkoutHistory,
  removeWorkoutHistoryExercise,
} from '../services/workoutHistory.ts'
import {
  buildMonthCalendar,
  formatCalendarDate,
  formatMonthTitle,
} from '../utils/calendar.ts'
import { getTodayDate, getTodayDateLabel, getTodayIsoDate } from '../utils/today.ts'

const TODAY_ISO = getTodayIsoDate()
const TODAY_DATE = getTodayDate()
const TODAY_LABEL = getTodayDateLabel()
const weekDayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const statusLabels = {
  planned: 'Запланировано',
  completed: 'Выполнено',
  missed: 'Пропущено',
  today: 'Сегодня',
}

const statusSymbols = {
  planned: '○',
  completed: '✓',
  missed: '×',
  today: '●',
} as const

interface CalendarPageProps {
  selectedDate?: string
}

function getMonthStateFromIsoDate(isoDate?: string) {
  if (!isoDate) {
    return {
      year: TODAY_DATE.getFullYear(),
      monthIndex: TODAY_DATE.getMonth(),
    }
  }

  const [year, month] = isoDate.split('-').map(Number)

  return {
    year: year || TODAY_DATE.getFullYear(),
    monthIndex: (month || TODAY_DATE.getMonth() + 1) - 1,
  }
}

function shiftMonth(year: number, monthIndex: number, direction: -1 | 1) {
  const nextDate = new Date(year, monthIndex + direction, 1)

  return {
    year: nextDate.getFullYear(),
    monthIndex: nextDate.getMonth(),
  }
}

export function CalendarPage({ selectedDate: controlledSelectedDate }: CalendarPageProps) {
  const [history, setHistory] = useState(() => loadWorkoutHistory())
  const [plannedWorkouts, setPlannedWorkouts] = useState(() => loadPlannedWorkouts())
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getMonthStateFromIsoDate(controlledSelectedDate),
  )

  const days = useMemo(
    () => buildMonthCalendar(visibleMonth.year, visibleMonth.monthIndex, history),
    [history, visibleMonth.monthIndex, visibleMonth.year],
  )

  const initialSelectedDay =
    days.find((day) => day.isoDate === controlledSelectedDate) ??
    days.find((day) => day.isoDate === TODAY_ISO) ??
    days.find((day) => day.isCurrentMonth && day.isTrainingDay) ??
    days.find((day) => day.isCurrentMonth)

  const [selectedDate, setSelectedDate] = useState(initialSelectedDay?.isoDate ?? TODAY_ISO)

  useEffect(() => {
    if (controlledSelectedDate) {
      setSelectedDate(controlledSelectedDate)
      setVisibleMonth(getMonthStateFromIsoDate(controlledSelectedDate))
    }
  }, [controlledSelectedDate])

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

  useEffect(() => {
    const hasSelectedDayInVisibleMonth = days.some((day) => day.isoDate === selectedDate)

    if (!hasSelectedDayInVisibleMonth) {
      const firstSelectableDay =
        days.find((day) => day.isoDate === TODAY_ISO) ??
        days.find((day) => day.isCurrentMonth && day.isTrainingDay) ??
        days.find((day) => day.isCurrentMonth)

      if (firstSelectableDay) {
        setSelectedDate(firstSelectableDay.isoDate)
      }
    }
  }, [days, selectedDate])

  const trainingDays = days.filter((day) => day.isCurrentMonth && day.isTrainingDay)
  const completedDays = trainingDays.filter((day) => day.status === 'completed')
  const missedDays = trainingDays.filter((day) => day.status === 'missed')
  const plannedDays = trainingDays.filter(
    (day) => day.status === 'planned' || day.status === 'today',
  )
  const selectedDay = days.find((day) => day.isoDate === selectedDate)
  const selectedHistoryEntry = history.find((entry) => entry.date === selectedDate)
  const selectedPlannedEntry = plannedWorkouts.find((entry) => entry.date === selectedDate)
  const selectedStatusText =
    selectedDay && selectedDay.status !== 'idle'
      ? statusLabels[selectedDay.status]
      : 'Нет тренировки'

  function goToPreviousMonth() {
    setVisibleMonth((current) => shiftMonth(current.year, current.monthIndex, -1))
  }

  function goToNextMonth() {
    setVisibleMonth((current) => shiftMonth(current.year, current.monthIndex, 1))
  }

  function handleRemovePlannedExercise(exerciseId: string) {
    const nextEntries = removePlannedWorkoutExercise(selectedDate, exerciseId)
    setPlannedWorkouts(nextEntries)
  }

  function handleRemoveHistoryExercise(exerciseId: string) {
    const nextHistory = removeWorkoutHistoryExercise(selectedDate, exerciseId)
    setHistory(nextHistory)
  }

  return (
    <section className="page-card">
      <div className="page-card__header">
        <h2 className="page-card__title">Календарь</h2>
        <p className="page-card__text">
          Просматривай тренировки по месяцам и быстро открывай детали по каждой дате.
        </p>
      </div>

      <div className="calendar-month-bar">
        <button
          type="button"
          className="calendar-month-bar__button"
          onClick={goToPreviousMonth}
        >
          ← Назад
        </button>
        <div className="calendar-month-bar__title">
          <strong>{formatMonthTitle(visibleMonth.year, visibleMonth.monthIndex)}</strong>
          <p>Сегодня: {TODAY_LABEL}</p>
        </div>
        <button
          type="button"
          className="calendar-month-bar__button"
          onClick={goToNextMonth}
        >
          Вперёд →
        </button>
      </div>

      <div className="page-card__grid">
        <article className="info-tile">
          <strong>Тренировочные дни</strong>
          <p>В месяце отмечено {trainingDays.length} тренировочных дат.</p>
        </article>
        <article className="info-tile">
          <strong>Выполнено</strong>
          <p>{completedDays.length} тренировочных дней уже сохранены в истории.</p>
        </article>
        <article className="info-tile">
          <strong>Пропущено</strong>
          <p>{missedDays.length} прошлых тренировочных дней пока без записи.</p>
        </article>
        <article className="info-tile">
          <strong>Запланировано</strong>
          <p>{plannedDays.length} будущих тренировочных дней ещё впереди.</p>
        </article>
      </div>

      <div className="calendar-legend" aria-label="Легенда календаря">
        <span className="calendar-legend__item calendar-legend__item--today">● Сегодня</span>
        <span className="calendar-legend__item calendar-legend__item--completed">
          ✓ Выполнено
        </span>
        <span className="calendar-legend__item calendar-legend__item--planned">
          ○ Запланировано
        </span>
        <span className="calendar-legend__item calendar-legend__item--missed">
          × Пропущено
        </span>
        <span className="calendar-legend__item">– Выходной</span>
      </div>

      <div
        className="calendar-grid"
        aria-label={`Календарь на ${formatMonthTitle(visibleMonth.year, visibleMonth.monthIndex)}`}
      >
        {weekDayLabels.map((label) => (
          <div key={label} className="calendar-grid__weekday">
            {label}
          </div>
        ))}

        {days.map((day) => {
          if (!day.isCurrentMonth) {
            return <div key={day.isoDate} className="calendar-day calendar-day--empty" />
          }

          const statusText =
            day.status === 'idle' ? 'Нет тренировки' : statusLabels[day.status]

          return (
            <button
              key={day.isoDate}
              type="button"
              className={`calendar-day calendar-day--${day.status}${
                day.isTrainingDay ? ' calendar-day--training' : ''
              }${day.isoDate === selectedDate ? ' calendar-day--selected' : ''}`}
              onClick={() => setSelectedDate(day.isoDate)}
              aria-label={`${formatCalendarDate(day.isoDate)}. ${statusText}`}
              aria-pressed={day.isoDate === selectedDate}
            >
              <div className="calendar-day__top">
                <strong>{day.dayNumber}</strong>
                <span
                  className={`calendar-day__badge${
                    day.isTrainingDay ? '' : ' calendar-day__badge--rest'
                  }`}
                >
                  {day.isTrainingDay && day.status !== 'idle' ? statusSymbols[day.status] : '–'}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="calendar-details">
        <h3 className="calendar-details__title">Детали выбранной даты</h3>

        {selectedDay?.isCurrentMonth ? (
          <article className="calendar-details-card">
            <strong>{formatCalendarDate(selectedDate)}</strong>
            <p>Статус: {selectedStatusText}.</p>
            <p>
              Тип дня:{' '}
              {selectedDay.isTrainingDay
                ? 'тренировочный день'
                : 'обычный день без тренировки'}
              .
            </p>

            {selectedHistoryEntry ? (
              <div className="calendar-details-list">
                {selectedHistoryEntry.entries.map((entry, index) => {
                  const exercise = exercises.find((item) => item.id === entry.exerciseId)

                  return (
                    <article
                      key={`${selectedHistoryEntry.id}-${entry.exerciseId}-${index}`}
                      className="calendar-details-exercise"
                    >
                      {exercise ? (
                        <ExerciseVisual exercise={exercise} size="compact" showOverlay={false} />
                      ) : null}
                      <div className="calendar-details-exercise__content">
                        <strong>{exercise?.name ?? entry.exerciseId}</strong>
                        <p>Подходы: {entry.sets}</p>
                        <p>Повторения: {entry.reps}</p>
                        <p>Статус: {entry.completed ? 'выполнено' : 'не выполнено'}</p>
                        <button
                          type="button"
                          className="workout-entry-card__remove"
                          onClick={() => handleRemoveHistoryExercise(entry.exerciseId)}
                        >
                          Убрать упражнение
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : selectedPlannedEntry ? (
              <div className="calendar-details-list">
                {selectedPlannedEntry.entries.map((entry, index) => {
                  const exercise = exercises.find((item) => item.id === entry.exerciseId)

                  return (
                    <article
                      key={`${selectedPlannedEntry.id}-${entry.exerciseId}-${index}`}
                      className="calendar-details-exercise"
                    >
                      {exercise ? (
                        <ExerciseVisual exercise={exercise} size="compact" showOverlay={false} />
                      ) : null}
                      <div className="calendar-details-exercise__content">
                        <strong>{exercise?.name ?? entry.exerciseId}</strong>
                        <p>Подходы: {entry.sets}</p>
                        <p>Повторения: {entry.reps}</p>
                        <p>Статус: запланировано</p>
                        <button
                          type="button"
                          className="workout-entry-card__remove"
                          onClick={() => handleRemovePlannedExercise(entry.exerciseId)}
                        >
                          Убрать упражнение
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : selectedDay.isTrainingDay ? (
              <div className="exercise-empty">
                <strong>Тренировка пока не сохранена</strong>
                <p>
                  После сохранения тренировки здесь появятся упражнения, подходы, повторения и
                  статус выполнения.
                </p>
              </div>
            ) : (
              <div className="exercise-empty">
                <strong>Нет упражнений на эту дату</strong>
                <p>Для обычного дня без тренировки детали упражнений не показываются.</p>
              </div>
            )}
          </article>
        ) : (
          <div className="exercise-empty">
            <strong>Дата не выбрана</strong>
            <p>Нажми на день календаря, чтобы увидеть детали.</p>
          </div>
        )}
      </div>
    </section>
  )
}
