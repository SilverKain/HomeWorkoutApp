import type { Exercise } from '../types/exercise.ts'

interface ExerciseVisualProps {
  exercise: Exercise
  compact?: boolean
  size?: 'default' | 'compact' | 'large'
  showOverlay?: boolean
}

const movementShortLabels: Record<Exercise['movementType'], string> = {
  Жим: 'Жим',
  Тяга: 'Тяга',
  Приседание: 'Ноги',
  Выпад: 'Выпад',
  Наклон: 'Тяга',
  Подъём: 'Подъём',
  Сгибание: 'Бицепс',
  Разгибание: 'Трицепс',
  Удержание: 'Статика',
  Скручивание: 'Кор',
  Разведение: 'Плечи',
  Сведение: 'Грудь',
  Мост: 'Ягодицы',
}

export function ExerciseVisual({
  exercise,
  compact = false,
  size = compact ? 'compact' : 'default',
  showOverlay = true,
}: ExerciseVisualProps) {
  const movementLabel = movementShortLabels[exercise.movementType] ?? exercise.movementType

  return (
    <div
      className={`exercise-visual${
        size === 'compact' ? ' exercise-visual--compact' : ''
      }${size === 'large' ? ' exercise-visual--large' : ''}`}
    >
      {exercise.imageSrc ? (
        <img
          className="exercise-visual__image"
          src={exercise.imageSrc}
          alt={exercise.name}
          loading="lazy"
        />
      ) : (
        <div className="exercise-visual__placeholder" aria-hidden="true">
          <div className="exercise-visual__shape exercise-visual__shape--primary" />
          <div className="exercise-visual__shape exercise-visual__shape--secondary" />
          <div className="exercise-visual__center">
            <span className="exercise-visual__kicker">Место под фото</span>
            <strong>{movementLabel}</strong>
          </div>
        </div>
      )}

      {showOverlay ? (
        <div className="exercise-visual__overlay">
          <span className="exercise-visual__badge">{exercise.movementType}</span>
          <span className="exercise-visual__badge exercise-visual__badge--subtle">
            {exercise.equipment}
          </span>
        </div>
      ) : null}
    </div>
  )
}
