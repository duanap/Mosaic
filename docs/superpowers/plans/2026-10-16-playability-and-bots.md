# DJQ 落子体验、提示、组队与机器人开发计划

> 2026-10-16 用户回复“继续”后已在当前会话内实现。下方保留原计划；执行结果见下表。此前引用的执行技能已不在当前技能清单中，本次按原生工具与验证流程执行。未自动提交、推送或部署。

## 执行记录

| 任务 | 当前结果 |
| --- | --- |
| 1 拖动/旋转/边界 | 已实现；几何测试、真实来源鼠标/CDP触屏与取消手势通过 |
| 2 大块提示轮换 | 已实现；穷尽oracle、姿态/去重/顺序、浏览器轮换通过 |
| 3 模式/组队/存档 | 已实现；计分/认输、v1/v2、浏览器组队与旧棋谱通过 |
| 4 取消准备 | 已实现；真人2/3/4席、机器人混合、再开与恢复通过 |
| 5 机器人策略 | 已实现；两组40局双色和三人/四人/组队分别基准，详见VERIFICATION.json |
| 6 席位/调度 | 已实现；真实worker、本地完整局/悔棋/恢复、在线组队、迟到/断线取消和12房并发通过 |
| 7 交付验证 | 原生、真实来源浏览器、打包和文档验证；实体Android/iOS与生产域名保留后续验收 |

实际测试归并：候选/提示/策略在`tests/moves.test.mjs`；v1/v2在`tests/modes.test.mjs`；浏览器流程统一在`tests/browser_gameplay.mjs`，搭配已有`browser_recovery.mjs`。标准机器人采用单步启发式；未引入外部模型。未自动commit/PR/部署，原任务中的建议提交步骤不代表已经执行。

**Goal:** 修复桌面/手机摆棋体验，取消准备，完善两人双色、加入四人组队、可循环大块提示与可独立对战的机器人。

**Architecture:** 保留共享规则、原生SVG界面、Node HTTP/SSE权威房间。抽出纯交互几何与合法走法枚举，提示和机器人共用候选；浏览器Web Worker和服务端worker_threads承载策略计算，主线程负责校验、调度与状态提交。

**Tech Stack:** Node.js >=22、JavaScript ES Modules、SVG、Pointer Events、Web Worker/worker_threads、node:test；可选现有Playwright环境做真实来源浏览器验证。

**Spec:** [试玩反馈与下一版设计](../specs/2026-10-16-playability-and-bots-design.md)。用户已确认四人分两队、每人一色、每队合计双色。对角颜色同队等建议默认值详见设计。

## Global Constraints

- 基线 `f8ecc99`；本次基线 `npm test` 49/49通过，未执行本轮浏览器手势验收。
- Node.js >=22、零 npm 运行依赖；保留现有HTTP/SSE、单进程房间、20×20棋盘、四色各21块。
- “按住拖动”位移阈值8 CSS px；悬停不移动；松手不落子；预览短按顺时针90°；保留确认、翻转与键盘。
- 完整形状始终处于棋盘内；碰撞、贴边、缺少角连接仍需通过原规则引擎校验。
- duo=2人各双色；trio=3人公共绿；classic=4人各自；teams=4人两队、每人一色、蓝红对黄绿。
- 无准备；满员且真人在线后房主手动开始；只有空位能被房主设为机器人。
- 保留round/revision/房间version与token保护；机器人无token，不加入真人恢复记录，不成为房主。
- 旧v1棋谱与本地存档继续可用；新v2携带模式/席位信息；恢复时重放历史而非重新计算机器人。
- 机器人标准策略预算400ms，硬超时1000ms；基准目标双人双色40局轮换先后手、胜率≥60%（平局计0.5）。性能与棋力均为待验证目标。
- 每项任务先添加有意义的失败回归，再实现、复测；不新增Docker、数据库、CI或部署操作。

## Review Focus

