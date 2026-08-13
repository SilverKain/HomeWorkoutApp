import type { MuscleGroup } from '../types/muscles.ts'

export const muscleGroups: MuscleGroup[] = [
  { id: 'chest', name: 'Грудь', shortName: 'Грудь', priority: 'normal' },
  {
    id: 'lats',
    name: 'Широчайшие',
    shortName: 'Широч.',
    priority: 'normal',
  },
  {
    id: 'upper-back',
    name: 'Верх спины',
    shortName: 'Спина',
    priority: 'normal',
  },
  {
    id: 'front-delts',
    name: 'Передняя дельта',
    shortName: 'Перед. дельта',
    priority: 'normal',
  },
  {
    id: 'side-delts',
    name: 'Средняя дельта',
    shortName: 'Сред. дельта',
    priority: 'normal',
  },
  {
    id: 'rear-delts',
    name: 'Задняя дельта',
    shortName: 'Зад. дельта',
    priority: 'normal',
  },
  { id: 'biceps', name: 'Бицепс', shortName: 'Бицепс', priority: 'normal' },
  { id: 'triceps', name: 'Трицепс', shortName: 'Трицепс', priority: 'normal' },
  {
    id: 'forearms',
    name: 'Предплечья',
    shortName: 'Предплечья',
    priority: 'normal',
  },
  { id: 'abs', name: 'Пресс', shortName: 'Пресс', priority: 'normal' },
  {
    id: 'quadriceps',
    name: 'Квадрицепс',
    shortName: 'Квадрицепс',
    priority: 'normal',
  },
  {
    id: 'hamstrings',
    name: 'Задняя поверхность бедра',
    shortName: 'Бедро сзади',
    priority: 'normal',
  },
  { id: 'glutes', name: 'Ягодицы', shortName: 'Ягодицы', priority: 'normal' },
  { id: 'calves', name: 'Икры', shortName: 'Икры', priority: 'normal' },
  {
    id: 'lower-back',
    name: 'Поясница',
    shortName: 'Поясница',
    priority: 'normal',
  },
]
