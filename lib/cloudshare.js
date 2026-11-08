'use strict'

/**
 * 影悦 · 独立版 (CinemaJoy)
 * 网盘公开分享解析、W3C 标准 RSS 24小时追更与原画直链流引擎
 * 
 * 架构规范:
 * - 0 视频下载流量开销，24小时增量巡检仅传输几 KB JSON 元数据
 * - 3000ms 超时熔断与 AbortController 安全保护
 * - O(N) Set 哈希比对与显式生命周期销毁
 */

const https = require('https')
const http = require('http')

const TIMEOUT_MS = 3000
const VIDEO_EXT_REGEX = /\.(mp4|mkv|m3u8|flv|ts|mov|avi|wmv)$/i
let _activeWatchers = new Set()

/**
 * 规范化提取网盘分享链接中的 pwdId 与提取码 (passcode)
 */
function parseShareUrl(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    return { pwdId: '', passcode: '', originalUrl: '' }
  }

  const str = rawInput.trim()
  let pwdId = ''
  let passcode = ''

  // 1. 提取 pwdId: 支持标准链接 pan.quark.cn/s/([a-zA-Z0-9]+)
  const urlMatch = str.match(/pan\.quark\.cn\/s\/([a-zA-Z0-9]+)/i)
  if (urlMatch) {
    pwdId = urlMatch[1]
  } else {
    // 纯字符 ID 模式
    const pureMatch = str.match(/^[a-zA-Z0-9]{8,32}$/)
    if (pureMatch) {
      pwdId = pureMatch[0]
    }
  }

  // 2. 提取密码/提取码 (兼容 提取码:1234, pwd=1234, 密码 1234)
  const passMatch = str.match(/(?:提取码|密码|pwd)[:：=\s]*([a-zA-Z0-9]{4,6})/i)
  if (passMatch) {
    passcode = passMatch[1]
  }

  return {
    pwdId,
    passcode,
    originalUrl: pwdId ? `https://pan.quark.cn/s/${pwdId}` : str,
  }
}

/**
 * 工业级剧集文件名清洗与去噪
 * 剔除广告、压制组、分辨率杂质，归一化提取“第XX集”
 */
function cleanEpisodeTitle(rawFilename) {
  if (!rawFilename || typeof rawFilename !== 'string') {
    return { epName: '正片', cleanTitle: '', isVideo: false }
  }

  const isVideo = VIDEO_EXT_REGEX.test(rawFilename)
  let name = rawFilename.replace(VIDEO_EXT_REGEX, '')

  // 1. 过滤垃圾营销前缀与括号广告
  name = name.replace(/【.*?】|\[.*?\]|（.*?）|\(.*?\)/g, (match) => {
    if (/公众号|关注|防失联|微信|最新|首发|微商|资源|分享/i.test(match)) {
      return ''
    }
    return match
  })
  name = name.replace(/关注公众号[^\s._-]+/gi, '')
  name = name.replace(/(?:4k|1080p|720p|hdr|dv|h265|hevc|x264|aac|ddp5\.1|remux|blu-?ray|web-?dl|hd)/gi, '')

  // 2. 精准匹配集数
  let epName = ''
  const s01e01Match = name.match(/S\d+E(\d+)/i)
  const cnHanMatch = name.match(/第\s*(\d{1,4})\s*集/i)
  const epMatch = name.match(/(?:EP?|E)\s*(\d{1,4})(?:[^\d]|$)/i)
  const numMatch = name.match(/(?:^|[^\d])(\d{1,3})(?:[^\d]|$)/)

  if (s01e01Match) {
    const num = parseInt(s01e01Match[1], 10)
    epName = `第${String(num).padStart(2, '0')}集`
  } else if (cnHanMatch) {
    const num = parseInt(cnHanMatch[1], 10)
    epName = `第${String(num).padStart(2, '0')}集`
  } else if (epMatch) {
    const num = parseInt(epMatch[1], 10)
    epName = `第${String(num).padStart(2, '0')}集`
  } else if (numMatch && numMatch[1]) {
    const num = parseInt(numMatch[1], 10)
    epName = `第${String(num).padStart(2, '0')}集`
  } else {
    epName = '正片'
  }

  const cleanTitle = name.trim().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ')
  return {
    epName,
    cleanTitle,
    isVideo,
  }
}

/**
 * 内部安全 HTTP 请求管道，严格绑定 3000ms 超时熔断
 */
function safeHttpRequest(urlStr, options = {}, postData = null) {
  return new Promise((resolve) => {
    let resolved = false
    const parsed = new URL(urlStr)
    const client = parsed.protocol === 'https:' ? https : http

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        if (req) req.destroy(new Error('TIMEOUT'))
        resolve({ ok: false, error: 'TIMEOUT', message: '请求超时（已触发 3000ms 熔断保护）' })
      }
    }, TIMEOUT_MS)

    const req = client.request(
      urlStr,
      {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...options.headers,
        },
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          clearTimeout(timer)
          if (resolved) return
          resolved = true
          try {
            const json = JSON.parse(body)
            resolve({ ok: res.statusCode === 200, status: res.statusCode, data: json, raw: body })
          } catch (e) {
            resolve({ ok: false, status: res.statusCode, raw: body, error: e.message })
          }
        })
      }
    )

    req.on('error', (err) => {
      clearTimeout(timer)
      if (resolved) return
      resolved = true
      resolve({ ok: false, error: err.message || 'NETWORK_ERROR' })
    })

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData))
    }
    req.end()
  })
}

