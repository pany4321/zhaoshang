# -*- coding: utf-8 -*-
"""按《庆阳市行政区划图.jpeg》生成高密度区县边界（贴近实际地形）。

- 拓扑：8 县由 26 条共享边界段拼装（相邻县反向复用同一段，密集点完全一致 → 零缝隙）
- 每段沿骨架线插值（约每 0.035° 一点）并叠加确定性法向抖动：
  锯齿段（环县北/西界、华池东界子午岭、镇原南界）幅度大频率高；
  轻抖段（内部县界）幅度小——贴近真实地形的手绘边界质感
- 输出：替换 demo/assets/data/mock.js 中 GEO_QINGYANG（ECharts geoJSON 格式）
"""
import io, json

MOCK = r"D:\research\政府招商引资风险管理平台\demo\assets\data\mock.js"

# —— 骨架锚点（与行政区划图对照的真实经纬度） ——
A = {
    "NW": (106.82, 37.08), "N1": (106.95, 37.16), "N2": (107.10, 37.10),
    "N3": (107.22, 37.17), "N4": (107.35, 37.09), "N5": (107.48, 37.14),
    "J1": (107.58, 37.02),                       # 环/华池 北端
    "H1": (107.75, 36.96), "H2": (107.92, 36.98),
    "H3": (108.05, 36.88), "H4": (108.28, 36.80),  # 华池东北角
    "H5": (108.36, 36.62), "H6": (108.28, 36.50),
    "H7": (108.42, 36.38), "H8": (108.34, 36.22),
    "H9": (108.42, 36.05),                       # 华池东南角
    "G1": (108.52, 35.88), "G2": (108.46, 35.72),
    "G3": (108.56, 35.58),                       # 合水东南
    "T1": (108.42, 35.44),                       # 合水/正宁 东交
    "Z1": (108.60, 35.38), "Z2": (108.68, 35.24),  # 正宁东南角
    "Z3": (108.48, 35.10), "Z4": (108.28, 35.04),
    "J2": (108.10, 35.08),                       # 宁/正宁 南交
    "N9a": (107.90, 35.00), "N9b": (107.68, 35.06),
    "N9": (107.52, 35.14),                       # 宁县西界南端
    "J9": (107.34, 35.10),                       # 镇原东南角 = 宁县西南界点（共点）
    "Y2": (107.05, 35.12), "Y3": (106.92, 35.30),
    "Y4": (106.80, 35.55),                       # 镇原西南角
    "Y5": (106.72, 35.75), "Y6": (106.78, 35.92),
    "Y7": (106.70, 36.08), "Y8": (106.80, 36.22),  # 镇原西界蒲河弧
    "J3": (106.84, 36.42),                       # 环/镇原 西交
    "W1": (106.74, 36.58), "W2": (106.86, 36.72),
    "W3": (106.76, 36.88), "W4": (106.90, 37.00),  # 环县西界锯齿
    # 内部交点
    "K1": (107.52, 36.52),  # 环/华池/庆城
    "K2": (107.88, 36.02),  # 华池/庆城/合水
    "K3": (107.42, 36.12),  # 环/庆城/镇原
    "K4": (107.86, 35.72),  # 庆城/合水/西峰
    "K5": (107.42, 35.78),  # 庆城/镇原/西峰
    "K6": (107.48, 35.52),  # 西峰/镇原/宁县
    "K7": (107.90, 35.52),  # 合水/西峰/宁县
    "K8": (108.12, 35.42),  # 合水/宁县/正宁
    # 内部中间锚点
    "m11": (107.50, 36.78), "m12": (107.56, 36.62),   # 环/华池
    "m31": (107.46, 36.34),                            # 环/庆城
    "m21": (107.60, 36.30), "m22": (107.72, 36.14),   # 华池/庆城
    "m41": (108.02, 36.04), "m42": (108.20, 36.00),   # 华池/合水
    "m51": (107.88, 35.90), "m52": (107.86, 35.78),   # 庆城/合水
    "m61": (107.68, 35.74), "m62": (107.55, 35.76),   # 庆城/西峰
    "m71": (107.44, 35.94), "m72": (107.40, 36.02),   # 庆城/镇原
    "m81": (107.44, 35.66), "m82": (107.46, 35.58),   # 镇原/西峰
    "m91": (107.38, 35.36), "m92": (107.30, 35.20),   # 镇原/宁县
    "mG1": (107.88, 35.62),                            # 合水/西峰
    "mG2": (107.98, 35.48),                            # 合水/宁县
    "mG3": (108.28, 35.50),                            # 合水/正宁
    "mG4": (108.14, 35.28),                            # 宁县/正宁
    "mG5": (107.58, 35.52), "mG6": (107.70, 35.50),   # 西峰/宁县
    "TIP": (107.20, 36.02),                            # 环县南尖（向下楔角尖端）
    "QT1": (107.36, 36.16),                            # 环县南尖/庆城 界点
    "QT2": (107.12, 36.12),                            # 环县南尖/镇原 界点
    "ZB1": (106.98, 36.24),                            # 环县/镇原 界中点
}

