'use strict'

/**
 * 影悦 · 本地环回多源影视海报可靠渲染代理服务 (Sidecar Loopback Proxy)
 *
 * 核心技术架构：
 * 1. 本地 127.0.0.1:23333 原生 HTTP 环回服务，Chromium 以原生规范管道加载海报；
 * 2. 结合阿里加密 DoH (223.5.5.5) 防伪造注入，智能获取干净直连真实 IP；
 * 3. 采用系统级 curl --resolve 原生引擎直接对接海外图床 CDN：
 *    - 彻底免疫 GFW UDP 53 / 28.0.0.x DNS 污染；
 *    - 彻底免疫 Electron / Node.js 底层 Socket 握手重置与 TLS 断连异常；
 *    - 支持 TLS 1.3 / ALPN / HTTP/2，穿透防盗链与图床防刷规则；
 * 4. In-flight 请求合流去重（Coalescing）：同 URL 并发仅请求一次远端；
 * 5. 严格魔数（Magic Bytes）校验，过滤非法截断与防盗链伪页；
 * 6. SHA-256 内容寻址磁盘持久化缓存（0ms 秒开，离线可用）。
 */

const http = require('node:http')
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')
const dnsModule = require('./dns')

let electronApp = null
try {
  electronApp = require('electron').app
} catch { }

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

// 真正阻断或非法的图床黑名单（如已被关停完全无响应的废弃域名）
const DEAD_HOSTS = []
// 缓存版本：旧版本按「无年份」补全过的海报可能张冠李戴，升级时整体作废一次
const CACHE_VERSION = 'v2'

function getCacheDir() {
  let dir
  try {
    const base = electronApp ? electronApp.getPath('userData') : path.join(__dirname, '..', 'data')
    dir = path.join(base, 'poster_cache')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  } catch {
    dir = path.join(__dirname, '..', 'data', 'poster_cache')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
  const marker = path.join(dir, `.${CACHE_VERSION}`)
  if (!fs.existsSync(marker)) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.cache')) fs.unlinkSync(path.join(dir, f))
      }
      fs.writeFileSync(marker, '')
    } catch {}
  }
  return dir
}

function isValidImage(buf) {
  if (!buf || buf.length < 128) return false
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true
  // WebP: RIFF ... WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf.length >= 12 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true
  }
  // GIF: GIF87a / GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true
  // AVIF / HEIF: ....ftyp
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    return true
  }
  // SVG
  const head = buf.subarray(0, 40).toString('utf8').toLowerCase()
  if (head.includes('<svg') || head.includes('<?xml')) return true
  return false
}

function detectMimeType(buf) {
  if (!buf || buf.length < 4) return 'image/jpeg'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp'
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif'
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'image/avif'
  return 'image/jpeg'
}

let server = null
let proxyPort = 0
let listenPromise = null
const memCache = new Map()
const inFlightMap = new Map()

class ConcurrencyQueue {
  constructor(limit = 8) {
    this.limit = limit
    this.running = 0
    this.queue = []
  }
  run(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      this.dequeue()
    })
  }
  dequeue() {
    if (this.running >= this.limit || !this.queue.length) return
    const { fn, resolve, reject } = this.queue.shift()
    this.running++
    fn()
      .then(resolve, reject)
      .finally(() => {
        this.running--
        this.dequeue()
      })
  }
}
const upstreamQueue = new ConcurrencyQueue(24)

const sharedHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 64 })
const sharedHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64 })

