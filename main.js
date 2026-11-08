'use strict'

/**
 * 影悦 · 独立版 —— 主进程
 *
 * 这是一个自给自足的影视客户端：
 *   · 界面、片库浏览、搜索、收藏、观看记录全部由本应用提供，不加载任何网站页面；
 *   · 片源来自标准媒体采集接口（纯 HTTP JSON），播放直取 m3u8 / mp4 直链；
 *   · 想加源就加源，源挂了就换源 —— 跟某个具体网站没有绑定关系。
 */

const { app, BrowserWindow, Menu, shell, session, ipcMain, screen, clipboard, dialog, net, protocol, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const dnsModule = require('./lib/dns')
const circles = require('./lib/circles')
const cloudshare = require('./lib/cloudshare')
const tgCrawler = require('./lib/telegram_crawler')

// 注册国内防污染海报图床代理私有协议
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'kky-pic',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

// 启动国内免翻墙安全防污染 DNS 拦截（免疫运营商 UDP 53 的 28.0.0.x 假 IP 污染）
require('./lib/dns').install()

// 忽略自签名/过期证书与 CDN TLS 握手异常，保证第三方片源接口稳定可用
app.commandLine.appendSwitch('ignore-certificate-errors')
app.commandLine.appendSwitch('allow-insecure-localhost', 'true')
app.commandLine.appendSwitch('allow-running-insecure-content')

// 开启硬件级 GPU 光栅化、零拷贝渲染与硬件解码（支持低配设备流畅播放）
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('disable-breakpad')
app.commandLine.appendSwitch('disable-component-update')
app.commandLine.appendSwitch('disable-domain-reliability')
app.commandLine.appendSwitch(
  'enable-features',
  'D3D11VideoDecoder,PlatformHEVCDecoderSupport,CanvasOopRasterization'
)
app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
  event.preventDefault()
  callback(true)
})

const api = require('./lib/api')
const sources = require('./lib/sources')
const quality = require('./lib/quality')
const prober = require('./lib/prober')
const router = require('./lib/router')
const recommender = require('./lib/recommender')
const cast = require('./lib/cast')
const metadata = require('./lib/metadata')
const imgproxy = require('./lib/imgproxy')

const APP_NAME = '影悦'
const TITLEBAR_HEIGHT = 44

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/130.0.0.0 Safari/537.36'

let mainWindow = null

const state = { width: 0, height: 0, x: null, y: null, maximized: false, zoom: 0 }
let hasSavedState = false

const stateFile = () => path.join(app.getPath('userData'), 'state.json')

function readState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    hasSavedState = true
    for (const key of Object.keys(state)) {
      if (raw[key] !== undefined && raw[key] !== null) state[key] = raw[key]
    }
  } catch {
    /* 首次启动 */
  }
}

let saveTimer = null
function writeState() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(stateFile()), { recursive: true })
      fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2))
    } catch {
      /* ignore */
    }
  }, 300)
}

function safeBounds() {
  const area = screen.getPrimaryDisplay().workAreaSize
  const fallbackWidth = Math.min(1440, Math.max(1040, area.width - 120))
  const fallbackHeight = Math.min(920, Math.max(680, area.height - 120))
  const width = Math.max(Number(state.width) || fallbackWidth, 1040)
  const height = Math.max(Number(state.height) || fallbackHeight, 680)
  const bounds = { width, height }

  if (hasSavedState && Number.isFinite(state.x) && Number.isFinite(state.y)) {
    const visible = screen.getAllDisplays().some(({ workArea: a }) => {
      const overlapX = Math.min(state.x + width, a.x + a.width) - Math.max(state.x, a.x)
      const overlapY = Math.min(state.y + height, a.y + a.height) - Math.max(state.y, a.y)
      return overlapX > 140 && overlapY > 140
    })
    if (visible) {
      bounds.x = Math.round(state.x)
      bounds.y = Math.round(state.y)
    }
  }
  return bounds
}