# —— 边界段定义：key: (节点序列, 抖动幅度, 是否高频锯齿) ——
SEGS = {
    "hq_north":  (["NW", "N1", "N2", "N3", "N4", "N5", "J1"], 0.020, True),
    "hq_hj":     (["J1", "m11", "m12", "K1"], 0.008, False),
    "hq_qc":     (["K1", "m31", "QT1", "TIP"], 0.008, False),
    "hq_zy":     (["TIP", "QT2", "ZB1", "J3"], 0.010, True),
    "hq_west":   (["J3", "W1", "W2", "W3", "W4", "NW"], 0.020, True),
    "hj_north":  (["J1", "H1", "H2", "H3", "H4"], 0.014, True),
    "hj_east":   (["H4", "H5", "H6", "H7", "H8", "H9"], 0.022, True),
    "hj_hs":     (["H9", "m42", "m41", "K2"], 0.008, False),
    "hj_qc":     (["K2", "m22", "m21", "K1"], 0.008, False),
    "qc_hs":     (["K2", "m51", "m52", "K4"], 0.007, False),
    "qc_xf":     (["K4", "m61", "m62", "K5"], 0.007, False),
    "qc_zy":     (["K5", "m72", "m71", "K3"], 0.007, False),
    "zy_xf":     (["K5", "m81", "m82", "K6"], 0.007, False),
    "zy_ng":     (["K6", "m91", "m92", "J9"], 0.008, False),
    "zy_south":  (["J9", "Y2", "Y3", "Y4"], 0.012, True),
    "ng_zy_s":   (["N9", "J9"], 0.0, False),
    "zy_west":   (["Y4", "Y5", "Y6", "Y7", "Y8", "J3"], 0.016, True),
    "hs_xf":     (["K4", "mG1", "K7"], 0.006, False),
    "xf_ng":     (["K7", "mG6", "mG5", "K6"], 0.006, False),
    "hs_east":   (["H9", "G1", "G2", "G3", "T1"], 0.014, True),
    "hs_zn":     (["T1", "mG3", "K8"], 0.007, False),
    "hs_ng":     (["K8", "mG2", "K7"], 0.006, False),
    "ng_zn":     (["K8", "mG4", "J2"], 0.007, False),
    "ng_south":  (["J2", "N9a", "N9b", "N9"], 0.012, True),
    "zn_east":   (["T1", "Z1", "Z2"], 0.010, True),
    "zn_south":  (["Z2", "Z3", "Z4", "J2"], 0.010, True),
}

