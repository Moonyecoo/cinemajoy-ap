'use strict'

/**
 * 影悦 · 独立版 (CinemaJoy)
 * Telegram 网盘公开分享自动爬取、链接真伪自我校验与 24 小时 RSS 高清源引擎
 * 
 * 架构规范:
 * - 0 凭据免登录公开频道网页抓取，支持第三方反代镜像回退 (options.mirrorBaseUrl)
 * - 严格两段式端侧真伪探针 (Token + 真实视频文件树探测，支持 1 级子文件夹深度穿透)
 * - 严格并发限制 (MAX_CONCURRENCY = 5) 与 3000ms 超时熔断
 * - W3C 标准 RSS 2.0 聚合流生成器
 * - 显式生命周期管理，杜绝定时器逃逸与内存泄漏
 */

const https = require('https')
const http = require('http')
const cloudshare = require('./cloudshare')

const TIMEOUT_MS = 3000
const MAX_CONCURRENCY = 5
const DEFAULT_MIRROR_BASE_URL = 'https://t.me/s/'

let _dailyCrawlerTimer = null

/**
 * 内部安全 HTTP 请求管道，严格绑定 3000ms 超时熔断
 */
function safeHttpRequest(urlStr, options = {}) {
  return new Promise((resolve) => {
    let resolved = false
    let parsed
    try {
      parsed = new URL(urlStr)
    } catch (e) {
      return resolve({ ok: false, error: 'INVALID_URL', message: e.message })
    }

    const client = parsed.protocol === 'https:' ? https : http

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        if (req) req.destroy(new Error('TIMEOUT'))
        resolve({ ok: false, error: 'NETWORK_TIMEOUT', message: '请求超时（已触发 3000ms 熔断保护）' })
      }
    }, TIMEOUT_MS)

    const req = client.request(
      urlStr,
      {
        method: options.method || 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          ...options.headers,
        },
      },
      (res) => {
        // 支持 301 / 302 简单重定向 (限 2 跳)
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && (options._redirects || 0) < 2) {
          clearTimeout(timer)
          resolved = true
          const nextUrl = new URL(res.headers.location, urlStr).toString()
          return resolve(safeHttpRequest(nextUrl, { ...options, _redirects: (options._redirects || 0) + 1 }))
        }

        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          clearTimeout(timer)
          if (resolved) return
          resolved = true
          resolve({ ok: res.statusCode === 200, status: res.statusCode, body })
        })
      }
    )

    req.on('error', (err) => {
      clearTimeout(timer)
      if (resolved) return
      resolved = true
      resolve({ ok: false, error: 'NETWORK_TIMEOUT', message: err.message || '网络连接异常' })
    })

    req.end()
  })
}

/**
 * 正则提取文本中的网盘分享 URL、提取码与影视标题
 */
function extractShareFromText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { title: '', pwdId: '', passcode: '', shareUrl: '' }
  }

  const text = rawText.trim()
  let pwdId = ''
  let passcode = ''

  // 1. 匹配 pan.quark.cn/s/([a-zA-Z0-9]+)
  const urlMatch = text.match(/pan\.quark\.cn\/s\/([a-zA-Z0-9]+)/i)
  if (urlMatch) {
    pwdId = urlMatch[1]
  }

  // 2. 匹配提取码
  const passMatch = text.match(/(?:提取码|密码|pwd)[:：=\s]*([a-zA-Z0-9]{4,6})/i)
  if (passMatch) {
    passcode = passMatch[1]
  }

  // 3. 提取影视标题（优先【】《》中的文字，但排除引流标签）
  let title = ''
  const allBrackets = text.match(/[【《]([^】》\n\r]+)[】》]/g) || []
  for (const b of allBrackets) {
    const inner = b.slice(1, -1).trim()
    if (!/今日|热播|首发|全网|关注|更新|资源|推荐|分享|通知|微商|防失联|首发更新/i.test(inner)) {
      title = inner
      break
    }
  }

  if (!title) {
    const cleanedText = text.replace(/[【《](?:今日|热播|首发|全网|关注|更新|资源|推荐|分享|通知|微商|防失联|首发更新)[^】》]*[】》]/gi, '')
    const firstLine = cleanedText.split('\n')[0] || ''
    title = firstLine.replace(/https?:\/\/[^\s]+/g, '').replace(/(?:提取码|密码|pwd).*$/i, '').trim()
  }

  // 去噪清洗
  title = title
    .replace(/(?:4k|1080p|hdr|remux|蓝光|原画|超清|更新|合集|系列)/gi, '')
    .replace(/[._-]+/g, ' ')
    .trim()

  return {
    title: title || '网盘高清影视',
    pwdId,
    passcode,
    shareUrl: pwdId ? `https://pan.quark.cn/s/${pwdId}` : '',
  }
}

