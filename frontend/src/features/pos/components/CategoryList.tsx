import * as React from 'react';
import {
  BookOpen,
  Boxes,
  Car,
  LayoutGrid,
  Package,
  Smartphone,
  Sparkles,
  Tag,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react';
import type { LocalProduct } from '@/lib/dexie-db';
import type { POSCategory } from '../types';
import type { IndustryLayoutMode, POSCapabilities } from './capabilities';
import { ScrollFadeList } from '@/components/dqnamo/ScrollFadeList';

export type LaborPartsFilter = 'ALL' | 'PARTS' | 'LABOR';

export interface CategoryListProps {
  categories: POSCategory[];
  products: LocalProduct[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
  capabilities: POSCapabilities;
  laborPartsFilter: LaborPartsFilter;
  onChangeLaborPartsFilter: (filter: LaborPartsFilter) => void;
}

const MODE_ICON_MAP: Record<IndustryLayoutMode, React.ComponentType<{ className?: string }>> = {
  retail: Sparkles,
  restaurant: UtensilsCrossed,
  hardware: Wrench,
  garage: Car,
  mobile: Smartphone,
  stationery: BookOpen,
};

function getCategoryIcon(slug: string, name: string, mode: IndustryLayoutMode) {
  const s = `${slug} ${name}`.toLowerCase();
  if (s.includes('food') || s.includes('drink') || s.includes('menu') || s.includes('coffee')) {
    return UtensilsCrossed;
  }
  if (s.includes('service') || s.includes('labor') || s.includes('bay') || s.includes('auto')) {
    return Car;
  }
  if (s.includes('tool') || s.includes('hard') || s.includes('pipe') || s.includes('paint')) {
    return Wrench;
  }
  if (s.includes('phone') || s.includes('mobile') || s.includes('tech') || s.includes('elec')) {
    return Smartphone;
  }
  if (s.includes('book') || s.includes('paper') || s.includes('office') || s.includes('pen')) {
    return BookOpen;
  }
  if (s.includes('pack') || s.includes('bundle') || s.includes('knit') || s.includes('linen')) {
    return Tag;
  }
  if (s.includes('outer') || s.includes('access')) {
    return Package;
  }
  return MODE_ICON_MAP[mode] || Boxes;
}

/**
 * Pane 1: Vertical symmetrical category rail with ScrollFadeList and Obsidian active selection.
 */
export function CategoryList({
  categories,
  products,
  selectedCategory,
  onSelectCategory,
  capabilities,
  laborPartsFilter,
  onChangeLaborPartsFilter,
}: CategoryListProps) {
  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.category_id, (map.get(p.category_id) || 0) + 1);
    }
    return map;
  }, [products]);

  const ModeIcon = MODE_ICON_MAP[capabilities.layoutMode];

  return (
    <section
      data-testid="pos-pane-categories"
      aria-label="Product Categories"
      className="flex h-full min-h-0 flex-col rounded-[22px] border border-border-theme/70 bg-white p-4 shadow-xs"
    >
      <div className="shrink-0 space-y-3 pb-3.5 border-b border-border-theme/60">
        <div className="flex items-center justify-between gap-2.5 px-0.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-accent-soft text-accent-soft-fg">
              <ModeIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[13px] font-extrabold text-[#222026] leading-tight">
                Categories
              </h2>
              <p className="truncate text-[10px] font-medium text-ink-muted">
                {capabilities.preset.label}
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold text-ink-muted tabular-nums">
            {categories.length + 1}
          </span>
        </div>

        {capabilities.splitLaborParts && (
          <div
            data-testid="garage-parts-labor-filter"
            className="grid grid-cols-3 gap-1 rounded-[12px] bg-[#F5F6FA] p-1"
          >
            {(
              [
                { id: 'ALL', label: 'All' },
                { id: 'PARTS', label: 'Parts' },
                { id: 'LABOR', label: 'Labor' },
              ] as const
            ).map((opt) => {
              const active = laborPartsFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeLaborPartsFilter(opt.id)}
                  className={`min-h-[30px] rounded-[9px] text-[10.5px] font-bold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#222026] text-white shadow-xs'
                      : 'text-ink-muted hover:text-[#222026]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ScrollFadeList
        containerClassName="flex-1 min-h-0 pt-2"
        maxHeightClass="max-h-full"
        className="pr-1"
        listClassName="gap-3 pt-1 pb-3"
      >
        <button
          type="button"
          data-testid="pos-category-ALL"
          onClick={() => onSelectCategory('ALL')}
          className={`flex w-full shrink-0 min-h-[46px] items-center justify-between gap-2.5 rounded-[14px] px-3.5 py-2.5 text-left transition-all cursor-pointer ${
            selectedCategory === 'ALL'
              ? 'bg-[#222026] text-white shadow-sm'
              : 'bg-[#F5F6FA]/75 text-[#222026] hover:bg-accent-soft/55'
          }`}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <LayoutGrid
              className={`h-4 w-4 shrink-0 ${
                selectedCategory === 'ALL' ? 'text-white' : 'text-accent'
              }`}
            />
            <span className="truncate text-[12px] font-bold">All Items</span>
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${
              selectedCategory === 'ALL'
                ? 'bg-white/15 text-white'
                : 'bg-white text-ink-muted'
            }`}
          >
            {products.length}
          </span>
        </button>

        {categories.map((cat) => {
          const active = selectedCategory === cat.id;
          const Icon = getCategoryIcon(cat.slug, cat.name, capabilities.layoutMode);
          const count = counts.get(cat.id) || 0;
          return (
            <button
              key={cat.id}
              type="button"
              data-testid={`pos-category-${cat.slug}`}
              onClick={() => onSelectCategory(cat.id)}
              className={`flex w-full shrink-0 min-h-[46px] items-center justify-between gap-2.5 rounded-[14px] px-3.5 py-2.5 text-left transition-all cursor-pointer ${
                active
                  ? 'bg-[#222026] text-white shadow-sm'
                  : 'bg-[#F5F6FA]/75 text-[#222026] hover:bg-accent-soft/55'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-accent'}`}
                />
                <span className="truncate text-[12px] font-bold">{cat.name}</span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${
                  active ? 'bg-white/15 text-white' : 'bg-white text-ink-muted'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </ScrollFadeList>
    </section>
  );
}