function fetchViaCurl(targetUrl, timeoutMs = 3000) {
  return new Promise(async (resolve, reject) => {
    let u
    try {
      u = new URL(targetUrl)
    } catch (e) {
      return reject(e)
    }

    const ips = await dnsModule.getCleanIps(u.hostname)
    const args = [
      '-s',
      '-L',
      '--connect-timeout',
      '2',
      '--max-time',
      String(Math.min(4, Math.ceil(timeoutMs / 1000))),
      '-H',
      `Host: ${u.hostname}`,
      '-H',
      `Referer: ${u.hostname.includes('doubanio.com') ? 'https://movie.douban.com/' : `${u.protocol}//${u.hostname}/`}`,
      '-A',
      UA,
    ]

    if (ips && Array.isArray(ips) && ips.length) {
      for (const ip of ips.slice(0, 3)) {
        args.push('--resolve', `${u.hostname}:443:${ip}`)
        args.push('--resolve', `${u.hostname}:80:${ip}`)
      }
    }

    args.push(targetUrl)

    execFile('curl', args, { encoding: 'buffer', maxBuffer: 15 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err)
      if (!stdout || stdout.length < 128) return reject(new Error('Empty payload'))
      if (!isValidImage(stdout)) return reject(new Error('Invalid image payload'))
      const type = detectMimeType(stdout)
      resolve({ buf: stdout, type })
    })
  })
}

async function fetchViaNode(targetUrl, timeoutMs = 5000) {
  let u = new URL(targetUrl)
  const ips = await dnsModule.getCleanIps(u.hostname)
  const candidates = ips && ips.length ? ips.slice(0, 3) : [u.hostname]
  const isHttps = u.protocol === 'https:'
  const port = u.port ? Number(u.port) : isHttps ? 443 : 80

  let lastErr = null
  for (const hostTarget of candidates) {
    try {
      const client = isHttps ? https : http
      return await new Promise((resolve, reject) => {
        const req = client.request(
          {
            host: hostTarget,
            port: port,
            path: u.pathname + u.search,
            method: 'GET',
            headers: {
              Host: u.hostname,
              'User-Agent': UA,
              Referer: u.hostname.includes('doubanio.com') ? 'https://movie.douban.com/' : `${u.protocol}//${u.hostname}/`,
              Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
            agent: isHttps ? sharedHttpsAgent : sharedHttpAgent,
            servername: isHttps ? u.hostname : undefined,
            rejectUnauthorized: false,
            timeout: timeoutMs,
          },
          (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              const nextUrl = new URL(res.headers.location, targetUrl).toString()
              return fetchViaNode(nextUrl, timeoutMs).then(resolve, reject)
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`HTTP ${res.statusCode}`))
            }
            const chunks = []
            res.on('data', (c) => chunks.push(c))
            res.on('end', () => {
              const buf = Buffer.concat(chunks)
              if (!isValidImage(buf)) return reject(new Error('Invalid image payload'))
              const type = detectMimeType(buf)
              resolve({ buf, type })
            })
          }
        )
        req.on('error', reject)
        req.on('timeout', () => {
          req.destroy()
          reject(new Error('timeout'))
        })
        req.end()
      })
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('Fetch failed')
}

async function fetchFromUpstream(targetUrl, timeoutMs = 3000) {
  if (inFlightMap.has(targetUrl)) {
    return inFlightMap.get(targetUrl)
  }

  const taskPromise = upstreamQueue.run(async () => {
    try {
      return await fetchViaCurl(targetUrl, timeoutMs)
    } catch (err) {
      // 备用协议快速退避尝试：Node 原生直连（极速限时 1.5s）
      try {
        return await fetchViaNode(targetUrl, 1500)
      } catch {
        throw err
      }
    }
  }).finally(() => {
    inFlightMap.delete(targetUrl)
  })

  inFlightMap.set(targetUrl, taskPromise)
  return taskPromise
}

