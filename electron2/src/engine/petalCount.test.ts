import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { shapeSummary } from './shape'
import { CLAIM } from '../content/about'
import type { LightShare } from './impression'

/**
 * 花瓣数可变的守门测试（v3.7，书香第六轮提案）。
 *
 * ============ 为什么要有这一整个文件 ============
 * 子曰那句「并不一定所有人都有 8 个花瓣」改的不是一个功能，是**产品定义**。
 * 而全仓库当时有十几处把「八片」写进了用户可见的文案与逻辑里 ——
 * 其中 `shape.ts` 那处 `const PETALS = 8` 已经在**对用户说假话**：
 * 只有五片花瓣的人即使五片全点亮，界面也会说「有 3 片这一周还没被点到」。
 *
 * 这类漂移的特点是：改的时候都能找齐，**下一次加文案时又会漏**。
 * 靠人记必然失守，所以把分界规则做成一条能自动跑的正则。
 *
 * ============ 分界规则（书香定稿，Lisa 认可） ============
 * 看这个数字在描述**「代价的比例」还是「花的构造」**：
 *   - 比例 ⇒ 修辞，可以写死（唯一豁免：`about.ts` 的 `CLAIM`）
 *   - 构造 ⇒ 数据，必须跟着用户的在册花瓣数走
 * 验法：把「八」换成「五」，句子对某些用户是不是变成了**在描述别人的花**。是 ⇒ 构造。
 */

const SRC = new URL('..', import.meta.url).pathname

/**
 * 只扫**说总数**的数字，不扫子集数量词。
 *
 * 第一版正则把「你可以选一到两片花瓣」「其余的都让给了这两片」也判成了违规 ——
 * 那是误报，而**误报会让守门测试被人关掉**，比没有测试更糟。
 * 分界在这里很干净：这产品的文案里 **一 / 两 永远是子集**（选一片、让给两片、有一片没动），
 * **三及以上才可能在说"我这朵花一共有几片"**（八片花瓣 / 六片让给了两片 / 有 3 片没被点到）。
 *
 * ⚠️ **例外：「两三片」是子集表达，不是总数**（书香第六轮复核补的）。
 *   它含「三」，但它是那句主张的承重部件 —— 凡是引用或改写主张的地方都会被误报，
 *   **而第一个被误报的人正是最有权限关掉这个测试的人。**
 *   不写清这一条，下一个人会以为这是个 bug 来"修好"它。
 */
const SUBSET_PHRASES = ['两三片', '两三瓣']
const HARDCODED = /[三四五六七八九十]\s*[片瓣]|[0-9]+\s*[片瓣]|[三四五六七八九十]\s*个维度|[0-9]+\s*个维度/
// ⚠️ 阿拉伯数字那一支原来写成 `[0-9]+\s*[片瓣]花瓣`（要求后面跟「花瓣」），
//   于是它**拦不住它本来要拦的那个 bug**：「有 3 片这一周还没被点到。」——
//   数字后面跟的是「这一周」，不是「花瓣」。元测试当场把这个漏洞打出来了。
//   注意这一支只拦**写死的数字**：`有 ${untouched} 片${period}还没被点到。` 这种模板串
//   里没有 0-9，照旧通过 —— 该拦的是写死，不是变量。

/**
 * `demoSeed.ts` 整体豁免 —— 它是**描述自己那份固定数据**的 fixture。
 * 「覆盖 6 片花瓣」说的是演示花园里那 6 片，是关于一份写死的数据集的字面事实，
 * 永远不会拿去描述某个真实用户的花园。豁免它，是为了避免"为了过测试而把真话改成模糊话"。
 */
/**
 * `demoSeed.ts` 里**只豁免「覆盖 N 片花瓣」这一种句式** —— 不整体豁免那个文件。
 *
 * 我原来整体豁免了它，书香判「开大了一格」，用她自己的比例/构造规则验：
 *   · 「覆盖 6 片花瓣」= 关于**这份写死数据集**的字面事实 ⇒ 豁免正确
 *   · 「记录 48 条 · **八片花瓣**全有记录」= 在说**产品的构造** ⇒ 不该豁免，
 *     而且这句是**网页演示版给陌生人看的展示文案，读它的人比读手册的人多得多**
 * 那一句已改成「每一片花瓣都有记录」。豁免收窄到句式级，构造claim 仍被拦住。
 *
 * 她的结构性意见（展示文案该搬出 fixture、迁去 `src/content/` 继续受门禁管）
 * 我认为对，但那是一次独立重构，记在 v3.7 方案的停车场里，不夹在这一版做。
 */
const FIXTURE_PATTERNS = [/覆盖\s*[0-9]+\s*片花瓣/]

