interface MarkdownFence {
  readonly marker: "`" | "~";
  readonly length: number;
}

interface MathHastNode {
  readonly type: string;
  readonly tagName?: string;
  readonly value?: string;
  readonly children?: MathHastNode[];
  properties?: Record<string, unknown>;
}

function fenceAtLineStart(line: string): MarkdownFence | null {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  const fence = match?.[1];
  if (!fence) return null;
  return { marker: fence[0] as MarkdownFence["marker"], length: fence.length };
}

function closesFence(line: string, fence: MarkdownFence): boolean {
  const match = /^ {0,3}(`+|~+)[ \t]*(?:\r?\n)?$/.exec(line);
  const marker = match?.[1];
  return Boolean(marker && marker[0] === fence.marker && marker.length >= fence.length);
}

function isEscaped(value: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function closingDelimiterIndex(value: string, delimiter: string, from: number): number {
  let index = value.indexOf(delimiter, from);
  while (index !== -1) {
    if (!isEscaped(value, index)) return index;
    index = value.indexOf(delimiter, index + delimiter.length);
  }
  return -1;
}

function normalizeOutsideFences(value: string): string {
  let result = "";
  let inlineCodeTicks = 0;

  for (let index = 0; index < value.length; ) {
    if (value[index] === "`") {
      let runEnd = index + 1;
      while (value[runEnd] === "`") runEnd += 1;
      const runLength = runEnd - index;
      if (inlineCodeTicks === 0) {
        inlineCodeTicks = runLength;
      } else if (inlineCodeTicks === runLength) {
        inlineCodeTicks = 0;
      }
      result += value.slice(index, runEnd);
      index = runEnd;
      continue;
    }

    if (inlineCodeTicks === 0 && value[index] === "\\" && !isEscaped(value, index)) {
      const delimiter = value[index + 1];
      if (delimiter === "(" || delimiter === "[") {
        const closingDelimiter = delimiter === "(" ? "\\)" : "\\]";
        const closingIndex = closingDelimiterIndex(value, closingDelimiter, index + 2);
        if (closingIndex !== -1) {
          // remark-math accepts double dollars for inline math too. Keeping
          // both replacements two characters wide preserves source offsets
          // used by interactive task-list items later in the message.
          const marker = "$$";
          result += marker;
          result += value.slice(index + 2, closingIndex);
          result += marker;
          index = closingIndex + closingDelimiter.length;
          continue;
        }
      }
    }

    result += value[index];
    index += 1;
  }

  return result;
}

/**
 * remark-math uses dollar delimiters, while coding agents commonly emit the
 * equivalent LaTeX `\(...\)` and `\[...\]` forms. Normalize those forms before
 * markdown parsing without touching examples inside inline or fenced code.
 */
export function normalizeLatexMathDelimiters(markdown: string): string {
  if (!markdown.includes("\\(") && !markdown.includes("\\[")) return markdown;

  let result = "";
  let plainTextStart = 0;
  let lineStart = 0;
  let activeFence: MarkdownFence | null = null;

  while (lineStart < markdown.length) {
    const newlineIndex = markdown.indexOf("\n", lineStart);
    const lineEnd = newlineIndex === -1 ? markdown.length : newlineIndex + 1;
    const line = markdown.slice(lineStart, lineEnd);

    if (activeFence) {
      if (closesFence(line, activeFence)) {
        result += markdown.slice(plainTextStart, lineEnd);
        plainTextStart = lineEnd;
        activeFence = null;
      }
    } else {
      const openingFence = fenceAtLineStart(line);
      if (openingFence) {
        result += normalizeOutsideFences(markdown.slice(plainTextStart, lineStart));
        activeFence = openingFence;
        plainTextStart = lineStart;
      }
    }

    lineStart = lineEnd;
  }

  const remainder = markdown.slice(plainTextStart);
  result += activeFence ? remainder : normalizeOutsideFences(remainder);
  return result;
}

function hasClassName(node: MathHastNode, className: string): boolean {
  const value = node.properties?.className;
  return Array.isArray(value) && value.includes(className);
}

function mathSource(node: MathHastNode): string | null {
  if (
    node.tagName === "annotation" &&
    node.properties?.encoding === "application/x-tex" &&
    node.children?.[0]?.type === "text"
  ) {
    return node.children[0].value ?? null;
  }
  for (const child of node.children ?? []) {
    const source = mathSource(child);
    if (source !== null) return source;
  }
  return null;
}

/** Keep highlight-and-copy output as markdown instead of duplicated KaTeX text. */
export function rehypeMathCopySource() {
  return (tree: MathHastNode) => {
    const visit = (node: MathHastNode) => {
      const display = hasClassName(node, "katex-display");
      const inline = !display && hasClassName(node, "katex");
      if (display || inline) {
        const source = mathSource(node);
        if (source !== null) {
          node.properties ??= {};
          node.properties.dataMarkdownCopy = display ? `$$\n${source}\n$$` : `$${source}$`;
          return;
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}
