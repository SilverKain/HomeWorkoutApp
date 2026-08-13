import { useDeferredValue, useMemo, useState } from 'react'
import { ExerciseVisual } from '../components/ExerciseVisual.tsx'
import { exerciseVariantMap, exercises, muscleGroups } from '../data/index.ts'
import { resolveMuscleGroups } from '../services/musclePriorities.ts'
import type { Exercise } from '../types/exercise.ts'
import type { MuscleGroup } from '../types/muscles.ts'

type EquipmentFilter = 'all' | 'bodyweight' | 'dumbbells'

const equipmentFilterLabels: Record<EquipmentFilter, string> = {
  all: 'Все',
  bodyweight: 'Собственный вес',
  dumbbells: 'Гантели',
}

function getEquipmentFilter(exercise: Exercise): EquipmentFilter {
  return exercise.equipment === 'Собственный вес' ? 'bodyweight' : 'dumbbells'
}

function getSortedMuscleIds(exercise: Exercise) {
  return Object.entries(exercise.muscles)
    .sort(([, left], [, right]) => (right ?? 0) - (left ?? 0))
    .map(([muscleId]) => muscleId)
}

function getMuscleName(muscleId: string, availableMuscles: MuscleGroup[]) {
  return availableMuscles.find((muscle) => muscle.id === muscleId)?.name ?? muscleId
}

function getPrimaryMuscles(exercise: Exercise, availableMuscles: MuscleGroup[]) {
  return getSortedMuscleIds(exercise)
    .slice(0, 2)
    .map((muscleId) => getMuscleName(muscleId, availableMuscles))
}

function getSecondaryMuscles(exercise: Exercise, availableMuscles: MuscleGroup[]) {
  return getSortedMuscleIds(exercise)
    .slice(2, 5)
    .map((muscleId) => getMuscleName(muscleId, availableMuscles))
}

function matchesMuscle(exercise: Exercise, muscleId: MuscleGroup['id'] | 'all') {
  if (muscleId === 'all') {
    return true
  }

  return muscleId in exercise.muscles
}

function matchesEquipment(exercise: Exercise, equipmentFilter: EquipmentFilter) {
  if (equipmentFilter === 'all') {
    return true
  }

  return getEquipmentFilter(exercise) === equipmentFilter
}

function matchesSearch(
  exercise: Exercise,
  query: string,
  availableMuscles: MuscleGroup[],
) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return true
  }

  const haystack = [
    exercise.name,
    exercise.description,
    exercise.equipment,
    exercise.movementType,
    ...getSortedMuscleIds(exercise).map((muscleId) =>
      getMuscleName(muscleId, availableMuscles),
    ),
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(normalizedQuery)
}