/** 中文字符串字面量（单引号 / 双引号 / 反引号），只取含中文的那些 */
const ZH_LITERAL = /(['"`])((?:[^'"`\\\n]|\\.)*?[一-龥](?:[^'"`\\\n]|\\.)*?)\1/g

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('花瓣数可变 · 文案不许写死构造', () => {
  it('除 CLAIM 之外，没有用户可见文案写死花瓣数', () => {
    const offenders: string[] = []

    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8')
      const lines = src.split('\n')

      lines.forEach((line, i) => {
        // 注释行不算 —— 注释是给维护者看的，不是用户可见文案。
        // 恰恰相反：注释里必须能自由写「原来是八片」来解释历史。
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return

        for (const m of line.matchAll(ZH_LITERAL)) {
          const text = m[2]
          if (CLAIM.includes(text) || text.includes('八片花瓣，你只能让其中两三片盛开')) continue
          // 「两三片」这类子集表达先剔掉，再判 —— 否则引用主张的地方必误报
          let probe = text
          for (const ph of SUBSET_PHRASES) probe = probe.split(ph).join('')
          for (const re of FIXTURE_PATTERNS) probe = probe.replace(re, '')
          if (HARDCODED.test(probe)) {
            offenders.push(`${file.replace(SRC, 'src/')}:${i + 1}　「${text}」`)
          }
        }
      })
    }

    expect(offenders, `写死了花瓣数的文案（分界规则见本文件头部）：\n${offenders.join('\n')}`)
      .toEqual([])
  })

  /**
   * 元测试：证明上面那道门禁**真的会拦东西**。
   * 一个拦不住东西的门禁是装饰，而装饰会让后来的人以为这里有保护。
   */
  it('门禁能拦住构造 claim，且不误伤子集表达', () => {
    const strip = (t: string) => {
      let probe = t
      for (const ph of SUBSET_PHRASES) probe = probe.split(ph).join('')
      for (const re of FIXTURE_PATTERNS) probe = probe.replace(re, '')
      return probe
    }
    // 会被拦（说的是构造）
    expect(HARDCODED.test(strip('八片花瓣全有记录'))).toBe(true)
    expect(HARDCODED.test(strip('有 3 片这一周还没被点到。'))).toBe(true)
    expect(HARDCODED.test(strip('六片让给了两片。'))).toBe(true)
    expect(HARDCODED.test(strip('把人生的八个维度，画成一朵会呼吸的花。'))).toBe(true)
    // 不该被拦（子集表达 / fixture 字面事实 / 无数字）
    expect(HARDCODED.test(strip('你只能让其中两三片盛开'))).toBe(false)
    expect(HARDCODED.test(strip('你可以选一到两片花瓣'))).toBe(false)
    expect(HARDCODED.test(strip('其余的花瓣，都让给了这两片。'))).toBe(false)
    expect(HARDCODED.test(strip('记录 14 条 · 覆盖 6 片花瓣 · 贡献 27'))).toBe(false)
    expect(HARDCODED.test(strip('每一片都在动，没有哪一片在开。'))).toBe(false)
  })

  it('CLAIM 本身保留那句主张 —— 它是比例不是构造，一个字不改', () => {
    expect(CLAIM).toContain('八片花瓣')
    expect(CLAIM).toContain('两三片')
  })
})

describe('shapeSummary 对任意花瓣数都说真话', () => {
  const share = (name: string, weight: number, total: number): LightShare => ({
    dimensionId: name, name, colorHex: '#000',
    weight, share: weight / total,
  } as LightShare)

  it('五瓣用户五片全点亮时，不许说「还有几片没被点到」', () => {
    // 这正是 PETALS = 8 时代的那句假话：8 - 5 = 3 ⇒「有 3 片这一周还没被点到」
    const total = 20
    const shares = ['健康', '职业', '家庭', '学习', '休闲'].map(n => share(n, 4, total))
    const line = shapeSummary(shares, '这一周', null, 5)
    expect(line?.kind).not.toBe('untouched')
    expect(line?.text ?? '').not.toMatch(/还没被点到/)
  })

  it('八瓣用户只点了四片时，「还有四片没被点到」照旧要说', () => {
    const total = 20
    const shares = ['健康', '职业', '家庭', '学习'].map(n => share(n, 5, total))
    const line = shapeSummary(shares, '这一周', null, 8)
    expect(line?.kind).toBe('untouched')
    expect(line?.text).toBe('有 4 片这一周还没被点到。')
  })

  it('不传花瓣数时退回 shares.length —— untouched 那一支静默，不误报', () => {
    const shares = ['健康', '职业'].map(n => share(n, 5, 10))
    const line = shapeSummary(shares, '这一周')
    expect(line?.kind).not.toBe('untouched')
  })

  it('「其余的花瓣都让给了这两片」对任意瓣数成立，且不含数字', () => {
    // 两片拿 70%，第三片 5% ⇒ 命中 fewTakeMost
    const shares = [share('职业', 35, 100), share('健康', 35, 100), share('家庭', 5, 100)]
    const line = shapeSummary(shares, '这一周', null, 5)
    expect(line?.kind).toBe('fewTakeMost')
    expect(line?.text).toBe('其余的花瓣，都让给了这两片。')
    expect(line?.text).not.toMatch(/[一二三四五六七八九十0-9]/)
  })

  it('「均匀」那一支的阈值也不许写死 7 —— 五瓣用户必须够得到', () => {
    // 五片各 20%：这就是五瓣用户的「均匀」。旧代码要求 shares.length >= 7，他永远到不了
    const shares = ['健康', '职业', '家庭', '学习', '休闲'].map(n => share(n, 4, 20))
    const line = shapeSummary(shares, '这一周', null, 5)
    expect(line?.kind).toBe('even')
    expect(line?.text).toBe('每一片都在动，没有哪一片在开。')
  })
})
