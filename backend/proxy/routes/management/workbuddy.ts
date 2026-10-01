/**
 * Management API - WorkBuddy OAuth Routes
 */

import Router from '@koa/router'
import type { Context } from 'koa'
import { managementAuthMiddleware } from '../../middleware/managementAuth'
import { AccountManager } from '../../../store/accounts'
import { WorkbuddyAdapter } from '../../adapters/workbuddy'

const router = new Router({ prefix: '/v0/management/workbuddy' })
router.use(managementAuthMiddleware)

function getWorkbuddyAccount(accountId?: string) {
  if (accountId) {
    const acc = AccountManager.getById(accountId, true);
    if (acc && acc.providerId === 'workbuddy') return acc;
  }
  const accounts = AccountManager.getByProviderId('workbuddy', true);
  return accounts[0] || null;
}

router.post('/oauth/start', async (ctx: Context) => {
  const body = (ctx.request.body as any) || {};
  const account = getWorkbuddyAccount(body.accountId);
  if (!account) {
    ctx.status = 404;
    ctx.body = { success: false, error: { code: 'NOT_FOUND', message: '未找到 WorkBuddy 账号，请先在 Providers 页面添加' } };
    return;
  }
  try {
    const adapter = new WorkbuddyAdapter({ id: 'workbuddy' } as any, account as any);
    const result = await adapter.startLogin(body.realm, body.platform);
    ctx.body = { success: true, data: result };
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = { success: false, error: { code: 'OAUTH_START_FAILED', message: error.message } };
  }
});

router.post('/oauth/poll', async (ctx: Context) => {
  const body = (ctx.request.body as any) || {};
  if (!body.state) {
    ctx.status = 400;
    ctx.body = { success: false, error: { code: 'MISSING_STATE', message: 'state 必填' } };
    return;
  }
  const account = getWorkbuddyAccount(body.accountId);
  if (!account) {
    ctx.status = 404;
    ctx.body = { success: false, error: { code: 'NOT_FOUND', message: '未找到 WorkBuddy 账号' } };
    return;
  }
  try {
    const adapter = new WorkbuddyAdapter({ id: 'workbuddy' } as any, account as any);
    const result = await adapter.pollLogin(body.state);
    ctx.body = { success: true, data: result };
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = { success: false, error: { code: 'OAUTH_POLL_FAILED', message: error.message } };
  }
});

router.post('/oauth/cancel', async (ctx: Context) => {
  const body = (ctx.request.body as any) || {};
  const account = getWorkbuddyAccount(body.accountId);
  if (!account) {
    ctx.status = 404;
    ctx.body = { success: false, error: { code: 'NOT_FOUND', message: '未找到 WorkBuddy 账号' } };
    return;
  }
  try {
    const adapter = new WorkbuddyAdapter({ id: 'workbuddy' } as any, account as any);
    const result = await adapter.cancelLogin(body.state);
    ctx.body = { success: true, data: result };
  } catch (error: any) {
    ctx.status = 500;
    ctx.body = { success: false, error: { code: 'OAUTH_CANCEL_FAILED', message: error.message } };
  }
});

router.get('/health', async (ctx: Context) => {
  const account = getWorkbuddyAccount(ctx.query.accountId as string);
  if (!account) {
    ctx.body = { success: true, data: { healthy: false, dashboardUrl: null, message: '未配置 WorkBuddy 账号' } };
    return;
  }
  try {
    const adapter = new WorkbuddyAdapter({ id: 'workbuddy' } as any, account as any);
    const info = await adapter.getHealth();
    ctx.body = { success: true, data: { ...info, dashboardUrl: info.dashboardUrl + '/' } };
  } catch (error: any) {
    ctx.body = { success: true, data: { healthy: false, dashboardUrl: null, message: error.message } };
  }
});

export default router
