import type { WorkoutHistoryEntry } from '../types/workout.ts'
import { getTodayIsoDate } from './today.ts'

export type CalendarDayStatus =
  | 'idle'
  | 'planned'
  | 'completed'
  | 'missed'
  | 'today'

export interface CalendarDay {
  isoDate: string
  dayNumber: number
  isCurrentMonth: boolean
  isTrainingDay: boolean
  status: CalendarDayStatus
}

const TRAINING_DAY_INDEXES = new Set([1, 3, 5])

function formatIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function isTrainingDay(date: Date) {
  return TRAINING_DAY_INDEXES.has(date.getDay())
}

export function getCalendarStatus(
  isoDate: string,
  trainingDay: boolean,
  history: WorkoutHistoryEntry[],
): CalendarDayStatus {
  const todayIso = getTodayIsoDate()

  if (isoDate === todayIso) {
    return 'today'
  }

  if (!trainingDay) {
    return 'idle'
  }

  const hasWorkout = history.some((entry) => entry.date === isoDate)

  if (hasWorkout) {
    return 'completed'
  }

  return isoDate < todayIso ? 'missed' : 'planned'
}

export function buildMonthCalendar(
  year: number,
  monthIndex: number,
  history: WorkoutHistoryEntry[],
): CalendarDay[] {
  const firstDay = new Date(year, monthIndex, 1)
  const lastDay = new Date(year, monthIndex + 1, 0)
  const startOffset = (firstDay.getDay() + 6) % 7
  const totalDays = lastDay.getDate()
  const days: CalendarDay[] = []

  for (let blankIndex = 0; blankIndex < startOffset; blankIndex += 1) {
    days.push({
      isoDate: `blank-${blankIndex}`,
      dayNumber: 0,
      isCurrentMonth: false,
      isTrainingDay: false,
      status: 'idle',
    })
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, monthIndex, day)
    const isoDate = formatIsoDate(date)
    const trainingDay = isTrainingDay(date)

    days.push({
      isoDate,
      dayNumber: day,
      isCurrentMonth: true,
      isTrainingDay: trainingDay,
      status: getCalendarStatus(isoDate, trainingDay, history),
    })
  }

  while (days.length % 7 !== 0) {
    const fillerIndex = days.length
    days.push({
      isoDate: `tail-${fillerIndex}`,
      dayNumber: 0,
      isCurrentMonth: false,
      isTrainingDay: false,
      status: 'idle',
    })
  }

  return days
}

export function formatCalendarDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, (month ?? 1) - 1, day ?? 1)

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatMonthTitle(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthIndex, 1))
}
