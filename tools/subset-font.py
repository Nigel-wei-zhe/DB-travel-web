#!/usr/bin/env python3
"""重新產生 fonts/ 內的字型子集，只收錄網站實際用到的字。

用法（在專案根目錄執行）：
    pip install fonttools brotli
    # 或：uv run --with fonttools --with brotli python3 tools/subset-font.py
    python3 tools/subset-font.py

輸出：
    fonts/subset-chars.txt           收錄的字元（單行、排序去重、UTF-8）
    fonts/NotoSansTC-subset.woff2    內文，可變字重 400–700
    fonts/NotoSerifTC-subset.woff2   標題，可變字重 500–700

原始字型（SIL OFL，約 29 MB）從 google/fonts 下載到 tools/.font-src/，
該資料夾不進 repo（見 .gitignore）。來源與授權見 fonts/LICENSE.md。

字元收集規則（tools/check-font.cjs 必須保持一致，修改時兩邊一起改）：
  1. data/*.jsonl 的完整文字
  2. index.html 的完整文字
  3. 專案根目錄 *.js（不含 *.test.*、不含子資料夾）內的字串字面量
     （'...'、"..." 與 `...`）裡的所有字元
  4. 固定補充：ASCII 可見字元 U+0020–U+007E、常用標點與全形符號、
     星期與日期用字（見下方 EXTRA）
  控制字元與空白（<= U+0020、U+007F）不計。

跑完後把 sw.js 的 VERSION 加 1，已安裝的手機才會換新字型。
"""
import pathlib
import re
import sys
import urllib.request

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    import brotli  # noqa: F401  woff2 壓縮需要
except ImportError:
    print('缺少套件，請先安裝：\n    pip install fonttools brotli\n'
          '或用 uv：\n    uv run --with fonttools --with brotli python3 tools/subset-font.py')
    sys.exit(1)

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools' / '.font-src'
FONTS = ROOT / 'fonts'
BASE = 'https://raw.githubusercontent.com/google/fonts/main/ofl'
# (來源檔名, 下載網址, 輸出檔名, 保留的字重範圍)
JOBS = [
    ('NotoSansTC-wght.ttf', BASE + '/notosanstc/NotoSansTC%5Bwght%5D.ttf', 'NotoSansTC-subset.woff2', (400, 700)),
    ('NotoSerifTC-wght.ttf', BASE + '/notoseriftc/NotoSerifTC%5Bwght%5D.ttf', 'NotoSerifTC-subset.woff2', (500, 700)),
]
CHARS_OUTPUT = FONTS / 'subset-chars.txt'

EXTRA = (
    '，。、；：？！…—～·・「」『』（）〔〕【】《》〈〉“”‘’'
    '＋－＝／＆％＃＠＊＄￥￡＜＞'
    '¥$€£%℃°±×÷≒→←↑↓↗↘★☆○●◎□■△▲▽▼◇◆※〒♪'
    '０１２３４５６７８９'
    '零一二三四五六七八九十百千萬億兩半'
    '星期週日月火水木金土年時分秒點號第天夜'
    '上午下午晚早今明昨前後'
)

STRING_RE = re.compile(r"""'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`""")


def js_files():
    return sorted(p for p in ROOT.glob('*.js') if '.test.' not in p.name)


def collect():
    text = ''
    for path in sorted((ROOT / 'data').glob('*.jsonl')):
        text += path.read_text(encoding='utf-8')
    text += (ROOT / 'index.html').read_text(encoding='utf-8')
    for path in js_files():
        for match in STRING_RE.finditer(path.read_text(encoding='utf-8')):
            text += match.group(0)
    chars = set(text) | set(EXTRA) | {chr(c) for c in range(0x20, 0x7F)}
    return sorted(c for c in chars if ord(c) > 0x20 and ord(c) != 0x7F)


def main():
    chars = collect()
    text = ''.join(chars)
    FONTS.mkdir(exist_ok=True)
    SRC.mkdir(exist_ok=True)
    CHARS_OUTPUT.write_text(text + '\n', encoding='utf-8')

    total = 0
    for source, url, output, (lo, hi) in JOBS:
        path = SRC / source
        if not path.exists():
            print(f'下載 {source}…')
            urllib.request.urlretrieve(url, path)
        options = subset.Options()
        options.flavor = 'woff2'
        options.layout_features = ['kern', 'locl', 'ccmp', 'liga', 'calt', 'vert', 'vkrn', 'vpal', 'palt', 'halt', 'vhal', 'chws', 'vchw']
        options.notdef_outline = True
        options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
        font = subset.load_font(str(path), options)
        subsetter = subset.Subsetter(options)
        subsetter.populate(text=text)
        subsetter.subset(font)
        font = instancer.instantiateVariableFont(font, {'wght': (lo, hi)})
        target = FONTS / output
        subset.save_font(font, str(target), options)
        size = target.stat().st_size
        total += size
        covered = {chr(c) for c in TTFont(str(target)).getBestCmap()}
        missing = ''.join(c for c in chars if c not in covered)
        print(f'{output}：{size / 1024:.0f} KB，字重 {lo}–{hi}' + (f'；字型本身沒有：{missing}' if missing else ''))
    print(f'字元 {len(chars)} 個，woff2 合計 {total / 1024:.0f} KB')
    print('記得把 sw.js 的 VERSION 加 1。')


if __name__ == '__main__':
    main()
