#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const WHITELIST_PATH = path.join(ROOT, 'data', 'domain-whitelist.json')

if (!fs.existsSync(WHITELIST_PATH)) {
  console.error('[Audit] 缺少域名白名单文件:', WHITELIST_PATH)
  process.exit(1)
}

const config = JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf8'))
const allowedSet = new Set(config.allowedDomains || [])
const forbiddenList = config.forbiddenDomains || []

const scanTargets = [
  path.join(ROOT, 'main.js'),
  path.join(ROOT, 'preload.js'),
  path.join(ROOT, 'package.json'),
]

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) {
      collectFiles(full)
    } else if (/\.(js|html|json)$/i.test(entry)) {
      scanTargets.push(full)
    }
  }
}

collectFiles(path.join(ROOT, 'lib'))
collectFiles(path.join(ROOT, 'src'))

const urlRegex = /https?:\/\/([a-zA-Z0-9\.\-_]+)/g
const foundHosts = new Map()
const violations = []

for (const file of scanTargets) {
  const relPath = path.relative(ROOT, file)
  const content = fs.readFileSync(file, 'utf8')

  // 1. 检查黑名单关键词
  for (const fHost of forbiddenList) {
    if (content.includes(fHost)) {
      violations.push({ file: relPath, host: fHost, reason: '包含严禁访问的境外阻断域名' })
    }
  }

  // 2. 检查正则匹配出来的 URL 域名
  let m
  while ((m = urlRegex.exec(content)) !== null) {
    const host = m[1].toLowerCase()
    // 过滤假域名如 x, a.jpg, b.jpg
    if (host.length <= 2 || host.endsWith('.jpg') || host.endsWith('.png')) continue

    if (!foundHosts.has(host)) {
      foundHosts.set(host, [])
    }
    foundHosts.get(host).push(relPath)

    // 检查是否在白名单中（支持主域名通配与精确匹配）
    const isAllowed =
      allowedSet.has(host) ||
      Array.from(allowedSet).some((allowed) => host === allowed || host.endsWith('.' + allowed))

    if (!isAllowed) {
      violations.push({ file: relPath, host, reason: '域名不在国内直连合规白名单中' })
    }
  }
}

console.log('================ 影悦网络自治与域名白名单审计 ================')
console.log(`已审计文件数: ${scanTargets.length}`)
console.log(`发现有效 Host: ${foundHosts.size} 个`)

if (violations.length > 0) {
  console.error('\n❌ 审计未通过！发现违规外网/阻断域名:')
  for (const v of violations) {
    console.error(` - [${v.file}] ${v.host} -> ${v.reason}`)
  }
  process.exit(1)
}

console.log('✅ 域名审计 100% 通过！所有网络请求均符合国内免 VPN 自治规范。')
process.exit(0)

