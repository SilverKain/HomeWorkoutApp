export type MusclePriority = 'low' | 'normal' | 'high'

export interface MuscleGroup {
  id: string
  name: string
  shortName: string
  priority: MusclePriority
}
