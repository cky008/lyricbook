# DIOR Da Ying — London 2026 Setlist Research

## Status

This preset is a **composite prediction**, not an official running order. London is scheduled for 2 September 2026 at Clapham Grand. The promoter lists a 19:30 show start and a 21:30 VIP photo-session start; those timings suggest a roughly two-hour performance window, but they do not guarantee the concert duration.

## Evidence tiers

### Tier A — official London material

The official venue and promoter pages establish the date, venue and tour context. The venue names the following representative repertoire, but does not give a running order:

- Love Myself More — 爱自己更深
- I’ve Been Better — 你最近过得好吗？
- If That Phone Call Had Been Answered — 如果那通电话有接通
- See You — 有天会再相见
- Go Slow to Go Fast — 慢慢走才能走得快
- YOLO — 人醒着不过一万多天
- This Lifetime of Ours — 人的这一生
- Save Some — 节约用爱
- Mutual Friends — 靠关系

The preset intentionally corrects two earlier metadata mistakes: `YOLO` maps to `人醒着不过一万多天`, and `Mutual Friends` maps to `靠关系`.

### Tier B — observed Taipei tour structure

A post-show report confirms that Taipei opened with `KAMPUNG GIRL`, included `你最近过得好吗？`, `如果那通电话有接通`, `爱自己更深`, `节约用爱`, `人醒着不过一万多天`, `PROUD OF MYSELF` and `我要发疯`, and closed with `有天会再相见`. It also confirms two-night rotations: Day 1 used `眼泪记得你` and `歌颂者`; Day 2 used `做一个惜情软心的人` and `再见的时候`.

The user-supplied 17 April Taipei community playlist is preserved as a 24-track **observed reference sequence**. It is not presented as an official cue sheet.

### Tier C — tour variability

The official Bali announcement said that the outdoor stop would use an approximately 50% changed setlist. This is why the preset keeps a large rotation pool and avoids presenting the London prediction as certain.

### Tier D — community preparation playlists

The user supplied a Spotify playlist and a 29-video YouTube concert-practice playlist. They are used only to broaden candidate coverage and identify plausible covers or collaborations. Community playlists never override official or observed evidence.

### Tier E — popularity signal

An August 2026 Spotify chart-history snapshot is used only as a secondary signal for recent originals such as `过了几天（合唱版）`, `她已不再是那个女孩`, `人的这一生` and `靠关系`. Streaming popularity is not setlist evidence.

## Included setlists

### 1. London high-confidence core — 17 songs

A preparation list combining official London promotional repertoire with recurring tour anchors. It is useful when the user wants a smaller, safer print/export scope.

### 2. London expanded composite prediction — 24 songs

1. Kampung Girl 普通人
2. 你最近过得好吗？
3. 如果那通电话有接通
4. 爱自己更深
5. 她已不再是那个女孩
6. 在加纳共和国离婚
7. 过了几天（合唱版）
8. 人的这一生
9. 靠关系
10. 大人的快乐
11. 节约用爱
12. 人醒着不过一万多天
13. 慢慢走才能走得快
14. LOUISE
15. Proud Of Myself
16. 我要发疯 LOSTCONTROL
17. 阿呆
18. 给我的 Crush
19. 花期不同
20. 泪桥 — optional cover slot
21. 做一个惜情软心的人 — optional rotation slot
22. 最后一次 — optional cover slot
23. Kampung Girl 普通人 — optional reprise
24. 有天会再相见

The optional items are deliberately replaceable. A real London running order may substitute other entries from the rotation pool.

### 3. Taipei 2026-04-17 observed reference — 24 tracks

The exact user-supplied order is retained, including the `Kampung Girl` reprise before the final song.

### 4. Rotation / cover / regional pool — 20 songs

This pool contains Taipei night-specific covers, collaborations, community preparation candidates and low-confidence regional covers. These entries must not be treated as confirmed London songs.

## Public-content rule

The preset contains metadata, source records, tags, confidence values and empty lyric tracks only. It does not distribute full copyrighted lyrics.

## Updating after the show

After an official or well-documented London running order becomes available:

1. add the source to `project.sources`;
2. create an `observed` London setlist rather than overwriting the prediction;
3. retain the prediction for comparison;
4. assign source references per song;
5. run `npm run validate:content`, `npm run check` and `npm run test:e2e`.

---

# 中文说明

该预设不是官方歌单，而是按“伦敦官方宣传 > 台北实演报道与用户提供顺序 > 巡演变化报道 > 社区预习歌单 > 流媒体热度”的优先级交叉整理。首版只放 10 首明显不足，因此 v0.0.5 扩充为 40 首曲库、17 首高置信度核心、24 首伦敦综合预测、24 首台北参考顺序和 20 首轮换候选。所有低置信度翻唱位都标为 optional，正式伦敦歌单公布后应新增 observed 版本，而不是删除预测历史。
