import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkMath from "remark-math";
import { describe, expect, it } from "vite-plus/test";

import { normalizeLatexMathDelimiters, rehypeMathCopySource } from "./markdown-math";

function renderMath(markdown: string): string {
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeKatex, rehypeMathCopySource]}
    >
      {normalizeLatexMathDelimiters(markdown)}
    </ReactMarkdown>,
  );
}

describe("normalizeLatexMathDelimiters", () => {
  it("renders inline parenthesis delimiters", () => {
    const html = renderMath(String.raw`The determinant is \(\det(A)=0\).`);

    expect(html).toContain('class="katex"');
    expect(html).toContain('data-markdown-copy="$\\det(A)=0$"');
    expect(html).toContain("det");
    expect(html).not.toContain(String.raw`\(`);
  });

  it("renders multiline bracket delimiters as display math", () => {
    const html = renderMath(String.raw`\[
\det(A)=9(3\cdot4-8\cdot2)
\]`);

    expect(html).toContain('class="katex-display"');
    expect(html).toContain('data-markdown-copy="$$\n\\det(A)=9(3\\cdot4-8\\cdot2)\n$$"');
    expect(html).toContain("det");
    expect(html).not.toContain(String.raw`\[`);
  });

  it("leaves unmatched delimiters visible while a message streams", () => {
    expect(normalizeLatexMathDelimiters(String.raw`Working on \(x + y`)).toBe(
      String.raw`Working on \(x + y`,
    );
  });

  it("does not alter inline code", () => {
    const markdown = "Use \\(x\\), but keep `\\(literal\\)` as source.";

    expect(normalizeLatexMathDelimiters(markdown)).toBe(
      "Use $$x$$, but keep `\\(literal\\)` as source.",
    );
  });

  it("does not alter fenced code", () => {
    const markdown = [
      String.raw`Before \(x\).`,
      "",
      "```tex",
      String.raw`\[literal\]`,
      "```",
      "",
      String.raw`After \[y\].`,
    ].join("\n");

    expect(normalizeLatexMathDelimiters(markdown)).toBe(
      ["Before $$x$$.", "", "```tex", String.raw`\[literal\]`, "```", "", "After $$y$$."].join(
        "\n",
      ),
    );
  });

  it("does not reinterpret escaped backslashes as delimiters", () => {
    const markdown = String.raw`Keep \\(literal\\), render \(math\).`;

    expect(normalizeLatexMathDelimiters(markdown)).toBe(
      String.raw`Keep \\(literal\\), render $$math$$.`,
    );
  });

  it("preserves source offsets for markdown interactions after equations", () => {
    const markdown = String.raw`\(x + y\) before - [ ] a task`;

    expect(normalizeLatexMathDelimiters(markdown)).toHaveLength(markdown.length);
  });
});
