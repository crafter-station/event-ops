import { homedir } from "node:os"

const env = process.env

export function tilde(path) {
  const home = homedir()
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path
}

export function stdoutIsTTY() {
  return Boolean(process.stdout.isTTY)
}

export function stderrIsTTY() {
  return Boolean(process.stderr.isTTY)
}

function colorEnabled(stream) {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false
  if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") return true
  if (env.TERM === "dumb") return false
  return Boolean(stream.isTTY)
}

let forceNoColor = false
export function disableColor() {
  forceNoColor = true
}

function paint(open, close, stream) {
  return (text) => (!forceNoColor && colorEnabled(stream) ? `\x1b[${open}m${text}\x1b[${close}m` : String(text))
}

function palette(stream) {
  return {
    bold: paint(1, 22, stream),
    dim: paint(2, 22, stream),
    red: paint(31, 39, stream),
    green: paint(32, 39, stream),
    yellow: paint(33, 39, stream),
    cyan: paint(36, 39, stream),
    accent: paint("38;2;240;236;228", 39, stream),
  }
}

export const out = palette(process.stdout)
export const err = palette(process.stderr)

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g")

export function visibleWidth(text) {
  return String(text).replace(ANSI_RE, "").length
}

function pad(text, width) {
  return String(text) + " ".repeat(Math.max(0, width - visibleWidth(text)))
}

export function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(visibleWidth(h), ...rows.map((r) => visibleWidth(r[i] ?? ""))))
  const last = headers.length - 1
  const cell = (c, i) => (i === last ? String(c ?? "") : pad(c ?? "", widths[i]))
  const head = headers.map((h, i) => out.dim(cell(h, i))).join("  ")
  const body = rows.map((r) => r.map(cell).join("  "))
  return [head, ...body].join("\n")
}

export function keyValues(pairs) {
  const width = Math.max(...pairs.map(([k]) => visibleWidth(k)))
  return pairs.map(([k, v]) => `${out.dim(pad(k, width))}  ${v}`).join("\n")
}

export function heading(text) {
  return out.bold(text)
}

export function banner(version) {
  if (!stderrIsTTY()) return
  process.stderr.write(`${err.accent(err.bold("event-ops"))} ${err.dim(`v${version}`)}\n\n`)
}

export function progress(message) {
  if (!stderrIsTTY()) return
  process.stderr.write(`\r\x1b[2K${err.dim(message)}`)
}

export function progressDone() {
  if (!stderrIsTTY()) return
  process.stderr.write("\r\x1b[2K")
}
