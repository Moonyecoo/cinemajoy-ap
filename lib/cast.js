'use strict'

/**
 * 影悦 · 投屏服务模块 (lib/cast.js)
 * 
 * 核心能力：
 * 1. DLNA / UPnP 局域网电视发现 (SSDP 组播多网卡搜索) 与 AVTransport 控制 (播放/暂停/停止/进度/音量)
 * 2. WebCast 本地轻量级 HTTP 串流服务端 (手机扫码看、平板/电视浏览器播放、局域网流转桥接)
 * 3. 纯原生零依赖 SVG 二维码生成器 (Byte 模式，支持任意 Wi-Fi 局域网 URL)
 */

const dgram = require('node:dgram')
const http = require('node:http')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const url = require('node:url')

// ---------------------------------------------------------------- 局域网 IP 与网络接口

function getLocalIps() {
  const nets = os.networkInterfaces()
  const ips = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address)
      }
    }
  }
  return ips.length ? ips : ['127.0.0.1']
}

function getPrimaryIp() {
  const ips = getLocalIps()
  // 优先选取 192.168.x.x 或 10.x.x.x 等家庭局域网网段
  const preferred = ips.find((ip) => /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip))
  return preferred || ips[0]
}

// ---------------------------------------------------------------- 纯原生零依赖 QR Code 生成器 (SVG)

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
let gfX = 1
for (let i = 0; i < 255; i++) {
  GF_EXP[i] = gfX
  GF_EXP[i + 255] = gfX
  GF_LOG[gfX] = i
  gfX <<= 1
  if (gfX & 0x100) gfX ^= 0x11d
}
GF_LOG[0] = 0

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

function rsGeneratorPoly(degree) {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], GF_EXP[i])
      next[j + 1] ^= poly[j]
    }
    poly = next
  }
  return poly
}

function rsEncode(data, numEcc) {
  const gen = rsGeneratorPoly(numEcc)
  const res = new Uint8Array(numEcc)
  for (const b of data) {
    const factor = b ^ res[0]
    for (let j = 0; j < numEcc - 1; j++) {
      res[j] = res[j + 1] ^ gfMul(gen[j + 1], factor)
    }
    res[numEcc - 1] = gfMul(gen[numEcc], factor)
  }
  return res
}

const QR_VERSIONS = [
  null,
  { v: 1, size: 21, dataBytes: 16, ecBytes: 10, blocks: 1, align: [] },
  { v: 2, size: 25, dataBytes: 28, ecBytes: 16, blocks: 1, align: [6, 18] },
  { v: 3, size: 29, dataBytes: 44, ecBytes: 26, blocks: 1, align: [6, 22] },
  { v: 4, size: 33, dataBytes: 64, ecBytes: 18, blocks: 2, align: [6, 26] },
  { v: 5, size: 37, dataBytes: 86, ecBytes: 24, blocks: 2, align: [6, 30] },
  { v: 6, size: 41, dataBytes: 108, ecBytes: 16, blocks: 4, align: [6, 34] },
  { v: 7, size: 45, dataBytes: 124, ecBytes: 18, blocks: 4, align: [6, 22, 38] },
]

