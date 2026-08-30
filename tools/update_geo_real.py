# -*- coding: utf-8 -*-
"""用真实行政边界替换 demo mock.js 中的 GEO_QINGYANG 区县多边形。

数据来源：阿里云 DataV GeoAtlas（https://geo.datav.aliyun.com，免费公开数据）
  https://geo.datav.aliyun.com/areas_v3/bound/621000_full.json
  （庆阳市 adcode=621000，含 8 区县官方边界，FeatureCollection/MultiPolygon）

处理：adcode → demo 区县 key 映射；坐标截断 5 位小数（约 1m 精度）控制体积；
生成单行 JSON 替换 mock.js 中的 `var GEO_QINGYANG = ...;` 字面量。

用法：python tools/update_geo_real.py
历史工具 update_geo.py / update_geo_dense.py（手绘估算边界）已被本脚本取代。
"""
import io
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOCK = os.path.join(ROOT, "demo", "assets", "data", "mock.js")
GEO_URL = "https://geo.datav.aliyun.com/areas_v3/bound/621000_full.json"

# DataV adcode → demo 区县 key（与 mock.js DISTRICTS 严格对应）
ADCODE_TO_KEY = {
    "621002": "xf",   # 西峰区
    "621021": "qc",   # 庆城县
    "621022": "hj",   # 环县
    "621023": "hn",   # 华池县
    "621024": "hy",   # 合水县
    "621025": "zq",   # 正宁县
    "621026": "ning", # 宁县
    "621027": "zx",   # 镇原县
}


def trunc_coords(coords, digits=5):
    if isinstance(coords, (int, float)):
        return round(coords, digits)
    return [trunc_coords(c, digits) for c in coords]


def main():
    print("拉取真实行政边界：", GEO_URL)
    req = urllib.request.Request(GEO_URL, headers={"User-Agent": "zhaoshang-demo/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    features = data.get("features", [])
    out_feats = []
    for f in features:
        prop = f.get("properties", {}) or {}
        adcode = str(prop.get("adcode", ""))
        name = prop.get("name", "")
        key = ADCODE_TO_KEY.get(adcode)
        if not key:
            print("  跳过未映射区县：", adcode, name)
            continue
        geo = f.get("geometry") or {}
        coords = trunc_coords(geo.get("coordinates"), 5)
        center = prop.get("center") or prop.get("centroid") or []
        out_feats.append({
            "type": "Feature",
            "properties": {
                "name": name,
                "adcode": key,
                "cp": [round(c, 5) for c in center] if center else None,
            },
            "geometry": {"type": geo.get("type", "MultiPolygon"), "coordinates": coords},
        })

    if len(out_feats) != 8:
        sys.exit("ERROR: 期望 8 个区县，实际 %d 个，中止替换" % len(out_feats))

    geo_json = json.dumps({"type": "FeatureCollection", "features": out_feats},
                          ensure_ascii=False, separators=(",", ":"))

    s = io.open(MOCK, encoding="utf-8").read()
    pat = re.compile(r'var GEO_QINGYANG = \{.*?\};', re.S)
    m = pat.search(s)
    if not m:
        sys.exit("ERROR: mock.js 中未找到 GEO_QINGYANG 定义")
    s = s[:m.start()] + "var GEO_QINGYANG = " + geo_json + ";" + s[m.end():]
    io.open(MOCK, "w", encoding="utf-8", newline="").write(s)

    pts = sum(
        len(ring)
        for f in out_feats
        for poly in (f["geometry"]["coordinates"] if f["geometry"]["type"] == "MultiPolygon" else [f["geometry"]["coordinates"]])
        for ring in poly
    )
    print("已替换 GEO_QINGYANG：8 区县，共 %d 个真实边界点，JSON %d 字节" % (pts, len(geo_json)))


if __name__ == "__main__":
    main()
