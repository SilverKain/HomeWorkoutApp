import type { NavigationId, NavigationItem } from '../types/navigation.ts'

interface BottomNavProps {
  activePage: NavigationId
  items: NavigationItem[]
  onNavigate: (id: NavigationId) => void
}

export function BottomNav({ activePage, items, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Нижняя навигация">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`bottom-nav__item${
            item.id === activePage ? ' bottom-nav__item--active' : ''
          }`}
          onClick={() => onNavigate(item.id)}
        >
          <strong>{item.shortLabel}</strong>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
