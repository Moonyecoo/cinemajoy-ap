'use strict'

/**
 * 影悦 · 独立版 - 影视圈核心引擎 (Cine Circle Engine)
 * 本地优先 (Local-First) 架构，纯本地自治，0 境外依赖，内置 XSS 与超大密令安全防御管线。
 */

function escapeHtml(str) {
  if (typeof str !== 'string') return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * 规范化电影实体 ID 生成器 (Canonical Movie ID)
 * 满足不可违反约束 3：通过稳定的 movie_id 引用电影，不复制电影资料或片源
 */
function canonicalMovieId(title, year = '') {
  const raw = String(title || '')
    .replace(/\s*(HD|BD|TC|4K|2160P|1080P|720P|国语|粤语|国英|中字|双字|原盘|抢先版|版本|v\d+).*/i, '')
    .replace(/[\s·:：,，.。!！?？()（）\[\]【】]/g, '')
    .toLowerCase()
    .trim()
  if (!raw) return 'cm_unknown'
  const seed = `${raw}:${String(year || '').trim()}`
  let h1 = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h1 ^= seed.charCodeAt(i)
    h1 = Math.imul(h1, 0x01000193) >>> 0
  }
  return 'cm_' + h1.toString(16).padStart(8, '0')
}

/**
 * 将秒数格式化为 HH:MM:SS 或 MM:SS
 */
