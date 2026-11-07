'use strict'

/**
 * 渲染进程唯一的能力入口。
 * 界面里没有任何网络/文件权限，全部通过这里走主进程，白名单式开放。
 */

const { contextBridge, ipcRenderer } = require('electron')

const ON_CHANNELS = new Set(['nav', 'player', 'zoom', 'download:progress', 'quality:progress'])

// 非 macOS(如 Windows)没有左侧红绿灯，标题栏去掉预留空位
if (process.platform !== 'darwin' && document.documentElement) {
  document.documentElement.classList.add('platform-win')
}

contextBridge.exposeInMainWorld('kky', {
  info: () => ipcRenderer.invoke('app:info'),
  imgProxyBase: () => ipcRenderer.sendSync('imgproxy:base'),

  sources: {
    list: () => ipcRenderer.invoke('sources:list'),
    resetDefault: () => ipcRenderer.invoke('sources:resetDefault'),
    add: (payload) => ipcRenderer.invoke('sources:add', payload),
    remove: (key) => ipcRenderer.invoke('sources:remove', key),
    toggle: (key, enabled) => ipcRenderer.invoke('sources:toggle', { key, enabled }),
    importTvbox: (target) => ipcRenderer.invoke('sources:import', target),
    test: (key) => ipcRenderer.invoke('sources:test', key),
  },

  api: {
    classes: (key) => ipcRenderer.invoke('api:classes', key),
    list: (payload) => ipcRenderer.invoke('api:list', payload),
    detail: (key, id) => ipcRenderer.invoke('api:detail', { key, id }),
    findBest: (payload) => ipcRenderer.invoke('api:findBest', payload),
    findPlayable: (payload) => ipcRenderer.invoke('api:findPlayable', payload),
    daily: (payload) => ipcRenderer.invoke('api:daily', payload),
    commentaries: (payload) => ipcRenderer.invoke('api:commentaries', payload),
    rankings: (payload) => ipcRenderer.invoke('api:rankings', payload),
    search: (payload) => ipcRenderer.invoke('api:search', payload),
    enrichPosters: (items) => ipcRenderer.invoke('api:enrichPosters', items),
    getPoster: (payload) => ipcRenderer.invoke('api:getPoster', payload),
    getBackdrop: (payload) => ipcRenderer.invoke('api:getBackdrop', payload),
  },

  media: {
    kind: (url) => ipcRenderer.invoke('media:kind', url),
    probe: (url) => ipcRenderer.invoke('media:probe', url),
    probeDeep: (url) => ipcRenderer.invoke('media:probeDeep', url),
    download: (payload) => ipcRenderer.invoke('media:download', payload),
    downloads: () => ipcRenderer.invoke('media:downloads'),
    reveal: (target) => ipcRenderer.invoke('media:reveal', target),
    copy: (text) => ipcRenderer.invoke('media:copy', text),
    copyImage: (dataUrl) => ipcRenderer.invoke('media:copyImage', dataUrl),
    saveClip: (payload) => ipcRenderer.invoke('media:saveClip', payload),
    open: (url) => ipcRenderer.invoke('media:open', url),
  },

  cast: {
    devices: () => ipcRenderer.invoke('cast:devices'),
    search: () => ipcRenderer.invoke('cast:search'),
    play: (payload) => ipcRenderer.invoke('cast:play', payload),
    control: (payload) => ipcRenderer.invoke('cast:control', payload),
    info: () => ipcRenderer.invoke('cast:info'),
    updateMedia: (payload) => ipcRenderer.invoke('cast:updateMedia', payload),
  },

  router: {
    rank: () => ipcRenderer.invoke('router:rank'),
    record: (payload) => ipcRenderer.invoke('router:record', payload),
    probeAll: () => ipcRenderer.invoke('router:probeAll'),
  },

  recommender: {
    rank: (payload) => ipcRenderer.invoke('recommender:rank', payload),
  },

  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    extractIntent: (query) => ipcRenderer.invoke('ai:extractIntent', { query }),
    search: (payload) => ipcRenderer.invoke('ai:search', payload),
    similar: (payload) => ipcRenderer.invoke('ai:similar', payload),
    companion: (payload) => ipcRenderer.invoke('ai:companion', payload),
  },

  dialog: {
    confirm: (payload) => ipcRenderer.invoke('dialog:confirm', payload),
  },

  circles: {
    official: () => ipcRenderer.invoke('circles:official'),
    avatars: () => ipcRenderer.invoke('circles:avatars'),
    encodeToken: (circle) => ipcRenderer.invoke('circles:encodeToken', circle),
    decodeToken: (token) => ipcRenderer.invoke('circles:decodeToken', token),
  },

  on: (channel, handler) => {
    if (!ON_CHANNELS.has(channel)) return () => {}
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})