function generateQrSvg(text, moduleSize = 5, margin = 4) {
  try {
    const bytes = Buffer.from(text, 'utf8')
    let ver = null
    for (let v = 1; v < QR_VERSIONS.length; v++) {
      if (bytes.length + 2 <= QR_VERSIONS[v].dataBytes) {
        ver = QR_VERSIONS[v]
        break
      }
    }
    if (!ver) ver = QR_VERSIONS[QR_VERSIONS.length - 1]

    const bitBuf = []
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bitBuf.push((val >> i) & 1)
    }

    pushBits(0b0100, 4) // Byte mode
    pushBits(bytes.length, 8)
    for (const b of bytes) pushBits(b, 8)
    const totalDataBits = ver.dataBytes * 8
    const termLen = Math.min(4, totalDataBits - bitBuf.length)
    pushBits(0, termLen)
    while (bitBuf.length % 8 !== 0) bitBuf.push(0)
    const pad = [0xec, 0x11]
    let pIdx = 0
    while (bitBuf.length < totalDataBits) {
      pushBits(pad[pIdx % 2], 8)
      pIdx++
    }

    const dataBytes = new Uint8Array(ver.dataBytes)
    for (let i = 0; i < ver.dataBytes; i++) {
      let b = 0
      for (let j = 0; j < 8; j++) b = (b << 1) | bitBuf[i * 8 + j]
      dataBytes[i] = b
    }

    const blockSize = Math.floor(ver.dataBytes / ver.blocks)
    const dataBlocks = []
    const ecBlocks = []
    for (let i = 0; i < ver.blocks; i++) {
      const start = i * blockSize
      const end = i === ver.blocks - 1 ? ver.dataBytes : (i + 1) * blockSize
      const slice = dataBytes.slice(start, end)
      dataBlocks.push(slice)
      ecBlocks.push(rsEncode(slice, ver.ecBytes))
    }

    const finalStream = []
    const maxBlockLen = Math.max(...dataBlocks.map((b) => b.length))
    for (let i = 0; i < maxBlockLen; i++) {
      for (const b of dataBlocks) {
        if (i < b.length) finalStream.push(b[i])
      }
    }
    for (let i = 0; i < ver.ecBytes; i++) {
      for (const b of ecBlocks) finalStream.push(b[i])
    }

    const size = ver.size
    const matrix = Array.from({ length: size }, () => new Int8Array(size).fill(-1))
    const isFunction = Array.from({ length: size }, () => new Uint8Array(size).fill(0))

    const setFinder = (r, c) => {
      for (let i = -1; i <= 7; i++) {
        for (let j = -1; j <= 7; j++) {
          const nr = r + i
          const nc = c + j
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue
          isFunction[nr][nc] = 1
          if (i >= 0 && i <= 6 && j >= 0 && j <= 6) {
            const isBlack = i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)
            matrix[nr][nc] = isBlack ? 1 : 0
          } else {
            matrix[nr][nc] = 0
          }
        }
      }
    }

    setFinder(0, 0)
    setFinder(0, size - 7)
    setFinder(size - 7, 0)

    if (ver.align && ver.align.length) {
      for (const r of ver.align) {
        for (const c of ver.align) {
          if (isFunction[r][c]) continue
          for (let i = -2; i <= 2; i++) {
            for (let j = -2; j <= 2; j++) {
              isFunction[r + i][c + j] = 1
              const isBlack = Math.abs(i) === 2 || Math.abs(j) === 2 || (i === 0 && j === 0)
              matrix[r + i][c + j] = isBlack ? 1 : 0
            }
          }
        }
      }
    }

    for (let i = 8; i < size - 8; i++) {
      if (!isFunction[6][i]) {
        isFunction[6][i] = 1
        matrix[6][i] = i % 2 === 0 ? 1 : 0
      }
      if (!isFunction[i][6]) {
        isFunction[i][6] = 1
        matrix[i][6] = i % 2 === 0 ? 1 : 0
      }
    }

    matrix[size - 8][8] = 1
    isFunction[size - 8][8] = 1

    for (let i = 0; i <= 8; i++) {
      if (!isFunction[8][i]) isFunction[8][i] = 2
      if (!isFunction[i][8]) isFunction[i][8] = 2
    }
    for (let i = 0; i <= 7; i++) {
      if (!isFunction[8][size - 1 - i]) isFunction[8][size - 1 - i] = 2
      if (!isFunction[size - 1 - i][8]) isFunction[size - 1 - i][8] = 2
    }

    const allBits = []
    for (const b of finalStream) {
      for (let j = 7; j >= 0; j--) allBits.push((b >> j) & 1)
    }

    let bitIdx = 0
    let right = size - 1
    let upward = true
    while (right > 0) {
      if (right === 6) right--
      const rows = upward
        ? Array.from({ length: size }, (_, i) => size - 1 - i)
        : Array.from({ length: size }, (_, i) => i)

      for (const r of rows) {
        for (const c of [right, right - 1]) {
          if (!isFunction[r][c]) {
            const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0
            const mask = (r + c) % 2 === 0
            matrix[r][c] = (bit ^ (mask ? 1 : 0)) === 1 ? 1 : 0
          }
        }
      }
      upward = !upward
      right -= 2
    }

    const formatBits = 0x5412
    for (let i = 0; i < 15; i++) {
      const bit = (formatBits >> (14 - i)) & 1
      if (i <= 5) matrix[8][i] = bit
      else if (i === 6) matrix[8][7] = bit
      else if (i === 7) matrix[8][8] = bit
      else if (i === 8) matrix[7][8] = bit
      else matrix[14 - i][8] = bit

      if (i < 8) matrix[size - 1 - i][8] = bit
      else matrix[8][size - 15 + i] = bit
    }

    const totalDim = (size + margin * 2) * moduleSize
    const paths = []
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c] === 1) {
          const x = (c + margin) * moduleSize
          const y = (r + margin) * moduleSize
          paths.push(`M${x},${y}h${moduleSize}v${moduleSize}h-${moduleSize}z`)
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="100%" height="100%"><rect width="100%" height="100%" fill="#ffffff" rx="12"/><path d="${paths.join(' ')}" fill="#121318"/></svg>`
  } catch (err) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="100%" height="100%" fill="#222"/><text x="100" y="100" fill="#fff" text-anchor="middle">扫码地址</text></svg>`
  }
}

