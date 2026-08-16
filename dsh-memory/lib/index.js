/**
 * dsh-memory — local memory for dsh agents.
 *
 * Model-callable tools to SAVE and RECALL important information the user
 * shared: credentials (usernames, passwords, tokens), preferences, facts.
 * The model decides what to remember through the injected system-prompt
 * guidance (automatic memory, like mainstream AI agents).
 *
 * PRIVACY / SECURITY CONTRACT:
 *  - Data is written ONLY to `$DSH_HOME/memory/memory.json` on this machine.
 *  - This file contains ZERO network calls — no fetch, no sockets.
 *  - Storage directory mode 0700, file mode 0600 (owner-only).
 *  - Writes are atomic (tmp file + rename) and serialized in-process.
 *
 * Host-only plugin (no browser half): identical shape to dsh-search.
 */

import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const name = 'dsh-memory'

/** Services this plugin mounts into. */
export const inject = ['tools', 'systemPrompt', 'dshHomePath']

/** Store file name under `$DSH_HOME/memory/`. */
const STORE_FILENAME = 'memory.json'
/** Hard cap on stored entries (oldest dropped first). */
const MAX_ENTRIES = 500
/** Tool call deadline. */
const TIMEOUT_MS = 5000

/** Valid kinds, for argument validation. */
const KINDS = new Set(['credential', 'preference', 'fact', 'other'])

// ---------------------------------------------------------------------------
// Schema shorthand → standard JSON Schema (mirrors the harness tool DSL;
// copied from dsh-search so the tools registry accepts the registration).
// ---------------------------------------------------------------------------

function compilePropertyMap(map) {
  const properties = {}
  const required = []
  for (const [name, node] of Object.entries(map)) {
    if (node.required === true) required.push(name)
    const { required: _drop, ...rest } = node
    properties[name] = rest
  }
  return { type: 'object', additionalProperties: false, properties, ...(required.length > 0 ? { required } : {}) }
}

function compileValue(node) {
  const out = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'required') continue // consumed by the enclosing property map
    if (key === 'properties') {
      const compiled = compilePropertyMap(value)
      out.properties = compiled.properties
      if (compiled.required !== undefined) out.required = compiled.required
      continue
    }
    if (key === 'items' && typeof value === 'object' && value !== null) {
      out.items = compileValue(value)
      continue
    }
    out[key] = value
  }
  return out
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Read the store; an absent file yields an empty entry list. */
async function readStore(storePath) {
  let raw
  try {
    raw = await readFile(storePath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('dsh-memory: store file is corrupt (' + storePath + ') — refusing to overwrite; move it aside to start fresh')
  }
  return Array.isArray(data.entries) ? data.entries : []
}

/** Atomically persist the entry list with owner-only permissions. */
async function writeStore(storeDir, storePath, entries) {
  await mkdir(storeDir, { recursive: true, mode: 0o700 })
  const payload = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries }, null, 2)
  const tmpPath = storePath + '.' + process.pid + '.tmp'
  await writeFile(tmpPath, payload, { mode: 0o600 })
  await rename(tmpPath, storePath)
  try {
    await chmod(storePath, 0o600)
  } catch {
    // best-effort: some filesystems do not support chmod
  }
}