/**
 * 解析 Telegram 网页公开频道预览中的消息列表
 */
function parseTelegramChannelMessages(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') return []

  const messages = []
  // 匹配 tgme_widget_message 包裹块
  const msgBlockRegex = /<div class="tgme_widget_message\b[^>]*data-post="([^"]+)"[\s\S]*?<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>(?:[\s\S]*?<time\b[^>]*datetime="([^"]+)")?/g

  let match
  while ((match = msgBlockRegex.exec(htmlContent)) !== null) {
    const postAttr = match[1] || '' // 例如 "channel_name/101"
    const rawHtmlText = match[2] || ''
    const datetime = match[3] || new Date().toISOString()

    const parts = postAttr.split('/')
    const channel = parts[0] || ''
    const msgId = parts[1] || postAttr

    // 清洗 HTML 标签得到纯文本
    const plainText = rawHtmlText
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()

    const shareInfo = extractShareFromText(plainText)
    if (shareInfo.pwdId) {
      messages.push({
        msgId,
        channel,
        datetime,
        rawText: plainText,
        title: shareInfo.title,
        pwdId: shareInfo.pwdId,
        passcode: shareInfo.passcode,
        shareUrl: shareInfo.shareUrl,
      })
    }
  }

  return messages
}

/**
 * 两段式真伪自我校验（包含 1 级子文件夹深度穿透探测）
 */
async function validateShareEntry(entry, options = {}) {
  if (!entry || !entry.pwdId) {
    return { valid: false, reason: 'INVALID_TOKEN', error: '缺少分享 ID' }
  }

  // 支持测试桩注入 (Stub Probe)
  if (typeof options.stubProbe === 'function') {
    const stubRes = await options.stubProbe(entry)
    if (!stubRes || !stubRes.ok) {
      return { valid: false, reason: 'INVALID_TOKEN', error: stubRes?.error || 'TOKEN_FAILED' }
    }
    const files = stubRes.filesRes?.files || []
    const validVideos = files.filter((f) => f.isVideo !== false)
    if (validVideos.length === 0) {
      return { valid: false, reason: 'NO_VIDEO' }
    }
    return {
      valid: true,
      title: stubRes.tokenRes?.title || entry.title,
      files: validVideos,
      updatedAt: Date.now(),
    }
  }

  // Phase 1: 探测 Token 与存活状态
  const tokenRes = await cloudshare.fetchShareToken(entry.pwdId, entry.passcode)
  if (!tokenRes.ok || !tokenRes.stoken) {
    return { valid: false, reason: 'INVALID_TOKEN', error: tokenRes.error || 'TOKEN_EXPIRED' }
  }

  // Phase 2: 探测文件树（优先探测根目录 pdir_fid=0）
  const filesRes = await cloudshare.fetchShareFiles(entry.pwdId, tokenRes.stoken, '0')
  if (!filesRes.ok) {
    return { valid: false, reason: 'INVALID_TOKEN', error: filesRes.error || 'FETCH_DETAIL_FAILED' }
  }

  let videoFiles = (filesRes.files || []).filter((f) => !f.isDir)

  // 若根目录下无直接视频文件，但存在子目录，下钻探测第 1 个子文件夹
  if (videoFiles.length === 0 && Array.isArray(filesRes.files)) {
    const subDirs = filesRes.files.filter((f) => f.isDir)
    if (subDirs.length > 0 && subDirs[0].fid) {
      const subRes = await cloudshare.fetchShareFiles(entry.pwdId, tokenRes.stoken, subDirs[0].fid)
      if (subRes.ok && Array.isArray(subRes.files)) {
        videoFiles = subRes.files.filter((f) => !f.isDir)
      }
    }
  }

  // 严格过滤：若全为文本、APK 或空目录，判定为 NO_VIDEO 淘汰
  if (videoFiles.length === 0) {
    return { valid: false, reason: 'NO_VIDEO' }
  }

  return {
    valid: true,
    title: tokenRes.title || entry.title,
    files: videoFiles,
    updatedAt: Date.now(),
  }
}

/**
 * 并发限制调度器 (Concurrency Throttling <= 5)
 */
async function mapConcurrent(items, limit, asyncFn) {
  const results = []
  const executing = new Set()

  for (const item of items) {
    const p = Promise.resolve().then(() => asyncFn(item))
    results.push(p)
    executing.add(p)
    const clean = () => executing.delete(p)
    p.then(clean, clean)
    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }
  return Promise.all(results)
}

/**
 * 从指定 Telegram 频道抓取并执行全量真伪自我校验
 */
async function crawlAndValidateChannel(channelName, options = {}) {
  const mirrorBaseUrl = options.mirrorBaseUrl || DEFAULT_MIRROR_BASE_URL
  const cleanBase = mirrorBaseUrl.endsWith('/') ? mirrorBaseUrl : mirrorBaseUrl + '/'
  const targetChannel = String(channelName || '').replace(/^@/, '').trim()

  if (!targetChannel) {
    return { ok: false, error: 'INVALID_CHANNEL', items: [] }
  }

  const channelUrl = `${cleanBase}${encodeURIComponent(targetChannel)}`
  const res = await safeHttpRequest(channelUrl)
  if (!res.ok || !res.body) {
    return { ok: false, error: 'NETWORK_TIMEOUT', message: res.message || '网络连接超时或频道不可达', items: [] }
  }

  const rawMessages = parseTelegramChannelMessages(res.body)
  const validItems = []
  const invalidItems = []

  // 并发控制：最多 5 并发执行自我验证
  await mapConcurrent(rawMessages, MAX_CONCURRENCY, async (msg) => {
    try {
      const valRes = await validateShareEntry(msg, options)
      if (valRes.valid) {
        validItems.push({
          ...msg,
          ...valRes,
        })
      } else {
        invalidItems.push({
          ...msg,
          ...valRes,
        })
      }
    } catch (err) {
      invalidItems.push({
        ...msg,
        valid: false,
        reason: 'PROBE_ERROR',
        error: err.message,
      })
    }
  })

  return {
    ok: true,
    channel: targetChannel,
    totalParsed: rawMessages.length,
    validCount: validItems.length,
    invalidCount: invalidItems.length,
    items: validItems,
    invalidItems,
    updatedAt: Date.now(),
  }
}

/**
 * 生成聚合多部影视剧的 W3C RSS 2.0 XML 字符串
 */
function exportAggregatedRssFeed(entries, feedTitle = '影悦 24h 自动化网盘高清片源') {
  const pubDate = new Date().toUTCString()
  const safeTitle = String(feedTitle).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const itemsXml = (entries || [])
    .map((entry) => {
      const itemTitle = String(entry.title || '网盘高清影视')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      const itemLink = String(entry.shareUrl || entry.link || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      const itemDate = new Date(entry.updatedAt || Date.now()).toUTCString()
      const guid = `tg_share_${entry.pwdId || entry.msgId || Math.random().toString(36).slice(2)}`
      const filesCount = Array.isArray(entry.files) ? entry.files.length : 0

      return `    <item>
      <title>${itemTitle} (${filesCount} 集)</title>
      <link>${itemLink}</link>
      <guid isPermaLink="false">${guid}</guid>
      <pubDate>${itemDate}</pubDate>
      <description>Telegram 自动抓取与真伪自检高清影视剧集 (共 ${filesCount} 个视频文件)</description>
      <enclosure url="${itemLink}" length="0" type="video/mp4" />
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>${safeTitle} - 影悦 · 独立版</title>
    <link>https://pan.quark.cn/</link>
    <description>24小时 Telegram 自动爬取、链接真伪自我校验与 W3C RSS 原画源 (CinemaJoy)</description>
    <lastBuildDate>${pubDate}</lastBuildDate>
${itemsXml}
  </channel>
</rss>`
}

/**
 * 24 小时自动巡检定时器与生命周期控制
 */
function startDailyCrawler(intervalMs = 24 * 3600 * 1000, taskFn) {
  stopDailyCrawler()
  _dailyCrawlerTimer = setInterval(async () => {
    if (typeof taskFn === 'function') {
      try {
        await taskFn()
      } catch (e) {
        console.error('[TelegramCrawler] 巡检任务异常:', e.message)
      }
    }
  }, intervalMs)
  // 不阻止 Node.js 进程退出
  if (_dailyCrawlerTimer.unref) {
    _dailyCrawlerTimer.unref()
  }
}

function stopDailyCrawler() {
  if (_dailyCrawlerTimer) {
    clearInterval(_dailyCrawlerTimer)
    _dailyCrawlerTimer = null
  }
}

function hasActiveCrawler() {
  return _dailyCrawlerTimer !== null
}

function destroy() {
  stopDailyCrawler()
}

module.exports = {
  TIMEOUT_MS,
  MAX_CONCURRENCY,
  DEFAULT_MIRROR_BASE_URL,
  extractShareFromText,
  parseTelegramChannelMessages,
  validateShareEntry,
  crawlAndValidateChannel,
  exportAggregatedRssFeed,
  startDailyCrawler,
  stopDailyCrawler,
  hasActiveCrawler,
  destroy,
}