// ---------------------------------------------------------------- 窗口

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon-1024.png')
  const win = new BrowserWindow({
    ...safeBounds(),
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#1A1C1F',
    title: APP_NAME,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    // macOS 用红绿灯标题栏；Windows 隐藏系统标题栏，改用右侧原生 Overlay 控制按钮
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 16, y: Math.round((TITLEBAR_HEIGHT - 14) / 2) },
        }
      : {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: '#000000',
            symbolColor: '#EAEAEA',
            height: TITLEBAR_HEIGHT,
          },
        }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
      webviewTag: false,
    },
  })

  mainWindow = win
  win.once('ready-to-show', () => win.show())

  if (process.env.KKY_DEBUG) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log('[renderer]', level, message, `${source}:${line}`)
    })
    win.webContents.on('preload-error', (_e, preloadPath, error) => {
      console.log('[preload-error]', preloadPath, String(error))
    })
  }

  const remember = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    state.maximized = mainWindow.isMaximized()
    if (!state.maximized && !mainWindow.isFullScreen()) {
      const b = mainWindow.getBounds()
      state.width = b.width
      state.height = b.height
      state.x = b.x
      state.y = b.y
    }
    writeState()
  }
  win.on('resize', remember)
  win.on('move', remember)
  win.on('maximize', remember)
  win.on('unmaximize', remember)
  win.on('close', remember)
  win.on('closed', () => {
    mainWindow = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return
    event.preventDefault()
    if (/^https?:/i.test(url)) shell.openExternal(url)
  })

  win.webContents.on('context-menu', (_event, params) => {
    const items = []
    if (params.isEditable) {
      items.push(
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      )
    } else if (params.selectionText && params.selectionText.trim()) {
      items.push({ role: 'copy', label: '复制' })
    }
    if (params.linkURL) {
      if (items.length) items.push({ type: 'separator' })
      items.push({ label: '在默认浏览器中打开', click: () => shell.openExternal(params.linkURL) })
      items.push({ label: '复制链接地址', click: () => clipboard.writeText(params.linkURL) })
    }
    if (items.length) items.push({ type: 'separator' })
    items.push({ label: '重新加载界面', click: () => win.reload() })
    Menu.buildFromTemplate(items).popup({ window: win })
  })

  win.loadFile(path.join(__dirname, 'src', 'index.html'))
}

// ---------------------------------------------------------------- 网络策略

/**
 * 两个必要的松绑：
 *   1. 片源 CDN 一般不带 CORS 头，而 hls.js 用 XHR 拉分片，界面又是 file:// 源，
 *      所以统一补上 Access-Control-Allow-*。
 *   2. 部分图床有防盗链，给图片请求补一个同源 Referer。
 */
function relaxNetworkPolicies() {
  const ses = session.defaultSession

  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {}
    headers['Access-Control-Allow-Origin'] = ['*']
    headers['Access-Control-Allow-Headers'] = ['*']
    headers['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS']
    headers['Access-Control-Expose-Headers'] = ['*']
    callback({ responseHeaders: headers })
  })

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders
    if (details.url && details.url.includes('doubanio.com')) {
      headers.Referer = 'https://movie.douban.com/'
    } else if (details.resourceType === 'image' && !headers.Referer && !headers.referer) {
      try {
        headers.Referer = new URL(details.url).origin + '/'
      } catch {
        /* ignore */
      }
    }
    callback({ requestHeaders: headers })
  })
}

// ---------------------------------------------------------------- 下载

const downloadsDir = () => path.join(app.getPath('userData'), 'downloads')

async function downloadMedia({ url, filename, vodId, episode }) {
  const kind = api.playKind(url)
  if (kind !== 'mp4') {
    return { ok: false, message: '该线路是 HLS 流，暂不支持离线保存' }
  }

  const dir = path.join(downloadsDir(), String(vodId || 'misc'))
  fs.mkdirSync(dir, { recursive: true })
  const safeName = String(filename || 'video').replace(/[/\\:*?"<>|]/g, '_').slice(0, 80)
  const target = path.join(dir, `${safeName}.mp4`)

  const res = await net.fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length') || 0)

  const handle = fs.createWriteStream(target)
  const reader = res.body.getReader()
  let received = 0
  const win = mainWindow
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.length
      handle.write(Buffer.from(value))
      if (win && !win.isDestroyed() && total) {
        win.webContents.send('download:progress', {
          vodId,
          episode,
          percent: Math.round((received / total) * 100),
          received,
          total,
        })
      }
    }
  } finally {
    handle.end()
  }
  return { ok: true, path: target, size: received }
}

