import { describe, expect, it } from "vite-plus/test";

import { normalizeLatexMathDelimiters, rehypeMathCopySource } from "./markdown-math";

describe("normalizeLatexMathDelimiters", () => {
  it("normalizes inline parenthesis delimiters", () => {
    expect(normalizeLatexMathDelimiters(String.raw`The determinant is \(\det(A)=0\).`)).toBe(
      String.raw`The determinant is $$\det(A)=0$$.`,
    );
  });

  it("normalizes multiline bracket delimiters", () => {
    expect(
      normalizeLatexMathDelimiters(String.raw`\[
\det(A)=9(3\cdot4-8\cdot2)
\]`),
    ).toBe(String.raw`$$
\det(A)=9(3\cdot4-8\cdot2)
$$`);
  });

  it("returns ordinary markdown unchanged", () => {
    const markdown = "A regular message with `code` and a [link](https://t3.codes).";

    expect(normalizeLatexMathDelimiters(markdown)).toBe(markdown);
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

describe("rehypeMathCopySource", () => {
  it("adds markdown copy source to inline and display math", () => {
    const inlineMath = {
      type: "element",
      tagName: "span",
      properties: { className: ["katex"] },
      children: [
        {
          type: "element",
          tagName: "annotation",
          properties: { encoding: "application/x-tex" },
          children: [{ type: "text", value: "x + y" }],
        },
      ],
    };
    const displayMath = {
      type: "element",
      tagName: "span",
      properties: { className: ["katex-display"] },
      children: [
        {
          type: "element",
          tagName: "annotation",
          properties: { encoding: "application/x-tex" },
          children: [{ type: "text", value: String.raw`\det(A)=0` }],
        },
      ],
    };

    rehypeMathCopySource()({ type: "root", children: [inlineMath, displayMath] });

    expect(inlineMath).toMatchObject({
      properties: { dataMarkdownCopy: "$x + y$" },
    });
    expect(displayMath).toMatchObject({
      properties: { dataMarkdownCopy: "$$\n\\det(A)=0\n$$" },
    });
  });
});