# —— 县 = 有序段列表（True = 段方向取反） ——
COUNTIES = {
    "环县":   [("hq_north", 0), ("hq_hj", 0), ("hq_qc", 0), ("hq_zy", 0), ("hq_west", 0)],
    "华池县": [("hq_hj", 1), ("hj_north", 0), ("hj_east", 0), ("hj_hs", 0), ("hj_qc", 0), ("hq_hj", 0)],
    "庆城县": [("hj_qc", 1), ("qc_hs", 0), ("qc_xf", 0), ("qc_zy", 0), ("hq_qc", 1)],
    "镇原县": [("hq_zy", 1), ("qc_zy", 1), ("zy_xf", 0), ("zy_ng", 0), ("zy_south", 0), ("zy_west", 0)],
    "西峰区": [("qc_xf", 1), ("hs_xf", 0), ("xf_ng", 0), ("zy_xf", 1)],
    "合水县": [("hj_hs", 1), ("hs_east", 0), ("hs_zn", 0), ("hs_ng", 1), ("hs_xf", 1), ("qc_hs", 1)],
    "宁县":   [("hs_ng", 1), ("ng_zn", 0), ("ng_south", 1), ("ng_zy_s", 0), ("zy_ng", 1), ("xf_ng", 1)],
    "正宁县": [("hs_zn", 1), ("zn_east", 0), ("zn_south", 0), ("ng_zn", 1)],
}

ADCODE = {"环县": "hj", "华池县": "hn", "庆城县": "qc", "合水县": "hy",
          "镇原县": "zx", "西峰区": "xf", "宁县": "ning", "正宁县": "zq"}
CP = {"环县": (107.12, 36.78), "华池县": (108.06, 36.52), "庆城县": (107.66, 35.92),
      "合水县": (108.16, 35.74), "镇原县": (107.02, 35.62), "西峰区": (107.63, 35.63),
      "宁县": (107.74, 35.24), "正宁县": (108.38, 35.24)}


def rng(seed):
    h = 2166136261
    for ch in seed:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    st = h
    while True:
        st = (st + 0x6D2B79F5) & 0xFFFFFFFF
        t = st
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF) & 0xFFFFFFFF
        yield ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0


# 段密集化：骨架点间插值 + 法向确定性抖动；结果按段名缓存（两县一致）
_dense_cache = {}
def densify(key):
    if key in _dense_cache:
        return _dense_cache[key]
    names, amp, jagged = SEGS[key]
    pts = [A[n] for n in names]
    step = 0.055 if jagged else 0.075
    out = [pts[0]]
    for i in range(len(pts) - 1):
        (x1, y1), (x2, y2) = pts[i], pts[i + 1]
        dx, dy = x2 - x1, y2 - y1
        length = (dx * dx + dy * dy) ** 0.5
        nx, ny = -dy / length, dx / length           # 单位法向
        g = rng(key + "#" + names[i] + names[i + 1])
        n_seg = max(1, int(round(length / step)))
        phase = next(g) * 6.283
        freq = 9 if jagged else 4
        for k in range(1, n_seg + 1):
            t = k / n_seg
            if k == n_seg:
                out.append(pts[i + 1])
                break
            bx, by = x1 + dx * t, y1 + dy * t
            w = (0.55 + 0.45 * next(g)) * amp
            off = w * (0.6 * ((phase + t * freq) % 2 - 1)) + w * (next(g) - 0.5)
            out.append((bx + nx * off, by + ny * off))
    _dense_cache[key] = out
    return out


features = []
for name, segs in COUNTIES.items():
    ring = []
    for key, rev in segs:
        pts = densify(key)
        if rev:
            pts = pts[::-1]
        if ring and ring[-1] == pts[0]:
            ring.extend(pts[1:])
        else:
            ring.extend(pts)
    ring.append(ring[0])  # 闭合
    features.append({
        "type": "Feature",
        "properties": {"name": name, "adcode": ADCODE[name], "cp": list(CP[name])},
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    })

geo = {"type": "FeatureCollection", "features": features}

s = io.open(MOCK, encoding="utf-8").read()
a = s.find("  var GEO_QINGYANG = {")
assert a > 0, "GEO start not found"
b = s.find("\n  };", a)
assert b > a, "GEO end not found"
new_block = (
    "  var GEO_QINGYANG = "
    + json.dumps(geo, ensure_ascii=False, separators=(",", ":"))
    + ";"
)
s = s[:a] + new_block + s[b + len("\n  };"):]
io.open(MOCK, "w", encoding="utf-8").write(s)

total = sum(len(f["geometry"]["coordinates"][0]) - 1 for f in features)
print("GEO_QINGYANG replaced:", len(features), "counties,", total, "total points")