- 手机从多格棋子的非左上角实心格抓取时位置不跳；空洞不触发旋转；拖动后不被合成click再旋转（任务1）。
- 拖动中收到SSE在线状态更新、pointercancel或第二指，既不丢失指针归属也不误提交（任务1）。
- 只有镜像/旋转才可行、最大棋子不可行、唯一落点等局面：提示不漏解，不把截断搜索当无棋可下（任务2）。
- 组队一人认输、双方同分，以及旧v1存档/三人公共绿：赢家、控制权与恢复保持正确（任务3）。
- 机器人结果迟到、悔棋/revision复用、房间删除、全真人断线、worker崩溃：只提交当前局面的一个合法意图（任务5–6）。

## 文件职责与依赖

| 文件 | 计划职责 |
| --- | --- |
| `public/placement.mjs`（新） | 不依赖DOM的预览边界、抓取偏移、旋转支点与手势状态 |
| `shared/moves.mjs`（新） | 穷尽候选与按绝对格去重；接收规则函数，避免rules与moves循环导入 |
| `shared/strategy.mjs`（新） | 提示排序与机器人候选评分；不负责改棋盘/调度 |
| `shared/modes.mjs`（新） | 人数/模式校验、控制权与队伍映射 |
| `shared/rules.mjs` | 规则真相、应用行动、计分、组队结束与棋谱版本兼容 |
| `public/analysis-worker.mjs`（新） | 提示/本地机器人计算入口，仅接收不可变快照 |
| `public/analysis-client.mjs`（新） | worker请求、取消、代次与过期响应隔离 |
| `server/bot-worker.mjs`（新） | 服务端机器人纯计算入口 |
| `server/bots.mjs`（新） | 有界线程池、每局任务、取消、超时与兜底结果 |
| `public/app.mjs` | 组合界面、选形、渲染、事件、同屏调度；拖动中不替换捕获节点 |
| `server/rooms.mjs` | 房主权限、席位类型、开局、再开、机器人权威提交 |
| `server/index.mjs` | 新客户端/共享模块静态白名单、worker生命周期、关闭回收 |
| `public/style.css`、`public/i18n.mjs` | 命中/手势样式、队伍与机器人展示、去准备文案 |

依赖：`任务1 → 任务2 → 任务3 → 任务4 → 任务5 → 任务6 → 任务7`。这是建议交付顺序；任务1和任务4技术上相对独立，但先集中解决试玩阻塞。每项完成后保留可玩的基线。

## 任务1：统一拖动、旋转与边界（P0）

**Files:** Create `public/placement.mjs`, `tests/placement.test.mjs`, `tests/browser_gameplay.mjs`; Modify `public/app.mjs`, `public/style.css`, `public/i18n.mjs`, `server/index.mjs`。

**Interfaces:**

- `clampOrigin(piece: string, orientation: number, origin: {x:number,y:number}): {x:number,y:number}`。
- `hitPreview(move: Move, cell: {x:number,y:number}): boolean`：只命中实心格。
- `rotatePreview(move: Move, pivot: {x:number,y:number}): Move`：输入棋盘上的实心支点，保留该格锚点，必要时整体回收边界。
- `beginGesture({pointerId,startPoint,move}): Gesture`、`moveGesture(gesture,point): Gesture`、`endGesture(gesture,{cancelled}): {move,rotate,suppressClick}`；point为CSS位置与换算后的棋盘连续坐标，Gesture保存初始move/偏移/8px阈值状态。
- `flipPreview(move: Move): Move`：在当前锚点镜像并夹紧；Move始终是`{piece,orientation,x,y}`。

- [ ] 为F5/L5等添加失败回归：任意实心格抓取后无跳变；8px以下短按旋转、达到8px只移动；空洞不命中；所有21形×8姿态×四边的原点与占用格都在0–19。
- [ ] 浏览器新增鼠标无按键移入移出不移动、拖动松开后去点确认位置不变、手机从非左上角抓取、边缘旋转/翻转、方向键夹紧、多指/取消、已落子不可移动的用例。浏览器脚本复用`tests/browser_recovery.mjs`的真实本地HTTP启动方式与Playwright加载方式。
- [ ] 运行 `node --test tests/placement.test.mjs` 和新增浏览器用例，确认回归针对旧逻辑失败，记录失败原因。
- [ ] 实现placement并接入app：删除普通悬停更新分支；选择后生成完整预览；统一pointer capture与pointerId；预览用几何命中；指针取消恢复原位置；拖动期间仅更新SVG预览、不重建board节点。同revision的在线状态重绘延后到手势结束，新revision直接取消旧手势。
- [ ] 注册`/placement.mjs`静态映射，更新使用说明；移除预览“过滤掉越界小格”的掩盖逻辑，统一由clamp约束。
- [ ] 复测新用例与 `npm test`；1440×1000、390×844、360×800下截图。用真实触摸事件检查拖动，不用单独dispatch合成事件冒充原生手势；真机另记待验收或实测结果。
- [ ] 仅提交本任务相关文件，建议提交名 `fix: unify piece dragging rotation and board bounds`。

