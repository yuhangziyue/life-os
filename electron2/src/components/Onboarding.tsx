import { useState } from 'react'
import { useStore, useEnabledDimensions } from '../stores/useStore'
import { FlowerChart } from './FlowerChart'
import { FlowerLogo } from './FlowerLogo'
import { PetalScoreRow } from './PetalScoreRow'

/**
 * 首启引导四幕（v3.1 B2，吞并 P0-8 首次盘点仪式）——
 *   第一幕 欢迎与定性：这不是考核表，是你的花园
 *   第二幕 八片花瓣：认识每个维度
 *   第三幕 亲手打分：初始分是用户第一次认真看自己的结果，不是种子写死的 3
 *   第四幕 花开了：三个基本操作提示 + 手册入口 + 第一步邀请（Lisa L5）
 * 全程可跳过（跳过 = 种子分照旧）；设置页可重看。
 * 语气红线（晓雅 X3）：邀请式，不出现任何目标设定与命令句。
 */

// 八个种子维度的一句话介绍；自种维度走兜底
const DIMENSION_INTROS: Record<string, string> = {
  '职业发展': '你的手艺、事业与影响力',
  '财务状况': '钱的流向，和说「不」的底气',
  '个人成长': '读的书、学的课、想通的事',
  '身心健康': '身体与情绪——所有远方的入场券',
  '家庭关系': '与最亲近的人之间的温度',
  '社交关系': '朋友、同好，与真诚的连接',
  '休闲娱乐': '玩耍与放空，给心里的弦松松劲',
  '精神成长': '意义、感恩，与内心的安顿',
}

export function Onboarding() {
  const dimensions = useEnabledDimensions()
  const actions = useStore(s => s.actions)
  const completeOnboarding = useStore(s => s.completeOnboarding)
  const skipOnboarding = useStore(s => s.skipOnboarding)
  const setOnboardingOpen = useStore(s => s.setOnboardingOpen)
  const setQuickAddOpen = useStore(s => s.setQuickAddOpen)

  const [act, setAct] = useState(0)
  const [saving, setSaving] = useState(false)
  const [scores, setScores] = useState<Record<string, number>>(
    () => Object.fromEntries(dimensions.map(d => [d.id, Math.round(d.initialScore) || 3]))
  )

  const handleBloom = async () => {
    if (saving) return
    setSaving(true)
    try {
      await completeOnboarding(scores)
      setAct(3) // 完成写入后进「花开了」，收尾由本组件负责
    } finally {
      setSaving(false)
    }
  }

  const close = () => setOnboardingOpen(false)

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto"
      data-testid="onboarding"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="min-h-full flex items-center justify-center p-8">
        <div className="w-full max-w-xl animate-fade-in" key={act}>

          {act === 0 && (
            <div className="text-center space-y-6">
              <div className="flex justify-center"><FlowerLogo size={56} /></div>
              <h1 className="text-3xl font-light tracking-[0.2em]">生命之花</h1>
              <p className="text-base text-[var(--text-secondary)] leading-loose">
                这里不是一张考核表，<br />是一座只属于你的花园。
              </p>
              <p className="text-sm text-[var(--text-muted)] leading-loose max-w-md mx-auto">
                「正因为你为你的玫瑰花费了时间，<br />才使你的玫瑰变得如此重要。」
                <span className="block mt-1 opacity-70">—— 《小王子》</span>
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button className="btn btn-ghost text-sm" onClick={() => skipOnboarding()}>
                  先逛逛
                </button>
                <button className="btn btn-primary" onClick={() => setAct(1)}>
                  走进花园 →
                </button>
              </div>
            </div>
          )}

          {act === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-light tracking-wide mb-2">八片花瓣</h2>
                <p className="text-sm text-[var(--text-muted)]">每片花瓣，照看你生活的一个角落</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {dimensions.map(d => (
                  <div key={d.id} className="card p-4 flex items-start gap-3">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5"
                      style={{ backgroundColor: d.colorHex }}
                    />
                    <div>
                      <div className="text-sm font-medium">{d.name}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                        {DIMENSION_INTROS[d.name] ?? '你亲手种下的一片花瓣'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <button className="btn btn-ghost text-sm" onClick={() => setAct(0)}>← 上一步</button>
                <button className="btn btn-primary" onClick={() => setAct(2)}>继续 →</button>
              </div>
            </div>
          )}

          {act === 2 && (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-2xl font-light tracking-wide mb-2">此刻的花</h2>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  现在的你，觉得每片花瓣舒展到哪里了？<br />凭直觉就好——没有对错，之后随时可以改。
                </p>
              </div>
              <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
                {dimensions.map(d => (
                  <PetalScoreRow
                    key={d.id}
                    dimension={d}
                    value={scores[d.id] ?? 3}
                    onChange={n => setScores(s => ({ ...s, [d.id]: n }))}
                    testId="onboarding-score-row"
                  />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <button className="btn btn-ghost text-sm" onClick={() => setAct(1)}>← 上一步</button>
                <button className="btn btn-primary" disabled={saving} onClick={handleBloom} data-testid="onboarding-bloom">
                  {saving ? '花正在开…' : '让花开 →'}
                </button>
              </div>
            </div>
          )}

          {act === 3 && (
            <div className="text-center space-y-6">
              <h2 className="text-2xl font-light tracking-wide">花开了</h2>
              <div className="flex justify-center animate-bloom">
                <FlowerChart dimensions={dimensions} actions={actions} size={280} />
              </div>
              <div className="text-sm text-[var(--text-secondary)] space-y-2 max-w-md mx-auto text-left leading-relaxed">
                <p>🌱 想记点什么：<b>⌘⇧L</b> 或点「+ 快速记录」，选一片花瓣，回车就好</p>
                <p>🌿 每周想回望：左边的「省 · 回顾反思」里有引导问题，答一个就够</p>
                <p>🌸 想换个气氛：设置里有三座花园——暗夜、茶室、花间</p>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                想深入了解这座花园，随时翻侧栏的「花语手册」
              </p>
              <div className="flex items-center justify-center gap-3">
                <button className="btn btn-ghost text-sm" onClick={close}>
                  走进花园
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => { close(); setQuickAddOpen(true) }}
                >
                  记下今天的一件小事
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