function start() {
  if (server && proxyPort > 0) return Promise.resolve(proxyPort)
  if (listenPromise) return listenPromise
  // 启动后 5 秒在后台修剪磁盘缓存，不阻塞首屏
  setTimeout(() => pruneDiskCacheLru(), 5000).unref?.()

  listenPromise = new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      let parsed
      try {
        parsed = new URL(req.url, `http://127.0.0.1:${proxyPort || 80}`)
      } catch {
        res.writeHead(400)
        res.end('Bad Request')
        return
      }

      if (parsed.pathname === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('pong')
        return
      }

      let targetUrl = parsed.searchParams.get('url')
      const title = parsed.searchParams.get('title') || ''
      if (!targetUrl) {
        res.writeHead(404)
        res.end('Missing url')
        return
      }

      if (targetUrl.startsWith('//')) targetUrl = 'https:' + targetUrl
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        res.writeHead(400)
        res.end('Invalid protocol')
        return
      }

      // 屏蔽历史图搜广告（360/百度图搜汽车、家具等）并直接触发专业影视库自愈
      const isSearchEngineAd =
        targetUrl.includes('qhimgs1.com') ||
        targetUrl.includes('image.so.com') ||
        targetUrl.includes('image.baidu.com')

      if (!isSearchEngineAd) {
        // 1. 内存缓存 (0ms)
        const memHit = memCache.get(targetUrl)
        if (memHit) {
          res.writeHead(200, {
            'Content-Type': memHit.type,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Cache': 'HIT-MEM',
          })
          res.end(memHit.buf)
          return
        }

        // 2. 磁盘持久化缓存 (0ms)
        const hash = crypto.createHash('sha256').update(targetUrl).digest('hex')
        const cacheFile = path.join(getCacheDir(), `${hash}.cache`)
        if (fs.existsSync(cacheFile)) {
          try {
            const stat = fs.statSync(cacheFile)
            if (stat.size > 128) {
              const buf = fs.readFileSync(cacheFile)
              if (isValidImage(buf)) {
                const type = detectMimeType(buf)
                if (memCache.size < 1000) memCache.set(targetUrl, { buf, type })
                res.writeHead(200, {
                  'Content-Type': type,
                  'Cache-Control': 'public, max-age=31536000, immutable',
                  'X-Cache': 'HIT-DISK',
                })
                res.end(buf)
                return
              }
            }
          } catch {
            /* 继续向远端请求 */
          }
        }
      }

      const hash = crypto.createHash('sha256').update(targetUrl).digest('hex')
      const cacheFile = path.join(getCacheDir(), `${hash}.cache`)

      // 3. 远端拉取并存盘
      try {
        if (isSearchEngineAd || DEAD_HOSTS.some((h) => targetUrl.includes(h))) throw new Error('Untrusted or broken upstream image domain')
        const result = await fetchFromUpstream(targetUrl, 3000)

        // 自动侦测并替换 CMS 爬虫生成的低清紫灰网格文字图（如 120x160 假海报）
        const isDummyCmsPoster =
          result.buf.length < 18 * 1024 &&
          (result.type === 'image/avif' || targetUrl.includes('20260802-1') || targetUrl.includes('placeholder'))
        if (isDummyCmsPoster && title) {
          throw new Error('Dummy CMS low-res placeholder')
        }

        if (memCache.size > 1500) {
          const firstKey = memCache.keys().next().value
          memCache.delete(firstKey)
        }
        memCache.set(targetUrl, result)

        fs.writeFile(cacheFile, result.buf, () => { })

        res.writeHead(200, {
          'Content-Type': result.type,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Cache': 'MISS',
        })
        res.end(result.buf)
      } catch (err) {
        // 4. 断链自愈：远端超时、404 或低清占位图时，自动升级为豆瓣电影官方原版超清海报
        if (title) {
          try {
            const metadata = require('./metadata')
            const domesticUrl = await metadata.scrapeDomesticPoster(title, parsed.searchParams.get('year') || '')
            if (domesticUrl && domesticUrl !== targetUrl) {
              const domesticRes = await fetchFromUpstream(domesticUrl, 3000)
              if (isValidImage(domesticRes.buf)) {
                memCache.set(targetUrl, domesticRes)
                fs.writeFile(cacheFile, domesticRes.buf, () => { })
                res.writeHead(200, {
                  'Content-Type': domesticRes.type,
                  'Cache-Control': 'public, max-age=31536000, immutable',
                  'X-Cache': 'HEALED-DOMESTIC',
                })
                res.end(domesticRes.buf)
                return
              }
            }
          } catch {
            /* 降级亦失败则回退 404 */
          }
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Poster not found or upstream unreachable')
      }
    })

    function tryBind(ports, idx = 0) {
      if (idx >= ports.length) {
        server.listen(0, '127.0.0.1', () => {
          proxyPort = server.address().port
          resolve(proxyPort)
        })
        return
      }
      const port = ports[idx]
      const onErr = (err) => {
        if (err.code === 'EADDRINUSE') {
          tryBind(ports, idx + 1)
        } else {
          listenPromise = null
          reject(err)
        }
      }
      server.once('error', onErr)
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', onErr)
        proxyPort = server.address().port
        resolve(proxyPort)
      })
    }

    tryBind([23333, 23334, 23335])
  })

  return listenPromise
}