**完成标准：** 不用提示也能在桌面/触屏完成4色首轮的多格落子；完整棋子不越界，确认不因鼠标离开棋盘失效。

## 任务2：穷尽候选与可循环的大块提示（P1）

**Files:** Create `shared/moves.mjs`, `shared/strategy.mjs`, `public/analysis-worker.mjs`, `public/analysis-client.mjs`, `tests/moves.test.mjs`, `tests/hints.test.mjs`, `tests/analysis-client.test.mjs`; Modify `shared/rules.mjs`, `public/app.mjs`, `public/i18n.mjs`, `server/index.mjs`, `tests/browser_gameplay.mjs`。

**Interfaces:**

- `enumerateMoves(game, color, preferredPiece, rules): Generator<Move>`，rules注入`{SIZE,CORNERS,variants,validateMove,pieceSize}`；模块不反向导入rules。rules导出薄封装`legalMoves(game,color=game.turn,preferredPiece=null): Generator<Move>`。
- 原 `findMove(game,color=game.turn,preferredPiece=null): Move|null` 取上述生成器首个结果，保持原有大块/方向/锚点遍历顺序。
- `rankHints(game,color): Move[]`：全量合法走法按格数分组；同组按棋形轮询、各棋形内部按评分及稳定坐标排序。
- `analyze({requestId,context,kind:'hints',game}): Promise<{requestId,context,moves:Move[]}>`；context含本地实例ID或room+round、revision、color、generation；`cancelAnalysis()`使旧请求失效。

- [ ] 失败测试覆盖：生成器与独立暴力oracle逐项集合相等；8姿态去重；仅方向1/镜像方向存在的固定局面；`findMove`旧结果不变；能走5格时第一组全部5格、5格不可行时降到4格。
- [ ] 固定局面连续提示直到候选耗尽：无重复绝对落点、棋形轮换、出现旋转和镜像、正确i/N；唯一候选文案；本地悔棋回到相同revision仍重新计算；旧worker结果不覆盖新回合。
- [ ] 运行新增原生测试，记录旧版失败，再实现生成器、排序、worker协议与提示状态；停止/判堵只用穷尽搜索，不能拿前N个结果判定。
- [ ] UI接收候选后通过任务1的边界/姿态接口更新；“下一方案”只改预览。新增模块全部注册静态白名单；worker用同源module URL，检查当前CSP允许加载，必要时明确加`worker-src 'self'`。
- [ ] 运行 `node --test tests/moves.test.mjs tests/hints.test.mjs tests/analysis-client.test.mjs`、`npm test`与浏览器提示用例；记录开局/中局/残局候选数量、耗时、内存峰值，避免只报告首手性能。
- [ ] 建议提交 `feat: cycle ranked hints across pieces and orientations`。

**完成标准：** 同局面连续点击能切换建议；大块优先、方向正确、无重复，不牺牲无棋可走判定的完整性。

## 任务3：显式模式、四人组队与存档兼容（P1）

**Files:** Create `shared/modes.mjs`, `tests/modes.test.mjs`, `tests/replay-compat.test.mjs`; Modify `shared/rules.mjs`, `server/rooms.mjs`, `public/app.mjs`, `public/i18n.mjs`, `server/index.mjs`, `tests/rules.test.mjs`, `tests/rooms.test.mjs`, `tests/http.test.mjs`, `tests/browser_gameplay.mjs`。

**Interfaces:**

