export const EXIT = {
  ok: 0,
  failure: 1,
  usage: 2,
  precondition: 3,
}

export class CliError extends Error {
  constructor(code, message, { exit = EXIT.failure, hint = null, details = null } = {}) {
    super(message)
    this.code = code
    this.exit = exit
    this.hint = hint
    this.details = details
  }
}
