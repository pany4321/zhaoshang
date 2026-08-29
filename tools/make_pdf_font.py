# -*- coding: utf-8 -*-
"""
生成 jsPDF 文字版导出所需的中文 TTF 子集。

做法：扫描 demo/ 下所有 JS/HTML 源文件，收集全部出现过的字符（演示数据完全
确定性，报告内容必然出自这些文件的字符集），再用 fontTools 从系统微软雅黑
(microsoft yahei) 中抽取字形子集，base64 封装为 demo/assets/vendor/pdf-font-zh.js，
供 profile.js 在导出时按需 <script> 懒加载。

用法（项目根目录）：
    python tools/make_pdf_font.py

输出：
    demo/assets/vendor/pdf-font-zh.js   （window.PDF_FONT_ZH = '<base64>'）
"""
import base64
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMO = os.path.join(ROOT, "demo")
OUT_JS = os.path.join(DEMO, "assets", "vendor", "pdf-font-zh.js")

SRC_FONT = r"C:\Windows\Fonts\msyh.ttc"   # 微软雅黑常规，TTC 取第 0 个


def collect_chars():
    chars = set()
    scan_dirs = [
        os.path.join(DEMO, "assets", "js"),
        os.path.join(DEMO, "assets", "data"),
        DEMO,
    ]
    seen_files = set()
    for d in scan_dirs:
        for dirpath, _dirnames, filenames in os.walk(d):
            for fn in filenames:
                p = os.path.join(dirpath, fn)
                ext = os.path.splitext(fn)[1].lower()
                if ext not in (".js", ".html"):
                    continue
                if p in seen_files:
                    continue
                seen_files.add(p)
                with open(p, "r", encoding="utf-8") as f:
                    chars.update(f.read())
    # ASCII 可打印区全量保留（数字/字母/标点），再加常用中文标点兜底
    chars.update(chr(c) for c in range(0x20, 0x7F))
    chars.update("，。、；：？！“”‘’（）《》〈〉【】〔〕—…·～￥％°①②③④⑤⑥⑦⑧⑨⑩")
    chars.discard("\n"); chars.discard("\r"); chars.discard("\t")
    return "".join(sorted(chars))


def main():
    text = collect_chars()
    cjk = sum(1 for c in text if ord(c) > 0x2E00)
    print("charset total=%d (CJK≈%d)" % (len(text), cjk))

    from fontTools.subset import Subsetter, Options, load_font, save_font

    opts = Options()
    opts.font_number = 0            # msyh.ttc 第一个字体（Regular）
    opts.text = text
    opts.hinting = False            # 去 hinting 显著缩小体积
    opts.layout_features = []       # 去排版特性（jsPDF 用不到）
    opts.name_IDs = [1, 2, 3, 4, 6]
    opts.notdef_outline = True
    opts.ignore_missing_glyphs = True

    print("loading", SRC_FONT, "…")
    font = load_font(SRC_FONT, opts)
    ss = Subsetter(options=opts)
    ss.populate(text=text)
    ss.subset(font)

    import io
    buf = io.BytesIO()
    save_font(font, buf, opts)
    ttf = buf.getvalue()
    print("subset ttf: %.1f KB" % (len(ttf) / 1024.0))

    b64 = base64.b64encode(ttf).decode("ascii")
    js = ("/* 自动生成：tools/make_pdf_font.py —— 微软雅黑中文子集（仅含演示数据字符），"
          "供 jsPDF 文字版报告导出使用 */\n"
          "window.PDF_FONT_ZH = '" + b64 + "';\n")
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write(js)
    print("written %s (%.1f KB)" % (os.path.relpath(OUT_JS, ROOT), len(js) / 1024.0))


if __name__ == "__main__":
    sys.exit(main())
