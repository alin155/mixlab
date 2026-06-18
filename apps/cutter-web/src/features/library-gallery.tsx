import { Badge, Card } from "@mixlab/ui-foundation";

export interface LibraryGalleryItem {
  id: string;
  title: string;
  image: string;
  meta: string;
  tags: readonly string[];
  description?: string;
  selected?: boolean;
  href?: string;
  actionLabel?: string;
  selectLabel?: string;
  onSelect?: () => void;
}

export function LibraryGallery({ items }: { items: readonly LibraryGalleryItem[] }) {
  return (
    <div className="cutter-library-grid">
      {items.map((item) => {
        const content = (
          <>
            <img src={item.image} alt="" loading="lazy" />
            <div className="cutter-library-card-copy">
              <strong>{item.title}</strong>
              <span>{item.meta}</span>
              {item.tags.length ? (
                <span className="cutter-library-card-tags">
                  {item.tags.map((tag) => <Badge tone="neutral" key={tag}>{tag}</Badge>)}
                </span>
              ) : null}
              {item.description ? <p>{item.description}</p> : null}
              {item.href ? <a href={item.href}>{item.actionLabel ?? "查看详情"}</a> : null}
            </div>
          </>
        );

        return (
          <Card
            className="cutter-library-card"
            bodyClassName="cutter-library-card-body"
            selected={Boolean(item.selected)}
            key={item.id}
          >
            {item.onSelect ? (
              <button
                className="cutter-library-card-button"
                type="button"
                aria-label={item.selectLabel ?? item.title}
                aria-pressed={Boolean(item.selected)}
                onClick={item.onSelect}
              >
                {content}
              </button>
            ) : (
              content
            )}
          </Card>
        );
      })}
    </div>
  );
}
