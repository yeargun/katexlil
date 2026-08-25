export interface KatexOptions {
  displayMode?: boolean
  throwOnError?: boolean
  errorColor?: string
}

export function renderToString(tex: string, options?: KatexOptions): string
export function render(
  tex: string,
  element: { innerHTML: string },
  options?: KatexOptions,
): void

declare const katex: {
  renderToString: typeof renderToString
  render: typeof render
}

export default katex
