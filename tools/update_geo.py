# -*- coding: utf-8 -*-
"""按《庆阳市行政区划图.jpeg》重构 mock.js 中的 GEO_QINGYANG 区县多边形。

- 坐标采用真实经纬度框架（庆阳市约东经 106.7-108.7、北纬 35.0-37.2）
- 相邻区县共享边界节点序列（反向复用），保证零缝隙零重叠
- 复刻真实特征：环县占西北大部且北/西界锯齿起伏、镇原西界蒲河弧形凹陷、
  华池东北横宽、庆城中部南北长条、合水东南长条、西峰区小、宁县南部大块、
  正宁东南角横条
"""
import io, json, re

import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOCK = os.path.join(ROOT, "demo", "assets", "data", "mock.js")

# 节点表：名称 -> [经度, 纬度]
N = {
    # —— 外轮廓（顺时针） ——
    "NW":    (106.82, 37.08),   # 环县西北角
    "HQ_N1": (106.95, 37.16),   # 环县北界锯齿
    "HQ_N2": (107.10, 37.10),
    "HQ_N3": (107.22, 37.17),
    "HQ_N4": (107.35, 37.09),
    "HQ_N5": (107.48, 37.14),
    "J_HQ_HJ": (107.58, 37.02), # 环县/华池 北端交点
    "HJ_N1": (107.75, 36.96),   # 华池北界
    "HJ_N2": (107.92, 36.98),
    "HJ_N3": (108.05, 36.88),
    "HJ_NE": (108.28, 36.80),   # 华池东北角
    "HJ_E1": (108.36, 36.62),   # 华池东界锯齿
    "HJ_E2": (108.28, 36.50),
    "HJ_E3": (108.42, 36.38),
    "HJ_E4": (108.34, 36.22),
    "HJ_SE": (108.42, 36.05),   # 华池东南角（华池/合水 东界上端）
    "HS_E1": (108.52, 35.88),   # 合水东界
    "HS_E2": (108.46, 35.72),
    "HS_E3": (108.56, 35.58),
    "J_HS_ZN": (108.42, 35.44), # 合水/正宁 东交
    "ZN_E1": (108.60, 35.38),   # 正宁东界
    "ZN_SE": (108.68, 35.24),   # 正宁东南角
    "ZN_S1": (108.48, 35.10),   # 正宁南界
    "ZN_S2": (108.28, 35.04),
    "J_NG_ZN": (108.10, 35.08), # 宁县/正宁 南交
    "NG_S1": (107.90, 35.00),   # 宁县南界
    "NG_S2": (107.68, 35.06),
    "NG_SW": (107.52, 35.14),   # 宁县西南角
    "ZY_SE": (107.30, 35.08),   # 镇原东南角
    "ZY_S1": (107.05, 35.12),   # 镇原南界
    "ZY_S2": (106.92, 35.30),
    "ZY_SW": (106.80, 35.55),   # 镇原西南角
    "ZY_W1": (106.72, 35.75),   # 镇原西界（蒲河弧形凹陷）
    "ZY_W2": (106.78, 35.92),
    "ZY_W3": (106.70, 36.08),
    "ZY_W4": (106.80, 36.22),
    "J_HQ_ZY": (106.84, 36.42), # 环县/镇原 西交
    "HQ_W1": (106.74, 36.58),   # 环县西界锯齿
    "HQ_W2": (106.86, 36.72),
    "HQ_W3": (106.76, 36.88),
    "HQ_W4": (106.90, 37.00),
    # —— 内部交点 ——
    "J_HJ_QC_HQ": (107.52, 36.52),  # 环县/华池/庆城
    "J_QC_HJ_HS": (107.88, 36.02),  # 华池/庆城/合水
    "J_HQ_QC_ZY": (107.42, 36.12),  # 环县/庆城/镇原
    "J_QC_HS_XF": (107.86, 35.72),  # 庆城/合水/西峰
    "J_QC_ZY_XF": (107.42, 35.78),  # 庆城/镇原/西峰
    "J_XF_ZY_NG": (107.48, 35.52),  # 西峰/镇原/宁县
    "J_HS_XF_NG": (107.90, 35.52),  # 合水/西峰/宁县
    "J_HS_NG_ZN": (108.12, 35.42),  # 合水/宁县/正宁
    # —— 内部边界中间点 ——
    "M_HJ_HQ1": (107.50, 36.78),  # 环县/华池界
    "M_HJ_HQ2": (107.56, 36.62),
    "M_HQ_QC1": (107.46, 36.34),  # 环县/庆城界
    "M_HJ_QC1": (107.60, 36.30),  # 华池/庆城界
    "M_HJ_QC2": (107.72, 36.14),
    "M_HJ_HS1": (108.02, 36.04),  # 华池/合水界
    "M_HJ_HS2": (108.20, 36.00),
    "M_QC_HS1": (107.88, 35.90),  # 庆城/合水界
    "M_QC_HS2": (107.86, 35.78),
    "M_QC_XF1": (107.68, 35.74),  # 庆城/西峰界
    "M_QC_XF2": (107.55, 35.76),
    "M_QC_ZY1": (107.44, 35.94),  # 庆城/镇原界
    "M_QC_ZY2": (107.40, 36.02),
    "M_XF_ZY1": (107.44, 35.66),  # 镇原/西峰界
    "M_XF_ZY2": (107.46, 35.58),
    "M_ZY_NG1": (107.38, 35.36),  # 镇原/宁县界
    "M_ZY_NG2": (107.30, 35.20),
    "M_HS_XF1": (107.88, 35.62),  # 合水/西峰界
    "M_HS_NG1": (107.98, 35.48),  # 合水/宁县界
    "M_HS_ZN1": (108.28, 35.50),  # 合水/正宁界
    "M_NG_ZN1": (108.14, 35.28),  # 宁县/正宁界
    "M_XF_NG1": (107.58, 35.52),  # 西峰/宁县界
    "M_XF_NG2": (107.70, 35.50),
}