// ---------------------------------------------------------------- DLNA / UPnP 投屏核心

const discoveredDevices = new Map()
let activeCast = null

function fetchXml(targetUrl, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl)
    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.path,
        timeout: timeoutMs,
        headers: { 'User-Agent': '影悦-DLNA-Client/2.4.0' },
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => resolve(body))
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
  })
}

function parseDeviceXml(xml, locationUrl) {
  const parsedLoc = url.parse(locationUrl)
  const baseUrl = `${parsedLoc.protocol}//${parsedLoc.host}`

  // 1. 查找 friendlyName
  const nameMatch = xml.match(/<friendlyName>([^<]+)<\/friendlyName>/i)
  const friendlyName = nameMatch ? nameMatch[1].trim() : '未知电视设备'

  // 2. 查找 modelName
  const modelMatch = xml.match(/<modelName>([^<]+)<\/modelName>/i)
  const modelName = modelMatch ? modelMatch[1].trim() : ''

  // 3. 查找 UDN
  const udnMatch = xml.match(/<UDN>([^<]+)<\/UDN>/i)
  const udn = udnMatch ? udnMatch[1].trim() : locationUrl

  // 4. 关键：查找 AVTransport 服务的 controlURL
  let avTransportControl = null
  let serviceType = 'urn:schemas-upnp-org:service:AVTransport:1'

  const serviceBlocks = xml.split(/<service>/i)
  for (const block of serviceBlocks) {
    if (/serviceType>.*AVTransport/i.test(block)) {
      const typeMatch = block.match(/<serviceType>([^<]+)<\/serviceType>/i)
      if (typeMatch) serviceType = typeMatch[1].trim()

      const ctrlMatch = block.match(/<controlURL>([^<]+)<\/controlURL>/i)
      if (ctrlMatch) {
        let ctrl = ctrlMatch[1].trim()
        if (!/^https?:\/\//i.test(ctrl)) {
          if (!ctrl.startsWith('/')) ctrl = '/' + ctrl
          ctrl = baseUrl + ctrl
        }
        avTransportControl = ctrl
        break
      }
    }
  }

  // 只有具备 AVTransport 控制能力的设备才是能投屏的电视/播放端
  if (!avTransportControl) return null

  return {
    id: udn,
    name: friendlyName,
    model: modelName,
    ip: parsedLoc.hostname,
    controlUrl: avTransportControl,
    serviceType,
    location: locationUrl,
    lastSeen: Date.now(),
  }
}

