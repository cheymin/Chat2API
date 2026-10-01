/**
 * Management API - Dependencies Routes
 * 自动检测运行环境依赖，缺失时一键安装
 *
 * 覆盖三大子系统：
 *   1. Node CLI（qoderclicn / qodercli）    → qoder provider
 *   2. Python venv + requirements              → workbuddy + universal-web-api
 *   3. Chromium 浏览器                         → universal-web-api（DrissionPage 需要）
 */

import { spawn, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import Router from '@koa/router'
import type { Context } from 'koa'
import { managementAuthMiddleware } from '../../middleware/managementAuth'

const router = new Router({ prefix: '/v0/management/deps' })
router.use(managementAuthMiddleware)

interface DepCheckResult {
  name: string
  category: 'node-cli' | 'python' | 'python-pkg' | 'browser' | 'subproject'
  key: string
  installed: boolean
  version?: string
  installCommand?: string
  description: string
}

function runCheck(cmd: string, args: string[]): { ok: boolean; output: string } {
  try {
    const r = spawnSync(cmd, args, { timeout: 5000, encoding: 'utf8' })
    return { ok: r.status === 0, output: (r.stdout || '') + (r.stderr || '') }
  } catch {
    return { ok: false, output: '' }
  }
}

function collectAllDeps(): DepCheckResult[] {
  const deps: DepCheckResult[] = []

  // Python 3
  const pyCheck = runCheck('python3', ['-c', 'import sys; print(sys.version)'])
  const pyVer = pyCheck.ok ? pyCheck.output.trim().split('\n')[0] : undefined
  deps.push({
    name: 'Python 3',
    category: 'python', key: 'python3',
    installed: pyCheck.ok && parseInt((pyVer || '0').split('.')[0]) >= 3,
    version: pyVer,
    installCommand: process.platform === 'darwin'
      ? 'brew install python@3.11'
      : process.platform === 'win32'
        ? 'winget install Python.Python.3.11'
        : 'sudo apt-get install -y python3 python3-pip python3-venv',
    description: 'workbuddy2api-hub + universal-web-api 都需要 Python 3.10+',
  })

  // Node.js
  const nodeCheck = runCheck('node', ['--version'])
  deps.push({
    name: 'Node.js',
    category: 'python', key: 'node',
    installed: nodeCheck.ok,
    version: nodeCheck.ok ? nodeCheck.output.trim() : undefined,
    installCommand: 'https://nodejs.org 安装 LTS',
    description: 'Chat2API 自身运行时',
  })

  // Qoder CLI
  const qoderClis: [string, string, string][] = [
    ['qoderclicn', '@qodercn-ai/qoderclicn', '国内版'],
    ['qodercli', '@qoder-ai/qodercli', '国际版'],
  ]
  for (const [cliName, pkgName, backend] of qoderClis) {
    const cliCheck = runCheck(cliName, ['--version'])
    deps.push({
      name: `Qoder CLI (${backend})`,
      category: 'node-cli', key: cliName,
      installed: cliCheck.ok,
      version: cliCheck.ok ? cliCheck.output.trim().slice(0, 60) : undefined,
      installCommand: `npm install -g ${pkgName}`,
      description: `qoder provider 调用的本地 CLI 二进制（${backend}）`,
    })
  }

  // Chromium / Chrome / Edge / Brave
  const browsers = ['chromium-browser', 'chromium', 'google-chrome', 'chrome', 'microsoft-edge', 'brave-browser']
  let browserFound = false
  for (const b of browsers) {
    const c = runCheck(b, ['--version'])
    if (c.ok) { browserFound = true; break }
  }
  deps.push({
    name: 'Chromium 浏览器',
    category: 'browser', key: 'chromium',
    installed: browserFound,
    installCommand: process.platform === 'darwin'
      ? 'brew install --cask google-chrome'
      : process.platform === 'win32'
        ? 'winget install Google.Chrome'
        : 'sudo apt-get install -y chromium-browser',
    description: 'universal-web-api 通过 DrissionPage 控制浏览器，需 Chrome/Chromium/Edge/Brave 之一',
  })

  // 子项目目录
  const thirdPartyDir = path.join(process.cwd(), 'backend', 'third_party')
  const wbDir = path.join(thirdPartyDir, 'workbuddy')
  const uwDir = path.join(thirdPartyDir, 'universal-web-api')

  // workbuddy2api-hub
  const wbMain = fs.existsSync(path.join(wbDir, 'wb_proxy.py'))
  const wbDrission = runCheck('python3', ['-c', 'import drissionpage']).ok
  deps.push({
    name: 'workbuddy2api-hub',
    category: 'subproject', key: 'workbuddy',
    installed: wbMain,
    version: wbDrission ? 'ready' : 'missing drissionpage',
    installCommand: `pip3 install --user drissionpage fastapi uvicorn`,
    description: '腾讯 WorkBuddy 国内版 + 国际版双区域 API，自动 OAuth 登录 + 签到积分',
  })

  // universal-web-api
  const uwMainOk = fs.existsSync(path.join(uwDir, 'main.py'))
  const uwDrission = runCheck('python3', ['-c', 'import drissionpage']).ok
  deps.push({
    name: 'universal-web-api',
    category: 'subproject', key: 'universal',
    installed: uwMainOk && uwDrission,
    version: uwMainOk ? 'ready' : 'missing',
    installCommand: `cd "${uwDir}" && pip3 install -r requirements.txt`,
    description: '驱动浏览器接管 ChatGPT / 豆包 / Gemini / Claude / Kimi / 通义千问 / Grok 等网页',
  })

  // drissionpage (单独暴露)
  const drissionOk = runCheck('python3', ['-c', 'import drissionpage']).ok
  deps.push({
    name: 'drissionpage',
    category: 'python-pkg', key: 'drissionpage',
    installed: drissionOk,
    installCommand: 'pip3 install --user drissionpage',
    description: 'Python 浏览器自动化引擎（universal-web-api 核心依赖）',
  })

  return deps
}

function runInstall(cmd: string, cwd?: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(process.platform === 'win32' ? 'cmd' : 'bash',
      process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd], {
      cwd, timeout: 300000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    proc.stdout.on('data', (c) => { out += c.toString() })
    proc.stderr.on('data', (c) => { out += c.toString() })
    proc.on('close', (code) => resolve({ success: code === 0, output: out }))
    proc.on('error', (e) => resolve({ success: false, output: e.message }))
  })
}

