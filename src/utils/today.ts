function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

export function getTodayDate() {
  return new Date()
}

export function getTodayIsoDate() {
  const today = getTodayDate()
  const year = today.getFullYear()
  const month = padDatePart(today.getMonth() + 1)
  const day = padDatePart(today.getDate())

  return `${year}-${month}-${day}`
}

export function getTodayDateLabel() {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(getTodayDate())
}