function formatTimeLabel(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const hrs = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = s % 60
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * 跨源时间轴双轨弹性校准算法 (calibrateMomentTime)
 * 当当前片源总时长与记录时刻的母本片长偏差 > 30s 时，自动按 progress_ratio 比例折算
 */
function calibrateMomentTime(timestampSec, refDurationSec, actualDurationSec) {
  const ts = Math.max(0, Number(timestampSec) || 0)
  const refDur = Number(refDurationSec) || 0
  const actDur = Number(actualDurationSec) || 0

  if (!Number.isFinite(ts) || ts < 0) return 0
  if (!Number.isFinite(actDur) || actDur <= 0) return Math.round(ts)
  const maxSafe = Math.max(0, Math.floor(actDur - 2))
  if (!Number.isFinite(refDur) || refDur <= 0) {
    return Math.min(Math.round(ts), maxSafe)
  }

  const diff = Math.abs(actDur - refDur)
  if (diff <= 30) {
    return Math.min(Math.round(ts), maxSafe)
  }
  const ratio = Math.min(1, Math.max(0, ts / refDur))
  const calibrated = Math.round(ratio * actDur)
  return Math.min(Math.max(0, calibrated), maxSafe)
}

/**
 * 5 维零压力情绪微共鸣定义 (Zero-Pressure Mood Echoes)
 */
const MOOD_ECHO_TYPES = [
  { key: 'tear', icon: '💧', label: '破防瞬间', short: '破防' },
  { key: 'solitude', icon: '🌌', label: '孤独共鸣', short: '共鸣' },
  { key: 'shock', icon: '⚡', label: '头皮发麻', short: '震撼' },
  { key: 'god', icon: '🎞️', label: '封神镜头', short: '封神' },
  { key: 'aftertaste', icon: '🍷', label: '后劲太大', short: '余味' }
]

const OFFICIAL_CIRCLES = [
  {
    id: 'circle_featured_youth',
    title: '那些年，我们看过的电影',
    mood: '经典',
    category: '精选',
    badge: '本周精选',
    desc: '一场关于青春与成长的电影之旅。那些回不去的岁月，都在光影里永恒定格。',
    coverColor: 'linear-gradient(135deg, rgba(230, 92, 0, 0.95) 0%, rgba(249, 212, 35, 0.95) 100%)',
    icon: '✨',
    author: { name: '林夕与电影', avatar: 'avatar_1' },
    favCount: 28000,
    favDisplay: '2.8 万',
    shareCount: 6500,
    items: [
      { id: 'yth_1', name: '情书', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2648230658.jpg', rating: '8.9', reason: '你好吗？我很好。雪山呼喊与借书卡背后的素描，青春暗恋最清澈纯净的注脚。' },
      { id: 'yth_2', name: '阳光普照', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2570086961.jpg', rating: '8.6', reason: '这个世界最公平的是太阳，无论纬度高低，每个地方一整年白天与黑夜的时间都各占一半。' },
      { id: 'yth_3', name: '牯岭街少年杀人事件', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p868151806.jpg', rating: '8.9', reason: '四个小时的青春阵痛与时代挽歌。手电筒微光刺破黑暗，世界却从未因少年而改变。' },
      { id: 'yth_4', name: '一一', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2119648123.jpg', rating: '9.1', reason: '电影发明以后，人类的生命至少延长了三倍。洋洋拍下的后脑勺，看见未曾洞见的真实人生。' },
      { id: 'yth_5', name: '少年时代', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2190807575.jpg', rating: '8.9', reason: '十二年真实光阴记录成长。不是我们抓住了时间，而是时间抓住了我们。' },
      { id: 'yth_6', name: '海街日记', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2232247417.jpg', rating: '8.8', reason: '梅子酒熟了的季节，四姐妹在镰仓老屋里温情守望。是枝裕和镜头下生活最宁谧的本真。' },
      { id: 'yth_7', name: '蓝色大门', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p584822571.jpg', rating: '8.4', reason: '留下什么，我们就变成什么样的大人。夏日单车与微风吹拂的衬衫，青春永不退色。' },
      { id: 'yth_8', name: '千与千寻', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2557573348.jpg', rating: '9.4', reason: '不要回头，一直向前走。失去名字便会迷失本心，宫崎骏给所有成长少年的神谕启示。' },
      { id: 'yth_9', name: '死亡诗社', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2575465690.jpg', rating: '9.2', reason: '及时采撷你的花蕾，让生命寻获属于自己的诗意。船长，我的船长！桌子上的仰望震撼一生。' },
      { id: 'yth_10', name: '少年派的奇幻漂流', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p1784592701.jpg', rating: '9.1', reason: '人生就是不断放下，可最遗憾的是，我们都没能好好告别。星光水母海面上的终极求索。' }
    ]
  },
  {
    id: 'circle_must_watch_10',
    title: '人生必看的10部电影',
    mood: '经典',
    category: '经典',
    desc: '世界影史巅峰丰碑，洗涤灵魂与认知边界的传世神作。',
    coverColor: 'linear-gradient(135deg, rgba(30, 20, 10, 0.95) 0%, rgba(90, 60, 25, 0.95) 100%)',
    icon: '👑',
    author: { name: '电影圣经', avatar: 'avatar_2' },
    favCount: 235000,
    favDisplay: '23.5 万',
    shareCount: 48000,
    items: [
      { id: 'mw_1', name: '教父', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p616779645.jpg', rating: '9.3', reason: '永远不要让别人知道你的想法。男人的史诗圣经，家族、责任与权力的巅峰交织。' },
      { id: 'mw_2', name: '肖申克的救赎', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p480747492.jpg', rating: '9.7', reason: '希望是这世上最好的东西。二十年的爬行穿越排污管，只为奔向太平洋自由的湛蓝。' },
      { id: 'mw_3', name: '霸王别姬', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2561716440.jpg', rating: '9.6', reason: '不疯魔不成活。半个世纪的风云动荡与梨园悲欢，华语影史登峰造极之作。' },
      { id: 'mw_4', name: '盗梦空间', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p511638621.jpg', rating: '9.4', reason: '层层梦境的折叠与陀螺的旋转，烧脑叙事与视听奇观的划时代标杆。' },
      { id: 'mw_5', name: '星际穿越', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2614988097.jpg', rating: '9.4', reason: '爱是唯一可以超越时间和空间的事物。五维空间书架背后，跨越几十年的深情凝望。' },
      { id: 'mw_6', name: '美丽人生', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2578474672.jpg', rating: '9.6', reason: '善意的谎言与最伟大的父爱。在集中营的至暗绝境中，以欢笑守护童真。' },
      { id: 'mw_7', name: '辛德勒的名单', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p492406163.jpg', rating: '9.5', reason: '凡救一人，即救全世界。黑白光影中那一抹红衣，人类历史最深刻的反思与良知。' },
      { id: 'mw_8', name: '千与千寻', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2557573348.jpg', rating: '9.4', reason: '失去名字便无法回家。宫崎骏献给所有成年人与孩子的心灵童话。' },
      { id: 'mw_9', name: '泰坦尼克号', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p457760035.jpg', rating: '9.5', reason: '赢得那张船票是我一生最美好的事。冰海沉船之夜，生死相许的永恒爱情。' },
      { id: 'mw_10', name: '楚门的世界', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p479682972.jpg', rating: '9.4', reason: '如果再也见不到你，祝你早安、午安、晚安。踏出虚假摄影棚，找回真正的人生。' }
    ]
  },
  {
    id: 'circle_single_universe',
    title: '一个人的电影宇宙',
    mood: '情绪',
    category: '情绪',
    desc: '在孤独的浩瀚光年里漫游，寻找自我存在的终极意义与温暖。',
    coverColor: 'linear-gradient(135deg, rgba(16, 26, 44, 0.95) 0%, rgba(35, 50, 75, 0.95) 100%)',
    icon: '🪐',
    author: { name: '深空观测者', avatar: 'avatar_3' },
    favCount: 187000,
    favDisplay: '18.7 万',
    shareCount: 39000,
    items: [
      { id: 'uni_1', name: '海上钢琴师', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2574551676.jpg', rating: '9.3', reason: '黑白琴键是有限的，琴键奏出的生命咏叹是无限的。' },
      { id: 'uni_2', name: '她', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2163429841.jpg', rating: '8.4', reason: '人与AI的跨维度倾心。在繁华现代世界里探讨孤独的究极边界。' },
      { id: 'uni_3', name: '迷失东京', pic: 'https://image.huyajs.com/cover/8e088b124c72a1ac0dcbcbdebbfb08f3.jpg', rating: '8.2', reason: '异乡霓虹都市里，两个孤独灵魂的短暂交汇与耳边轻语。' },
      { id: 'uni_4', name: '海边的曼彻斯特', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2421855653.jpg', rating: '8.6', reason: '我们不一定要走出来，学会带着缺憾生活，也是一种勇敢。' },
      { id: 'uni_5', name: '银翼杀手2049', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2501511788.jpg', rating: '8.3', reason: '黄沙漫天的废墟之上，人造人向虚无存在的悲壮告别。' },
      { id: 'uni_6', name: '绿皮书', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2549177902.jpg', rating: '8.9', reason: '世界上有太多孤独的人，害怕踏出第一步。一辆车上的偏见消除与相惜。' },
      { id: 'uni_7', name: '机器人总动员', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p1461851991.jpg', rating: '9.4', reason: '废墟地球上七百年唯一的清扫者瓦力，穿越星海寻找爱与牵挂。' },
      { id: 'uni_8', name: '荒野生存', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p465687407.jpg', rating: '8.6', reason: '唯有在孤独荒原的终点，才顿悟快乐唯有分享时才是真实的。' },
      { id: 'uni_9', name: '暖暖内含光', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p479142790.jpg', rating: '8.5', reason: '纵然记忆可以被彻底洗除，相遇的心依然会在蒙托克的海边重逢。' },
      { id: 'uni_10', name: '降临', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2411622637.jpg', rating: '7.8', reason: '哪怕早已窥见生命旅途的痛苦结局，我依然义无反顾地拥抱它。' },
      { id: 'uni_11', name: '楚门的世界', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p479682972.jpg', rating: '9.4', reason: '走出摄影棚，一个人走向浩瀚真实的星辰大海。' },
      { id: 'uni_12', name: '少年派的奇幻漂流', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p1784592701.jpg', rating: '9.1', reason: '一人一虎面对太平洋的波澜浩瀚，找回内在灵魂的救赎。' }
    ]
  },
  {
    id: 'circle_most_romantic',
    title: '世界上最浪漫的电影',
    mood: '主题',
    category: '主题',
    desc: '爱是穿越时空与生死的唯一实体，至死不渝的浪漫诗篇。',
    coverColor: 'linear-gradient(135deg, rgba(80, 20, 45, 0.95) 0%, rgba(140, 45, 80, 0.95) 100%)',
    icon: '🌹',
    author: { name: '恋人絮语', avatar: 'avatar_4' },
    favCount: 129000,
    favDisplay: '12.9 万',
    shareCount: 26000,
    items: [
      { id: 'rom_1', name: '爱在黎明破晓前', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2555762374.jpg', rating: '8.8', reason: '维也纳的一夜漫步，无止境的交谈与相视一笑，爱情最纯粹的悸动。' },
      { id: 'rom_2', name: '花样年华', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1910828286.jpg', rating: '8.8', reason: '昏黄路灯下的旗袍掠影，那些最克制却最汹涌的隐秘情愫。' },
      { id: 'rom_3', name: '泰坦尼克号', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p457760035.jpg', rating: '9.5', reason: 'You jump, I jump. 冰海巨轮沉没的那一夜，爱情超越了生死与时间的维度。' },
      { id: 'rom_4', name: '傲慢与偏见', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2012532948.jpg', rating: '8.7', reason: '晨雾中的旷野相迎，傲慢消融，偏见释怀，你俘获了我的身心。' },
      { id: 'rom_5', name: '罗马假日', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2189264010.jpg', rating: '9.1', reason: '赫本与派克的短暂邂逅，真理之口的惊呼与告别时的深情回眸。' },
      { id: 'rom_6', name: '恋恋笔记本', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p483730937.jpg', rating: '8.6', reason: '雨中的质问与相拥，一生只爱一人的矢志不渝。' },
      { id: 'rom_7', name: '真爱至上', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p475600770.jpg', rating: '8.6', reason: '圣诞飘雪夜门前的纸板告白，爱其实无处不在。' },
      { id: 'rom_8', name: '怦然心动', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p501177648.jpg', rating: '9.1', reason: '斯人若彩虹，遇上方知有。梧桐树上的微风与少年的顿悟。' },
      { id: 'rom_9', name: '天使爱美丽', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2447590313.jpg', rating: '8.7', reason: '巴黎小巷里的奇趣浪漫，用善意温暖每一个孤独的灵魂。' },
      { id: 'rom_10', name: '大话西游之大圣娶亲', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2455050536.jpg', rating: '9.2', reason: '我的意中人是个盖世英雄，有一天他会踩着七彩祥云来娶我。' }
    ]
  },
  {
    id: 'circle_rewatch_classics',
    title: '值得反复看的经典电影',
    mood: '经典',
    category: '经典',
    desc: '常看常新，每次重温都能读出全新的人生滋味与哲学回响。',
    coverColor: 'linear-gradient(135deg, rgba(35, 25, 45, 0.95) 0%, rgba(65, 45, 80, 0.95) 100%)',
    icon: '🎞️',
    author: { name: '胶片时光机', avatar: 'avatar_5' },
    favCount: 96000,
    favDisplay: '9.6 万',
    shareCount: 18000,
    items: [
      { id: 'cls_1', name: '大话西游之大圣娶亲', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2455050536.jpg', rating: '9.2', reason: '年少不懂至尊宝，读懂已是城墙人。华语后现代喜剧与悲剧的巅峰。' },
      { id: 'cls_2', name: '功夫', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2219011938.jpg', rating: '8.8', reason: '周星驰集大成之作，从绝望小人物到如来神掌的顿悟与宽恕。' },
      { id: 'cls_3', name: '无间道', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2564556863.jpg', rating: '9.3', reason: '天台对决与摩斯密码，华语警匪天花板，宿命与身份认同的无解深渊。' },
      { id: 'cls_4', name: '盗梦空间', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p511638621.jpg', rating: '9.4', reason: '每一次重看都能发现隐藏在梦境深处的伏笔与造梦者细节。' },
      { id: 'cls_5', name: '指环王3：王者无敌', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2646999423.jpg', rating: '9.3', reason: '影史无可超越的中土魔幻史诗，刚铎冲锋号角每次响起都令人热泪盈眶。' },
      { id: 'cls_6', name: '黑客帝国', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p451926917.jpg', rating: '9.1', reason: '子弹时间与红蓝药丸，二十年前便精准预言了元宇宙与虚拟牢笼。' },
      { id: 'cls_7', name: '搏击俱乐部', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p480383375.jpg', rating: '9.0', reason: '抛弃一切你才能获得真正的自由。消费主义社会的最猛烈炸药。' },
      { id: 'cls_8', name: '饮食男女', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p1910899751.jpg', rating: '9.2', reason: '李安家庭三部曲巅峰，开场切菜烹饪长镜头与东方人伦情感的细腻典范。' },
      { id: 'cls_9', name: '疯狂的麦克斯4：狂暴之路', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2236181653.jpg', rating: '8.7', reason: '纯粹狂暴实景动作视听交响乐，每次观影都心率飙升。' },
      { id: 'cls_10', name: '重庆森林', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p792381411.jpg', rating: '8.8', reason: '加利福尼亚梦境与凤梨罐头，王家卫镜头下都市男女最迷醉的情愫。' },
      { id: 'cls_11', name: '触不可及', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1454261925.jpg', rating: '9.3', reason: '跨越阶层的平等挚友，重燃对生命狂放热爱的温情灵药。' },
      { id: 'cls_12', name: '忠犬八公的故事', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p524964018.jpg', rating: '9.4', reason: '九年的风雪守望，只要看一次就会被爱与忠诚彻底击中心灵。' },
      { id: 'cls_13', name: '记忆碎片', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p641688453.jpg', rating: '8.7', reason: '诺兰神作倒叙双线剪辑，重看才能拼凑出失忆者眼前的全部残局。' },
      { id: 'cls_14', name: '致命魔术', pic: 'https://p.lztutu.com/upload/vod/20220322-1/59a630cb2ae68c0b0802a2fd883b0996.jpg', rating: '8.9', reason: '两位魔术大师以生命与偏执为筹码的残酷斗法。' },
      { id: 'cls_15', name: '卧虎藏龙', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1596883196.jpg', rating: '8.4', reason: '江湖里的剑道与人心，东方哲学的克制与飞向云海的纵身一跃。' }
    ]
  },
  {
    id: 'circle_mood_solitude',
    title: '深夜孤独经典',
    mood: '独处时光',
    desc: '在无人的深夜，给疲惫的心灵一场深邃而宁静的拥抱。孤独不是寂寞，而是与自己灵魂深处的低语。',
    coverColor: 'linear-gradient(135deg, rgba(20, 30, 48, 0.95) 0%, rgba(36, 59, 85, 0.95) 100%)',
    icon: '🌙',
    author: { name: '影悦策展人', avatar: 'avatar_1' },
    favCount: 1520,
    shareCount: 426,
    items: [
      { id: 'sol_1', name: '肖申克的救赎', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p480747492.jpg', rating: '9.7', reason: '希望是这世上最好的东西，而美好的东西永不消逝。每一只羽翼丰满的鸟，都无法被牢笼禁锢。' },
      { id: 'sol_2', name: '海上钢琴师', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2574551676.jpg', rating: '9.3', reason: '陆地对我来说是一艘太大的船，我更宁愿在琴键间流浪。有限的黑白琴键，弹出无限的生命咏叹。' },
      { id: 'sol_3', name: '楚门的世界', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p479682972.jpg', rating: '9.4', reason: '如果再也不能见到你，祝你早安、午安、晚安。踏出这扇门，虚伪的巨大摄影棚终成昨日过客。' },
      { id: 'sol_4', name: '迷失东京', pic: 'https://image.huyajs.com/cover/8e088b124c72a1ac0dcbcbdebbfb08f3.jpg', rating: '8.2', reason: '在繁华都市的霓虹夜色中，两个孤独灵魂的短暂交汇与耳边轻语，治愈了所有异乡漂泊的寂寥。' },
      { id: 'sol_5', name: '她', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2163429841.jpg', rating: '8.4', reason: '与人工智能谈一场跨维度的恋爱。在人潮拥挤的冰冷现代都市，探讨亲密与孤独的边界。' },
      { id: 'sol_6', name: '少年派的奇幻漂流', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p1784592701.jpg', rating: '9.1', reason: '浩瀚汪洋里一人一虎的奇幻求生。无论最后你相信哪个版本的故事，神性与兽性都在这一刻达成和解。' },
      { id: 'sol_7', name: '绿皮书', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2549177902.jpg', rating: '8.9', reason: '世界上有太多孤独的人，害怕踏出第一步。一辆老爷车上的偏见消融与灵魂相惜。' },
      { id: 'sol_8', name: '海边的曼彻斯特', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2421855653.jpg', rating: '8.6', reason: '我们并不一定要与过去的痛苦和解，走不出来也没关系。真正的深情，是学会背负缺憾前行。' }
    ]
  },
  {
    id: 'circle_mood_rain',
    title: '雨天悬疑烧脑',
    mood: '悬疑解密',
    desc: '窗外细雨霏霏，室内案情扑朔迷离。每一处细节皆是线索，智力与直觉的极致角逐。',
    coverColor: 'linear-gradient(135deg, rgba(9, 32, 63, 0.95) 0%, rgba(83, 120, 149, 0.95) 100%)',
    icon: '🌧️',
    author: { name: '推理馆长', avatar: 'avatar_2' },
    favCount: 1390,
    shareCount: 395,
    items: [
      { id: 'rain_1', name: '盗梦空间', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p511638621.jpg', rating: '9.4', reason: '现实与梦境的层层重叠，陀螺若隐若现地旋转。你确信此刻正在清醒，还是依然沉睡在造梦者的潜意识里？' },
      { id: 'rain_2', name: '禁闭岛', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p1832875827.jpg', rating: '8.9', reason: '要像个怪物一样活着，还是像个好人一样死去？雨夜悬崖灯塔下，关于自我认知与心魔的终极诘问。' },
      { id: 'rain_3', name: '看不见的客人', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2498971355.jpg', rating: '8.8', reason: '43 次反转的密室谎言，时钟滴答作响。不到最后一分钟撕下面具，绝无可能窥探这出复仇迷局的真相。' },
      { id: 'rain_4', name: '利刃出鞘', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2574043647.jpg', rating: '8.1', reason: '致敬古典本格风骨的精妙杀局，华丽庄园里各怀鬼胎的家族遗产争夺战，反转层出不穷。' },
      { id: 'rain_5', name: '致命魔术', pic: 'https://p.lztutu.com/upload/vod/20220322-1/59a630cb2ae68c0b0802a2fd883b0996.jpg', rating: '8.9', reason: '每个魔术都有三个步骤：验证、转换与化腐朽为神奇。两位魔术师以生命为赌注的偏执巅峰对决。' },
      { id: 'rain_6', name: '记忆碎片', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p641688453.jpg', rating: '8.7', reason: '只有十分钟记忆的失忆症患者，在自己身体的刺青上追寻杀妻真凶。颠覆性的倒叙双线剪辑里程碑。' },
      { id: 'rain_7', name: '七宗罪', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p457631648.jpg', rating: '8.8', reason: '连绵阴雨的罪恶之城，连环杀手的终极命题。那个未被拆开的纸盒，撕裂了理性的最后防线。' },
      { id: 'rain_8', name: '嫌疑人X的献身', pic: 'https://p.lztutu.com/upload/vod/20220329-1/8875b7349c77884b177c41dc1202c500.jpg', rating: '8.5', reason: '究竟什么样的诡计，才能骗过天才物理学家？以生命为画笔，写给深爱之人最深沉的一道方程式。' }
    ]
  },
  {
    id: 'circle_mood_nostalgia',
    title: '华语经典回声',
    mood: '怀旧岁月',
    desc: '黄金时代的胶片质感与时光印记，那些永远无法褪色的光影记忆，回荡在岁月长河中。',
    coverColor: 'linear-gradient(135deg, rgba(75, 18, 72, 0.95) 0%, rgba(240, 194, 123, 0.95) 100%)',
    icon: '🎞️',
    author: { name: '留声机', avatar: 'avatar_3' },
    favCount: 2180,
    shareCount: 680,
    items: [
      { id: 'nos_1', name: '霸王别姬', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2561716440.jpg', rating: '9.6', reason: '不疯魔不成活。半个世纪的风云动荡与梨园悲欢，一出人戏难分的华语影史巅峰史诗。' },
      { id: 'nos_2', name: '花样年华', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1910828286.jpg', rating: '8.8', reason: '如果多一张船票，你会不会跟我走？昏黄路灯下的旗袍掠影，那些最克制却最汹涌的隐秘情愫。' },
      { id: 'nos_3', name: '大话西游之大圣娶亲', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2455050536.jpg', rating: '9.2', reason: '曾经有一份真诚的爱情放在我面前... 幼时看是喜剧，成年再看却满是宿命无可奈何的沧桑与叹息。' },
      { id: 'nos_4', name: '无间道', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2564556863.jpg', rating: '9.3', reason: '对不起，我是警察。天台上的黑白博弈与无间轮回，华语卧底警匪片难以逾越的封神之作。' },
      { id: 'nos_5', name: '饮食男女', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p1910899751.jpg', rating: '9.2', reason: '人生不能像做菜，把所有的料都准备好了才下锅。一席周末家宴，道尽华人家庭里最浓烈也最克制的爱。' },
      { id: 'nos_6', name: '重庆森林', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p792381411.jpg', rating: '8.8', reason: '不知道从什么时候开始，在什么东西上面都有个日期。金城武的凤梨罐头与王菲的加州梦游。' },
      { id: 'nos_7', name: '卧虎藏龙', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1596883196.jpg', rating: '8.4', reason: '把手握紧，里面什么也没有；把手松开，你拥有的是一切。竹林之巅的诗意比剑，李安镜头下的东方心性。' },
      { id: 'nos_8', name: '功夫', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2219011938.jpg', rating: '8.8', reason: '想学啊？我教你啊。从猪笼城寨的小混混到如来神掌的顿悟，周星驰献给无厘头动作美学的集大成之作。' }
    ]
  },
  {
    id: 'circle_mood_cyber',
    title: '赛博朋克漫游',
    mood: '科幻未来',
    desc: '高科技与底层生活交织的未来图景，在雨夜霓虹阴影下寻找生命的真正定义。',
    coverColor: 'linear-gradient(135deg, rgba(15, 12, 41, 0.95) 0%, rgba(48, 43, 99, 0.95) 50%, rgba(36, 36, 62, 0.95) 100%)',
    icon: '⚡',
    author: { name: '仿生人', avatar: 'avatar_4' },
    favCount: 1120,
    shareCount: 310,
    items: [
      { id: 'cyb_1', name: '银翼杀手2049', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2501511788.jpg', rating: '8.3', reason: '我曾见过人类无法想象的光景，都在时光的雨中逝去。黄沙漫天的废墟之上，人造人向虚无存在的悲壮告别。' },
      { id: 'cyb_2', name: '攻壳机动队', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1910832390.jpg', rating: '9.1', reason: '在浩瀚无垠的网络世界里，记忆若能随意篡改，我的真正灵魂又在何方？硬核科幻哲学启蒙基石。' },
      { id: 'cyb_3', name: '黑客帝国', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p451926917.jpg', rating: '9.1', reason: '吞下红色药丸，去直面真实世界的残酷荒原。颠覆世纪的子弹时间，人类与母体智能的破壁之战。' },
      { id: 'cyb_4', name: '头号玩家', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2516578307.jpg', rating: '8.7', reason: '现实是唯一真实存在的地方，感谢你玩我的游戏。斯皮尔伯格献给全球流行文化与极客世代的浪漫情书。' },
      { id: 'cyb_5', name: '机械姬', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2221650372.jpg', rating: '7.6', reason: '密闭别墅里的图灵测试。当人工智能学会了伪装与情感操纵，造物主与被造物的博弈瞬间反转。' },
      { id: 'cyb_6', name: '阿丽塔：战斗天使', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2544987866.jpg', rating: '7.5', reason: '废铁城女孩拥有火星古武术的机械之心。在大马士革钢刀与机甲残骸间，觉醒守护爱人的狂暴战力。' },
      { id: 'cyb_7', name: '银翼杀手', pic: 'https://p.lztutu.com/upload/vod/20221016-1/0e444684451adeb418ff1a73f2467a3b.jpg', rating: '8.6', reason: '一切光景都将湮没于时间的洪流，如同泪水消失在雨中。黑色电影与赛博朋克美学的始祖图腾。' },
      { id: 'cyb_8', name: '创：战纪', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p749506698.jpg', rating: '7.4', reason: 'Daft Punk 操刀的电子原声与网格光轮竞速。极致冷峻的荧光线条，建构电子母系统的虚拟疆界。' }
    ]
  },
  {
    id: 'circle_mood_tears',
    title: '催泪温情名作',
    mood: '治愈温情',
    desc: '触动内心最柔软角落的人间至情，关于爱、离别、救赎与生命的温暖宽恕。',
    coverColor: 'linear-gradient(135deg, rgba(43, 88, 118, 0.95) 0%, rgba(78, 67, 118, 0.95) 100%)',
    icon: '💧',
    author: { name: '解忧铺', avatar: 'avatar_5' },
    favCount: 1840,
    shareCount: 540,
    items: [
      { id: 'tea_1', name: '忠犬八公的故事', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p524964018.jpg', rating: '9.4', reason: '它不知道什么是离别，它只知道你在哪里，爱与守望就在哪里。火车站前落雪覆盖的九年不移。' },
      { id: 'tea_2', name: '美丽人生', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2578474672.jpg', rating: '9.6', reason: '这是我的父亲给我的最珍贵的礼物——一个善意的童话。在集中营的至暗绝境中，以欢笑守护童真。' },
      { id: 'tea_3', name: '泰坦尼克号', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p457760035.jpg', rating: '9.5', reason: '赢得那张船票，是我一生中最美好的事情。冰海巨轮沉没的那一夜，爱情超越了生死与时间的维度。' },
      { id: 'tea_4', name: '触不可及', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1454261925.jpg', rating: '9.3', reason: '真正的友情是跨越身份、财富与肉体残疾的平视与坦荡。在音乐与速度中重新唤醒对生命的热爱。' },
      { id: 'tea_5', name: '寻梦环游记', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2503997609.jpg', rating: '9.1', reason: '真正的死亡是世界上没有一个人记得你。金盏花桥的那一端，万寿菊编织的斑斓亡灵世界与家族眷恋。' },
      { id: 'tea_6', name: '当幸福来敲门', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2614359276.jpg', rating: '9.2', reason: '如果你有梦想，就要去捍卫它。地铁公厕里捂住孩子耳朵的父亲，终于在华尔街的人潮中迎来掌声。' },
      { id: 'tea_7', name: '飞屋环游记', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p462495990.jpg', rating: '9.1', reason: '无数气球牵引着飞向仙境瀑布的木屋。开篇十分钟无言的相守一生，是影史上最动人的爱情缩影。' },
      { id: 'tea_8', name: '辛德勒的名单', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p492406163.jpg', rating: '9.5', reason: '凡救一人，即救全世界。黑白光影中那抹触动心弦的红衣女孩，人类至暗历史中闪耀的人性微光。' }
    ]
  },
  {
    id: 'circle_mood_epic',
    title: '热血燃向史诗',
    mood: '高分必看',
    desc: '孤勇者的觉醒与史诗级反击，每一帧都令人心潮澎湃，唤醒灵魂深处不屈的力量。',
    coverColor: 'linear-gradient(135deg, rgba(255, 65, 108, 0.95) 0%, rgba(255, 75, 43, 0.95) 100%)',
    icon: '🔥',
    author: { name: '冒险家', avatar: 'avatar_6' },
    favCount: 1670,
    shareCount: 480,
    items: [
      { id: 'epi_1', name: '星际穿越', pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2614988097.jpg', rating: '9.4', reason: '不要温和地走进那个良夜。爱不是人类发明的东西，它是唯一能穿越五维空间与引力黑洞的实体。' },
      { id: 'epi_2', name: '指环王3：王者无敌', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2646999423.jpg', rating: '9.3', reason: '也许有一天，人类的勇气会枯竭，但绝不是今天！刚铎白树重新开花，中土魔幻史诗的壮丽绝唱。' },
      { id: 'epi_3', name: '角斗士', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2411580491.jpg', rating: '8.6', reason: '在今生或来世，我终将完成复仇。大将军沦为角斗士，重燃罗马帝国自由与尊严的黄昏荣耀。' },
      { id: 'epi_4', name: '疯狂的麦克斯4：狂暴之路', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2236181653.jpg', rating: '8.7', reason: '废土狂澜，纯粹狂暴的高燃视听交响乐。绝望世界里的救赎之旅，引擎轰鸣震撼灵魂。' },
      { id: 'epi_5', name: '黑暗骑士', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p462656467.jpg', rating: '9.2', reason: '他不是我们应得的英雄，却是我们此刻需要的守护者。蝙蝠侠与小丑在混乱深渊里的无解正邪博弈。' },
      { id: 'epi_6', name: '拯救大兵瑞恩', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1014542496.jpg', rating: '9.1', reason: '奥马哈海滩二十五分钟残酷写实枪弹风暴。八个人去救一个二等兵，关于生命价值的终极权衡。' },
      { id: 'epi_7', name: '盗火线', pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p1487673510.jpg', rating: '8.5', reason: '阿尔帕西诺与德尼罗世纪同框！洛杉矶街头最硬核的劫案交火，两个惺惺相惜男人的宿命终局。' },
      { id: 'epi_8', name: '搏击俱乐部', pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p480383375.jpg', rating: '9.0', reason: '抛弃一切，你才能获得真正的自由。消费主义牢笼里的疯狂觉醒与颠覆反叛。' }
    ]
  }
]

const AVATAR_OPTIONS = [
  { id: 'avatar_1', name: '极简黑金', bg: 'linear-gradient(135deg, #1c1c1e 0%, #2c2c2e 100%)', symbol: 'CJ', icon: '✦' },
  { id: 'avatar_2', name: '深海夜航', bg: 'linear-gradient(135deg, #0a192f 0%, #1e3a5f 100%)', symbol: 'OC', icon: '◈' },
  { id: 'avatar_3', name: '胶片记忆', bg: 'linear-gradient(135deg, #2b1d0c 0%, #4a3525 100%)', symbol: 'FM', icon: '◉' },
  { id: 'avatar_4', name: '极光幽蓝', bg: 'linear-gradient(135deg, #091a28 0%, #17384a 100%)', symbol: 'AU', icon: '❖' },
  { id: 'avatar_5', name: '暮霭紫灰', bg: 'linear-gradient(135deg, #1e1329 0%, #362247 100%)', symbol: 'DK', icon: '❂' },
  { id: 'avatar_6', name: '月岩银灰', bg: 'linear-gradient(135deg, #232526 0%, #414345 100%)', symbol: 'SL', icon: '▲' }
]

/**
 * 官方预置经典电影高光时刻锚点库 (Cinematic Moments)
 * 包含双轨时间轴锚点 (timestamp_sec + duration_sec + progress_ratio) 与 5 维零压力情绪微共鸣
 */
const PRESET_MOMENTS = [
  {
    moment_id: 'mom_yth_loveletter_1',
    circle_id: 'circle_featured_youth',
    movie_title: '情书',
    timestamp_sec: 2538,
    duration_sec: 7020,
    quote_or_note: '图书馆窗帘被风吹起，少年藤井树在窗边看书的侧影，是青春暗恋最安静的定格。',
    mood_tag: '🎞️ 封神镜头',
    author: { name: '林夕与电影', avatar: 'avatar_1' },
    echoes: { tear: 680, solitude: 920, shock: 190, god: 1850, aftertaste: 760 }
  },
  {
    moment_id: 'mom_yth_loveletter_2',
    circle_id: 'circle_featured_youth',
    movie_title: '情书',
    timestamp_sec: 6420,
    duration_sec: 7020,
    quote_or_note: '借书卡翻过来的那一瞬，背面画满了少女的素描肖像，跨越生死的暗恋终于有了回响。',
    mood_tag: '💧 破防瞬间',
    author: { name: '林夕与电影', avatar: 'avatar_1' },
    echoes: { tear: 3420, solitude: 1280, shock: 540, god: 2190, aftertaste: 1890 }
  },
  {
    moment_id: 'mom_yth_yiyi_1',
    circle_id: 'circle_featured_youth',
    movie_title: '一一',
    timestamp_sec: 9780,
    duration_sec: 10380,
    quote_or_note: '婆婆，我好想你。我觉得我也老了。洋洋站在告别仪式上念出那段话，看懂的人都沉默了。',
    mood_tag: '🍷 后劲太大',
    author: { name: '胶片时光机', avatar: 'avatar_3' },
    echoes: { tear: 1920, solitude: 2150, shock: 380, god: 1640, aftertaste: 2890 }
  },
  {
    moment_id: 'mom_yth_spirited_1',
    circle_id: 'circle_featured_youth',
    movie_title: '千与千寻',
    timestamp_sec: 5520,
    duration_sec: 7500,
    quote_or_note: '海上电车静静驶过湛蓝水面，千寻与无脸男并肩坐着，一句话也没有说，却治愈了整个童年。',
    mood_tag: '🌌 孤独共鸣',
    author: { name: '林夕与电影', avatar: 'avatar_1' },
    echoes: { tear: 1450, solitude: 3120, shock: 410, god: 2780, aftertaste: 1960 }
  },
  {
    moment_id: 'mom_mw_shawshank_1',
    circle_id: 'circle_must_watch_10',
    movie_title: '肖申克的救赎',
    timestamp_sec: 3915,
    duration_sec: 8520,
    quote_or_note: '安迪锁上广播室大门，让《费加罗的婚礼》响彻高墙广场，所有囚犯驻足仰望自由的歌声。',
    mood_tag: '⚡ 头皮发麻',
    author: { name: '电影圣经', avatar: 'avatar_2' },
    echoes: { tear: 1890, solitude: 960, shock: 3680, god: 4120, aftertaste: 2310 }
  },
  {
    moment_id: 'mom_mw_shawshank_2',
    circle_id: 'circle_must_watch_10',
    movie_title: '肖申克的救赎',
    timestamp_sec: 6840,
    duration_sec: 8520,
    quote_or_note: '暴雨雷鸣之夜，爬出五百码排污管的安迪在雨中张开双臂仰天洗礼，重获新生的史诗定格。',
    mood_tag: '🎞️ 封神镜头',
    author: { name: '电影圣经', avatar: 'avatar_2' },
    echoes: { tear: 2760, solitude: 1120, shock: 4590, god: 5280, aftertaste: 3140 }
  },
  {
    moment_id: 'mom_mw_interstellar_0',
    circle_id: 'circle_must_watch_10',
    movie_title: '星际穿越',
    timestamp_sec: 2530,
    start_sec: 2526,
    end_sec: 2534,
    duration_sec: 10140,
    quote_or_note: '不要温顺地走进那个良夜。库珀驾车驶离玉米地，掀开副驾驶毛毯却发现女儿并未藏在车下，引擎轰鸣声与火箭倒计时交错。',
    mood_tag: '💧 破防瞬间',
    author: { name: '深空观测者', avatar: 'avatar_4' },
    echoes: { tear: 3120, solitude: 1980, shock: 1640, god: 2890, aftertaste: 2150 }
  },
  {
    moment_id: 'mom_mw_interstellar_1',
    circle_id: 'circle_must_watch_10',
    movie_title: '星际穿越',
    timestamp_sec: 5610,
    start_sec: 5606,
    end_sec: 5614,
    duration_sec: 10140,
    quote_or_note: '米勒星球一小时等于地球七年。库珀回到飞船一口气看完儿女跨越二十三年的录像，泪如雨下。',
    mood_tag: '💧 破防瞬间',
    author: { name: '深空观测者', avatar: 'avatar_4' },
    echoes: { tear: 4820, solitude: 2340, shock: 1980, god: 3650, aftertaste: 2910 }
  },
  {
    moment_id: 'mom_mw_interstellar_2',
    circle_id: 'circle_must_watch_10',
    movie_title: '星际穿越',
    timestamp_sec: 8325,
    start_sec: 8321,
    end_sec: 8329,
    duration_sec: 10140,
    quote_or_note: '五维超立方体书架背后，库珀拨动引力琴弦将黑洞量子数据化作摩斯密码刻进女儿手表的秒针里，爱跨越了时空维度。',
    mood_tag: '🎞️ 封神镜头',
    author: { name: '深空观测者', avatar: 'avatar_4' },
    echoes: { tear: 4150, solitude: 2680, shock: 3920, god: 5120, aftertaste: 4230 }
  },
  {
    moment_id: 'mom_uni_1900_1',
    circle_id: 'circle_single_universe',
    movie_title: '海上钢琴师',
    timestamp_sec: 3120,
    start_sec: 3116,
    end_sec: 3124,
    duration_sec: 9900,
    quote_or_note: '暴风雨夜的船舱大厅，1900卸下钢琴滑轮锁扣，随着海浪摇摆弹出魔幻华尔兹。',
    mood_tag: '🎞️ 封神镜头',
    author: { name: '深空观测者', avatar: 'avatar_3' },
    echoes: { tear: 920, solitude: 1840, shock: 2150, god: 3490, aftertaste: 1620 }
  },
  {
    moment_id: 'mom_uni_manchester_1',
    circle_id: 'circle_single_universe',
    movie_title: '海边的曼彻斯特',
    timestamp_sec: 6180,
    start_sec: 6176,
    end_sec: 6184,
    duration_sec: 8220,
    quote_or_note: '街头偶遇前妻，一句 "I can\'t beat it"（我走不出来），道尽了人世间最真实的伤痛与体谅。',
    mood_tag: '💧 破防瞬间',
    author: { name: '深空观测者', avatar: 'avatar_3' },
    echoes: { tear: 3890, solitude: 3410, shock: 620, god: 1980, aftertaste: 3560 }
  },
  {
    moment_id: 'mom_rom_sunrise_1',
    circle_id: 'circle_most_romantic',
    movie_title: '爱在黎明破晓前',
    timestamp_sec: 2240,
    start_sec: 2236,
    end_sec: 2244,
    duration_sec: 6060,
    quote_or_note: '狭窄的唱片店试听间里，两人无数次欲言又止地错开眼神，空气里全是心动的电流。',
    mood_tag: '🎞️ 封神镜头',
    author: { name: '恋人絮语', avatar: 'avatar_4' },
    echoes: { tear: 840, solitude: 1120, shock: 690, god: 2890, aftertaste: 2450 }
  },
  {
    moment_id: 'mom_rom_inmood_1',
    circle_id: 'circle_most_romantic',
    movie_title: '花样年华',
    timestamp_sec: 4380,
    start_sec: 4376,
    end_sec: 4384,
    duration_sec: 5880,
    quote_or_note: '如果我多一张船票，你会不会跟我走？昏暗街角潮湿的雨夜，旗袍摇曳出最克制的深情。',
    mood_tag: '🍷 后劲太大',
    author: { name: '恋人絮语', avatar: 'avatar_4' },
    echoes: { tear: 1680, solitude: 2540, shock: 430, god: 3120, aftertaste: 3490 }
  },
  {
    moment_id: 'mom_cls_west_1',
    circle_id: 'circle_rewatch_classics',
    movie_title: '大话西游之大圣娶亲',
    timestamp_sec: 5340,
    start_sec: 5336,
    end_sec: 5344,
    duration_sec: 5700,
    quote_or_note: '那个人样子好怪啊。我也看到了，他好像条狗啊。城墙之下夕阳武士相拥，大圣转身踏入黄沙。',
    mood_tag: '💧 破防瞬间',
    author: { name: '胶片时光机', avatar: 'avatar_5' },
    echoes: { tear: 5620, solitude: 4180, shock: 1120, god: 4890, aftertaste: 5120 }
  },
  {
    moment_id: 'mom_cls_infernal_1',
    circle_id: 'circle_rewatch_classics',
    movie_title: '无间道',
    timestamp_sec: 4920,
    start_sec: 4916,
    end_sec: 4924,
    duration_sec: 6060,
    quote_or_note: '以前我没得选，现在我想做个好人。维多利亚港高楼天台烈日猎猎，宿命对决一触即发。',
    mood_tag: '⚡ 头皮发麻',
    author: { name: '胶片时光机', avatar: 'avatar_5' },
    echoes: { tear: 1420, solitude: 2180, shock: 3450, god: 4120, aftertaste: 2890 }
  }
]

// 为所有官方圈子补齐规范化 movie_id、旅程站点序号 step_order 与高光时刻列表 moments[]（自动按时间轴升序排列）
function enrichOfficialCircles() {
  for (const circle of OFFICIAL_CIRCLES) {
    circle.items = (circle.items || []).map((it, idx) => ({
      ...it,
      movie_id: it.movie_id || canonicalMovieId(it.name, it.year || ''),
      step_order: idx + 1
    }))
    // 关联该圈子或圈内同名电影的预置高光时刻
    const movieNames = new Set(circle.items.map((it) => it.name))
    const matchedMoments = PRESET_MOMENTS.filter(
      (m) => m.circle_id === circle.id || movieNames.has(m.movie_title)
    ).map((m) => {
      const movie_id = canonicalMovieId(m.movie_title)
      const ts = Math.max(0, Number(m.timestamp_sec) || 0)
      const dur = Math.max(1, Number(m.duration_sec) || 7200)
      const startSec = m.start_sec !== undefined ? Math.max(0, Number(m.start_sec)) : Math.max(0, ts - 4)
      const endSec = m.end_sec !== undefined ? Math.max(startSec + 2, Number(m.end_sec)) : Math.min(dur, ts + 4)
      const clipDur = Math.max(2, endSec - startSec)
      const ratio = Number((ts / dur).toFixed(4))
      const label = formatTimeLabel(ts)
      const clipRangeLabel = `${formatTimeLabel(startSec)} - ${formatTimeLabel(endSec)}`
      return {
        id: m.moment_id,
        moment_id: m.moment_id,
        circle_id: circle.id,
        movie_id,
        movie_title: m.movie_title,
        timestamp_sec: ts,
        start_sec: startSec,
        end_sec: endSec,
        clip_duration: clipDur,
        clip_range_label: clipRangeLabel,
        duration_sec: dur,
        progress_ratio: ratio,
        time_label: label,
        anchor: {
          timestamp_sec: ts,
          start_sec: startSec,
          end_sec: endSec,
          duration_sec: dur,
          progress_ratio: ratio,
          time_label: label
        },
        quote_or_note: m.quote_or_note,
        mood_tag: m.mood_tag,
        author_name: m.author?.name || '影悦策展人',
        author: m.author,
        echoes: { ...m.echoes }
      }
    }).sort((a, b) => (a.start_sec ?? a.timestamp_sec) - (b.start_sec ?? b.timestamp_sec))
    circle.moments = matchedMoments
  }
}
enrichOfficialCircles()

const TOKEN_PREFIX = 'CJ_CIRCLE_V1:'
const TOKEN_PREFIX_V2 = 'CJ_CIRCLE_V2:'
const MAX_TOKEN_LENGTH = 16384
const MAX_MOVIES_PER_CIRCLE = 100
const MAX_MOMENTS_PER_CIRCLE = 200

function sanitizeMoment(m, fallbackCircleId = '') {
  if (!m || typeof m !== 'object') return null
  const rawAnchor = m.anchor && typeof m.anchor === 'object' ? m.anchor : {}
  const ts = Math.max(0, Math.floor(Number(rawAnchor.timestamp_sec ?? m.timestamp_sec ?? 0) || 0))
  const dur = Math.max(0, Math.floor(Number(rawAnchor.duration_sec ?? m.duration_sec ?? 0) || 0))
  const startSec = Math.max(0, Math.floor(Number(rawAnchor.start_sec ?? m.start_sec ?? Math.max(0, ts - 4)) || 0))
  const endSec = Math.max(startSec + 2, Math.floor(Number(rawAnchor.end_sec ?? m.end_sec ?? (ts + 4)) || (ts + 4)))
  const clipDur = Math.max(2, endSec - startSec)
  const ratio = dur > 0 ? Math.min(1, Math.max(0, Number((ts / dur).toFixed(4)))) : 0
  const label = formatTimeLabel(ts)
  const clipRangeLabel = `${formatTimeLabel(startSec)} - ${formatTimeLabel(endSec)}`
  const movieTitle = escapeHtml(String(m.movie_title || m.movieTitle || '未知影片').slice(0, 80))
  const rawEchoes = m.echoes && typeof m.echoes === 'object' ? m.echoes : {}
  const cleanId = escapeHtml(String(m.id || m.moment_id || ('mom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6))).slice(0, 40))
  const cleanAuthorName = escapeHtml(String(m.author_name || m.author?.name || '影悦影迷').slice(0, 30))

  return {
    id: cleanId,
    moment_id: cleanId,
    circle_id: escapeHtml(String(m.circle_id || fallbackCircleId || '').slice(0, 50)),
    movie_id: escapeHtml(String(m.movie_id || canonicalMovieId(movieTitle)).slice(0, 32)),
    movie_title: movieTitle,
    timestamp_sec: ts,
    start_sec: startSec,
    end_sec: endSec,
    clip_duration: clipDur,
    clip_range_label: clipRangeLabel,
    duration_sec: dur,
    progress_ratio: ratio,
    time_label: label,
    anchor: {
      timestamp_sec: ts,
      start_sec: startSec,
      end_sec: endSec,
      duration_sec: dur,
      progress_ratio: ratio,
      time_label: label
    },
    quote_or_note: escapeHtml(String(m.quote_or_note || m.note || '').slice(0, 120)),
    mood_tag: escapeHtml(String(m.mood_tag || '💧 破防瞬间').slice(0, 20)),
    author_name: cleanAuthorName,
    author: {
      name: cleanAuthorName,
      avatar: escapeHtml(String(m.author?.avatar || 'avatar_1').slice(0, 20))
    },
    echoes: {
      tear: Math.max(0, Math.floor(Number(rawEchoes.tear) || 0)),
      solitude: Math.max(0, Math.floor(Number(rawEchoes.solitude) || 0)),
      shock: Math.max(0, Math.floor(Number(rawEchoes.shock) || 0)),
      god: Math.max(0, Math.floor(Number(rawEchoes.god) || 0)),
      aftertaste: Math.max(0, Math.floor(Number(rawEchoes.aftertaste) || 0))
    },
    created_at: Number(m.created_at) || Date.now()
  }
}

/**
 * 编码圈子为安全短密令（含稳定 movie_id 与 moments 光影时刻列表）
 */
function encodeCircleToken(circle) {
  if (!circle || typeof circle !== 'object') {
    throw new Error('无效的影视圈数据对象')
  }
  const payload = {
    v: 1,
    id: String(circle.id || Date.now()),
    title: String(circle.title || '未命名影视圈').slice(0, 50),
    mood: String(circle.mood || '全部').slice(0, 20),
    desc: String(circle.desc || '').slice(0, 200),
    coverColor: String(circle.coverColor || 'linear-gradient(135deg, #141e30 0%, #243b55 100%)').slice(0, 100),
    author: {
      name: String(circle.author?.name || '影悦影迷').slice(0, 30),
      avatar: String(circle.author?.avatar || 'avatar_1').slice(0, 20)
    },
    items: (Array.isArray(circle.items) ? circle.items : []).slice(0, MAX_MOVIES_PER_CIRCLE).map((it, idx) => ({
      id: String(it.id || ''),
      movie_id: String(it.movie_id || canonicalMovieId(it.name, it.year || '')),
      site: String(it.site || ''),
      name: String(it.name || '').slice(0, 80),
      pic: String(it.pic || '').slice(0, 300),
      rating: String(it.rating || '').slice(0, 10),
      reason: String(it.reason || '').slice(0, 100),
      step_order: idx + 1
    })),
    moments: (Array.isArray(circle.moments) ? circle.moments : []).slice(0, 40).map((m) => ({
      moment_id: String(m.moment_id || '').slice(0, 40),
      movie_title: String(m.movie_title || '').slice(0, 80),
      timestamp_sec: Math.max(0, Math.floor(Number(m.anchor?.timestamp_sec ?? m.timestamp_sec ?? 0) || 0)),
      duration_sec: Math.max(0, Math.floor(Number(m.anchor?.duration_sec ?? m.duration_sec ?? 0) || 0)),
      quote_or_note: String(m.quote_or_note || '').slice(0, 60),
      mood_tag: String(m.mood_tag || '💧 破防瞬间').slice(0, 20),
      author: {
        name: String(m.author?.name || '影悦影迷').slice(0, 30),
        avatar: String(m.author?.avatar || 'avatar_1').slice(0, 20)
      },
      echoes: m.echoes || { tear: 1, solitude: 0, shock: 0, god: 0, aftertaste: 0 }
    }))
  }

  const jsonStr = JSON.stringify(payload)
  const base64 = Buffer.from(jsonStr, 'utf8').toString('base64')
  return TOKEN_PREFIX + base64
}

/**
 * 5 步安全防御解码管线（兼容 V1 与 V2 协议，支持 Moments 安全清洗）
 */
function decodeCircleToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new Error('分享码不能为空')
  }
  const token = rawToken.trim()
  // 1. 长度预检
  if (token.length > MAX_TOKEN_LENGTH) {
    throw new Error('分享码超出安全长度限制（最大 16KB）')
  }
  // 2. 前缀校验
  let payloadBase64 = ''
  if (token.startsWith(TOKEN_PREFIX)) {
    payloadBase64 = token.slice(TOKEN_PREFIX.length).trim()
  } else if (token.startsWith(TOKEN_PREFIX_V2)) {
    payloadBase64 = token.slice(TOKEN_PREFIX_V2.length).trim()
  } else {
    throw new Error('无法识别的影视圈分享码格式')
  }
  // 3. 安全解码
  let jsonStr
  try {
    jsonStr = Buffer.from(payloadBase64, 'base64').toString('utf8')
  } catch {
    throw new Error('分享码解码失败：Base64 格式破损')
  }
  let obj
  try {
    obj = JSON.parse(jsonStr)
  } catch {
    throw new Error('分享码内容解析失败：非法 JSON')
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('无效的影视圈数据结构')
  }
  // 4. Schema 与防原型污染
  if (obj.v !== 1 && obj.v !== 2) {
    throw new Error('不受支持的分享码协议版本')
  }
  if ('__proto__' in obj) delete obj.__proto__
  if ('constructor' in obj) delete obj.constructor

  const newCircleId = 'imported_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)

  // 5. XSS 转义与字段校验
  return {
    v: 1,
    id: newCircleId,
    title: escapeHtml(String(obj.title || '未命名影视圈').slice(0, 50)),
    mood: escapeHtml(String(obj.mood || '全部').slice(0, 20)),
    desc: escapeHtml(String(obj.desc || '').slice(0, 200)),
    coverColor: String(obj.coverColor || 'linear-gradient(135deg, #141e30 0%, #243b55 100%)').slice(0, 100),
    author: {
      name: escapeHtml(String(obj.author?.name || '热心影迷').slice(0, 30)),
      avatar: escapeHtml(String(obj.author?.avatar || 'avatar_1').slice(0, 20))
    },
    items: (Array.isArray(obj.items) ? obj.items : []).slice(0, MAX_MOVIES_PER_CIRCLE).map((it, idx) => {
      const cleanName = escapeHtml(String(it.name || '').slice(0, 80))
      return {
        id: escapeHtml(String(it.id || '')),
        movie_id: escapeHtml(String(it.movie_id || canonicalMovieId(cleanName))),
        site: escapeHtml(String(it.site || '')),
        name: cleanName,
        pic: String(it.pic || '').slice(0, 300),
        rating: escapeHtml(String(it.rating || '').slice(0, 10)),
        reason: escapeHtml(String(it.reason || '').slice(0, 100)),
        step_order: idx + 1
      }
    }),
    moments: (Array.isArray(obj.moments) ? obj.moments : [])
      .slice(0, MAX_MOMENTS_PER_CIRCLE)
      .map((m) => sanitizeMoment(m, newCircleId))
      .filter(Boolean),
    isCustom: true,
    isImported: true,
    createdAt: Date.now()
  }
}

/**
 * 圈子内存与存储管理核心类
 */
class CineCircleEngine {
  constructor(storageAdapter = null) {
    this.storage = storageAdapter || {
      get: () => [],
      set: () => {}
    }
  }

  getOfficialCircles() {
    return OFFICIAL_CIRCLES
  }

  getCustomCircles() {
    try {
      const list = this.storage.get()
      return Array.isArray(list) ? list : []
    } catch {
      return []
    }
  }

  getAllCircles() {
    return [...this.getOfficialCircles(), ...this.getCustomCircles()]
  }

  getCircleById(id) {
    return this.getAllCircles().find((c) => String(c.id) === String(id)) || null
  }

  createCircle({ title, mood, desc, coverColor, author }) {
    const customList = this.getCustomCircles()
    const newCircle = {
      id: 'circle_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: escapeHtml(String(title || '我的私享影单').slice(0, 50)),
      mood: escapeHtml(String(mood || '独处时光').slice(0, 20)),
      desc: escapeHtml(String(desc || '自建影单，记录每一个触动心灵的光影瞬间。').slice(0, 200)),
      coverColor: String(coverColor || 'linear-gradient(135deg, #141e30 0%, #243b55 100%)').slice(0, 100),
      author: {
        name: escapeHtml(String(author?.name || '我').slice(0, 30)),
        avatar: escapeHtml(String(author?.avatar || 'avatar_1').slice(0, 20))
      },
      items: [],
      moments: [],
      isCustom: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    customList.unshift(newCircle)
    this.storage.set(customList)
    return newCircle
  }

  deleteCircle(id) {
    let customList = this.getCustomCircles()
    const beforeLen = customList.length
    customList = customList.filter((c) => String(c.id) !== String(id))
    if (customList.length !== beforeLen) {
      this.storage.set(customList)
      return true
    }
    return false
  }

  addMovieToCircle(circleId, movie) {
    const circle = this.getCircleById(circleId)
    if (!circle) throw new Error('未找到指定影视圈')
    if (!circle.isCustom) throw new Error('官方预置影视圈不可直接修改，请先收藏或自建')
    if (circle.items.length >= MAX_MOVIES_PER_CIRCLE) {
      throw new Error(`单圈收录影片已达硬上限 (${MAX_MOVIES_PER_CIRCLE} 部)`)
    }
    const cleanName = escapeHtml(String(movie.name || '').slice(0, 80))
    const movieId = escapeHtml(String(movie.movie_id || canonicalMovieId(cleanName, movie.year || '')))
    const exists = circle.items.some((it) => (it.id && it.id === movie.id) || (it.movie_id && it.movie_id === movieId && cleanName))
    if (!exists) {
      circle.items.push({
        id: escapeHtml(String(movie.id || '')),
        movie_id: movieId,
        site: escapeHtml(String(movie.site || '')),
        name: cleanName,
        pic: String(movie.pic || '').slice(0, 300),
        rating: escapeHtml(String(movie.rating || '').slice(0, 10)),
        reason: escapeHtml(String(movie.reason || '影迷挚爱推荐').slice(0, 100)),
        step_order: circle.items.length + 1
      })
      circle.updatedAt = Date.now()
      this.saveCustomCircle(circle)
    }
    return circle
  }

  addMomentToCircle(circleId, momentInput) {
    const circle = this.getCircleById(circleId)
    if (!circle) throw new Error('未找到指定影视圈')
    if (!Array.isArray(circle.moments)) circle.moments = []
    if (circle.moments.length >= MAX_MOMENTS_PER_CIRCLE) {
      throw new Error(`单圈光影时刻已达硬上限 (${MAX_MOMENTS_PER_CIRCLE} 条)`)
    }
    const sanitized = sanitizeMoment(momentInput, circleId)
    if (!sanitized) throw new Error('无效的光影时刻数据')
    circle.moments.unshift(sanitized)
    if (circle.isCustom) {
      circle.updatedAt = Date.now()
      this.saveCustomCircle(circle)
    }
    return sanitized
  }

  removeMovieFromCircle(circleId, movieId) {
    const circle = this.getCircleById(circleId)
    if (!circle || !circle.isCustom) return false
    const lenBefore = circle.items.length
    circle.items = circle.items.filter((it) => String(it.id) !== String(movieId))
    if (circle.items.length !== lenBefore) {
      circle.updatedAt = Date.now()
      this.saveCustomCircle(circle)
      return true
    }
    return false
  }

  saveCustomCircle(circle) {
    const customList = this.getCustomCircles()
    const idx = customList.findIndex((c) => String(c.id) === String(circle.id))
    if (idx >= 0) {
      customList[idx] = circle
    } else {
      customList.unshift(circle)
    }
    this.storage.set(customList)
  }

  importToken(tokenStr) {
    const circle = decodeCircleToken(tokenStr)
    this.saveCustomCircle(circle)
    return circle
  }
}

module.exports = {
  OFFICIAL_CIRCLES,
  AVATAR_OPTIONS,
  MOOD_ECHO_TYPES,
  PRESET_MOMENTS,
  TOKEN_PREFIX,
  TOKEN_PREFIX_V2,
  MAX_TOKEN_LENGTH,
  MAX_MOVIES_PER_CIRCLE,
  MAX_MOMENTS_PER_CIRCLE,
  escapeHtml,
  canonicalMovieId,
  formatTimeLabel,
  calibrateMomentTime,
  sanitizeMoment,
  encodeCircleToken,
  decodeCircleToken,
  CineCircleEngine
}