router.get('/check', async (ctx: Context) => {
  try {
    const deps = collectAllDeps()
    const summary = {
      total: deps.length,
      installed: deps.filter(d => d.installed).length,
      missing: deps.filter(d => !d.installed).length,
    }
    ctx.body = { success: true, data: { deps, summary } }
  } catch (error: any) {
    ctx.status = 500
    ctx.body = { success: false, error: { code: 'CHECK_FAILED', message: error.message } }
  }
})

router.post('/install-all', async (ctx: Context) => {
  const deps = collectAllDeps().filter(d => !d.installed)
  const results: any[] = []
  for (const dep of deps) {
    if (!dep.installCommand) { results.push({ key: dep.key, success: false, message: '无安装命令' }); continue }
    const r = await runInstall(dep.installCommand)
    results.push({ key: dep.key, success: r.success, output: r.output.slice(-500) })
  }
  const after = collectAllDeps()
  ctx.body = {
    success: true,
    data: {
      before: deps.length,
      results,
      afterSummary: {
        total: after.length,
        installed: after.filter(d => d.installed).length,
        missing: after.filter(d => !d.installed).length,
      },
    },
  }
})

router.post('/install/:key', async (ctx: Context) => {
  const key = ctx.params.key as string
  const all = collectAllDeps()
  const dep = all.find(d => d.key === key)
  if (!dep) { ctx.status = 404; ctx.body = { success: false, error: 'not found' }; return }
  if (dep.installed) { ctx.body = { success: true, data: { alreadyInstalled: true } }; return }
  if (!dep.installCommand) { ctx.status = 400; ctx.body = { success: false, error: 'no install command' }; return }
  const r = await runInstall(dep.installCommand)
  ctx.body = { success: r.success, data: { output: r.output.slice(-1000) } }
})

export default router
