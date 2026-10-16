"""Optional E2E suite. Requires Python playwright and Chromium; see docs/TESTING.md."""
import os
import json
import pathlib
import shutil
import unittest
from playwright.sync_api import sync_playwright
BASE = os.environ.get('DJQ_BASE_URL', 'http://127.0.0.1:3000')
ART = pathlib.Path(os.environ.get('DJQ_ARTIFACT_DIR', 'artifacts/browser'))
class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ART.mkdir(parents=True, exist_ok=True)
        cls.p = sync_playwright().start()
        cls.browser = cls.p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'), args=['--no-sandbox'])
    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.p.stop()
    def page(self, **options):
        context = self.browser.new_context(**options)
        self.addCleanup(context.close)
        page = context.new_page()
        page.set_default_timeout(10000)
        page.on('pageerror', lambda error: self.fail(str(error)))
        if os.environ.get('DJQ_BROWSER_BRIDGE') == '1':
            from browser_bridge import attach
            bridge = attach(page, BASE)
            self.addCleanup(bridge.dispose)
        else:
            page.goto(BASE)
        return page
    def test_01_home_local_move_undo_restore(self):
        p = self.page(viewport={'width': 1440, 'height': 1000})
        p.locator('#local-start').wait_for()
        p.screenshot(path=str(ART / 'home-desktop.png'), full_page=True)
        p.locator('#mode-2').click()
        p.locator('#local-start').click()
        p.locator('#hint').click()
        p.locator('#confirm-move').click()
        self.assertEqual(p.locator('#move-number').inner_text(), '1')
        p.locator('#undo').click()
        self.assertEqual(p.locator('#move-number').inner_text(), '0')
        for _ in range(12):
            p.locator('#hint').click()
            p.locator('#confirm-move').click()
        p.screenshot(path=str(ART / 'game-desktop.png'), full_page=True)
        p.reload()
        p.locator('#resume-local').click()
        self.assertEqual(p.locator('#move-number').inner_text(), '12')
        p.locator('#theme-toggle').click()
        p.screenshot(path=str(ART / 'game-dark.png'), full_page=True)
    def test_02_mobile_three_player_and_no_overflow(self):
        p = self.page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
        p.locator('#mode-3').click()
        p.locator('#local-start').click()
        for _ in range(4):
            p.locator('#hint').click()
            p.locator('#confirm-move').click()
        self.assertEqual(p.locator('#move-number').inner_text(), '4')
        self.assertLessEqual(p.evaluate('document.documentElement.scrollWidth'), 390)
        p.screenshot(path=str(ART / 'game-mobile.png'), full_page=True)
    def test_03_two_browser_online_move_reload_and_rematch(self):
        a = self.page(viewport={'width': 1280, 'height': 900})
        b = self.page(viewport={'width': 1280, 'height': 900})
        a.locator('#mode-2').click()
        a.locator('#player-name').fill('Alice')
        a.locator('#create-room').click()
        a.locator('#room-code').wait_for()
        code = a.locator('#room-code').inner_text()
        b.locator('#player-name').fill('Bob')
        b.locator('#room-code-input').fill(code)
        b.locator('#join-room').click()
        a.locator('#online-start').click()
        a.locator('#hint').click()
        a.locator('#confirm-move').click()
        b.wait_for_function("document.querySelector('#move-number')?.textContent === '1'")
        b.reload()
        b.locator('#hint').wait_for()
        b.locator('#hint').click()
        b.locator('#confirm-move').click()
        a.wait_for_function("document.querySelector('#move-number')?.textContent === '2'")
        a.on('dialog', lambda d: d.accept())
        a.locator('#resign').click()
        a.locator('#rematch').wait_for()
        a.locator('#rematch').click()
        b.locator('#room-code').wait_for()
        a.locator('#online-start').click()
        self.assertEqual(a.locator('#move-number').inner_text(), '0')
    def test_04_mobile_dock_keeps_confirmation_accessible(self):
        p = self.page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        p.locator('#mode-2').click()
        p.locator('#local-start').click()
        p.locator('[data-piece="I1"]').click()
        p.locator('.mobile-dock').wait_for()
        board = p.locator('#board').bounding_box()
        p.locator('#board').tap(position={'x': board['width']/40, 'y': board['height']/40})
        p.locator('[data-action="confirm-move"]').click()
        self.assertEqual(p.locator('#move-number').inner_text(), '1')

    def test_05_keyboard_enter_respects_button_focus(self):
        p = self.page()
        p.locator('#local-start').click()
        p.locator('#hint').focus()
        p.keyboard.press('Enter')
        p.locator('#preview rect').first.wait_for()
        self.assertGreater(p.locator('#preview rect').count(), 0)
        p.locator('#board').focus()
        p.keyboard.press('Enter')
        self.assertEqual(p.locator('#move-number').inner_text(), '1')

    def test_06_online_three_and_four_player_color_rotation(self):
        for count in [3,4]:
            pages=[self.page(viewport={'width': 1280,'height': 900}) for _ in range(count)]
            host=pages[0]
            host.locator(f'#mode-{count}').click()
            host.locator('#create-room').click()
            host.locator('#room-code').wait_for()
            code=host.locator('#room-code').inner_text()
            for index,page in enumerate(pages[1:],start=1):
                page.locator('#player-name').fill(f'Guest {index}')
                page.locator('#room-code-input').fill(code)
                page.locator('#join-room').click()
            host.screenshot(path=str(ART / f'lobby-{count}.png'),full_page=True)
            host.locator('#online-start').click()
            for color in range(4):
                actor=pages[color if color<3 or count==4 else 0]
                actor.locator('#hint').click()
                actor.locator('#confirm-move').click()
            for page in pages:
                page.wait_for_function("document.querySelector('#move-number')?.textContent === '4'")

    def test_07_replay_import_navigation_and_safe_names(self):
        p=self.page()
        record={'format':'djq-replay','version':1,'players':2,'scoring':'bonus',
            'names':['<img src=x onerror=alert(1)>','B'],'actions':[]}
        for color,(x,y) in enumerate([(0,0),(19,0),(19,19),(0,19)]):
            record['actions'].append({'type':'move','color':color,'player':color%2,
                'move':{'piece':'I1','orientation':0,'x':x,'y':y},'automatic':False})
        p.locator('#import-file').set_input_files({'name':'sample.json','mimeType':'application/json','buffer':json.dumps(record).encode()})
        p.locator('#replay-next').wait_for()
        for _ in range(4):
            p.locator('#replay-next').click()
        self.assertEqual(p.locator('#move-number').inner_text(),'4')
        self.assertEqual(p.locator('img').count(),0)
        self.assertIn('<img',p.locator('.player-ident strong').first.inner_text())
        p.locator('#home-button').click()
        record['actions'][0]['move']['x']=8
        p.locator('#import-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(record).encode()})
        p.locator('#toast').wait_for()
        self.assertTrue(p.locator('#local-start').is_visible())

    def test_08_local_game_completes_and_rematches(self):
        p=self.page(viewport={'width':1440,'height':1000})
        p.locator('#local-start').click()
        for _ in range(85):
            if p.locator('#rematch').count():
                break
            p.locator('#hint').click()
            p.locator('#confirm-move').click()
        self.assertEqual(p.locator('#rematch').count(),1)
        p.screenshot(path=str(ART / 'finished-desktop.png'),full_page=True)
        p.locator('#rematch').click()
        self.assertEqual(p.locator('#move-number').inner_text(),'0')

    def test_09_home_inventory_is_per_color_not_per_player(self):
        p=self.page()
        p.locator('#mode-2').click()
        self.assertIn('\u6bcf\u8272',p.locator('.art-tag').inner_text())

if __name__ == '__main__':
    unittest.main(verbosity=2)