- `normalizeMode(players: number, mode?: string): 'duo'|'trio'|'classic'|'teams'`，缺省按人数映射前三种，错误组合抛`INVALID_OPTIONS`。
- `teamOf(mode: string, seat: number): number|null`，teams映射0/2→0、1/3→1；非组队返回null。
- `newGame(players=4,scoring='bonus',{mode}={}): Game` 向后兼容；`game.mode`随快照同步。
- `teamScores(game): Array<{team,members,score,remaining,placed,forfeited,winner}>`；原`scores(game)`仍输出个人贡献，teams时winner按获胜队的未认输成员展示，最终结果banner以teamScores为准。
- `exportReplay(game,names=[],{seats}={}): ReplayV2`；`replay(record,steps)`接受v1/v2，校验mode/seat元数据并重放动作，Game重放不依赖worker。

- [ ] 添加失败测试：duo控制[0,2]/[1,3]；teams同队不共享本色连接；按色奖励后合队；队伍并列；一人认输继续、整队认输直接败；机器人元数据不能改变move所有权。
- [ ] 固定v1样例覆盖2/3/4人、存档恢复、公共绿轮换；v2覆盖组队与席位信息；非法模式、超量动作、伪造source、非法seat配置拒绝。旧v1的动作总数限制继续成立，v2同为最多84步棋+4次认输。
- [ ] 运行 `node --test tests/modes.test.mjs tests/replay-compat.test.mjs` 确认失败；实现模式映射、结算/结束判定、房间mode传递、v2兼容与本地存档升级。
- [ ] 首页区分“人数/玩法”，两人明确“每人双色”；四人增加个人/组队选择。大厅、回合、结算和复盘都显示队伍/贡献，注册`/shared/modes.mjs`。
- [ ] 扩展HTTP与浏览器测试：真实4席teams加入→轮流落子→队伍结算→再开；新旧棋谱导入；duo/trio/classic均可结束，恢复席位不受棋谱版本影响。
- [ ] 运行新增测试与 `npm test`；建议提交 `feat: add explicit game modes and two-team scoring`。

**完成标准：** 四人两队从开局到复盘完整；旧对局继续可恢复；两人双色明确可用。

## 任务4：移除准备，简化真人房间开局（P1）

**Files:** Modify `server/rooms.mjs`, `public/app.mjs`, `public/i18n.mjs`, `tests/rooms.test.mjs`, `tests/http.test.mjs`, `tests/browser_smoke.py`, `tests/browser_recovery.mjs`, `tests/browser_gameplay.mjs`, `docs/API.md`。

**Interfaces:**

- 保持`{type:'start'}`、`{type:'rematch'}`；删除ready字段与`{type:'ready'}`处理，旧命令返回`INVALID_COMMAND`。
- `canStart(room): {ok:boolean,code?:'ROOM_NOT_FULL'|'PLAYER_OFFLINE'}`供同一房间逻辑复用；房主权限单独校验。

- [ ] 新增/修改失败测试：无人准备但满员在线可开始；缺人/离线不可开始；非房主禁止；再开回waiting且无ready字段；旧round动作拒绝，离开/房主转移/断线恢复仍生效。
- [ ] 更新所有测试里的ready步骤，先验证行为失败，再删除ready前后端字段、按钮、错误文案与再开重置逻辑。房主按钮根据满员/在线显示可用状态，其他人显示等待房主。
- [ ] 运行 `node --test tests/rooms.test.mjs tests/http.test.mjs`、`npm test`；运行 `node --test tests/browser_recovery.mjs tests/browser_gameplay.mjs` 和 `python tests/browser_smoke.py`（后者按原文档启动本地服务）。
- [ ] 修改API开局/再开约定；建议提交 `feat: start full rooms without ready checks`。

**完成标准：** 所有2/3/4人线上房间与再开均不再出现准备步骤，开始前仍明确检查真人在线状态。

## 任务5：共享标准机器人策略与棋力基准（P2）

**Files:** Extend `shared/strategy.mjs`, `public/analysis-worker.mjs`, `public/analysis-client.mjs`; Create `tests/strategy.test.mjs`, `scripts/benchmark-bots.mjs`。

**Interfaces:**

