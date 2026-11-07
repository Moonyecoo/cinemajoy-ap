'use strict'

/**
 * 真实流特征与清晰度仲裁器
 *
 * 核心目标：
 * 1. 破解采集源虚标“4K/蓝光/1080P”乱象。
 * 2. 结合 ffprobe 提取底层真实 Stream 规格（真实宽高、有效码率、编码格式、声道）。
 * 3. 对清晰度给出具备客观技术依据的真伪评级。
 */

const { execFile } = require('node:child_process')
const fs = require('node:fs')
const quality = require('./quality')

const FFPROBE_PATHS = [
  'ffprobe',
  'ffprobe.exe',
  '/usr/local/bin/ffprobe',
  '/opt/homebrew/bin/ffprobe',
  // Windows 常见安装位置与环境变量
  'C:\\ffmpeg\\bin\\ffprobe.exe',
  'C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe',
  'C:\\ProgramData\\chocolatey\\bin\\ffprobe.exe',
]

function getFfprobePath() {
  for (const p of FFPROBE_PATHS) {
    if (p === 'ffprobe' || fs.existsSync(p)) {
      return p
    }
  }
  return null
}

/**
 * 评定真实画质梯队与真伪标签
 */
function evaluateTier(width, height, kbps) {
  const w = Number(width || 0)
  const h = Number(height || 0)
  const b = Number(kbps || 0)

  if (w >= 3840 || h >= 2160) {
    if (b >= 8000) return { tier: '4K', label: '真 4K 超高清', badge: 'badge-4k', legit: true }
    return { tier: '4K-low', label: '4K 压制版', badge: 'badge-hd', legit: false }
  }

  if (w >= 1920 || h >= 1080) {
    if (b >= 3000) return { tier: '1080P-high', label: '1080P 原画蓝光', badge: 'badge-1080p', legit: true }
    if (b >= 1200) return { tier: '1080P', label: '1080P 高清', badge: 'badge-1080p', legit: true }
    return { tier: '1080P-low', label: '1080P 低码糊源', badge: 'badge-sd', legit: false }
  }

  if (w >= 1280 || h >= 720) {
    if (b >= 1000) return { tier: '720P', label: '720P 高清', badge: 'badge-720p', legit: true }
    return { tier: '720P-low', label: '720P 标清', badge: 'badge-sd', legit: false }
  }

  return { tier: 'SD', label: '标清 480P', badge: 'badge-sd', legit: true }
}

/**
 * 使用 ffprobe 深度探测流
 */
function probeStream(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const ffprobe = getFfprobePath()
    if (!ffprobe) {
      // 降级使用 HTTP 分片采样估算
      return quality.measure(url).then(
        (info) => {
          const evalRes = evaluateTier(info.height || 1080, info.height || 1080, info.kbps)
          resolve({
            ok: true,
            method: 'http-sampling',
            width: info.height ? Math.round((info.height * 16) / 9) : 1920,
            height: info.height || 1080,
            kbps: info.kbps,
            codec: 'h264',
            audioCodec: 'aac',
            ...evalRes,
          })
        },
        (err) => resolve({ ok: false, error: err.message })
      )
    }

    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      url,
    ]

    execFile(ffprobe, args, { timeout: timeoutMs }, (error, stdout) => {
      if (error || !stdout) {
        // 探测失败降级
        return quality.measure(url).then(
          (info) => {
            const evalRes = evaluateTier(0, info.height, info.kbps)
            resolve({
              ok: true,
              method: 'fallback-sampling',
              width: 0,
              height: info.height,
              kbps: info.kbps,
              ...evalRes,
            })
          },
          () => resolve({ ok: false, error: error ? error.message : 'ffprobe 探测超时' })
        )
      }

      try {
        const data = JSON.parse(stdout)
        const video = (data.streams || []).find((s) => s.codec_type === 'video')
        const audio = (data.streams || []).find((s) => s.codec_type === 'audio')

        if (!video) {
          return resolve({ ok: false, error: '未找到有效视频流' })
        }

        const width = Number(video.width || 0)
        const height = Number(video.height || 0)
        let kbps = Number(video.tags && video.tags.variant_bitrate ? video.tags.variant_bitrate / 1000 : 0)

        // 若 HLS manifest tags 无码率，从 format.bit_rate 获取
        if (!kbps && data.format && data.format.bit_rate) {
          kbps = Math.round(Number(data.format.bit_rate) / 1000)
        }

        const evalRes = evaluateTier(width, height, kbps)

        resolve({
          ok: true,
          method: 'ffprobe-deep',
          width,
          height,
          codec: video.codec_name || 'h264',
          profile: video.profile || '',
          fps: video.r_frame_rate || '25/1',
          kbps,
          audioCodec: audio ? audio.codec_name : 'aac',
          channels: audio ? audio.channels : 2,
          duration: data.format ? Math.round(Number(data.format.duration || 0)) : 0,
          ...evalRes,
        })
      } catch (e) {
        resolve({ ok: false, error: '解析 ffprobe 输出失败: ' + e.message })
      }
    })
  })
}

module.exports = {
  probeStream,
  evaluateTier,
}

