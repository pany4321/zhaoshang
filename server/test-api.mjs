// 后端 API 完整测试脚本
import http from 'http'

const BASE = { hostname: 'localhost', port: 3000 }

function req(path, options = {}) {
  return new Promise((resolve, reject) => {
    const data = options.body ? JSON.stringify(options.body) : null
    const req = http.request({
      ...BASE,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(options.headers || {}),
      },
    }, res => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) })
        } catch {
          resolve({ status: res.statusCode, data: body })
        }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

let passed = 0
let failed = 0
const failures = []

function test(name, fn) {
  return fn()
    .then(res => {
      const ok = res.status >= 200 && res.status < 300 && res.data.code === 0
      if (ok) {
        passed++
        console.log(`  ✅ ${name}`)
      } else {
        failed++
        failures.push({ name, status: res.status, msg: res.data.msg || res.data.message || 'unknown' })
        console.log(`  ❌ ${name} (${res.status}) ${res.data.msg || ''}`)
      }
      return res
    })
    .catch(err => {
      failed++
      failures.push({ name, error: err.message })
      console.log(`  ❌ ${name}: ${err.message}`)
    })
}

let adminToken = ''
let workerToken = ''

async function run() {
  console.log('\n=== 1. 基础接口 ===\n')

  await test('健康检查', async () => {
    const res = await req('/api/health')
    return { status: res.status, data: { code: res.data?.ok ? 0 : 1 } }
  })

  await test('区县列表', () => req('/api/dict/districts'))
  await test('行业列表', () => req('/api/dict/industries'))
  await test('风险等级', () => req('/api/dict/risk-levels'))
  await test('风险维度', () => req('/api/dict/risk-dims'))
  await test('项目阶段', () => req('/api/dict/project-stages'))

  console.log('\n=== 2. 登录鉴权 ===\n')

  const loginAdmin = await test('管理员登录', () =>
    req('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } })
  )
  if (loginAdmin.data?.data?.token) adminToken = loginAdmin.data.data.token

  const loginWorker = await test('专员登录', () =>
    req('/api/auth/login', { method: 'POST', body: { username: 'zhaoshang01', password: '123456' } })
  )
  if (loginWorker.data?.data?.token) workerToken = loginWorker.data.data.token

  await test('错误密码', async () => {
    const res = await req('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } })
    // 预期 401
    return { status: res.status === 401 ? 200 : res.status, data: { code: res.status === 401 ? 0 : 1 } }
  })

  await test('获取当前用户', () =>
    req('/api/auth/me', { headers: { Authorization: `Bearer ${adminToken}` } })
  )

  await test('未授权访问', async () => {
    const res = await req('/api/workbench/kpi')
    return { status: res.status === 401 ? 200 : res.status, data: { code: res.status === 401 ? 0 : 1 } }
  })

  console.log('\n=== 3. 驾驶舱 ===\n')

  await test('总览数据', () => req('/api/dashboard/overview'))
  await test('总览(指定区县)', () => req('/api/dashboard/overview?districtId=xf'))
  await test('风险雷达', () => req('/api/dashboard/risk-radar'))
  await test('风险TOP5', () => req('/api/dashboard/top-risk?limit=5'))
  await test('行业分布', () => req('/api/dashboard/industry-dist'))
  await test('区县分布', () => req('/api/dashboard/district-dist'))
  await test('趋势数据', () => req('/api/dashboard/trend'))
  await test('AI日报', () => req('/api/dashboard/ai-daily'))

  console.log('\n=== 4. 企业库 ===\n')

  const listRes = await test('企业列表(分页)', () =>
    req('/api/enterprise?page=1&pageSize=20')
  )
  const totalEnt = listRes.data?.data?.total || 0
  console.log(`    企业总数: ${totalEnt}`)

  await test('企业列表(关键词)', () => req('/api/enterprise?keyword=' + encodeURIComponent('科技')))
  await test('企业列表(区县)', () => req('/api/enterprise?districtId=xf'))
  await test('企业列表(行业)', () => req('/api/enterprise?industryId=software'))
  await test('企业列表(风险等级)', () => req('/api/enterprise?riskLevel=red'))
  await test('企业列表(规模)', () => req('/api/enterprise?scale=' + encodeURIComponent('大型企业')))
  await test('企业列表(重点)', () => req('/api/enterprise?isKey=true'))
  await test('企业列表(排序)', () => req('/api/enterprise?sortBy=tax&sortOrder=desc'))

  const firstId = listRes.data?.data?.list?.[0]?.id
  if (firstId) {
    await test('企业详情', () => req(`/api/enterprise/${firstId}`))
    await test('企业风险雷达', () => req(`/api/enterprise/${firstId}/risk-radar`))
    await test('企业风险事件', () => req(`/api/enterprise/${firstId}/risk-events`))
    await test('企业匹配政策', () => req(`/api/enterprise/${firstId}/policies`))
    await test('企业关联项目', () => req(`/api/enterprise/${firstId}/project`))
    await test('企业AI研判', () => req(`/api/enterprise/${firstId}/ai-analysis`))
    await test('企业经营趋势', () => req(`/api/enterprise/${firstId}/business-trend`))
    await test('企业侧边栏列表', () => req('/api/enterprise/sidebar/list'))
  }

  console.log('\n=== 5. 风险预警 ===\n')

  await test('风险统计', () => req('/api/risk/stats'))
  await test('风险列表', () => req('/api/risk?page=1&pageSize=20'))
  await test('风险列表(红色)', () => req('/api/risk?level=red'))
  await test('风险列表(待处理)', () => req('/api/risk?status=pending'))

  const riskRes = await req('/api/risk?page=1&pageSize=1')
  const firstRiskId = riskRes.data?.data?.list?.[0]?.id
  if (firstRiskId) {
    await test('风险详情', () => req(`/api/risk/${firstRiskId}`))
    await test('风险派单', () =>
      req(`/api/risk/${firstRiskId}/dispatch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { assignee: 'zhaoshang01', dueDate: '2026-12-31' },
      })
    )
  }

  console.log('\n=== 6. 工作台 ===\n')

  await test('工作台KPI', () =>
    req('/api/workbench/kpi', { headers: { Authorization: `Bearer ${workerToken}` } })
  )
  await test('任务列表', () =>
    req('/api/workbench/tasks?page=1&pageSize=20', { headers: { Authorization: `Bearer ${workerToken}` } })
  )
  await test('今日待办', () =>
    req('/api/workbench/today', { headers: { Authorization: `Bearer ${workerToken}` } })
  )
  await test('近期动态', () =>
    req('/api/workbench/activities', { headers: { Authorization: `Bearer ${workerToken}` } })
  )

  const taskRes = await req('/api/workbench/tasks?status=pending&pageSize=1', {
    headers: { Authorization: `Bearer ${workerToken}` },
  })
  const firstTaskId = taskRes.data?.data?.list?.[0]?.id
  if (firstTaskId) {
    await test('开始任务', () =>
      req(`/api/workbench/tasks/${firstTaskId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${workerToken}` },
        body: {},
      })
    )
    await test('完成任务', () =>
      req(`/api/workbench/tasks/${firstTaskId}/finish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${workerToken}` },
        body: { result: '测试完成' },
      })
    )
  }

  console.log('\n=== 7. 招商项目 ===\n')

  await test('项目漏斗', () => req('/api/project/funnel'))
  await test('项目列表', () => req('/api/project?page=1&pageSize=20'))
  await test('项目列表(阶段筛选)', () => req('/api/project?stage=0'))
  await test('项目列表(区县)', () => req('/api/project?districtId=xf'))

  const projRes = await req('/api/project?page=1&pageSize=1')
  const firstProjId = projRes.data?.data?.list?.[0]?.id
  if (firstProjId) {
    await test('项目详情', () => req(`/api/project/${firstProjId}`))
    await test('推进项目阶段', () =>
      req(`/api/project/${firstProjId}/advance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { note: '测试推进' },
      })
    )
  }

  console.log('\n=== 8. 政策服务 ===\n')

  await test('政策分类', () => req('/api/policy/categories'))
  await test('政策列表', () => req('/api/policy?page=1&pageSize=20'))
  await test('政策列表(产业类)', () => req('/api/policy?category=' + encodeURIComponent('产业')))
  await test('政策列表(关键词)', () => req('/api/policy?keyword=' + encodeURIComponent('税收')))
  await test('政策列表(级别)', () => req('/api/policy?level=national'))

  const polRes = await req('/api/policy?page=1&pageSize=1')
  const firstPolId = polRes.data?.data?.list?.[0]?.id
  if (firstPolId) {
    const detailRes = await test('政策详情', () => req(`/api/policy/${firstPolId}`))
    // 验证热度自增
    if (detailRes.data?.data?.matchedEnterprises) {
      console.log(`    匹配企业数: ${detailRes.data.data.matchedEnterprises.length}`)
    }
  }

  console.log('\n=== 9. 产业图谱 ===\n')

  await test('图谱数据(按行业)', () => req('/api/graph?type=industry'))
  await test('图谱数据(按区县)', () => req('/api/graph?type=district'))
  await test('图谱数据(指定区县)', () => req('/api/graph?type=industry&districtId=xf'))

  const graphRes = await req('/api/graph?type=industry')
  const nodes = graphRes.data?.data?.nodes || []
  console.log(`    节点数: ${nodes.length}`)

  console.log('\n=== 10. AI 智能体 ===\n')

  for (const agent of ['insight', 'risk', 'plan', 'service']) {
    await test(`AI对话(${agent})`, () =>
      req(`/api/ai/chat/${agent}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${workerToken}` },
        body: { message: '你好' },
      })
    )
  }

  await test('AI对话历史', () =>
    req('/api/ai/history/insight', {
      headers: { Authorization: `Bearer ${workerToken}` },
    })
  )

  // 总结
  console.log('\n' + '='.repeat(50))
  console.log(`  测试完成：✅ 通过 ${passed}  /  ❌ 失败 ${failed}`)
  console.log('='.repeat(50))

  if (failures.length > 0) {
    console.log('\n失败详情：')
    failures.forEach(f => console.log(`  - ${f.name}: ${f.msg || f.error}`))
  }

  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('测试脚本异常:', err)
  process.exit(1)
})
