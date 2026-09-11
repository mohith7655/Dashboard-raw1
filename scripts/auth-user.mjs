/**
 * Makes one dashboard sign-in: an `email:hash` entry for AUTH_USERS, and an
 * AUTH_SECRET too if there is not one yet.
 *
 *   npm run auth:user -- you@example.com
 *
 * Asks for the password, shown as asterisks. Leave it blank and a strong one is
 * made up and printed, once. The password itself is never stored anywhere —
 * only the hash goes in the environment. Nothing is written back, so, as with
 * `google:auth`, you stay in control of where the values land.
 */
import { randomBytes, scryptSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * `scrypt.<salt>.<key>`, both base64url, at Node's default scrypt cost. The
 * functions read this exact shape in `netlify/lib/auth.ts`; change one and you
 * must change the other.
 */
const KEY_LENGTH = 64

/** Anything shorter is refused; a blank answer gets a generated one instead. */
const MIN_PASSWORD = 12

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readEnvFile() {
  try {
    return Object.fromEntries(
      readFileSync(join(root, '.env'), 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
        .map((line) => {
          const i = line.indexOf('=')
          return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
        }),
    )
  } catch {
    return {}
  }
}

/** Piped input, read a line per answer. Shared so no line is dropped between questions. */
let piped

/** One answer, from the terminal or from a pipe. */
async function ask(question, { hidden = false } = {}) {
  if (!process.stdin.isTTY) {
    piped ??= createInterface({ input: process.stdin })[Symbol.asyncIterator]()
    process.stdout.write(question + '\n')
    const { value } = await piped.next()
    return value ?? ''
  }
  return hidden ? askHidden(question) : askVisible(question)
}

function askVisible(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

/** Keys the hidden prompt handles itself. By code, since none of them prints. */
const ESC = String.fromCharCode(0x1b)
const CTRL_C = String.fromCharCode(0x03)
const CTRL_D = String.fromCharCode(0x04)
const DEL = String.fromCharCode(0x7f)

/**
 * A line typed with each key shown as an asterisk. Showing nothing at all
 * reads as a prompt that is not taking input; the asterisks say the keys are
 * landing without the password itself ever being on screen.
 *
 * Keys are read raw rather than through readline. Muting readline does not
 * work: it clears the line on every keystroke, wiping the prompt off the
 * screen, and newer Node no longer routes its output through the method one
 * would override to silence it.
 */
function askHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process
    let value = ''

    const finish = () => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
    }

    const onData = (chunk) => {
      // Arrow keys and the like arrive as escape sequences; none belong in a password.
      if (chunk.startsWith(ESC)) return
      for (const char of chunk) {
        // Enter, or Ctrl+D.
        if (char === '\r' || char === '\n' || char === CTRL_D) {
          finish()
          resolve(value)
          return
        }
        // Ctrl+C, which raw mode no longer turns into a signal on its own.
        if (char === CTRL_C) {
          finish()
          process.exit(130)
        }
        // Backspace: DEL on most terminals, BS on some Windows ones.
        if (char === DEL || char === '\b') {
          if (value) {
            value = value.slice(0, -1)
            // Back over the last asterisk, blank it, and step back again.
            stdout.write('\b \b')
          }
          continue
        }
        if (char >= ' ') {
          value += char
          stdout.write('*')
        }
      }
    }

    stdout.write(question)
    stdin.setEncoding('utf8')
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

const email = (process.argv[2] ?? (await ask('Email: '))).trim().toLowerCase()

// The entry is split on its last colon and entries on commas and whitespace,
// so an address carrying any of those could never be read back.
if (!/^[^\s@,:]+@[^\s@,:]+\.[^\s@,:]+$/.test(email)) {
  console.error(`"${email}" is not an email address this can make an account for.`)
  process.exit(1)
}

let password = await ask('Password (leave blank to generate one): ', { hidden: true })
let generated = false

if (!password) {
  password = randomBytes(18).toString('base64url')
  generated = true
} else {
  if (password.length < MIN_PASSWORD) {
    console.error(
      `Use at least ${MIN_PASSWORD} characters, or leave it blank for a generated one.`,
    )
    process.exit(1)
  }
  const again = await ask('Same password again: ', { hidden: true })
  if (again !== password) {
    console.error('The two passwords did not match. Nothing was made.')
    process.exit(1)
  }
}

const salt = randomBytes(16)
const key = scryptSync(password, salt, KEY_LENGTH)
const entry = `${email}:scrypt.${salt.toString('base64url')}.${key.toString('base64url')}`

console.log('\nAUTH_USERS entry — separate it from any others with a comma:\n')
console.log(`  ${entry}\n`)

if (generated) {
  console.log('Password for this account. It is shown once and stored nowhere:\n')
  console.log(`  ${password}\n`)
}

const env = { ...readEnvFile(), ...process.env }
if (!env.AUTH_SECRET) {
  console.log('No AUTH_SECRET found in .env. Here is a random one:\n')
  console.log(`  AUTH_SECRET=${randomBytes(48).toString('base64url')}\n`)
}

console.log('Set these in .env for `npm run dev`, and in Netlify under Project')
console.log('configuration → Environment variables (scoped to Functions), then redeploy.')
