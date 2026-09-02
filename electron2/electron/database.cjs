const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const { v4: uuid } = require('./uuid.cjs')

let db

// 与 main.cjs 同一个开关：默认静默，LIFEOS_DEBUG=1 时才打查询日志
const DEBUG = process.env.LIFEOS_DEBUG === '1'
function log(tag, ...args) { if (DEBUG) console.log(`[DB:MAIN:${tag}]`, ...args) }
function logE(tag, ...args) { console.error(`[DB:MAIN:${tag}]`, ...args) }

// ========== 每日自动备份 ==========
// 迁移机制的后悔药：必须发生在打开/迁移数据库之前。
// 此刻没有任何写入者，直接把主库 + WAL 一起拷走就是一份一致的快照。
// 每天只备一份，保留最近 30 份。

const BACKUP_KEEP = 30

function backupIfNeeded(dbPath) {
  try {
    if (!fs.existsSync(dbPath)) return // 全新用户没有库，无需备份
    const dir = path.join(app.getPath('userData'), 'backups')
    fs.mkdirSync(dir, { recursive: true })

    const d = new Date()
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const target = path.join(dir, `life-os-${stamp}.sqlite`)
    if (fs.existsSync(target)) return // 今天已备过

    fs.copyFileSync(dbPath, target)
    if (fs.existsSync(dbPath + '-wal')) fs.copyFileSync(dbPath + '-wal', target + '-wal')
    log('backup', '已备份到', target)

    // 轮转：只留最近 BACKUP_KEEP 份（按主库文件数）
    const mains = fs.readdirSync(dir)
      .filter(f => /^life-os-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
      .sort()
    while (mains.length > BACKUP_KEEP) {
      const victim = mains.shift()
      fs.rmSync(path.join(dir, victim), { force: true })
      fs.rmSync(path.join(dir, victim + '-wal'), { force: true })
      log('backup', '轮转删除', victim)
    }
  } catch (e) {
    // 备份失败不阻断启动，但必须出声
    logE('backup', '备份失败:', e.message)
  }
}

// ========== 迁移机制 ==========
// PRAGMA user_version + 有序迁移列表。
// 规矩：改表结构 / 改种子口径，一律新增一条迁移，禁止再写游离的 ALTER 补丁。
// （初始分种子失效那个 bug 就是没有它的第一次发作。）

const MIGRATIONS = [
  {
    version: 1,
    name: 'reviews 表补 autoSummary 列（收编原游离补丁）',
    up(db) {
      const cols = db.prepare('PRAGMA table_info(reviews)').all().map(c => c.name)
      if (!cols.includes('autoSummary')) {
        db.exec('ALTER TABLE reviews ADD COLUMN autoSummary TEXT NOT NULL DEFAULT ""')
      }
    },
  },
  {
    version: 2,
    name: '八维数据色 → 植物色系（暗夜花园设计，2026-08-18 圆桌拍板）',
    up(db) {
      // 按旧色值匹配替换：用户没有改色入口，命中即是种子色；改过名字也不受影响
      const MAP = [
        ['#4A90D9', '#B8804D'], // 职业·赭石
        ['#50B86C', '#7A9E7E'], // 财务·竹青
        ['#9B59B6', '#9B7BB8'], // 成长·绛紫
        ['#E74C3C', '#D89A9E'], // 健康·藕粉
        ['#F39C12', '#E0B77E'], // 家庭·暖杏
        ['#1ABC9C', '#A8B8C8'], // 社交·月白
        ['#E91E63', '#6E8CAF'], // 休闲·黛蓝
        ['#8E44AD', '#8FA876'], // 精神·苔绿
      ]
      const stmt = db.prepare('UPDATE dimensions SET colorHex = ? WHERE colorHex = ?')
      MAP.forEach(([oldHex, newHex]) => stmt.run(newHex, oldHex))
    },
  },
  {
    version: 3,
    name: 'v3.1「入园与手感」：settings/events/flower_snapshots 三表 + actions.mood + dimensions.identity',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS flower_snapshots (
          id TEXT PRIMARY KEY, weekKey TEXT NOT NULL UNIQUE,
          takenAt INTEGER NOT NULL, dataUrl TEXT NOT NULL
        );
      `)
      const acols = db.prepare('PRAGMA table_info(actions)').all().map(c => c.name)
      if (!acols.includes('mood')) {
        db.exec("ALTER TABLE actions ADD COLUMN mood TEXT NOT NULL DEFAULT ''")
      }
      const dcols = db.prepare('PRAGMA table_info(dimensions)').all().map(c => c.name)
      if (!dcols.includes('identity')) {
        db.exec("ALTER TABLE dimensions ADD COLUMN identity TEXT NOT NULL DEFAULT ''")
      }
      // 老库豁免首启引导：已经在用的人早用真实数据打过分了，别再拉回第一课。
      // 迁移跑在 seedIfNeeded 之前，全新库此刻 dimensions 为空 → 不豁免 → 走引导。
      const existing = db.prepare('SELECT COUNT(*) AS c FROM dimensions').get().c
      if (existing > 0) {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('onboardingDone', '1')").run()
      }
    },
  },
  {
    version: 4,
    name: 'v3.2「见客」：quarterly_reviews 表 + dimensions.focusSince（焦点维度 + 季度校准会谈）',
    up(db) {
      // 会谈是史料，焦点是状态，两者生命周期不同 —— 设计稿 §4.2。
      // completedAt IS NULL 即草稿（中途保存态），草稿永不过期。
      db.exec(`
        CREATE TABLE IF NOT EXISTS quarterly_reviews (
          id                TEXT PRIMARY KEY,
          startedAt         INTEGER NOT NULL,
          completedAt       INTEGER,
          actProgress       INTEGER NOT NULL DEFAULT 0,
          scores            TEXT NOT NULL DEFAULT '{}',
          reflections       TEXT NOT NULL DEFAULT '{}',
          focusDimensionIds TEXT NOT NULL DEFAULT '[]',
          intent            TEXT NOT NULL DEFAULT ''
        );
      `)
      // 渲染缓存列：权威源是 quarterly_reviews，这里冗余一份让 FlowerChart/卡片/侧栏
      // 不必为了判一条金边去翻史料柜（设计稿 §4.3）。NULL = 非焦点，存量库零回填。
      const dcols = db.prepare('PRAGMA table_info(dimensions)').all().map(c => c.name)
      if (!dcols.includes('focusSince')) {
        db.exec('ALTER TABLE dimensions ADD COLUMN focusSince INTEGER')
      }
    },
  },
  {
    version: 5,
    name: 'v3.5「我的花园」：dimensions 补 targetScore（目标）+ weeklyIntent（计划节奏）',
    up(db) {
      const dcols = db.prepare('PRAGMA table_info(dimensions)').all().map(c => c.name)
      // 目标分：用户自己定这片花瓣想开到什么程度。NULL = 没定过，界面上就不画目标线。
      // 刻意可为空 —— 「八片都得有目标」正是我们要反驳的那套叙事。
      if (!dcols.includes('targetScore')) {
        db.exec('ALTER TABLE dimensions ADD COLUMN targetScore REAL')
      }
      // 计划节奏：希望每周照顾几次。0 = 不为这片立计划（默认，存量库零回填）。
      // 🔴 它只用来给「今天」页的轻推排序，绝不产生红点/未读数/催办文案 ——
      // 去惩罚化是这产品的准入条件，计划是给自己看的意图，不是待办债务。
      if (!dcols.includes('weeklyIntent')) {
        db.exec('ALTER TABLE dimensions ADD COLUMN weeklyIntent INTEGER NOT NULL DEFAULT 0')
      }
    },
  },
  {
    version: 6,
    name: 'v3.6「约定」：dimensions 补 pactTiming / pactAnchor / pactText（执行意图三件套）',
    up(db) {
      // 「约定」不是计划，也不是提醒（第五轮圆桌 小艾）：
      //   执行意图（implementation intention）是少数被 meta 分析反复验证有效的干预（d≈0.65），
      //   它生效的机制不是提升动力，而是把行为的控制权交给**环境线索**。
      //   ⇒ 所以它天然不需要提醒 —— 提醒是它的替代品，不是补充。这正是它能在零催办红线下存活的原因。
      //
      // 句式：每个「时机」，「锚点」之后，我给「这片花瓣」做「一件具体的事」。
      //   时机 = 枚举（每天/工作日/周末/周一..周日），锚点 = 用户自己已有的日常行为（吃完晚饭/关掉电脑）。
      //
      // 🔴 三个字段，没有第四个 —— **没有完成态、没有进度、没有计数**。
      //   一旦有 boolean，UI 就能显示「未完成」，约定就变成任务，任务就有失败，失败就是惩罚。
      //   这是唯一可靠的守法方式，靠文案自律守不住（Lisa 二轮：不做到期判定）。
      const dcols = db.prepare('PRAGMA table_info(dimensions)').all().map(c => c.name)
      if (!dcols.includes('pactTiming')) {
        db.exec("ALTER TABLE dimensions ADD COLUMN pactTiming TEXT NOT NULL DEFAULT ''")
      }
      if (!dcols.includes('pactAnchor')) {
        db.exec("ALTER TABLE dimensions ADD COLUMN pactAnchor TEXT NOT NULL DEFAULT ''")
      }
      if (!dcols.includes('pactText')) {
        db.exec("ALTER TABLE dimensions ADD COLUMN pactText TEXT NOT NULL DEFAULT ''")
      }
    },
  },
  {
    version: 7,
    name: 'v3.6「Aha 闸门」：events 表 UNIQUE(name, at) —— 防程序自身重复写入',
    up(db) {
      // 闸门通过后要连写两条事件，上层一旦手抖调两次，索引兜住就不会重复计数。
      // 存量数据里可能已有 (name, at) 重复行，加索引前先去重，否则建索引会失败。
      db.exec(`
        DELETE FROM events
        WHERE id NOT IN (SELECT MIN(id) FROM events GROUP BY name, at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_events_name_at ON events(name, at);
      `)
    },
  },
  {
    version: 8,
    name: 'v3.7「那些美妙时刻」：aha_moments 表 —— 让 Aha 能被回看',
    up(db) {
      /*
       * 为什么要单开一张表，而不是往 events 上加一列 payload：
       *   `events` 是**闸门的账**（同类冷却 14/30 天、每天 1 条、每周 3 条都查它），
       *   它只需要 (name, at)，而且有 UNIQUE(name, at) 约束。
       *   把「给用户读的内容」混进去，这张表就变成了两件事，
       *   而两件事共用一张表的下一步必然是其中一件把另一件的约束搞坏。
       *
       * 这张表是**只增不改**的：Aha 播过就是播过，内容不该事后被改写 ——
       * 它是账的一部分，而这产品最不能让用户怀疑的就是账的可信度。
       */
      db.exec(`
        CREATE TABLE IF NOT EXISTS aha_moments (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          at INTEGER NOT NULL,
          headline TEXT NOT NULL DEFAULT '',
          lines TEXT NOT NULL DEFAULT '[]',
          colorHex TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_moments_at ON aha_moments(at DESC);
      `)
    },
  },
]

function runMigrations() {
  const current = db.pragma('user_version', { simple: true })
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue
    log('migrate', `v${m.version}: ${m.name}`)
    db.transaction(() => {
      m.up(db)
      db.pragma(`user_version = ${m.version}`)
    })()
  }
}

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'life-os.sqlite')
  log('init', '数据库路径:', dbPath)

  backupIfNeeded(dbPath)

  try {
    db = new Database(dbPath)
    log('init', '数据库连接成功')
  } catch (e) {
    logE('init', '数据库连接失败:', e.message)
    throw e
  }

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  log('init', '创建表结构...')
  db.exec(`
    CREATE TABLE IF NOT EXISTS dimensions (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL,
      colorHex TEXT NOT NULL, sortOrder INTEGER NOT NULL,
      isEnabled INTEGER NOT NULL DEFAULT 1, createdAt INTEGER NOT NULL,
      currentScore REAL NOT NULL DEFAULT 0, initialScore REAL NOT NULL DEFAULT 0,
      scoringMode TEXT NOT NULL DEFAULT 'auto'
    );
    CREATE TABLE IF NOT EXISTS score_rubrics (
      id TEXT PRIMARY KEY, score INTEGER NOT NULL, label TEXT NOT NULL,
      descriptionText TEXT NOT NULL, dimensionId TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, level INTEGER NOT NULL,
      sortOrder INTEGER NOT NULL, createdAt INTEGER NOT NULL,
      parentId TEXT, dimensionId TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      quantitativeTarget REAL, quantitativeUnit TEXT,
      isActive INTEGER NOT NULL DEFAULT 1, createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL, dimensionId TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY, date INTEGER NOT NULL, description TEXT NOT NULL,
      quality TEXT NOT NULL DEFAULT 'medium', impact INTEGER NOT NULL DEFAULT 1,
      isCompleted INTEGER NOT NULL DEFAULT 1, createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL, dimensionId TEXT NOT NULL,
      branchId TEXT, goalId TEXT
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, periodType TEXT NOT NULL, periodStart INTEGER NOT NULL,
      periodEnd INTEGER NOT NULL, score REAL NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '',
      autoSummary TEXT NOT NULL DEFAULT '', createdAt INTEGER NOT NULL, dimensionId TEXT
    );
  `)
  log('init', '表结构创建完成')

  runMigrations()
  seedIfNeeded()
  log('init', '初始化完成')
}

function closeDatabase() {
  if (db) {
    log('close', '关闭数据库')
    db.close()
  }
}

// ========== 种子数据 ==========

const DIMENSION_DEFS = [
  { name: '职业发展', icon: 'Briefcase', colorHex: '#B8804D', branches: [
    { name: '技能成长', children: ['技术深度', '技术广度', '软技能'] },
    { name: '项目成果', children: ['主导项目交付', '技术债务治理', '开源贡献'] },
    { name: '晋升/转型', children: ['述职准备', '影响力建设', '内部 visibility'] },
    { name: '副业探索', children: ['产品 idea 验证', '技术储备', '商业化探索'] },
  ]},
  { name: '财务状况', icon: 'DollarSign', colorHex: '#7A9E7E', branches: [
    { name: '收入', children: ['主业薪资', '副业/投资收入', '被动收入'] },
    { name: '支出管理', children: ['日常消费', '大额支出', '订阅服务'] },
    { name: '储蓄', children: ['应急基金', '目标储蓄', '退休账户'] },
    { name: '投资', children: ['理财学习', '资产配置', '投资复盘'] },
  ]},
  { name: '个人成长', icon: 'Brain', colorHex: '#9B7BB8', branches: [
    { name: '阅读', children: ['专业书籍', '思维/哲学', '文学/传记'] },
    { name: '课程学习', children: ['在线课程', '线下培训', '认证考试'] },
    { name: '思维训练', children: ['写作输出', '思考复盘', '辩论/讨论'] },
    { name: '创作', children: ['博客/文章', '视频/播客', '代码/作品'] },
  ]},
  { name: '身心健康', icon: 'Heart', colorHex: '#D89A9E', branches: [
    { name: '运动', children: ['有氧运动', '力量训练', '柔韧性/拉伸'] },
    { name: '饮食', children: ['营养均衡', '饮水充足', '减少垃圾食品'] },
    { name: '睡眠', children: ['入睡时间', '睡眠时长', '睡眠质量'] },
    { name: '心理健康', children: ['冥想/正念', '情绪日记', '心理咨询'] },
  ]},
  { name: '家庭关系', icon: 'Home', colorHex: '#E0B77E', branches: [
    { name: '父母', children: ['定期通话', '回家探望', '关心健康'] },
    { name: '伴侣', children: ['深度对话', '共同活动', '未来规划'] },
    { name: '子女关系', children: ['陪伴时间', '教育引导', '成长记录'] },
    { name: '家庭仪式', children: ['家庭聚餐', '节日庆祝', '家庭旅行'] },
  ]},
  { name: '社交关系', icon: 'Users', colorHex: '#A8B8C8', branches: [
    { name: '挚友维护', children: ['定期联系', '深度交流', '互相帮助'] },
    { name: '社群参与', children: ['线上社群', '线下活动', '行业圈子'] },
    { name: '人脉拓展', children: ['新人结识', '关系维护', '价值交换'] },
    { name: '社交能量', children: ['社交节奏', '独处充电', '边界管理'] },
  ]},
  { name: '休闲娱乐', icon: 'Gamepad2', colorHex: '#6E8CAF', branches: [
    { name: '影音娱乐', children: ['电影/剧集', '音乐/播客', '游戏'] },
    { name: '兴趣爱好', children: ['摄影/绘画', '手工/DIY', '乐器/才艺'] },
    { name: '旅行', children: ['短途出行', '长途旅行', '旅行规划'] },
    { name: '放松', children: ['发呆放空', '按摩/SPA', '自然接触'] },
  ]},
  { name: '精神成长', icon: 'Sparkles', colorHex: '#8FA876', branches: [
    { name: '冥想/正念', children: ['每日冥想', '正念练习', '呼吸练习'] },
    { name: '感恩/反思', children: ['感恩日记', '人生复盘', '价值观梳理'] },
    { name: '利他/贡献', children: ['志愿服务', '知识分享', '帮助他人'] },
    { name: '人生意义', children: ['使命探索', '长期愿景', '哲学思考'] },
  ]},
]

const SCORE_RUBRICS = [
  { score: 1, label: '未起步', descriptionText: '几乎没有投入时间和精力' },
  { score: 2, label: '初步尝试', descriptionText: '偶尔关注，但不成体系' },
  { score: 3, label: '开始建立', descriptionText: '有意识投入，但频率低、效果弱' },
  { score: 4, label: '基础养成', descriptionText: '有一定规律，但容易被其他事情打断' },
  { score: 5, label: '中等水平', descriptionText: '基本稳定，但还没达到理想状态' },
  { score: 6, label: '良好状态', descriptionText: '持续投入，有可见的进步和成果' },
  { score: 7, label: '优秀', descriptionText: '已经成为习惯，各方面表现不错' },
  { score: 8, label: '卓越', descriptionText: '在该维度有明显的优势和成果' },
  { score: 9, label: '接近完美', descriptionText: '几乎不需要刻意努力就能维持高水平' },
  { score: 10, label: '圆满', descriptionText: '完全掌控，是该维度的榜样' },
]

function seedIfNeeded() {
  log('seed', '检查种子数据...')
  const count = db.prepare('SELECT COUNT(*) as cnt FROM dimensions').get().cnt
  log('seed', `当前维度数: ${count}`)
  if (count > 0) {
    log('seed', '已有数据，跳过种子')
    return
  }

  log('seed', '开始插入种子数据...')
  const now = Date.now()

  db.transaction(() => {
    DIMENSION_DEFS.forEach((def, i) => {
      const dimId = uuid()
      db.prepare(`INSERT INTO dimensions (id, name, icon, colorHex, sortOrder, isEnabled, createdAt, currentScore, initialScore, scoringMode)
        VALUES (?,?,?,?,?,1,?,3,3,'auto')`).run(dimId, def.name, def.icon, def.colorHex, i, now)

      SCORE_RUBRICS.forEach(r => {
        db.prepare('INSERT INTO score_rubrics (id, score, label, descriptionText, dimensionId) VALUES (?,?,?,?,?)')
          .run(uuid(), r.score, r.label, r.descriptionText, dimId)
      })

      def.branches.forEach((b, j) => {
        const branchId = uuid()
        db.prepare('INSERT INTO branches (id, name, level, sortOrder, createdAt, parentId, dimensionId) VALUES (?,?,1,?,?,NULL,?)')
          .run(branchId, b.name, j, now, dimId)
        b.children.forEach((child, k) => {
          db.prepare('INSERT INTO branches (id, name, level, sortOrder, createdAt, parentId, dimensionId) VALUES (?,?,2,?,?,?,?)')
            .run(uuid(), child, k, now, branchId, dimId)
        })
      })
    })
  })()

  log('seed', '种子数据插入完成')
}

// ========== CRUD ==========

function getDimensions() {
  const rows = db.prepare('SELECT * FROM dimensions ORDER BY sortOrder').all()
  log('getDimensions', `返回 ${rows.length} 条`)
  return rows
}
function getDimension(id) { return db.prepare('SELECT * FROM dimensions WHERE id = ?').get(id) }
function addDimension(row) {
  log('addDimension', row.name)
  db.prepare('INSERT INTO dimensions (id, name, icon, colorHex, sortOrder, isEnabled, createdAt, currentScore, initialScore, scoringMode) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(row.id, row.name, row.icon, row.colorHex, row.sortOrder, row.isEnabled, row.createdAt, row.currentScore, row.initialScore, row.scoringMode)
}
function updateDimension(id, data) {
  const keys = Object.keys(data); const vals = Object.values(data)
  // 空对象会拼出 `SET  WHERE id = ?` —— SQLite 报 near "WHERE": syntax error。
  // 这不是假想情况：IPC 的结构化克隆会**丢掉值为 undefined 的字段**，
  // 于是 { targetScore: undefined } 过一趟 IPC 就变成了 {}。空更新当 no-op 处理。
  if (keys.length === 0) return
  db.prepare(`UPDATE dimensions SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`).run(...vals, id)
}
function deleteDimension(id) {
  db.transaction(() => {
    db.prepare('DELETE FROM score_rubrics WHERE dimensionId = ?').run(id)
    db.prepare('DELETE FROM branches WHERE dimensionId = ?').run(id)
    db.prepare('DELETE FROM goals WHERE dimensionId = ?').run(id)
    db.prepare('DELETE FROM actions WHERE dimensionId = ?').run(id)
    db.prepare('DELETE FROM dimensions WHERE id = ?').run(id)
  })()
}

function getScoreRubrics() {
  const rows = db.prepare('SELECT * FROM score_rubrics').all()
  log('getScoreRubrics', `返回 ${rows.length} 条`)
  return rows
}
function getScoreRubricsByDimension(dimId) { return db.prepare('SELECT * FROM score_rubrics WHERE dimensionId = ?').all(dimId) }
function addScoreRubric(row) { db.prepare('INSERT INTO score_rubrics (id, score, label, descriptionText, dimensionId) VALUES (?,?,?,?,?)').run(row.id, row.score, row.label, row.descriptionText, row.dimensionId) }

function getBranches() {
  const rows = db.prepare('SELECT * FROM branches ORDER BY sortOrder').all()
  log('getBranches', `返回 ${rows.length} 条`)
  return rows
}
function getBranchesByDimension(dimId) { return db.prepare('SELECT * FROM branches WHERE dimensionId = ? ORDER BY sortOrder').all(dimId) }
function addBranch(row) { db.prepare('INSERT INTO branches (id, name, level, sortOrder, createdAt, parentId, dimensionId) VALUES (?,?,?,?,?,?,?)').run(row.id, row.name, row.level, row.sortOrder, row.createdAt, row.parentId, row.dimensionId) }
function updateBranch(id, data) {
  const keys = Object.keys(data); const vals = Object.values(data)
  db.prepare(`UPDATE branches SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`).run(...vals, id)
}
function deleteBranch(id) {
  db.transaction(() => {
    db.prepare('DELETE FROM branches WHERE parentId = ?').run(id)
    db.prepare('DELETE FROM branches WHERE id = ?').run(id)
  })()
}

function getGoals() {
  const rows = db.prepare('SELECT * FROM goals').all()
  log('getGoals', `返回 ${rows.length} 条`)
  return rows
}
function getGoalsByDimension(dimId) { return db.prepare('SELECT * FROM goals WHERE dimensionId = ?').all(dimId) }
function addGoal(row) {
  log('addGoal', row.title)
  db.prepare('INSERT INTO goals (id, title, description, quantitativeTarget, quantitativeUnit, isActive, createdAt, updatedAt, dimensionId) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(row.id, row.title, row.description, row.quantitativeTarget, row.quantitativeUnit, row.isActive, row.createdAt, row.updatedAt, row.dimensionId)
}
function updateGoal(id, data) {
  const keys = Object.keys(data); const vals = Object.values(data)
  db.prepare(`UPDATE goals SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`).run(...vals, id)
}
function deleteGoal(id) { db.prepare('DELETE FROM goals WHERE id = ?').run(id) }

function getActions() {
  const rows = db.prepare('SELECT * FROM actions ORDER BY date DESC').all()
  log('getActions', `返回 ${rows.length} 条`)
  return rows
}
function getActionsByDimension(dimId) { return db.prepare('SELECT * FROM actions WHERE dimensionId = ? ORDER BY date DESC').all(dimId) }
function addAction(row) {
  log('addAction', row.description.slice(0, 30))
  db.prepare('INSERT INTO actions (id, date, description, quality, impact, isCompleted, createdAt, updatedAt, dimensionId, branchId, goalId, mood) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(row.id, row.date, row.description, row.quality, row.impact, row.isCompleted, row.createdAt, row.updatedAt, row.dimensionId, row.branchId, row.goalId, row.mood ?? '')
}
function updateAction(id, data) {
  const keys = Object.keys(data); const vals = Object.values(data)
  db.prepare(`UPDATE actions SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`).run(...vals, id)
}
function deleteAction(id) { db.prepare('DELETE FROM actions WHERE id = ?').run(id) }

function getReviews() {
  const rows = db.prepare('SELECT * FROM reviews ORDER BY periodStart DESC').all()
  log('getReviews', `返回 ${rows.length} 条`)
  return rows
}
function addReview(row) {
  log('addReview', row.periodType)
  db.prepare('INSERT INTO reviews (id, periodType, periodStart, periodEnd, score, note, autoSummary, createdAt, dimensionId) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(row.id, row.periodType, row.periodStart, row.periodEnd, row.score, row.note, row.autoSummary, row.createdAt, row.dimensionId)
}
function updateReview(id, data) {
  const keys = Object.keys(data); const vals = Object.values(data)
  db.prepare(`UPDATE reviews SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`).run(...vals, id)
}
function deleteReview(id) { db.prepare('DELETE FROM reviews WHERE id = ?').run(id) }

// ========== settings / events / flower_snapshots（v3.1） ==========

function getSetting(key) {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return r ? r.value : null
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value))
}
function getSnapshots() {
  return db.prepare('SELECT id, weekKey, takenAt, dataUrl FROM flower_snapshots ORDER BY takenAt').all()
}
function addSnapshot(row) {
  // weekKey UNIQUE：同一周重复拍不叠加，覆盖为最新一张
  db.prepare('INSERT OR REPLACE INTO flower_snapshots (id, weekKey, takenAt, dataUrl) VALUES (?,?,?,?)')
    .run(row.id, row.weekKey, row.takenAt, row.dataUrl)
}
function logEvent(name) {
  // OR IGNORE 是 v7 唯一索引的配套：同名同毫秒重复写入被静默吞掉，而不是抛异常崩调用方
  db.prepare('INSERT OR IGNORE INTO events (name, at) VALUES (?, ?)').run(String(name), Date.now())
}

// ---- 那些美妙时刻（v3.7）：Aha 播过之后落一条，供「那些美妙时刻」时间轴回看 ----
//
// 只增不改：Aha 播过就是播过，内容不该事后被改写 —— 它是账的一部分。
// `INSERT OR IGNORE` + 主键 id：上层手抖调两次不会重复。
function addMoment(row) {
  db.prepare(
    'INSERT OR IGNORE INTO aha_moments (id, kind, at, headline, lines, colorHex) VALUES (?,?,?,?,?,?)'
  ).run(
    String(row.id), String(row.kind), Number(row.at),
    String(row.headline || ''), JSON.stringify(row.lines || []), String(row.colorHex || ''),
  )
}
function getMoments() {
  return db.prepare('SELECT * FROM aha_moments ORDER BY at DESC').all().map(r => ({
    ...r,
    lines: (() => { try { return JSON.parse(r.lines) } catch { return [] } })(),
  }))
}

/** 全量读 settings（导出用）。见 electron.d.ts 里那段「白名单是个沉默的陷阱」 */
function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// ---- Aha 闸门用的三个查询 + 一个清理（v3.6）----
function hasEvent(name) {
  return !!db.prepare('SELECT 1 FROM events WHERE name = ? LIMIT 1').get(String(name))
}
function hasEventSince(name, sinceMs) {
  return !!db.prepare('SELECT 1 FROM events WHERE name = ? AND at >= ? LIMIT 1').get(String(name), sinceMs)
}
function countEventsSince(name, sinceMs) {
  return db.prepare('SELECT COUNT(*) AS c FROM events WHERE name = ? AND at >= ?').get(String(name), sinceMs).c
}
/** 播完待播帧后整组清掉（同一天可能攒了多条），避免堆积 */
function clearEventsByPrefix(prefix) {
  db.prepare("DELETE FROM events WHERE name LIKE ? || '%'").run(String(prefix))
  return true
}

// ========== 季度校准会谈 + 焦点维度（v3.2） ==========

function getQuarterlyReviews() {
  return db.prepare('SELECT * FROM quarterly_reviews ORDER BY startedAt DESC').all()
}
function upsertQuarterlyReview(row) {
  db.prepare(`
    INSERT INTO quarterly_reviews (id, startedAt, completedAt, actProgress, scores, reflections, focusDimensionIds, intent)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      completedAt = excluded.completedAt, actProgress = excluded.actProgress,
      scores = excluded.scores, reflections = excluded.reflections,
      focusDimensionIds = excluded.focusDimensionIds, intent = excluded.intent
  `).run(
    row.id, row.startedAt, row.completedAt ?? null, row.actProgress,
    row.scores ?? '{}', row.reflections ?? '{}', row.focusDimensionIds ?? '[]', row.intent ?? ''
  )
}
function deleteQuarterlyReview(id) {
  db.prepare('DELETE FROM quarterly_reviews WHERE id = ?').run(id)
}
/**
 * 焦点维度改写：权威源（会谈记录）与渲染缓存（dimensions.focusSince）同一事务内双写。
 * 单机 SQLite 单写者，事务内双写无一致性风险（设计稿 §4.3）。
 */
function setFocusDimensions(ids) {
  const now = Date.now()
  db.transaction(() => {
    db.prepare('UPDATE dimensions SET focusSince = NULL WHERE focusSince IS NOT NULL').run()
    const stmt = db.prepare('UPDATE dimensions SET focusSince = ? WHERE id = ?')
    ;(ids || []).slice(0, 2).forEach(id => stmt.run(now, id))
  })()
}

function clearAllData() {
  log('clearAll', '清除所有数据')
  db.transaction(() => {
    db.prepare('DELETE FROM actions').run()
    db.prepare('DELETE FROM goals').run()
    db.prepare('DELETE FROM branches').run()
    db.prepare('DELETE FROM score_rubrics').run()
    db.prepare('DELETE FROM reviews').run()
    db.prepare('DELETE FROM quarterly_reviews').run()
    db.prepare('DELETE FROM dimensions').run()
  })()
  seedIfNeeded()
}

module.exports = {
  initDatabase, closeDatabase, clearAllData,
  getDimensions, getDimension, addDimension, updateDimension, deleteDimension,
  getScoreRubrics, getScoreRubricsByDimension, addScoreRubric,
  getBranches, getBranchesByDimension, addBranch, updateBranch, deleteBranch,
  getGoals, getGoalsByDimension, addGoal, updateGoal, deleteGoal,
  getActions, getActionsByDimension, addAction, updateAction, deleteAction,
  getReviews, addReview, updateReview, deleteReview,
  getSetting, setSetting, getAllSettings, getSnapshots, addSnapshot, logEvent,
  addMoment, getMoments,
  hasEvent, hasEventSince, countEventsSince, clearEventsByPrefix,
  getQuarterlyReviews, upsertQuarterlyReview, deleteQuarterlyReview, setFocusDimensions,
}