async function searchDlnaDevices(timeoutMs = 2800) {
  const localIps = getLocalIps()
  const promises = []

  const searchTargets = [
    'urn:schemas-upnp-org:device:MediaRenderer:1',
    'urn:schemas-upnp-org:service:AVTransport:1',
    'ssdp:all',
  ]

  for (const localIp of localIps) {
    promises.push(
      new Promise((resolve) => {
        let socket = null
        try {
          socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
          socket.on('error', () => {
            try {
              socket.close()
            } catch (_) {}
            resolve()
          })

          socket.on('message', async (msg) => {
            try {
              const text = msg.toString('utf8')
              const locMatch = text.match(/LOCATION:\s*(https?:\/\/[^\r\n]+)/i)
              if (!locMatch) return
              const locationUrl = locMatch[1].trim()
              if (discoveredDevices.has(locationUrl)) return

              const xml = await fetchXml(locationUrl, 2500)
              const dev = parseDeviceXml(xml, locationUrl)
              if (dev) {
                discoveredDevices.set(dev.id, dev)
              }
            } catch (_) {}
          })

          socket.bind(0, () => {
            try {
              socket.setBroadcast(true)
              if (localIp !== '127.0.0.1') {
                socket.setMulticastInterface(localIp)
              }
              for (const st of searchTargets) {
                const searchMsg =
                  `M-SEARCH * HTTP/1.1\r\n` +
                  `HOST: 239.255.255.250:1900\r\n` +
                  `MAN: "ssdp:discover"\r\n` +
                  `MX: 2\r\n` +
                  `ST: ${st}\r\n\r\n`
                socket.send(searchMsg, 0, searchMsg.length, 1900, '239.255.255.250', () => {})
              }
            } catch (_) {}
          })

          setTimeout(() => {
            try {
              socket.close()
            } catch (_) {}
            resolve()
          }, timeoutMs)
        } catch (_) {
          resolve()
        }
      })
    )
  }

  await Promise.all(promises)
  return Array.from(discoveredDevices.values()).map((d) => ({
    id: d.id,
    name: d.name,
    model: d.model,
    ip: d.ip,
  }))
}