function getPort() {
  return proxyPort
}

function getProxyBase() {
  return `http://127.0.0.1:${proxyPort}/img?url=`
}

function stop() {
  if (server) {
    server.close()
    server = null
    proxyPort = 0
    listenPromise = null
  }
}

const MAX_DISK_CACHE_BYTES = 500 * 1024 * 1024 // 500MB 磁盘 LRU 上限

function getImageDimensions(buf) {
  if (!buf || buf.length < 16) return null
  try {
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }
    // GIF
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
    }
    // WebP
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf.length >= 30) {
      const tag = buf.subarray(12, 16).toString('ascii')
      if (tag === 'VP8X' && buf.length >= 30) {
        const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16))
        const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16))
        return { width, height }
      }
      if (tag === 'VP8 ' && buf.length >= 30) {
        const width = buf.readUInt16LE(26) & 0x3fff
        const height = buf.readUInt16LE(28) & 0x3fff
        return { width, height }
      }
    }
    // JPEG
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2
      while (offset < buf.length - 8) {
        if (buf[offset] !== 0xff) { offset++; continue }
        const marker = buf[offset + 1]
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
          const height = buf.readUInt16BE(offset + 5)
          const width = buf.readUInt16BE(offset + 7)
          return { width, height }
        }
        const len = buf.readUInt16BE(offset + 2)
        offset += 2 + len
      }
    }
  } catch {}
  return null
}

function pruneDiskCacheLru(maxBytes = MAX_DISK_CACHE_BYTES) {
  try {
    const dir = getCacheDir()
    if (!fs.existsSync(dir)) return { totalSize: 0, pruned: 0 }
    const files = fs.readdirSync(dir)
    let totalSize = 0
    const fileStats = []

    for (const f of files) {
      if (!f.endsWith('.cache')) continue
      const fullPath = path.join(dir, f)
      try {
        const stat = fs.statSync(fullPath)
        totalSize += stat.size
        fileStats.push({ path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs })
      } catch {}
    }

    if (totalSize <= maxBytes) return { totalSize, pruned: 0 }

    // LRU: 最久未更新的文件排在前面优先清理
    fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs)

    let prunedCount = 0
    let currentSize = totalSize
    const targetSize = Math.floor(maxBytes * 0.8)

    for (const file of fileStats) {
      if (currentSize <= targetSize) break
      try {
        fs.unlinkSync(file.path)
        currentSize -= file.size
        prunedCount++
      } catch {}
    }

    return { totalSize: currentSize, pruned: prunedCount }
  } catch (err) {
    return { totalSize: 0, pruned: 0, error: err.message }
  }
}

module.exports = {
  start,
  stop,
  getPort,
  getProxyBase,
  isValidImage,
  detectMimeType,
  getImageDimensions,
  pruneDiskCacheLru,
  MAX_DISK_CACHE_BYTES,
}
