import type { ReactNode } from 'react'

interface InfoTileProps {
  title: string
  text: string
}

interface PageSectionProps {
  title: string
  description: string
  tiles: InfoTileProps[]
  footer?: ReactNode
}

export function PageSection({
  title,
  description,
  tiles,
  footer,
}: PageSectionProps) {
  return (
    <section className="page-card">
      <div className="page-card__header">
        <h2 className="page-card__title">{title}</h2>
        <p className="page-card__text">{description}</p>
      </div>

      <div className="page-card__grid">
        {tiles.map((tile) => (
          <article key={tile.title} className="info-tile">
            <strong>{tile.title}</strong>
            <p>{tile.text}</p>
          </article>
        ))}
      </div>

      {footer}
    </section>
  )
}