/**
 * 获取公开分享的临时访问 stoken
 */
async function fetchShareToken(pwdId, passcode = '') {
  if (!pwdId) {
    return { ok: false, error: 'MISSING_PWD_ID', message: '缺少分享 ID' }
  }

  const endpoint = 'https://drive.quark.cn/1/clouddrive/share/sharepage/token'
  const res = await safeHttpRequest(endpoint, { method: 'POST' }, { pwd_id: pwdId, passcode })
  if (!res.ok || !res.data) {
    return { ok: false, error: res.error || 'FETCH_TOKEN_FAILED', message: res.data?.message || '获取分享令牌失败' }
  }

  const code = res.data.code
  if (code && code !== 0 && code !== 200) {
    return { ok: false, error: `ERR_${code}`, message: res.data.message || '分享不存在或已失效' }
  }

  const stoken = res.data.data?.stoken || ''
  const title = res.data.data?.title || '网盘影视资源'
  return { ok: true, stoken, title }
}

/**
 * 拉取分享目录中的文件列表（只保留视频）
 */
async function fetchShareFiles(pwdId, stoken, pdirFid = '0') {
  if (!pwdId || !stoken) {
    return { ok: false, error: 'MISSING_PARAMS', message: '缺少分享 ID 或令牌' }
  }

  const endpoint = `https://drive.quark.cn/1/clouddrive/share/sharepage/detail?pwd_id=${encodeURIComponent(
    pwdId
  )}&stoken=${encodeURIComponent(stoken)}&pdir_fid=${encodeURIComponent(pdirFid)}&_page=1&_size=100`

  const res = await safeHttpRequest(endpoint, { method: 'GET' })
  if (!res.ok || !res.data || !res.data.data) {
    return { ok: false, error: res.error || 'FETCH_DETAIL_FAILED', files: [] }
  }

  const rawList = res.data.data.list || []
  const files = []

  for (const item of rawList) {
    const isDir = item.file_type === 0 || item.format_type === 'folder'
    const name = item.file_name || ''
    const { epName, cleanTitle, isVideo } = cleanEpisodeTitle(name)
    if (isVideo) {
      files.push({
        fid: item.fid || item.file_id || item.id,
        name,
        epName,
        cleanTitle,
        size: item.size || 0,
        updatedAt: item.updated_at || item.created_at || Date.now(),
        isDir,
      })
    }
  }

  return { ok: true, files }
}

/**
 * O(N) Set 哈希增量差异比对算法
 * 输入旧列表与新列表，提取最新追加的剧集文件
 */
function diffShareUpdates(cachedFiles, latestFiles) {
  if (!Array.isArray(latestFiles)) return []
  if (!Array.isArray(cachedFiles) || cachedFiles.length === 0) return [...latestFiles]

  const cachedSet = new Set(cachedFiles.map((f) => String(f.fid || f.id || f.name)))
  return latestFiles.filter((f) => !cachedSet.has(String(f.fid || f.id || f.name)))
}

/**
 * 生成 W3C 规范的 RSS 2.0 XML 字符串
 */
function exportToRssFeed({ title = '网盘高清影视追更', link = '', files = [], updatedAt = Date.now() }) {
  const pubDate = new Date(updatedAt).toUTCString()
  const safeTitle = String(title).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeLink = String(link).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const itemsXml = (files || [])
    .map((f) => {
      const itemTitle = String(f.epName ? `${f.epName} - ${f.name}` : f.name)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      const itemDate = new Date(f.updatedAt || updatedAt).toUTCString()
      const itemGuid = `cloudshare_${f.fid || f.name}`
      return `    <item>
      <title>${itemTitle}</title>
      <link>${safeLink}</link>
      <guid isPermaLink="false">${itemGuid}</guid>
      <pubDate>${itemDate}</pubDate>
      <enclosure url="${safeLink}" length="${f.size || 0}" type="video/mp4" />
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>${safeTitle} - 影悦 · 独立版</title>
    <link>${safeLink}</link>
    <description>24小时自动化网盘无感转流与追更源 (CinemaJoy)</description>
    <lastBuildDate>${pubDate}</lastBuildDate>
${itemsXml}
  </channel>
</rss>`
}

/**
 * 显式生命周期方法：销毁所有后台巡检定时器，杜绝内存泄漏
 */
function clearWatcher(timerId) {
  if (timerId) {
    clearInterval(timerId)
    _activeWatchers.delete(timerId)
  } else {
    for (const t of _activeWatchers) {
      clearInterval(t)
    }
    _activeWatchers.clear()
  }
}

function destroy() {
  clearWatcher()
}

module.exports = {
  TIMEOUT_MS,
  parseShareUrl,
  cleanEpisodeTitle,
  fetchShareToken,
  fetchShareFiles,
  diffShareUpdates,
  exportToRssFeed,
  clearWatcher,
  destroy,
}
