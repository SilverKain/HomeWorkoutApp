import type { MuscleGroup } from './muscles.ts'

export type EquipmentType =
  | 'Собственный вес'
  | '2 гантели по 1 кг'
  | '1 гантель 1 кг'

export type MovementType =
  | 'Жим'
  | 'Тяга'
  | 'Приседание'
  | 'Выпад'
  | 'Наклон'
  | 'Подъём'
  | 'Сгибание'
  | 'Разгибание'
  | 'Удержание'
  | 'Скручивание'
  | 'Разведение'
  | 'Сведение'
  | 'Мост'

export type MuscleLoadMap = Partial<Record<MuscleGroup['id'], number>>

export interface Exercise {
  id: string
  name: string
  description: string
  imageSrc?: string
  equipment: EquipmentType
  movementType: MovementType
  muscles: MuscleLoadMap
  fatigueLevel: number
  baseEffectiveness: number
}