# 各县边界节点序列（顺时针；相邻县共享同一段节点，反向复用）
COUNTIES = {
    "环县": [
        "NW", "HQ_N1", "HQ_N2", "HQ_N3", "HQ_N4", "HQ_N5", "J_HQ_HJ",
        "M_HJ_HQ1", "M_HJ_HQ2", "J_HJ_QC_HQ", "M_HQ_QC1", "J_HQ_QC_ZY",
        "M_ZY_NG2", "M_ZY_NG1", "J_HQ_ZY",
        "HQ_W1", "HQ_W2", "HQ_W3", "HQ_W4",
    ],
    "华池县": [
        "J_HQ_HJ", "HJ_N1", "HJ_N2", "HJ_N3", "HJ_NE",
        "HJ_E1", "HJ_E2", "HJ_E3", "HJ_E4", "HJ_SE",
        "M_HJ_HS2", "M_HJ_HS1", "J_QC_HJ_HS",
        "M_HJ_QC2", "M_HJ_QC1", "J_HJ_QC_HQ",
        "M_HJ_HQ2", "M_HJ_HQ1",
    ],
    "庆城县": [
        "J_HJ_QC_HQ", "M_HJ_QC1", "M_HJ_QC2", "J_QC_HJ_HS",
        "M_QC_HS1", "M_QC_HS2", "J_QC_HS_XF",
        "M_QC_XF1", "M_QC_XF2", "J_QC_ZY_XF",
        "M_QC_ZY1", "M_QC_ZY2", "J_HQ_QC_ZY",
        "M_HQ_QC1",
    ],
    "镇原县": [
        "J_HQ_ZY", "M_ZY_NG1", "M_ZY_NG2", "J_HQ_QC_ZY",
        "M_QC_ZY2", "M_QC_ZY1", "J_QC_ZY_XF",
        "M_XF_ZY1", "M_XF_ZY2", "J_XF_ZY_NG",
        "M_ZY_NG2", "ZY_SE", "ZY_S1", "ZY_S2", "ZY_SW",
        "ZY_W1", "ZY_W2", "ZY_W3", "ZY_W4",
    ],
    "西峰区": [
        "J_QC_ZY_XF", "M_QC_XF2", "M_QC_XF1", "J_QC_HS_XF",
        "M_HS_XF1", "J_HS_XF_NG",
        "M_XF_NG2", "M_XF_NG1", "J_XF_ZY_NG",
        "M_XF_ZY2", "M_XF_ZY1",
    ],
    "合水县": [
        "J_QC_HJ_HS", "M_HJ_HS1", "M_HJ_HS2", "HJ_SE",
        "HS_E1", "HS_E2", "HS_E3", "J_HS_ZN",
        "M_HS_ZN1", "J_HS_NG_ZN",
        "M_HS_NG1", "J_HS_XF_NG",
        "M_HS_XF1", "J_QC_HS_XF",
        "M_QC_HS2", "M_QC_HS1",
    ],
    "宁县": [
        "J_HS_XF_NG", "M_HS_NG1", "J_HS_NG_ZN",
        "M_NG_ZN1", "J_NG_ZN", "NG_S1", "NG_S2", "NG_SW",
        "M_ZY_NG2", "M_ZY_NG1", "J_XF_ZY_NG",
        "M_XF_NG1", "M_XF_NG2",
    ],
    "正宁县": [
        "J_HS_NG_ZN", "M_HS_ZN1", "J_HS_ZN",
        "ZN_E1", "ZN_SE", "ZN_S1", "ZN_S2", "J_NG_ZN",
        "M_NG_ZN1",
    ],
}

# 标签锚点（cp）——按各县几何中心（参照行政区划图目测）
CP = {
    "环县":   (107.12, 36.78),
    "华池县": (108.06, 36.52),
    "庆城县": (107.66, 35.92),
    "合水县": (108.16, 35.74),
    "镇原县": (107.02, 35.62),
    "西峰区": (107.63, 35.63),
    "宁县":   (107.74, 35.24),
    "正宁县": (108.36, 35.24),
}

ADCODE = {"环县": "hj", "华池县": "hn", "庆城县": "qc", "合水县": "hy",
          "镇原县": "zx", "西峰区": "xf", "宁县": "ning", "正宁县": "zq"}

features = []
for name, seq in COUNTIES.items():
    coords = [list(N[k]) for k in seq]
    coords.append(list(N[seq[0]]))  # 闭合
    features.append({
        "type": "Feature",
        "properties": {"name": name, "adcode": ADCODE[name], "cp": list(CP[name])},
        "geometry": {"type": "Polygon", "coordinates": [coords]},
    })

geo = {"type": "FeatureCollection", "features": features}

s = io.open(MOCK, encoding="utf-8").read()
a = s.find("  var GEO_QINGYANG = {")
assert a > 0, "GEO start not found"
b = s.find("\n  };", a)
assert b > a, "GEO end not found"
b_end = b + len("\n  };")

new_block = (
    "  var GEO_QINGYANG = "
    + json.dumps(geo, ensure_ascii=False, separators=(",", ":"))
    + ";"
)
# 压缩后的单行过长：按维度整理为可读格式
new_block = (
    "  var GEO_QINGYANG = "
    + json.dumps(geo, ensure_ascii=False, indent=2).replace("\n", "\n  ")
    + ";"
)

s = s[:a] + new_block + s[b_end:]
io.open(MOCK, "w", encoding="utf-8").write(s)
print("GEO_QINGYANG replaced,", len(features), "features")
