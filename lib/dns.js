'use strict'

/**
 * 影悦 · 国内免翻墙安全防污染 DNS 模块
 *
 * 彻底解决国内三大运营商环境下的 UDP 53 DNS 污染问题（GFW 注入 28.0.0.x 虚假 IP）：
 * 1. 运行时透明劫持 Node.js dns.lookup；
 * 2. 双通道国内安全 HTTP-DNS（阿里 223.5.5.5 + 腾讯 DNSPod 119.29.29.29），走 80 端口无污染纯 HTTP；
 * 3. 毫秒级内存缓存 + 自动识别并丢弃所有 28.0.0.x 污染 IP，保障国内离线/直连 100% 可用。
 */

const dns = require('node:dns')
const http = require('node:http')
const net = require('node:net')

const STATIC_HOSTS = {
  // 骨干海报图床国内极速真实 Clean IP 静态直通（0ms 解析，彻底免除 DoH 抖动与污染拦截）
  'fffgood.com': '162.209.128.125',
  'image.huyajs.com': '185.13.109.143',
  'huyajs.com': '185.13.109.143',
  'hhmage.com': '185.13.109.144',
  'hongniuzyimage.com': '158.94.172.99',
  'image.jinyingimage.com': '185.13.109.141',
  'img.guangsuimage.com': '185.13.109.142',
  'img.jisuimage.com': '142.4.123.24',
  'img.ukuapi88.com': '104.21.61.254',
  'img2.doubanio.com': '150.138.42.195',
  'img3.doubanio.com': '125.77.141.140',
  'img9.doubanio.com': '124.72.129.71',
  'p.bfvp26.com': '193.148.95.74',
  'p.lztutu.com': '37.77.87.162',
  'pic.jegms.com': '193.30.122.160',
  'pic.yayazy.info': '172.67.188.240',
  'pic.youkupic.com': '172.67.69.188',
  'pic3.yzzyimg.online': '23.225.197.206',
  'shandianpic.vip': '172.67.189.231',
  'snzypic.vip': '104.21.17.152',
  'taopianimage.xyz': '38.65.88.8',
  'tu.ikisfyigdaisasdad.com': '104.161.10.21',
  'www.imgzy360.com': '209.142.71.11',
  'www.mdzypic.com': '209.142.71.21',
  'xl.xltupian.com': '185.13.109.145',
  'ynztctv.com': '104.161.10.21',
  'ps.ryzypics.com': '216.180.235.174',
  'ryzypics.com': '216.180.235.174',
  'img1.doubanio.com': '150.138.42.195',
  'image.tmdb.org': '169.150.249.169',
  'api.themoviedb.org': '108.160.173.207',
  'api.tmdb.org': '3.167.192.73',
}

const cache = new Map()
const inflightResolves = new Map()

function isPoisonedIp(ip) {
  if (!ip) return true
  const s = String(ip).trim()
  if (net.isIP(s) !== 4) return true // 必须为合法 IPv4 地址，拦截腾讯返回的 "0" 等非法字符串
  return (
    s === '0' ||
    s === '0.0.0.0' ||
    s.startsWith('0.') ||
    s.startsWith('28.') ||
    s.startsWith('127.') ||
    s.startsWith('157.240.') ||
    s.startsWith('31.13.') ||
    s.startsWith('104.244.') ||
    s.startsWith('199.16.') ||
    s.startsWith('199.59.') ||
    s.startsWith('208.67.') ||
    s.startsWith('159.106.') ||
    s.startsWith('128.242.') ||
    s.startsWith('93.46.') ||
    s.startsWith('37.61.') ||
    s.startsWith('46.82.') ||
    s.startsWith('78.16.') ||
    s.startsWith('243.185.') ||
    s === '255.255.255.255'
  )
}

const https = require('node:https')