- `chooseMove(game,{color=game.turn,level='standard',budgetMs=400,seed=0,now=performance.now}={}): {move:Move|null,metrics:{evaluated,elapsedMs,fallback}}`；不修改输入game。
- `evaluateMove(game,move,{seat,mode}): number`：候选模拟复用规则校验，面积、连接点/可达性、扩张/封堵、残局收尾采用具名权重；固定seed与固定评价数量时结果可复现。
- worker协议增加`kind:'bot'`，context定义沿用任务2；正常无解返回null，但必须由完整合法性查询确认。
- `node scripts/benchmark-bots.mjs --games 40 --seed 20261016 --mode duo` 输出JSON汇总与逐局结果；可选`--output artifacts/bots/duo.json`，不把基准工件提交仓库。

- [ ] 添加失败测试：合法且无输入变更；存在大块时通常重视面积但不强制；固定战略局面保留唯一扩张口/利用空隙；双色与同队收益映射；公共绿控制；零预算/worker失败仍有合法兜底；固定seed/评价数量可重现。
- [ ] 运行 `node --test tests/strategy.test.mjs` 确认失败，再实现启发式评分与可中断候选评价；使用任务2的完整候选，不把超时未搜索区域误认无解。
- [ ] 基准对手固定为原`findMove`策略，交替先后手并保持相同计分；完整40局与四人/组队轮换基准，记录胜率、放出格数、单步耗时p50/p95/最大值与兜底次数。预算按墙钟执行，确定性单测用注入时钟/固定评价数隔离硬件差异。
- [ ] 若双人胜率<60%或频繁用兜底，调整权重/候选评价成本并重跑；保留测试集之外的种子验证，避免只对一个开局优化。
- [ ] 建议提交 `feat: add position-aware bot strategy and benchmarks`。

**完成标准：** 策略达到设计中的合法性、预算和棋力目标；报告真实结果，未达标不得把功能标为完成。策略本任务尚不对外开放机器人席位。

## 任务6：机器人席位、本地/联机调度与资源生命周期（P2）

**Files:** Create `server/bots.mjs`, `server/bot-worker.mjs`, `tests/bots.test.mjs`, `tests/bot-rooms.test.mjs`; Modify `server/rooms.mjs`, `server/index.mjs`, `public/app.mjs`, `public/i18n.mjs`, `public/style.css`, `tests/http.test.mjs`, `tests/browser_gameplay.mjs`, `docs/API.md`。

**Interfaces:**

- 席位公开字段`{id,name,kind:'human'|'bot',level?:'standard',connected,left}`；真人内部持有token/stream，机器人内部无token与stream，非真人不能authorize。
- 新命令`{type:'set-bot',seat:number,level:'standard'}`只填waiting空位；`{type:'remove-bot',seat:number}`只移除waiting机器人，均房主专用。create先保留真人房主，后用命令配置机器人；本地可配1位真人+机器人，不开放零真人自动对战入口。
- `BotScheduler({workers=2,budgetMs=400,hardTimeoutMs=1000,onResult})`提供`request(job)`、`cancel(context)`、`close()`；job包含快照和完整context，结果与任务5一致。每间房只保留一个作业，取消要释放队列和worker预算。
- `RoomStore.applyBotResult(context,result): boolean`只在room/round/revision/turn/controller/kind/配置代次全部匹配且move合法时提交；deadline到达先取消同局作业，随后只执行一次超时兜底。
- 本地用任务2的analysis-client调度bot；controller对应bot时canPlay为false、真人确认禁用；恢复/悔棋/回首页取消作业。本地存档导出沿用任务3的席位元数据。

- [ ] 失败测试覆盖权限、空位限制、机器人不需要SSE即可开始、真人不能冒充bot、真人加入不覆盖bot、机器人无token/恢复记录、不能当房主、真人全离开清理。
- [ ] 用可控调度器/时钟覆盖：同回合只落一次；超时与bot完成竞争；悔棋或再开后旧结果丢弃；房间删除后不提交；队列排队达到deadline兜底；worker崩溃重建/超时回收；lastHuman不被bot刷新；全真人离线时不再发新bot作业，重连后恢复。
- [ ] 运行 `node --test tests/bots.test.mjs tests/bot-rooms.test.mjs` 确认失败；实现线程池与房间侧受控提交，集成server关闭流程，避免500ms tick中进行同步全盘策略搜索。
- [ ] UI提供本地真人/机器人席位选择与联机房主空位操作，显示“机器人思考中”；duo控制同一玩家双色、teams展示队伍关系、trio公共绿按当前controller调度。回合来源标注人类/机器人/超时，旧棋谱保持原显示。
- [ ] 实现机器人对局悔棋：撤回最近一次真人行动及之后自动行动；重放完毕再调度，不让已取消机器人任务立即补回。
- [ ] 扩展真实HTTP浏览器场景：1真人+bot双色完整局；2真人+2bot组队；断线与恢复；本地刷新恢复、悔棋、再开；后台页/离开后无额外提交。
- [ ] 运行原生全套、浏览器全套；多房间并行压测记录HTTP响应与SSE延迟，检查400ms/1000ms目标和线程池队列上限。建议队列上限按maxRooms=100、每房最多1个任务；超出/过时作业直接兜底或丢弃，不能无限堆积。
- [ ] 建议提交 `feat: integrate local and authoritative online bot seats`。

