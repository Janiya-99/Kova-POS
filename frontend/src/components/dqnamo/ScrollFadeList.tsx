import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ScrollFadeListProps extends React.HTMLAttributes<HTMLDivElement> {
  maxHeightClass?: string;
  containerClassName?: string;
  listClassName?: string;
}

const LIST_SPACING_CLASS_RE = /^(?:[a-z0-9-]+:)*(?:space-y-|gap-y-|gap-|divide-)/;

function splitScrollAndListClasses(className?: string): {
  scrollClasses: string;
  inferredListClasses: string;
  hasExplicitSpacing: boolean;
} {
  if (!className) {
    return { scrollClasses: '', inferredListClasses: '', hasExplicitSpacing: false };
  }

  const scrollTokens: string[] = [];
  const listTokens: string[] = [];

  for (const token of className.trim().split(/\s+/)) {
    if (!token) continue;
    if (LIST_SPACING_CLASS_RE.test(token)) {
      listTokens.push(token);
    } else {
      scrollTokens.push(token);
    }
  }

  return {
    scrollClasses: scrollTokens.join(' '),
    inferredListClasses: listTokens.join(' '),
    hasExplicitSpacing: listTokens.some((token) =>
      /^(?:[a-z0-9-]+:)*(?:space-y-|gap-y-|gap-)/.test(token)
    ),
  };
}

/**
 * dqnamo.com/kitchen scroll container with subtle top/bottom gradient masks
 * so fixed-height Bento cards remain flush and never produce half-cards.
 */
export function ScrollFadeList({
  maxHeightClass = 'max-h-[260px]',
  containerClassName,
  listClassName,
  className,
  children,
  ...props
}: ScrollFadeListProps) {
  const { scrollClasses, inferredListClasses, hasExplicitSpacing } = React.useMemo(
    () => splitScrollAndListClasses(className),
    [className]
  );

  const listHasSpacing =
    hasExplicitSpacing ||
    Boolean(listClassName && /(?:space-y-|gap-y-|gap-)/.test(listClassName));

  return (
    <div className={cn('relative w-full min-h-0', containerClassName)}>
      <div
        className={cn(
          'h-full overflow-y-auto pos-clean-scroll pr-1 [mask-image:linear-gradient(to_bottom,black_0%,black_94%,transparent_100%)]',
          maxHeightClass,
          scrollClasses
        )}
        {...props}
      >
        <div
          className={cn(
            'py-1.5 pb-3 min-h-full flex flex-col',
            !listHasSpacing && 'gap-2.5',
            inferredListClasses,
            listClassName
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

