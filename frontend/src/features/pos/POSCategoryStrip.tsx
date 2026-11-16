import {
  LayoutGrid,
  Package,
  Shirt,
  ShoppingBag,
  Sparkles,
  Tag,
  Watch,
  type LucideIcon,
} from 'lucide-react';
import type { LocalProduct } from '@/lib/dexie-db';
import type { POSCategory } from './types';

function resolveCategoryIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (n.includes('accessor') || n.includes('bag') || n.includes('tote')) return ShoppingBag;
  if (n.includes('watch') || n.includes('jewel') || n.includes('cap')) return Watch;
  if (n.includes('knit') || n.includes('wool') || n.includes('luxury')) return Sparkles;
  if (n.includes('linen') || n.includes('shirt') || n.includes('top') || n.includes('apparel')) return Shirt;
  if (n.includes('outer') || n.includes('jacket') || n.includes('coat')) return Tag;
  return Package;
}

interface POSCategoryStripProps {
  categories: POSCategory[];
  products: LocalProduct[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
}

/**
 * Horizontal portrait icon category cards inspired by modern POS workflows,
 * applying Law of Similarity so cashiers can scan categories and SKU counts at a glance.
 */
export function POSCategoryStrip({
  categories,
  products,
  selectedCategory,
  onSelectCategory,
}: POSCategoryStripProps) {
  const cards: Array<{
    id: string;
    label: string;
    count: number;
    icon: LucideIcon;
  }> = [
    {
      id: 'ALL',
      label: 'All Items',
      count: products.length,
      icon: LayoutGrid,
    },
    ...categories.map((cat) => ({
      id: cat.id,
      label: cat.name,
      count: products.filter((p) => p.category_id === cat.id).length,
      icon: resolveCategoryIcon(cat.name),
    })),
  ];

  return (
    <div
      data-testid="pos-category-strip"
      className="flex items-stretch gap-2.5 overflow-x-auto pos-clean-scroll py-0.5"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        const active = selectedCategory === card.id;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectCategory(card.id)}
            aria-pressed={active}
            className={`group flex min-w-[106px] sm:min-w-[116px] shrink-0 flex-col justify-between gap-2.5 rounded-[16px] border px-3 py-2.5 text-left transition-all duration-150 cursor-pointer ${
              active
                ? 'border-accent bg-accent-soft/75 text-ink shadow-[0_4px_14px_rgba(135,127,193,0.16)]'
                : 'border-border-theme/75 bg-surface text-ink hover:border-accent/55 hover:bg-surface-muted/45'
            }`}
          >
            <span
              className={`inline-flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors ${
                active
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'bg-surface-muted text-accent group-hover:bg-accent-soft/60'
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-bold leading-tight text-ink">
                {card.label}
              </p>
              <p className="mt-0.5 text-[10.5px] font-medium text-ink-muted tabular-nums">
                {card.count} {card.count === 1 ? 'item' : 'items'}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