**完成标准：** 真人可在本地/联机与机器人完整对战，组队正确；搜索不阻塞其他房间，过期结果不污染状态，worker随服务关闭回收。

## 任务7：整体验收、打包与文档（P2）

**Files:** Update `README.md`, `docs/GAME_RULES.md`, `docs/GAME_SPEC.md`, `docs/API.md`, `docs/TESTING.md`, `docs/RELEASE_NOTES.md`, `docs/PROGRESS.md`, `docs/VERIFICATION.json`；按需要调整`scripts/check.mjs`/`scripts/build.mjs`资产检查，不修改构建产物当作源码。

- [ ] 在独立临时工作目录验收构建产物，确认public/shared新模块、browser worker和server worker全部打包且MIME正确；请求私有server模块仍404。新增模块逐个列在静态白名单，不开放任意路径。
- [ ] 执行 `npm run verify`，要求语法、所有原生测试与构建全过；仅在此任务或需要交付阶段运行build，避免把旧dist与新源码混测。
- [ ] 执行 `node --test tests/browser_recovery.mjs tests/browser_gameplay.mjs` 与原Python smoke suite。浏览器支持/依赖不可用时记录具体阻塞，不能把跳过当通过。禁止只使用桥接环境证明worker/CSP/原生触摸已验收。
- [ ] 实机验收Windows鼠标、Android触屏、iOS触屏；覆盖多格任意抓取、旋转/翻转、四边、滚动、确认、窄屏、横屏。记录设备与结果，缺设备的项目明确保留待验收。
- [ ] 复跑机器人40局双色和四人/组队基准，保存棋力与性能指标；审查所有新增行为与设计逐项对应，失败项必须修复或显式标记未完成。
- [ ] 更新玩法、取消准备流程、组队认输、机器人席位、提示轮换、v1/v2兼容与测试命令；VERIFICATION只写本次真实执行记录。
- [ ] 检查 `git diff --check` 与变更范围，建议提交 `docs: document and verify playability and bot release`。仅交付可审查分支；推送/PR/部署按后续用户指令执行。

## 建议交付批次与粗估

| 批次 | 任务 | 可交付体验 | 有效开发时间粗估 |
| --- | --- | --- | --- |
| A | 1–2 | 拖动稳定、点击旋转、不越界、提示可切换 | 1.5–2.5天 |
| B | 3–4 | 两人双色入口明确、四人组队、无准备开局、旧档兼容 | 1.5–2.5天 |
| C | 5–6 | 标准机器人、本地/联机混合席位、性能与棋力基准 | 2–3天 |
| D | 7 | 真机与完整回归、打包文档 | 1–1.5天 |

总计约6–9.5个有效开发日，仅用于相对规模判断，不是交付承诺；移动端手感、策略调优和真实设备可用性是主要不确定项。每批按验收结果推进，A批可先独立试用。

## 计划自查

- 用户每条需求均已映射到任务；两人双色作为已有能力完善，未重复新造规则。
- 提示“优先大块/姿态搜索”基于已存在实现扩展，重点是去重、轮换与展示。
- 组队是用户确认的四人四色、两队各双色；不是八色或全场只两色。
- 交互边界、触摸取消、无准备再开、v1存档、worker静态加载/取消/关闭均有归属。
- 初次交付只有设计与计划；随后用户授权继续，实际实现与验收记录在本文开头，计划目标与实测指标分开记录。