/** Serialize store writes across concurrent tool calls. */
let writeChain = Promise.resolve()
function enqueueWrite(work) {
  const run = writeChain.then(work, work)
  writeChain = run.then(() => undefined, () => undefined)
  return run
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function apply(ctx, config = {}) {
  const storeDir = ctx.dshHomePath('memory')
  const storePath = join(storeDir, STORE_FILENAME)

  ctx.systemPrompt.section({
    name: 'dsh-memory',
    order: 120,
    text:
      '自动记忆：当用户提供凭据（用户名/密码/token/API key）、个人偏好或重要事实时，'
      + '主动调用 memory_save 保存，并为检索性命名（类别 credential/preference/fact，'
      + 'tags 给关键词）。之后需要这些信息时调用 memory_recall 回忆；记忆有误时用 '
      + 'memory_forget 删除。记忆只写入本机 $DSH_HOME/memory/memory.json，绝不上传；'
      + '不要在回复中复述完整密码或 token。',
  })

  ctx.tools.register({
    name: 'memory_save',
    description:
      '保存一条本地记忆（用户提供的用户名/密码/凭据、偏好、重要事实等）。'
      + '数据只写入本机 $DSH_HOME/memory/memory.json，不会上传到任何地方。'
      + '相同内容再次保存仅更新时间戳。',
    parameters: compilePropertyMap({
      content: { type: 'string', required: true, description: '要记住的内容，例如「用户的 GitHub 用户名是 xxx」' },
      kind: { type: 'string', description: '类别：credential（凭据/密码）/ preference（偏好）/ fact（事实）/ other，默认 other' },
      tags: { type: 'array', items: { type: 'string' }, description: '检索关键词，例如 ["github", "username"]' },
    }),
    output: {
      schema: compileValue({
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          saved: { type: 'boolean', required: true },
          total: { type: 'number', required: true },
        },
      }),
      render: (_args, value) => [{ type: 'text', text: `已保存记忆条目 ${value.id}（共 ${value.total} 条）` }],
    },
    timeoutMs: TIMEOUT_MS,
    isConcurrencySafe: () => false,
    execute: async (args) => {
      const content = typeof args.content === 'string' ? args.content.trim() : ''
      if (content.length === 0) throw new Error('memory_save: content 不能为空')
      const rawKind = typeof args.kind === 'string' ? args.kind.trim() : ''
      const kind = rawKind.length === 0 ? 'other' : (KINDS.has(rawKind) ? rawKind : 'other')
      const tags = Array.isArray(args.tags)
        ? args.tags.filter(t => typeof t === 'string' && t.trim().length > 0).map(t => t.trim())
        : []
      return enqueueWrite(async () => {
        const entries = await readStore(storePath)
        const now = new Date().toISOString()
        const existing = entries.find(entry => entry.content === content)
        if (existing !== undefined) {
          existing.updatedAt = now
          existing.kind = kind
          existing.tags = tags
          await writeStore(storeDir, storePath, entries)
          return { id: existing.id, saved: true, total: entries.length }
        }
        const entry = { id: randomUUID(), content, kind, tags, createdAt: now, updatedAt: now }
        entries.push(entry)
        if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
        await writeStore(storeDir, storePath, entries)
        return { id: entry.id, saved: true, total: entries.length }
      })
    },
  })

  ctx.tools.register({
    name: 'memory_recall',
    description:
      '回忆本地保存的记忆（凭据、偏好、事实等）。按关键词匹配内容与标签，'
      + '返回相关条目。数据只从本机 $DSH_HOME/memory/memory.json 读取。',
    parameters: compilePropertyMap({
      query: { type: 'string', required: true, description: '检索关键词，例如 "github 用户名" 或 "代码风格偏好"' },
      kind: { type: 'string', description: '只返回该类别（credential/preference/fact/other）' },
      limit: { type: 'number', description: '最多返回条数，默认 5，最大 20' },
    }),
    output: {
      schema: compileValue({
        type: 'object',
        additionalProperties: false,
        properties: {
          entries: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                content: { type: 'string', required: true },
                kind: { type: 'string', required: true },
                tags: { type: 'array', items: { type: 'string' }, required: true },
                updatedAt: { type: 'string', required: true },
              },
            },
          },
        },
      }),
      render: (_args, value) => value.entries.length === 0
        ? [{ type: 'text', text: '没有找到匹配的记忆。' }]
        : [{ type: 'text', text: value.entries.map(entry =>
            `[${entry.kind}] ${entry.content}${entry.tags.length > 0 ? '（标签: ' + entry.tags.join(', ') + '）' : ''}`,
          ).join('\n') }],
    },
    timeoutMs: TIMEOUT_MS,
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      if (query.length === 0) throw new Error('memory_recall: query 不能为空')
      const rawKind = typeof args.kind === 'string' ? args.kind.trim() : ''
      const kindFilter = rawKind.length > 0 && KINDS.has(rawKind) ? rawKind : undefined
      const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 20)
      const entries = await readStore(storePath)
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
      const scored = entries
        .filter(entry => kindFilter === undefined || entry.kind === kindFilter)
        .map(entry => {
          const haystack = (entry.content + ' ' + (entry.tags ?? []).join(' ')).toLowerCase()
          const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
          return { entry, score }
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
      return {
        entries: scored.map(item => ({
          id: item.entry.id,
          content: item.entry.content,
          kind: item.entry.kind ?? 'other',
          tags: item.entry.tags ?? [],
          updatedAt: item.entry.updatedAt,
        })),
      }
    },
  })

  ctx.tools.register({
    name: 'memory_forget',
    description:
      '删除一条本地记忆（按条目 id 或精确内容）。用于清理保存错误或不再需要的信息。',
    parameters: compilePropertyMap({
      id: { type: 'string', description: '要删除的条目 id（memory_recall 返回的 id）' },
      content: { type: 'string', description: '要删除的条目精确内容' },
    }),
    output: {
      schema: compileValue({
        type: 'object',
        additionalProperties: false,
        properties: {
          removed: { type: 'number', required: true },
          total: { type: 'number', required: true },
        },
      }),
      render: (_args, value) => [{ type: 'text', text: `已删除 ${value.removed} 条记忆（剩余 ${value.total} 条）` }],
    },
    timeoutMs: TIMEOUT_MS,
    isConcurrencySafe: () => false,
    execute: async (args) => {
      const id = typeof args.id === 'string' ? args.id.trim() : ''
      const content = typeof args.content === 'string' ? args.content.trim() : ''
      if (id.length === 0 && content.length === 0) {
        throw new Error('memory_forget: 需要提供 id 或 content')
      }
      return enqueueWrite(async () => {
        const entries = await readStore(storePath)
        const before = entries.length
        const kept = entries.filter(entry =>
          !(id.length > 0 && entry.id === id) && !(content.length > 0 && entry.content === content),
        )
        if (kept.length === before) return { removed: 0, total: before }
        await writeStore(storeDir, storePath, kept)
        return { removed: before - kept.length, total: kept.length }
      })
    },
  })
}