function sendSoap(controlUrl, serviceType, action, args = {}) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(controlUrl)
    let bodyArgs = ''
    for (const [k, v] of Object.entries(args)) {
      bodyArgs += `<${k}>${v}</${k}>`
    }

    const soapBody =
      `<?xml version="1.0" encoding="utf-8"?>\r\n` +
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\r\n` +
      `  <s:Body>\r\n` +
      `    <u:${action} xmlns:u="${serviceType}">\r\n` +
      `      ${bodyArgs}\r\n` +
      `    </u:${action}>\r\n` +
      `  </s:Body>\r\n` +
      `</s:Envelope>`

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.path,
        method: 'POST',
        timeout: 4500,
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          SOAPAction: `"${serviceType}#${action}"`,
          'Content-Length': Buffer.byteLength(soapBody),
          Connection: 'close',
        },
      },
      (res) => {
        let resp = ''
        res.on('data', (c) => (resp += c))
        res.on('end', () => resolve(resp))
      }
    )

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('SOAP request timeout'))
    })
    req.write(soapBody)
    req.end()
  })
}

function fmtSoapTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

async function castToDlna({ deviceId, videoUrl, title = '影悦影视', initialTime = 0 }) {
  const dev = discoveredDevices.get(deviceId)
  if (!dev) throw new Error('未找到该投屏设备或设备已离线')

  const escapedUrl = String(videoUrl || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const escapedTitle = String(title || '影悦影视')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 1. 设置媒体地址与元数据
  await sendSoap(dev.controlUrl, dev.serviceType, 'SetAVTransportURI', {
    InstanceID: 0,
    CurrentURI: escapedUrl,
    CurrentURIMetaData: `&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"&gt;&lt;item id="0" parentID="-1" restricted="1"&gt;&lt;dc:title&gt;${escapedTitle}&lt;/dc:title&gt;&lt;upnp:class&gt;object.item.videoItem&lt;/upnp:class&gt;&lt;res protocolInfo="http-get:*:video/*:*"&gt;${escapedUrl}&lt;/res&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;`,
  })

  // 2. 发送播放指令
  await sendSoap(dev.controlUrl, dev.serviceType, 'Play', {
    InstanceID: 0,
    Speed: 1,
  })

  // 3. 若有初始进度，执行跳转
  if (initialTime > 3) {
    try {
      await sendSoap(dev.controlUrl, dev.serviceType, 'Seek', {
        InstanceID: 0,
        Unit: 'REL_TIME',
        Target: fmtSoapTime(initialTime),
      })
    } catch (_) {}
  }

  activeCast = {
    deviceId: dev.id,
    deviceName: dev.name,
    videoUrl,
    title,
    startedAt: Date.now(),
    state: 'PLAYING',
  }

  return { success: true, deviceName: dev.name }
}

async function controlDlna({ action, value }) {
  if (!activeCast) throw new Error('当前没有正在投屏的设备')
  const dev = discoveredDevices.get(activeCast.deviceId)
  if (!dev) throw new Error('设备已离线')

  if (action === 'pause') {
    await sendSoap(dev.controlUrl, dev.serviceType, 'Pause', { InstanceID: 0 })
    activeCast.state = 'PAUSED'
  } else if (action === 'play' || action === 'resume') {
    await sendSoap(dev.controlUrl, dev.serviceType, 'Play', { InstanceID: 0, Speed: 1 })
    activeCast.state = 'PLAYING'
  } else if (action === 'stop') {
    await sendSoap(dev.controlUrl, dev.serviceType, 'Stop', { InstanceID: 0 })
    activeCast = null
  } else if (action === 'seek') {
    await sendSoap(dev.controlUrl, dev.serviceType, 'Seek', {
      InstanceID: 0,
      Unit: 'REL_TIME',
      Target: fmtSoapTime(value),
    })
  }

  return { success: true, activeCast }
}

// ---------------------------------------------------------------- WebCast 扫码即看服务端

let webServer = null
let webPort = 3988
let currentMedia = {
  videoUrl: '',
  title: '影悦影视',
  epName: '',
  time: 0,
}

function updateCurrentMedia(payload) {
  if (!payload) return
  currentMedia = {
    videoUrl: payload.videoUrl || currentMedia.videoUrl,
    title: payload.title || currentMedia.title,
    epName: payload.epName || currentMedia.epName,
    time: Number(payload.time) || 0,
  }
}

function getWebCastHtml() {
  const hlsJsPath = path.join(__dirname, '..', 'src', 'vendor', 'hls.min.js')
  let hlsCode = ''
  try {
    hlsCode = fs.readFileSync(hlsJsPath, 'utf8')
  } catch (_) {}

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>${currentMedia.title} · 投屏播放</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0d0e14;
    color: #e5e7eb;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", Roboto, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
  }
  header {
    padding: 16px 20px;
    background: rgba(20, 22, 31, 0.95);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand {
    font-size: 15px;
    font-weight: 700;
    color: #00C6FF;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .title-wrap { flex: 1; min-width: 0; }
  .title { font-size: 16px; font-weight: 700; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }
  
  .player-box {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #000;
    box-shadow: 0 12px 36px rgba(0,0,0,0.8);
  }
  video {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
  }
  .status-bar {
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    color: #9ca3af;
    background: #14161f;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .badge-live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #10B981;
    font-weight: 600;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #10B981; box-shadow: 0 0 8px #10B981; animation: pulse 1.8s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .actions {
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
  }
  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    background: linear-gradient(135deg, #1677FF, #00C6FF);
    color: #fff;
    box-shadow: 0 4px 16px rgba(22, 119, 255, 0.35);
  }
  .btn-ghost {
    background: rgba(255,255,255,0.08);
    color: #e5e7eb;
    box-shadow: none;
    border: 1px solid rgba(255,255,255,0.12);
  }
  .tip-box {
    margin-top: auto;
    padding: 16px;
    border-radius: 12px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    font-size: 12px;
    line-height: 1.6;
    color: #6b7280;
  }
  .tip-box b { color: #9ca3af; }
</style>
</head>
<body>
  <header>
    <div class="brand">
      <svg width="20" height="20" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="7" fill="#1677FF"/><polygon points="11,8.5 20,14 11,19.5" fill="#fff"/></svg>
      影悦
    </div>
    <div class="title-wrap">
      <div class="title" id="webTitle">${currentMedia.title}</div>
      <div class="sub" id="webSub">${currentMedia.epName || '当前正在播放'}</div>
    </div>
  </header>

  <div class="player-box">
    <video id="v" controls playsinline webkit-playsinline x5-playsinline preload="auto"></video>
  </div>

  <div class="status-bar">
    <div class="badge-live"><span class="dot"></span>局域网极速投屏通道已接通</div>
    <span id="rateLabel">1080P 超清</span>
  </div>

  <div class="actions">
    <button class="btn" id="btnSync">🔄 与电脑端进度同步</button>
    <button class="btn btn-ghost" id="btnFull">⛶ 进入手机全屏</button>
    
    <div class="tip-box">
      <b>💡 投屏小贴士：</b><br>
      • 手机或平板扫码全屏播放后，可直接点击右上角无线投屏图标，将画面无缝流转至大屏电视或外接音箱。<br>
      • 安卓手机与电视保持在同一 Wi-Fi 下可享受内网零流量急速缓冲。
    </div>
  </div>

  <script>${hlsCode}</script>
  <script>
    const video = document.getElementById('v')
    let hls = null
    let targetUrl = ${JSON.stringify(currentMedia.videoUrl)}
    let startTime = ${Number(currentMedia.time) || 0}

    function playStream(url, time) {
      if (!url) return
      if (hls) { hls.destroy(); hls = null }

      if (Hls.isSupported() && url.includes('.m3u8')) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: true })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (time > 0) video.currentTime = time
          video.play().catch(() => {})
        })
      } else {
        video.src = url
        if (time > 0) video.currentTime = time
        video.play().catch(() => {})
      }
    }

    playStream(targetUrl, startTime)

    document.getElementById('btnSync').onclick = async () => {
      try {
        const res = await fetch('/api/stream').then(r => r.json())
        if (res.videoUrl) {
          document.getElementById('webTitle').textContent = res.title
          document.getElementById('webSub').textContent = res.epName || '正在播放'
          playStream(res.videoUrl, res.time || 0)
        }
      } catch(_) {}
    }

    document.getElementById('btnFull').onclick = () => {
      if (video.requestFullscreen) video.requestFullscreen()
      else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen()
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen()
    }
  </script>
</body>
</html>`
}

function startWebCastServer() {
  if (webServer) return { port: webPort, primaryIp: getPrimaryIp() }

  webServer = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true)
    res.setHeader('Access-Control-Allow-Origin', '*')

    if (parsed.pathname === '/' || parsed.pathname === '/cast') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(getWebCastHtml())
    } else if (parsed.pathname === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(currentMedia))
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  })

  // 监听并容错端口占用
  const tryListen = (p) => {
    webServer.listen(p, '0.0.0.0', () => {
      webPort = p
    })
    webServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        tryListen(p + 1)
      }
    })
  }
  tryListen(webPort)

  return { port: webPort, primaryIp: getPrimaryIp() }
}

function getWebCastInfo() {
  const ip = getPrimaryIp()
  const castUrl = `http://${ip}:${webPort}/cast`
  const qrSvg = generateQrSvg(castUrl)
  return {
    url: castUrl,
    ip,
    port: webPort,
    qrSvg,
    currentMedia,
    activeCast,
  }
}

module.exports = {
  searchDlnaDevices,
  castToDlna,
  controlDlna,
  startWebCastServer,
  updateCurrentMedia,
  getWebCastInfo,
  generateQrSvg,
  getPrimaryIp,
}

