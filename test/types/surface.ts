import katex, {
  ParseError,
  render,
  renderToString,
  type KatexOptions,
} from "@itslil/katex"

const options: KatexOptions = {
  displayMode: true,
  output: "htmlAndMathml",
  throwOnError: false,
  trust: ({ command }) => command === "\\href",
}

const html: string = renderToString("x^2", options)
const sameHtml: string = katex.renderToString("x^2", options)
const error: Error = new ParseError("bad input")

declare const element: HTMLElement
render("x^2", element, options)

void html
void sameHtml
void error
