# -*- coding: utf-8 -*-
"""生成服务端 PDF/DOCX 导出用的中文字体子集 + 字符覆盖表。

背景：前端 jsPDF 那条链路（tools/make_pdf_font.py）用的是「demo 源码里出现过的字符」
      子集（410KB），只适合固定文案的报告。AI 对话是自由文本，必须换成常用字全集，
      否则企业名里的生僻字会渲染成空白。

本脚本产出两个文件（均提交到仓库，保证 clone 后即可运行）：
    server/assets/fonts/NotoSansSC-SC.ttf          字符子集（约 3.4MB）
    server/assets/fonts/NotoSansSC-SC.ranges.json  码位覆盖区间（运行时判断缺字用）

字符集 = GB2312 全集（6763 汉字）+ 项目语料里实际出现的 CJK 字符
        + ASCII + 常用中文标点/数学符号/几何图形/序号。
字体源优先 Noto Sans CJK（Linux/容器），其次微软雅黑（Windows 开发机）。

用法（项目根目录）：
    python tools/make_server_font.py
    python tools/make_server_font.py --font /path/to/font.ttc
"""
import argparse
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "server", "assets", "fonts")
OUT_TTF = os.path.join(OUT_DIR, "NotoSansSC-SC.ttf")
OUT_TTF_BOLD = os.path.join(OUT_DIR, "NotoSansSC-SC-Bold.ttf")
OUT_RANGES = os.path.join(OUT_DIR, "NotoSansSC-SC.ranges.json")

# 候选字体源：(常规, 粗体, 说明)。TTC 取其中简体中文（SC）那一款。
FONT_CANDIDATES = [
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
     "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "Noto Sans CJK SC"),
    ("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
     "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc", "Noto Sans CJK SC"),
    ("/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
     "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Bold.otf", "Noto Sans CJK SC"),
    (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\msyhbd.ttc", "Microsoft YaHei"),
    (r"C:\Windows\Fonts\msyh.ttf", r"C:\Windows\Fonts\msyhbd.ttf", "Microsoft YaHei"),
    ("/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/PingFang.ttc", "PingFang SC"),
]

# 需要额外纳入的符号区（模型常用 ●○★☆→←↑↓ ≥ ≤ ± ≈ ※ ①②③ 等）
RANGES = [
    (0x20, 0x7E), (0xA0, 0xFF), (0x2000, 0x206F), (0x2070, 0x209F),
    (0x20A0, 0x20BF), (0x2100, 0x214F), (0x2190, 0x21FF), (0x2200, 0x22FF),
    (0x2460, 0x24FF), (0x2500, 0x257F), (0x25A0, 0x25FF), (0x2600, 0x27BF),
    (0x3000, 0x303F), (0x3040, 0x30FF), (0xFE30, 0xFE4F), (0xFF00, 0xFFEF),
]


def pick_font(explicit=None, bold=False):
    from fontTools.ttLib import TTCollection, TTFont
    if explicit:
        candidates = [(explicit, explicit, "explicit")]
    else:
        candidates = FONT_CANDIDATES
    for reg, bld, label in candidates:
        path = bld if (bold and bld) else reg
        if not path or not os.path.exists(path):
            continue
        if path.lower().endswith(".ttc"):
            coll = TTCollection(path)
            for f in coll.fonts:
                if "SC" in (f["name"].getDebugName(1) or ""):
                    return f, path, label
            return coll.fonts[0], path, label
        return TTFont(path), path, label
    if bold:
        return None, None, None      # 没有粗体源就跳过，正文仍可用
    raise SystemExit("找不到可用的中文字体，请用 --font 指定 .ttf/.ttc 路径")


def gb2312_chars():
    s = set()
    for hi in range(0xA1, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                s.add(bytes([hi, lo]).decode("gb2312"))
            except Exception:
                pass
    return s


def corpus_chars():
    """项目里真实出现过的字符（企业名/地址/文案）——保证实际数据零缺字。"""
    chars = set()
    patterns = [
        "server/prisma/real-fixtures.json",
        "server/prisma/demo-fixtures.json",
        "demo/assets/data/*.js",
        "demo/assets/js/pages/*.js",
        "demo/assets/js/common/*.js",
    ]
    for pat in patterns:
        for p in glob.glob(os.path.join(ROOT, pat)):
            try:
                with open(p, encoding="utf-8") as f:
                    chars.update(f.read())
            except Exception:
                pass
    return chars


def to_ranges(codepoints):
    cps = sorted(codepoints)
    out = []
    start = prev = cps[0]
    for cp in cps[1:]:
        if cp == prev + 1:
            prev = cp
            continue
        out.append([start, prev])
        start = prev = cp
    out.append([start, prev])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", help="指定字体文件路径（.ttf/.otf/.ttc）")
    args = ap.parse_args()

    from fontTools.subset import Subsetter, Options

    font, src_path, src_label = pick_font(args.font)
    src_cmap = set()
    for t in font["cmap"].tables:
        src_cmap |= set(t.cmap.keys())

    chars = set(c for c in gb2312_chars() if ord(c) in src_cmap)
    for a, b in RANGES:
        chars |= set(chr(c) for c in range(a, b + 1) if c in src_cmap)
    extra = set(c for c in corpus_chars()
                if 0x3000 <= ord(c) <= 0x9FFF and c not in chars and ord(c) in src_cmap)
    chars |= extra

    os.makedirs(OUT_DIR, exist_ok=True)
    text = "".join(sorted(chars))

    def make(font_obj, out_path):
        opts = Options()
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        opts.drop_tables += ["DSIG"]
        ss = Subsetter(options=opts)
        ss.populate(text=text)
        ss.subset(font_obj)
        font_obj.flavor = None
        font_obj.save(out_path)

    make(font, OUT_TTF)

    # 粗体：字符集与常规完全一致（不缩水），否则模型输出里的生僻字加粗时会缺字形
    bold_font, bold_src, _ = pick_font(args.font, bold=True)
    if bold_font is not None:
        make(bold_font, OUT_TTF_BOLD)
        print("bold     : %s  %.2f MB  (%s)" % (
            os.path.relpath(OUT_TTF_BOLD, ROOT), os.path.getsize(OUT_TTF_BOLD) / 1048576, bold_src))
    else:
        print("bold     : 未找到粗体源字体，PDF 将只用常规字重")

    from fontTools.ttLib import TTFont
    out_font = TTFont(OUT_TTF)
    out_cmap = set()
    for t in out_font["cmap"].tables:
        out_cmap |= set(t.cmap.keys())
    ranges = to_ranges(out_cmap)
    with open(OUT_RANGES, "w", encoding="utf-8") as f:
        json.dump({"source": src_label, "ranges": ranges}, f, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(OUT_TTF) / 1048576
    print("source   : %s (%s)" % (src_label, src_path))
    print("charset  : %d 字符（GB2312 全集 + 语料补充 %d 字）" % (len(chars), len(extra)))
    if extra:
        print("补充字   : %s" % "".join(sorted(extra)))
    print("font     : %s  %.2f MB" % (os.path.relpath(OUT_TTF, ROOT), size))
    print("ranges   : %s  %d 个区间" % (os.path.relpath(OUT_RANGES, ROOT), len(ranges)))


if __name__ == "__main__":
    main()
