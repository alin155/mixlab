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
    <div className="cutter-library-grid ml-library-grid ml-library-grid--three">
      {items.map((item) => {
        const content = (
          <>
            <img
              className="ml-media-frame ml-media-frame--16x9 ml-media-fill"
              src={item.image}
              alt=""
              loading="lazy"
            />
            <div className="cutter-library-card-copy ml-media-tile-copy">
              <strong className="ml-media-tile-title">{item.title}</strong>
              <span className="ml-media-tile-meta">{item.meta}</span>
              {item.tags.length ? (
                <span className="cutter-library-card-tags ml-media-tile-tags">
                  {item.tags.map((tag) => <Badge tone="neutral" key={tag}>{tag}</Badge>)}
                </span>
              ) : null}
              {item.description ? <p className="ml-media-tile-description">{item.description}</p> : null}
              {item.href ? <a className="ml-media-tile-link" href={item.href}>{item.actionLabel ?? "查看详情"}</a> : null}
            </div>
          </>
        );

        return (
          <Card
            className="cutter-library-card ml-media-tile-card"
            bodyFlush
            bodyClassName="cutter-library-card-body ml-media-tile-body"
            selected={Boolean(item.selected)}
            key={item.id}
          >
            {item.onSelect ? (
              <button
                className="cutter-library-card-button ml-media-tile-action"
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
