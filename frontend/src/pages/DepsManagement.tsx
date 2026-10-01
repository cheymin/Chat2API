import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, CheckCircle2, XCircle, Loader2, RefreshCw, Zap } from 'lucide-react';
import { ApiService } from '@/services/api';

interface DepItem {
  name: string;
  category: string;
  key: string;
  installed: boolean;
  version?: string;
  installCommand?: string;
  description: string;
}

const categoryLabel: Record<string, string> = {
  'node-cli': 'Node CLI',
  'python': 'Python',
  'python-pkg': 'Python 包',
  'browser': '浏览器',
  'subproject': '子项目',
};

export function DepsManagement() {
  const { t } = useTranslation();
  const [deps, setDeps] = useState<DepItem[]>([]);
  const [summary, setSummary] = useState({ total: 0, installed: 0, missing: 0 });
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installingAll, setInstallingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDeps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: any = await ApiService.deps.check();
      setDeps(data.deps);
      setSummary(data.summary);
    } catch (e: any) {
      setError(e.response?.data?.error?.message || e.message || '检测失败（请先在设置里完成 Management API 认证）');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDeps(); }, [fetchDeps]);

  const installOne = async (key: string) => {
    setInstalling(key);
    try {
      await apiClient.post(`/deps/install/${key}`);
      await fetchDeps();
    } finally {
      setInstalling(null);
    }
  };

  const installAll = async () => {
    setInstallingAll(true);
    try {
      await ApiService.deps.installAll();
      await fetchDeps();
    } finally {
      setInstallingAll(false);
    }
  };

  const missing = deps.filter(d => !d.installed);
  const installed = deps.filter(d => d.installed);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-7 w-7" />
            依赖管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            自动检测 Chat2API 所有子系统运行所需的依赖，一键安装缺失项
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchDeps} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            重新检测
          </Button>
          {missing.length > 0 && (
            <Button onClick={installAll} disabled={installingAll}>
              <Zap className="h-4 w-4 mr-2" />
              {installingAll ? '安装中...' : `一键安装全部 (${missing.length})`}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold">{summary.total}</div><div className="text-xs text-muted-foreground">总依赖</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-green-500">{summary.installed}</div><div className="text-xs text-muted-foreground">已安装</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-amber-500">{summary.missing}</div><div className="text-xs text-muted-foreground">缺失</div></CardContent></Card>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-500/10 text-red-500 text-sm">{error}</div>
      )}

      {missing.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-amber-500" /> 缺失 ({missing.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {missing.map(dep => (
              <Card key={dep.key} className="border-amber-500/30">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{dep.name}</CardTitle>
                      <CardDescription className="mt-1">{dep.description}</CardDescription>
                    </div>
                    <Badge variant="destructive" className="shrink-0">{categoryLabel[dep.category] || dep.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                      {dep.installCommand}
                    </code>
                    <Button size="sm" onClick={() => installOne(dep.key)} disabled={installing === dep.key}>
                      {installing === dep.key ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      安装
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {installed.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" /> 已安装 ({installed.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {installed.map(dep => (
              <Card key={dep.key} className="border-green-500/30 opacity-80">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{dep.name}</span>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="text-xs text-muted-foreground">{dep.version || 'OK'}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
export default DepsManagement;
