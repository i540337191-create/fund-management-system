import {
  layout,
  measureNaturalWidth,
  prepare,
  prepareWithSegments,
  type PrepareOptions,
} from "@chenglou/pretext";

export const TEXT_LAYOUT_FONTS = {
  body: '14px "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
  bodyStrong: '600 14px "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
  caption: '12px "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
  mono: '14px "IBM Plex Mono", Menlo, "DejaVu Sans Mono", "Bitstream Vera Sans Mono", Courier, monospace',
};

type EstimateTextOptions = PrepareOptions & {
  font?: string;
  maxWidth: number;
  lineHeight?: number;
  paddingBlock?: number;
  paddingInline?: number;
};

export type TextBlockEstimate = {
  height: number;
  lineCount: number;
  textWidth: number;
  reservedHeight: number;
};

const preparedCache = new Map<string, ReturnType<typeof prepare>>();
const preparedSegmentCache = new Map<string, ReturnType<typeof prepareWithSegments>>();

function cacheKey(text: string, font: string, options?: PrepareOptions) {
  return JSON.stringify([text, font, options?.whiteSpace ?? "normal", options?.wordBreak ?? "normal", options?.letterSpacing ?? 0]);
}

function fallbackTextEstimate(text: string, options: Required<Pick<EstimateTextOptions, "maxWidth" | "lineHeight" | "paddingBlock" | "paddingInline">>) {
  const averageCharWidth = 7;
  const usableWidth = Math.max(1, options.maxWidth - options.paddingInline);
  const lineCount = Math.max(1, Math.ceil((text.length * averageCharWidth) / usableWidth));
  const height = lineCount * options.lineHeight;
  return {
    height,
    lineCount,
    textWidth: Math.min(usableWidth, text.length * averageCharWidth),
    reservedHeight: height + options.paddingBlock,
  };
}

export function estimateTextBlock(text: string, options: EstimateTextOptions): TextBlockEstimate {
  const font = options.font ?? TEXT_LAYOUT_FONTS.body;
  const lineHeight = options.lineHeight ?? 24;
  const paddingBlock = options.paddingBlock ?? 0;
  const paddingInline = options.paddingInline ?? 0;
  const maxWidth = Math.max(1, options.maxWidth - paddingInline);
  const prepareOptions: PrepareOptions = {
    whiteSpace: options.whiteSpace ?? "normal",
    wordBreak: options.wordBreak ?? "normal",
    letterSpacing: options.letterSpacing ?? 0,
  };

  try {
    const key = cacheKey(text, font, prepareOptions);
    let prepared = preparedCache.get(key);
    if (!prepared) {
      prepared = prepare(text, font, prepareOptions);
      preparedCache.set(key, prepared);
    }
    const result = layout(prepared, maxWidth, lineHeight);
    return {
      height: result.height,
      lineCount: result.lineCount,
      textWidth: maxWidth,
      reservedHeight: result.height + paddingBlock,
    };
  } catch {
    return fallbackTextEstimate(text, { maxWidth: options.maxWidth, lineHeight, paddingBlock, paddingInline });
  }
}

export type InlineWrapEstimate = {
  height: number;
  rowCount: number;
  itemWidths: number[];
};

export function estimateInlineWrap(
  items: string[],
  {
    font = TEXT_LAYOUT_FONTS.caption,
    maxWidth,
    rowHeight = 24,
    columnGap = 8,
    rowGap = 8,
    paddingInline = 16,
  }: {
    font?: string;
    maxWidth: number;
    rowHeight?: number;
    columnGap?: number;
    rowGap?: number;
    paddingInline?: number;
  },
): InlineWrapEstimate {
  let currentRowWidth = 0;
  let rowCount = items.length > 0 ? 1 : 0;

  const itemWidths = items.map((item) => {
    try {
      const key = cacheKey(item, font, { whiteSpace: "normal" });
      let prepared = preparedSegmentCache.get(key);
      if (!prepared) {
        prepared = prepareWithSegments(item, font, { whiteSpace: "normal" });
        preparedSegmentCache.set(key, prepared);
      }
      return Math.ceil(measureNaturalWidth(prepared) + paddingInline);
    } catch {
      return Math.ceil(item.length * 7 + paddingInline);
    }
  });

  itemWidths.forEach((width) => {
    const nextWidth = currentRowWidth === 0 ? width : currentRowWidth + columnGap + width;
    if (nextWidth > maxWidth && currentRowWidth > 0) {
      rowCount += 1;
      currentRowWidth = width;
      return;
    }
    currentRowWidth = nextWidth;
  });

  return {
    height: rowCount === 0 ? 0 : rowCount * rowHeight + Math.max(0, rowCount - 1) * rowGap,
    rowCount,
    itemWidths,
  };
}

export type VirtualListEstimate = {
  itemHeights: number[];
  totalHeight: number;
  averageHeight: number;
};

export function estimateVirtualListHeights(
  items: string[],
  options: Omit<EstimateTextOptions, "paddingBlock"> & { rowChrome?: number },
): VirtualListEstimate {
  const rowChrome = options.rowChrome ?? 48;
  const itemHeights = items.map((item) => estimateTextBlock(item, options).height + rowChrome);
  const totalHeight = itemHeights.reduce((sum, height) => sum + height, 0);
  return {
    itemHeights,
    totalHeight,
    averageHeight: itemHeights.length ? totalHeight / itemHeights.length : 0,
  };
}
