import type { PropsWithChildren } from 'react'
import { BottomNav } from './BottomNav.tsx'
import type { NavigationId, NavigationItem } from '../types/navigation.ts'

interface AppLayoutProps extends PropsWithChildren {
  activePage: NavigationId
  items: NavigationItem[]
  onNavigate: (id: NavigationId) => void
}

export function AppLayout({
  activePage,
  items,
  onNavigate,
  children,
}: AppLayoutProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <nav className="top-nav" aria-label="Основная навигация">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`top-nav__item${
                  item.id === activePage ? ' top-nav__item--active' : ''
                }`}
                onClick={() => onNavigate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <BottomNav
        activePage={activePage}
        items={items}
        onNavigate={onNavigate}
      />
    </div>
  )
}