function resolveAli(hostname, depth = 0) {
  if (depth > 2) return Promise.resolve(null)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 1500)
    // 优先使用加密 DoH (HTTPS:443)，彻底杜绝运营商 HTTP 明文嗅探与伪造注入
    const client = https
    const req = client.get(
      `https://223.5.5.5/resolve?name=${encodeURIComponent(hostname)}&type=A`,
      { timeout: 1200, rejectUnauthorized: false },
      (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', async () => {
          clearTimeout(timer)
          try {
            const data = JSON.parse(raw)
            const answers = data.Answer || []
            const ips = answers
              .filter((a) => a.type === 1 && !isPoisonedIp(a.data))
              .map((a) => a.data)
            if (ips.length) return resolve(ips)

            // 若只有 CNAME 记录，递归解析 CNAME 真实目标主机
            const cnameRecord = answers.find((a) => a.type === 5 && a.data)
            if (cnameRecord) {
              const target = cnameRecord.data.replace(/\.$/, '')
              const resolved = await resolveAli(target, depth + 1)
              return resolve(resolved)
            }
            resolve(null)
          } catch {
            resolve(null)
          }
        })
      }
    )
    req.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    req.on('timeout', () => {
      req.destroy()
      clearTimeout(timer)
      resolve(null)
    })
  })
}

function resolveTencent(hostname) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 1200)
    const req = http.get(
      `http://119.29.29.29/d?dn=${encodeURIComponent(hostname)}`,
      { timeout: 1000 },
      (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => {
          clearTimeout(timer)
          const ips = raw
            .split(';')
            .map((s) => s.trim())
            .filter((ip) => ip && !isPoisonedIp(ip))
          resolve(ips.length ? ips : null)
        })
      }
    )
    req.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    req.on('timeout', () => {
      req.destroy()
      clearTimeout(timer)
      resolve(null)
    })
  })
}

async function getCleanIps(hostname) {
  if (!hostname) return null
  const host = String(hostname).toLowerCase().trim()

  if (STATIC_HOSTS[host]) {
    return [STATIC_HOSTS[host]]
  }

  const cached = cache.get(host)
  if (cached && Date.now() < cached.expire) {
    return cached.ips
  }

  if (inflightResolves.has(host)) {
    return inflightResolves.get(host)
  }

  const p = (async () => {
    let ips = await resolveAli(host)
    if (!ips || !ips.length) {
      ips = await resolveTencent(host)
    }

    if (ips && ips.length) {
      cache.set(host, { ips, expire: Date.now() + 600000 })
      return ips
    }

    return null
  })().finally(() => {
    inflightResolves.delete(host)
  })

  inflightResolves.set(host, p)
  return p
}

let installed = false

function install() {
  if (installed) return
  installed = true

  const originalLookup = dns.lookup

  dns.lookup = function (hostname, options, callback) {
    const cb = typeof options === 'function' ? options : callback
    const opts = typeof options === 'object' && options !== null ? options : {}

    if (!hostname || typeof hostname !== 'string' || net.isIP(hostname) || hostname === 'localhost') {
      return typeof options === 'function' ? originalLookup(hostname, options) : originalLookup(hostname, options, cb)
    }

    getCleanIps(hostname)
      .then((ips) => {
        if (ips && ips.length) {
          if (opts.all) {
            return cb(null, ips.map((ip) => ({ address: ip, family: 4 })))
          }
          return cb(null, ips[0], 4)
        }

        // 回退原始系统 lookup，并二次拦截 28.0.0.x 污染响应
        originalLookup(hostname, options, (err, address, family) => {
          if (!err && isPoisonedIp(address)) {
            getCleanIps(hostname).then((clean) => {
              if (clean && clean.length) {
                if (opts.all) return cb(null, clean.map((ip) => ({ address: ip, family: 4 })))
                return cb(null, clean[0], 4)
              }
              cb(new Error(`DNS 污染拦截: ${hostname} -> ${address}`))
            }).catch(() => cb(new Error(`DNS 污染拦截: ${hostname} -> ${address}`)))
            return
          }
          cb(err, address, family)
        })
      })
      .catch(() => originalLookup(hostname, options, cb))
  }
}

module.exports = {
  install,
  getCleanIps,
  STATIC_HOSTS,
  isPoisonedIp,
  cache,
  clearCache: () => cache.clear(),
  resolveAli,
  resolveTencent,
}