function listDownloads() {
  const root = downloadsDir()
  if (!fs.existsSync(root)) return []
  const out = []
  for (const vodId of fs.readdirSync(root)) {
    const dir = path.join(root, vodId)
    if (!fs.statSync(dir).isDirectory()) continue
    for (const file of fs.readdirSync(dir)) {
      if (!/\.(mp4|mkv|webm)$/i.test(file)) continue
      const full = path.join(dir, file)
      const st = fs.statSync(full)
      out.push({ vodId, name: file, path: full, size: st.size, mtime: st.mtimeMs })
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

// ---------------------------------------------------------------- 菜单

function send(channel, payload) {
  const win = mainWindow
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function buildMenu() {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `关于 ${APP_NAME}` },
        { type: 'separator' },
        { label: '源管理…', accelerator: 'CommandOrControl+,', click: () => send('nav', { route: 'settings' }) },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${APP_NAME}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${APP_NAME}` },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '播放',
      submenu: [
        // 这几个不挂全局快捷键：空格/方向键/M/F 在搜索框里是要正常输入的，
        // 播放器的按键由渲染进程自己监听。
        { label: '播放 / 暂停', click: () => send('player', 'toggle') },
        { label: '上一集', click: () => send('player', 'prev') },
        { label: '下一集', click: () => send('player', 'next') },
        { type: 'separator' },
        { label: '快退 10 秒', click: () => send('player', 'seek-back') },
        { label: '快进 10 秒', click: () => send('player', 'seek-forward') },
        { type: 'separator' },
        { label: '静音', click: () => send('player', 'mute') },
        { label: '全屏播放', click: () => send('player', 'fullscreen') },
      ],
    },
    {
      label: '前往',
      submenu: [
        { label: '首页', accelerator: 'Command+Shift+H', click: () => send('nav', { route: 'home' }) },
        { label: '搜索', accelerator: 'Command+F', click: () => send('nav', { route: 'search' }) },
        { label: '我的收藏', accelerator: 'Command+D', click: () => send('nav', { route: 'favorites' }) },
        { label: '观看记录', accelerator: 'Command+Y', click: () => send('nav', { route: 'history' }) },
        { type: 'separator' },
        { label: '后退', accelerator: 'Command+[', click: () => send('nav', { back: true }) },
        { label: '刷新界面', accelerator: 'Command+R', click: () => mainWindow && mainWindow.reload() },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '实际大小', accelerator: 'Command+0', click: () => send('zoom', 0) },
        { label: '放大', accelerator: 'Command+Plus', click: () => send('zoom', 1) },
        { label: '缩小', accelerator: 'Command+-', click: () => send('zoom', -1) },
        { type: 'separator' },
        { label: '进入全屏', accelerator: 'Control+Command+F', click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'Alt+Command+I', click: () => mainWindow && mainWindow.webContents.toggleDevTools() },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '项目主页与技术文档', click: () => shell.openExternal('https://github.com/cinemajoy/cinemajoy-app') },
      ],
    },
  ]
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  } else {
    // Windows / Linux: 隐藏原生 Win32 菜单栏，避免破坏无边框沉浸式暗黑标题栏与布局
    Menu.setApplicationMenu(null)
  }
}

// ---------------------------------------------------------------- IPC

function resolveSite(key) {
  const site = sources.get(key) || sources.enabled()[0]
  if (!site) throw new Error('还没有可用的片源，请先在「源管理」里添加')
  return site
}

function registerIpc() {
  ipcMain.on('imgproxy:base', (event) => {
    event.returnValue = imgproxy.getProxyBase()
  })

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    titlebarHeight: TITLEBAR_HEIGHT,
    downloads: downloadsDir(),
  }))

  ipcMain.handle('sources:list', () => sources.list())

  ipcMain.handle('sources:resetDefault', () => sources.resetDefault())

  ipcMain.handle('sources:add', (_e, payload) => sources.addSite(payload))

  ipcMain.handle('sources:remove', (_e, key) => sources.removeSite(key))

  ipcMain.handle('sources:toggle', (_e, { key, enabled }) => sources.toggleSite(key, enabled))

  ipcMain.handle('sources:import', async (_e, target) => sources.importTvbox(target))

  ipcMain.handle('sources:test', async (_e, key) => {
    const site = sources.get(key)
    if (!site) throw new Error('源不存在')
    try {
      return await api.testSite(site)
    } catch (error) {
      return { ok: false, message: String(error.message || error) }
    }
  })

  ipcMain.handle('api:classes', async (_e, key) => {
    const site = resolveSite(key)
    return { site: site.key, classes: await api.fetchClasses(site) }
  })

  ipcMain.handle('api:list', async (_e, { key, typeId, page, keyword }) => {
    const site = resolveSite(key)
    return { site: site.key, ...(await api.fetchList(site, { typeId, page, keyword })) }
  })

  ipcMain.handle('api:search', async (_e, { key, query, limit } = {}) => {
    const site = resolveSite(key)
    return api.searchSmart(site, query, { limit: limit || 30 })
  })

  ipcMain.handle('api:detail', async (_e, { key, id }) => {
    const site = resolveSite(key)
    return api.fetchDetail(site, id)
  })

  ipcMain.handle('api:daily', async (_e, { hours, limit } = {}) => {
    return api.fetchDailyUpdates(sources.enabled(), { hours: hours || 24, limit: limit || 40 })
  })

  ipcMain.handle('api:commentaries', async (_e, { limit, force } = {}) => {
    return api.fetchMovieCommentaries(sources.enabled(), { limit: limit || 64, force: Boolean(force) })
  })

  ipcMain.handle('api:tmdbFeed', async (_e, { category, page, force } = {}) => {
    return metadata.fetchTmdbFeed({ category, page, force })
  })

  ipcMain.handle('api:rankings', async (_e, { type, limit } = {}) => {
    return api.fetchRankings(sources.enabled(), { type: type || 'all', limit: limit || 20 })
  })

  ipcMain.handle('api:enrichPosters', async (_e, items) => {
    return metadata.enrichList(items, 4)
  })

  ipcMain.handle('api:getPoster', async (_e, { title, year }) => {
    return metadata.scrapeDomesticPoster(title, year)
  })

  ipcMain.handle('api:getBackdrop', async (_e, { title, year, fallbackPic } = {}) => {
    return metadata.scrapeHorizontalBackdrop(title, year, fallbackPic)
  })

  // 轻量化语义与会话接口兜底（已脱脂，零内存开销）
  ipcMain.handle('ai:status', () => ({ ready: false }))
  ipcMain.handle('ai:extractIntent', (_e, { query }) => ({ rawQuery: query, cleanQuery: query, year: '', category: '', isSemantic: false }))
  ipcMain.handle('ai:search', async () => [])
  ipcMain.handle('ai:similar', async () => [])
  ipcMain.handle('ai:companion', (_e, payload) => ({
    summary: `《${payload?.name || '本片'}》精选自优质网络流媒体，享受纯净视听体验。`,
    qa: [
      { q: '影片主要看点是什么？', a: payload?.desc ? payload.desc.slice(0, 80) : '叙事节奏明快，剧情跌宕起伏。' },
      { q: '适合什么场景观看？', a: '适合周末家庭影院或沉浸独享。' },
      { q: '画质如何？', a: '系统已智能优选全网高码率低延迟线路。' },
      { q: '播放卡顿怎么办？', a: '播放器支持一键切换备用极速线路。' }
    ]
  }))

  ipcMain.handle('media:kind', (_e, url) => api.playKind(url))

  // 量一条流的码率（画质）。免费源普遍压得很狠，光看分辨率会误判。
  ipcMain.handle('media:probe', async (_e, url) => {
    try {
      const info = await quality.measure(url)
      return { ok: true, ...info, label: quality.label(info.kbps) }
    } catch (error) {
      return { ok: false, message: String(error.message || error) }
    }
  })

  // 基于 ffprobe 的深度流特征与真实清晰度仲裁
  ipcMain.handle('media:probeDeep', async (_e, url) => {
    try {
      return await prober.probeStream(url)
    } catch (error) {
      return { ok: false, message: String(error.message || error) }
    }
  })

  // 多臂老虎机自适应多源排序
  ipcMain.handle('router:rank', async () => {
    try {
      return router.rankSites(sources.enabled())
    } catch {
      return sources.enabled()
    }
  })

  // 全网片源受控并发测速（4路并发限流，防抖互斥）
  let isProbing = false
  ipcMain.handle('router:probeAll', async () => {
    if (isProbing) return router.rankSites(sources.enabled())
    isProbing = true
    try {
      return await router.probeAllSites(sources.enabled(), { concurrency: 4, timeoutMs: 2000 })
    } catch (e) {
      console.warn('[router:probeAll]', e.message)
      return router.rankSites(sources.enabled())
    } finally {
      isProbing = false
    }
  })

  // 记录请求质量与时延反馈
  ipcMain.handle('router:record', async (_e, { siteKey, success, latencyMs }) => {
    router.recordOutcome(siteKey, Boolean(success), Number(latencyMs) || 500)
    return { ok: true }
  })

  // 端侧轻量推荐重排
  ipcMain.handle('recommender:rank', async (_e, { pool, history, favorites, limit }) => {
    try {
      return recommender.rankRecommendations(pool, history, favorites, limit || 12)
    } catch {
      return (pool || []).slice(0, limit || 12)
    }
  })

  // 同一部片在所有片源里谁的画质最好
  ipcMain.handle('api:findBest', async (event, { title, currentSite }) => {
    try {
      const list = await quality.findBestForTitle({
        title,
        sites: sources.enabled(),
        currentSite,
        onProgress: (done, total) => {
          if (!event.sender.isDestroyed()) event.sender.send('quality:progress', { done, total })
        },
      })
      return { ok: true, list }
    } catch (error) {
      return { ok: false, message: String(error.message || error) }
    }
  })

  // 全网静默探活与断链自愈：当当前源线路 404/失效时，毫秒级跨源并发探活有效播放源
  ipcMain.handle('api:findPlayable', async (_event, payload) => {
    try {
      return await api.findPlayableSource(sources.enabled(), payload)
    } catch {
      return null
    }
  })

  ipcMain.handle('media:download', async (_e, payload) => {
    try {
      return await downloadMedia(payload)
    } catch (error) {
      return { ok: false, message: String(error.message || error) }
    }
  })

  ipcMain.handle('media:downloads', () => listDownloads())

  ipcMain.handle('media:reveal', (_e, target) => {
    if (target) shell.showItemInFolder(target)
    else shell.openPath(downloadsDir())
  })

  ipcMain.handle('media:copy', (_e, text) => clipboard.writeText(String(text || '')))

  ipcMain.handle('media:copyImage', (_e, dataUrl) => {
    try {
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
        const img = nativeImage.createFromDataURL(dataUrl)
        clipboard.writeImage(img)
        return true
      }
    } catch (err) {
      console.warn('Failed to copy image to clipboard:', err)
    }
    return false
  })

  ipcMain.handle('media:saveClip', async (_e, { filename, bufferBase64 }) => {
    try {
      const safeName = String(filename || 'cinemajoy_highlight.webm').replace(/[/\\]/g, '_').trim()
      const downloads = app.getPath('downloads')
      const targetPath = path.join(downloads, safeName)
      const buf = Buffer.from(bufferBase64, 'base64')
      fs.writeFileSync(targetPath, buf)
      shell.showItemInFolder(targetPath)
      return { success: true, path: targetPath }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('media:open', (_e, url) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
  })

  ipcMain.handle('cast:devices', () => cast.searchDlnaDevices(2000))
  ipcMain.handle('cast:search', () => cast.searchDlnaDevices(2800))
  ipcMain.handle('cast:play', async (_e, payload) => {
    cast.startWebCastServer()
    return cast.castToDlna(payload)
  })
  ipcMain.handle('cast:control', async (_e, payload) => cast.controlDlna(payload))
  ipcMain.handle('cast:info', () => {
    cast.startWebCastServer()
    return cast.getWebCastInfo()
  })
  ipcMain.handle('cast:updateMedia', (_e, payload) => cast.updateCurrentMedia(payload))

  ipcMain.handle('circles:official', () => circles.OFFICIAL_CIRCLES)
  ipcMain.handle('circles:avatars', () => circles.AVATAR_OPTIONS)
  ipcMain.handle('circles:encodeToken', (_e, circle) => circles.encodeCircleToken(circle))
  ipcMain.handle('circles:decodeToken', (_e, token) => circles.decodeCircleToken(token))

  ipcMain.handle('cloudshare:resolve', async (_e, { url, passcode } = {}) => {
    try {
      const parsed = cloudshare.parseShareUrl(url)
      const pwdId = parsed.pwdId
      const finalPasscode = passcode || parsed.passcode || ''
      if (!pwdId) {
        return { ok: false, error: 'INVALID_URL', message: '未能识别有效的网盘分享链接' }
      }
      const tokenRes = await cloudshare.fetchShareToken(pwdId, finalPasscode)
      if (!tokenRes.ok) return tokenRes
      const filesRes = await cloudshare.fetchShareFiles(pwdId, tokenRes.stoken)
      return {
        ok: true,
        pwdId,
        passcode: finalPasscode,
        title: tokenRes.title || '网盘高清影视',
        shareUrl: `https://pan.quark.cn/s/${pwdId}`,
        files: filesRes.ok ? filesRes.files : [],
        updatedAt: Date.now(),
      }
    } catch (err) {
      return { ok: false, error: err.message || 'RESOLVE_ERROR' }
    }
  })

  ipcMain.handle('cloudshare:exportRss', (_e, payload) => {
    try {
      const xml = cloudshare.exportToRssFeed(payload || {})
      return { ok: true, xml }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('telegram:crawl', async (_e, { channel, mirrorBaseUrl } = {}) => {
    try {
      return await tgCrawler.crawlAndValidateChannel(channel, { mirrorBaseUrl })
    } catch (err) {
      return { ok: false, error: 'CRAWL_FAILED', message: err.message, items: [] }
    }
  })

  ipcMain.handle('telegram:exportRss', (_e, { items, title } = {}) => {
    try {
      const xml = tgCrawler.exportAggregatedRssFeed(items || [], title)
      return { ok: true, xml }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('telegram:toggleDailyCrawler', (_e, { enable, intervalMs, channel, mirrorBaseUrl } = {}) => {
    try {
      if (enable) {
        tgCrawler.startDailyCrawler(intervalMs || 24 * 3600 * 1000, async () => {
          if (channel) {
            await tgCrawler.crawlAndValidateChannel(channel, { mirrorBaseUrl })
          }
        })
      } else {
        tgCrawler.stopDailyCrawler()
      }
      return { ok: true, active: tgCrawler.hasActiveCrawler() }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('dialog:confirm', async (_e, { title, message }) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['取消', '确定'],
      defaultId: 1,
      cancelId: 0,
      title: title || '确认',
      message: message || '',
    })
    return result.response === 1
  })
}

// ---------------------------------------------------------------- 生命周期

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.setName(APP_NAME)
  app.userAgentFallback = UA

  async function fetchImageBuffer(targetUrl, timeoutMs = 3500) {
    let u
    try {
      u = new URL(targetUrl)
    } catch {
      throw new Error('Invalid URL')
    }

    // 针对仅开放 80 端口或海外 443 阻断的图床，强制转为 HTTP 80 端口直连
    const HTTP_ONLY_HOSTS = [
      'fffgood.com',
      'p.bfvp26.com',
      'bfvp26.com',
      'p.lztutu.com',
      'lztutu.com',
      'pic3.yzzyimg.online',
      'yzzyimg.online',
      'img.guangsuimage.com',
      'hdzyk-cdn.com',
      'bfzycdn.com',
      'vodimg.com',
      'pic.lz-cdn.com',
      'upload/vod',
    ]
    const isHttpOnly = HTTP_ONLY_HOSTS.some((h) => u.hostname.includes(h) || u.pathname.includes(h))
    const protocol = isHttpOnly ? 'http:' : u.protocol
    const port = isHttpOnly ? 80 : (u.port || (u.protocol === 'https:' ? 443 : 80))

    // 1. 获取防污染真实 IP（阿里 HTTP-DNS + 腾讯 DNSPod 强力穿透 28.0.0.x 污染）
    let ips = await dnsModule.getCleanIps(u.hostname)
    const hostCandidates = ips && ips.length ? [...ips.slice(0, 3), u.hostname] : [u.hostname]

    let lastErr = null
    for (const hostTarget of hostCandidates) {
      try {
        const result = await new Promise((resolve, reject) => {
          const isHttps = protocol === 'https:'
          const client = isHttps ? https : http

          const req = client.request(
            {
              host: hostTarget,
              port: port,
              path: u.pathname + u.search,
              method: 'GET',
              headers: {
                Host: u.hostname,
                'User-Agent': UA,
                Referer: `${protocol}//${u.hostname}/`,
                Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              },
              servername: isHttps ? u.hostname : undefined,
              timeout: Math.min(timeoutMs, 2500),
              rejectUnauthorized: false,
            },
            (res) => {
              if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let nextUrl = res.headers.location
                if (nextUrl.startsWith('/')) nextUrl = `${protocol}//${u.hostname}${nextUrl}`
                return fetchImageBuffer(nextUrl, timeoutMs).then(resolve, reject)
              }
              if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`))
              }
              const type = res.headers['content-type'] || 'image/jpeg'
              const chunks = []
              res.on('data', (c) => chunks.push(c))
              res.on('end', () => {
                resolve({ buf: Buffer.concat(chunks), type })
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
        return result
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr || new Error('Fetch failed')
  }

  app.whenReady().then(async () => {
    // 启动本地海报环回 HTTP 代理服务 (Sidecar Loopback Proxy)
    try {
      await imgproxy.start()
    } catch (e) {
      console.error('[ImgProxy] Failed to start:', e)
    }

    // 注册全局图床直连代理，通过防污染 HTTP-DNS + 端口降级直通原生官方海报
    const memPicCache = new Map()
    protocol.handle('kky-pic', async (req) => {
      let targetUrl = ''
      try {
        const parsed = new URL(req.url)
        targetUrl = parsed.searchParams.get('url') || ''
      } catch {
        targetUrl = decodeURIComponent(req.url.replace(/^kky-pic:\/\/([^\/]+)?\/?\?url=/i, ''))
      }
      if (!targetUrl) return new Response(null, { status: 404 })
      if (targetUrl.startsWith('//')) targetUrl = 'https:' + targetUrl
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        return new Response(null, { status: 404 })
      }

      const cached = memPicCache.get(targetUrl)
      if (cached && cached.buf) {
        return new Response(cached.buf, {
          status: 200,
          headers: {
            'Content-Type': cached.type || 'image/jpeg',
            'Cache-Control': 'public, max-age=2592000',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }

      try {
        const result = await fetchImageBuffer(targetUrl, 3500)

        if (memPicCache.size > 1200) {
          const firstKey = memPicCache.keys().next().value
          memPicCache.delete(firstKey)
        }
        memPicCache.set(targetUrl, result)

        return new Response(result.buf, {
          status: 200,
          headers: {
            'Content-Type': result.type,
            'Cache-Control': 'public, max-age=2592000',
            'Access-Control-Allow-Origin': '*',
          },
        })
      } catch (e) {
        return new Response(null, { status: 404 })
      }
    })

    readState()
    session.defaultSession.setUserAgent(UA)
    relaxNetworkPolicies()

    // 强制设置 macOS Dock 品牌图标，杜绝系统 Dock 历史缓存残留
    if (process.platform === 'darwin' && app.dock) {
      const dockIconPath = path.join(__dirname, 'assets', 'icon-1024.png')
      if (fs.existsSync(dockIconPath)) {
        try {
          const img = nativeImage.createFromPath(dockIconPath)
          app.dock.setIcon(img)
        } catch {}
      }
    }

    registerIpc()
    buildMenu()
    createWindow()

    if (process.env.KKY_SMOKE) {
      try {
        const mod = process.env.KKY_SMOKE_MOD || './test/smoke'
        require(mod)()
      } catch {
        setTimeout(() => app.quit(), 500)
      }
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else if (mainWindow) mainWindow.show()
  })

  app.on('window-all-closed', () => app.quit())

  app.on('before-quit', () => {
    clearTimeout(saveTimer)
    try {
      tgCrawler.stopDailyCrawler()
    } catch {
      /* ignore */
    }
    try {
      fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2))
    } catch {
      /* ignore */
    }
  })
}
