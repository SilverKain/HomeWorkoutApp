export type NavigationId =
  | 'home'
  | 'today'
  | 'calendar'
  | 'exercises'
  | 'progress'
  | 'settings'

export interface NavigationItem {
  id: NavigationId
  label: string
  shortLabel: string
  description: string
}

export const navigationItems: NavigationItem[] = [
  {
    id: 'home',
    label: 'Главная',
    shortLabel: 'Главная',
    description: 'Обзор состояния тренировок и быстрый вход в программу.',
  },
  {
    id: 'today',
    label: 'Сегодня',
    shortLabel: 'Сегодня',
    description: 'Текущая тренировка и действия на сегодня.',
  },
  {
    id: 'calendar',
    label: 'Календарь',
    shortLabel: 'Календарь',
    description: 'План и история тренировочных дней.',
  },
  {
    id: 'exercises',
    label: 'Упражнения',
    shortLabel: 'Упражн.',
    description: 'Каталог доступных домашних упражнений.',
  },
  {
    id: 'progress',
    label: 'Прогресс',
    shortLabel: 'Прогресс',
    description: 'История результатов и динамика выполнения.',
  },
  {
    id: 'settings',
    label: 'Настройки',
    shortLabel: 'Ещё',
    description: 'Параметры приложения и пользовательские предпочтения.',
  },
]
