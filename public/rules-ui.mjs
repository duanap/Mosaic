/** Player-facing guide. Semantic sections wrap naturally without a wide rules table. */
export function rulesContent() {
  return `<div class="rules-content">
    <div class="rules-intro"><p><strong>把棋子尽可能放上棋盘，留下的小格越少越好。</strong></p><p>每种颜色都有完整的 21 块棋子。</p></div>
    <section aria-labelledby="rules-placement"><h3 id="rules-placement"><span class="rules-index" aria-hidden="true">01</span>怎样落子</h3>
      <ul><li>每种颜色的第一块棋子，必须覆盖<strong>起始角</strong>。</li><li>后续棋子必须与已有同色棋子<strong>角碰角，不能边贴边</strong>。</li><li>不同颜色可以贴边，但棋子不能重叠，也不能超出棋盘。</li></ul>
      <div class="rules-examples" aria-label="两块同色棋子的连接示例">
        <figure><svg viewBox="0 0 90 66" aria-hidden="true"><rect x="15" y="6" width="26" height="26" rx="3"/><rect x="43" y="34" width="26" height="26" rx="3"/><circle class="rules-contact" cx="42" cy="33" r="4"/></svg><figcaption><strong>可以：角碰角</strong><span>两块同色棋子以角相连</span></figcaption></figure>
        <figure class="rules-invalid"><svg viewBox="0 0 90 66" aria-hidden="true"><rect x="15" y="20" width="26" height="26" rx="3"/><rect x="43" y="20" width="26" height="26" rx="3"/><path class="rules-contact" d="M42 19V47"/></svg><figcaption><strong>不可以：边贴边</strong><span>两块同色棋子不能贴边</span></figcaption></figure>
      </div>
    </section>
    <section aria-labelledby="rules-modes"><h3 id="rules-modes"><span class="rules-index" aria-hidden="true">02</span>选择玩法</h3>
      <div class="rules-mode-grid">
        <article><div class="rules-mode-heading"><h4>两人 · 每人双色</h4><span>20 × 20</span></div><p>蓝红一方，黄绿一方。自己的两色分别从对角出发。</p></article>
        <article><div class="rules-mode-heading"><h4>两人 · 每人单色</h4><span>14 × 14</span></div><p>每人控制一色，蓝黄从对角出发，双方交替落子。</p></article>
        <article><div class="rules-mode-heading"><h4>三人 · 公共色轮换</h4><span>20 × 20</span></div><p>每人控制一色，公共绿色由三位玩家依次操作，不计入个人得分。</p></article>
        <article><div class="rules-mode-heading"><h4>四人 · 个人或组队</h4><span>20 × 20</span></div><p>每人控制一色，可各自计分，也可蓝红对黄绿组队。</p></article>
      </div><p class="rules-note">四色玩法按<strong>蓝 → 黄 → 红 → 绿</strong>的顺序行动。</p>
    </section>
    <section aria-labelledby="rules-controls"><h3 id="rules-controls"><span class="rules-index" aria-hidden="true">03</span>操作棋子</h3>
      <ol class="rules-steps"><li><strong>选棋子：</strong>从棋子区选择一块尚未使用的棋子。</li><li><strong>移位置：</strong>按住预览棋子的任意实心小格拖动。</li><li><strong>调方向：</strong>短按预览可旋转，点击翻转按钮可镜像翻转。</li><li><strong>确认落子：</strong>调整好位置后，点击打勾按钮。</li></ol>
      <p class="rules-note">落点提示只提供建议，仍需手动确认。</p>
    </section>
    <section aria-labelledby="rules-finish"><h3 id="rules-finish"><span class="rules-index" aria-hidden="true">04</span>何时结束</h3>
      <p>某种颜色的棋子全部用完，或已无合法落点时，系统会自动跳过该色。有棋可下时不能主动跳过回合，但可以选择认输。</p><p>所有颜色都无法继续落子后，进行结算。</p>
    </section>
    <section aria-labelledby="rules-scoring"><h3 id="rules-scoring"><span class="rules-index" aria-hidden="true">05</span>怎样获胜</h3>
      <p>每剩下 <strong>1 个小格扣 1 分</strong>。计算的是小格数，不是棋子块数。</p>
      <div class="rules-score-grid"><article><h4>基础计分</h4><p>一种颜色全部放完，记为 <strong>0 分</strong>。</p></article><article><h4>奖励计分</h4><p>一种颜色全部放完，得 <strong>15 分</strong>；最后放下的是单格棋子，再加 5 分，共 <strong>20 分</strong>。</p></article></div>
      <p>每人双色时合计自己的两色得分，组队时合计队伍得分。<strong>总分最高者获胜，同分并列；认输者不参与获胜。</strong></p>
    </section>
    <section aria-labelledby="rules-online"><h3 id="rules-online"><span class="rules-index" aria-hidden="true">06</span>联机提醒</h3>
      <p>回合超时后，系统会自动放下一块合法棋子。</p><p>断线后可刷新页面尝试恢复原席位。当前回合玩家断线时，最多再等待 45 秒，且不会延长原回合时限。</p>
    </section>
    <footer class="rules-keyboard" aria-labelledby="rules-keyboard-title"><h3 id="rules-keyboard-title">键盘快捷键</h3><dl>${[['R','旋转'],['F','翻转'],['T','提示'],['↑↓←→','移动'],['Enter','确认'],['Esc','取消']].map(([key,label])=>`<div><dt><kbd>${key}</kbd></dt><dd>${label}</dd></div>`).join('')}</dl></footer>
  </div>`;
}