export function ExercisesPage() {
  const resolvedMuscleGroups = useMemo(() => resolveMuscleGroups(muscleGroups), [])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMuscle, setSelectedMuscle] =
    useState<MuscleGroup['id'] | 'all'>('all')
  const [selectedEquipment, setSelectedEquipment] =
    useState<EquipmentFilter>('all')
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const exerciseMap = useMemo(
    () =>
      Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise])),
    [],
  )

  const filteredExercises = exercises.filter((exercise) => {
    return (
      matchesSearch(exercise, deferredSearchQuery, resolvedMuscleGroups) &&
      matchesMuscle(exercise, selectedMuscle) &&
      matchesEquipment(exercise, selectedEquipment)
    )
  })

  const ownWeightCount = exercises.filter(
    (exercise) => exercise.equipment === 'Собственный вес',
  ).length
  const dumbbellCount = exercises.length - ownWeightCount
  const chainedCount = exercises.filter((exercise) => exerciseVariantMap[exercise.id]).length
  const activeMuscleName =
    selectedMuscle === 'all'
      ? 'Все мышцы'
      : resolvedMuscleGroups.find((muscle) => muscle.id === selectedMuscle)?.name ??
        'Все мышцы'

  return (
    <section className="page-card">
      <div className="page-card__header">
        <h2 className="page-card__title">Упражнения</h2>
        <p className="page-card__text">
          Здесь можно искать упражнения, фильтровать их по мышцам и оборудованию
          и смотреть, какие из них входят в цепочки усложнения.
        </p>
      </div>

      <div className="page-card__grid">
        <article className="info-tile">
          <strong>База упражнений</strong>
          <p>Всего добавлено {exercises.length} упражнений на русском языке.</p>
        </article>
        <article className="info-tile">
          <strong>Оборудование</strong>
          <p>
            Собственный вес: {ownWeightCount}. С гантелями: {dumbbellCount}.
          </p>
        </article>
        <article className="info-tile">
          <strong>Фильтр по мышцам</strong>
          <p>Сейчас выбран режим: {activeMuscleName}.</p>
        </article>
        <article className="info-tile">
          <strong>Цепочки сложности</strong>
          <p>В связки прогрессии уже включено {chainedCount} упражнений.</p>
        </article>
      </div>

      <div className="exercise-filters">
        <label className="exercise-search">
          <span>Поиск</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Например: отжимания, спина, гантели"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        <div className="exercise-filter-group">
          <span className="exercise-filter-group__label">Оборудование</span>
          <div className="exercise-filter-pills">
            {(['all', 'bodyweight', 'dumbbells'] as EquipmentFilter[]).map(
              (filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`exercise-filter-pill${
                    selectedEquipment === filter
                      ? ' exercise-filter-pill--active'
                      : ''
                  }`}
                  onClick={() => setSelectedEquipment(filter)}
                >
                  {equipmentFilterLabels[filter]}
                </button>
              ),
            )}
          </div>
        </div>

        <label className="exercise-muscle-select">
          <span>Мышца</span>
          <select
            value={selectedMuscle}
            onChange={(event) =>
              setSelectedMuscle(event.target.value as MuscleGroup['id'] | 'all')
            }
          >
            <option value="all">Все мышцы</option>
            {resolvedMuscleGroups.map((muscle) => (
              <option key={muscle.id} value={muscle.id}>
                {muscle.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="exercise-results" aria-label="Список упражнений">
        {filteredExercises.length > 0 ? (
          filteredExercises.map((exercise) => {
            const primaryMuscles = getPrimaryMuscles(exercise, resolvedMuscleGroups)
            const secondaryMuscles = getSecondaryMuscles(exercise, resolvedMuscleGroups)
            const variantNode = exerciseVariantMap[exercise.id]
            const previousExerciseName = variantNode?.previousExerciseId
              ? exerciseMap[variantNode.previousExerciseId]?.name
              : null
            const nextExerciseName = variantNode?.nextExerciseId
              ? exerciseMap[variantNode.nextExerciseId]?.name
              : null

            return (
              <article key={exercise.id} className="exercise-card">
                <ExerciseVisual exercise={exercise} />

                <div className="exercise-card__header">
                  <strong>{exercise.name}</strong>
                  <span className="exercise-card__equipment">
                    {exercise.equipment}
                  </span>
                </div>

                <p className="exercise-card__description">{exercise.description}</p>

                <div className="exercise-card__meta">
                  <div>
                    <span className="exercise-card__label">Основные мышцы</span>
                    <p>{primaryMuscles.join(', ') || 'Не указаны'}</p>
                  </div>
                  <div>
                    <span className="exercise-card__label">
                      Дополнительные мышцы
                    </span>
                    <p>{secondaryMuscles.join(', ') || 'Нет дополнительных'}</p>
                  </div>
                  <div>
                    <span className="exercise-card__label">Тип движения</span>
                    <p>{exercise.movementType}</p>
                  </div>
                  {variantNode ? (
                    <div>
                      <span className="exercise-card__label">Цепочка сложности</span>
                      <p>
                        {variantNode.label} • шаг {variantNode.level}
                        {previousExerciseName ? ` • после: ${previousExerciseName}` : ''}
                        {nextExerciseName
                          ? ` • дальше: ${nextExerciseName}`
                          : ' • финальный вариант'}
                      </p>
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })
        ) : (
          <div className="exercise-empty">
            <strong>Ничего не найдено</strong>
            <p>
              Попробуй изменить запрос или сбросить часть фильтров, чтобы увидеть
              больше упражнений.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
