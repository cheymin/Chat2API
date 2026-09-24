import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useProxyStore } from '@/stores/proxyStore'
import { useToast } from '@/hooks/use-toast'
import { Settings2, AlertCircle, CheckCircle2 } from 'lucide-react'

interface AdvancedConfigProps {
  onConfigChange?: () => void
}

interface FormErrors {
  timeout?: string
  retryCount?: string
  outboundProxy?: string
}

export function AdvancedConfig({ onConfigChange }: AdvancedConfigProps) {
  const { t } = useTranslation()
  const { proxyConfig, setProxyConfig, appConfig, saveAppConfig, isLoading } = useProxyStore()
  const { toast } = useToast()
  
  const initialFormDataRef = useRef({
    timeout: (proxyConfig.timeout / 1000).toString(),
    retryCount: proxyConfig.retryCount.toString(),
    outboundProxy: appConfig?.outboundProxy || '',
  })

  const [formData, setFormData] = useState({
    timeout: (proxyConfig.timeout / 1000).toString(),
    retryCount: proxyConfig.retryCount.toString(),
    outboundProxy: appConfig?.outboundProxy || '',
  })
  
  const [errors, setErrors] = useState<FormErrors>({})
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    const newFormData = {
      timeout: (proxyConfig.timeout / 1000).toString(),
      retryCount: proxyConfig.retryCount.toString(),
      outboundProxy: appConfig?.outboundProxy || '',
    }
    setFormData(newFormData)
    initialFormDataRef.current = newFormData
  }, [proxyConfig, appConfig])

  const validateTimeout = (value: string): string | undefined => {
    const timeout = parseInt(value, 10)
    if (isNaN(timeout)) return t('proxy.timeoutMustBeNumber')
    if (timeout < 1 || timeout > 300) return t('proxy.timeoutRangeError')
    return undefined
  }

  const validateRetryCount = (value: string): string | undefined => {
    const count = parseInt(value, 10)
    if (isNaN(count)) return t('proxy.retryCountMustBeNumber')
    if (count < 0 || count > 10) return t('proxy.retryCountRangeError')
    return undefined
  }

  const validateOutboundProxy = (value: string): string | undefined => {
    if (!value) return undefined // Optional
    try {
      const url = new URL(value)
      if (!['http:', 'https:', 'socks5:'].includes(url.protocol)) {
        return 'Must use http://, https://, or socks5:// protocol'
      }
    } catch {
      return 'Must be a valid URL (e.g. http://127.0.0.1:10808)'
    }
    return undefined
  }

  const handleTimeoutChange = (value: string) => {
    setFormData(prev => ({ ...prev, timeout: value }))
    const error = validateTimeout(value)
    setErrors(prev => ({ ...prev, timeout: error }))
    setHasChanges(true)
    onConfigChange?.()
  }

  const handleRetryCountChange = (value: string) => {
    setFormData(prev => ({ ...prev, retryCount: value }))
    const error = validateRetryCount(value)
    setErrors(prev => ({ ...prev, retryCount: error }))
    setHasChanges(true)
    onConfigChange?.()
  }

  const handleOutboundProxyChange = (value: string) => {
    setFormData(prev => ({ ...prev, outboundProxy: value }))
    const error = validateOutboundProxy(value)
    setErrors(prev => ({ ...prev, outboundProxy: error }))
    setHasChanges(true)
    onConfigChange?.()
  }

  const handleSave = async () => {
    const timeoutError = validateTimeout(formData.timeout)
    const retryError = validateRetryCount(formData.retryCount)
    const proxyError = validateOutboundProxy(formData.outboundProxy)

    if (timeoutError || retryError || proxyError) {
      setErrors({
        timeout: timeoutError,
        retryCount: retryError,
        outboundProxy: proxyError,
      })
      toast({
        title: t('proxy.validationFailed'),
        description: t('proxy.fixFormErrors'),
        variant: 'destructive',
      })
      return
    }

    const newProxyConfig = {
      timeout: parseInt(formData.timeout, 10) * 1000,
      retryCount: parseInt(formData.retryCount, 10),
    }

    setProxyConfig(newProxyConfig)

    const success = await saveAppConfig({
      requestTimeout: newProxyConfig.timeout,
      retryCount: newProxyConfig.retryCount,
      outboundProxy: formData.outboundProxy,
    })

    if (success) {
      setHasChanges(false)
      toast({
        title: t('common.success'),
        description: t('proxy.advancedConfigUpdated'),
      })
    } else {
      toast({
        title: t('common.error'),
        description: t('proxy.configSaveFailed'),
        variant: 'destructive',
      })
    }
  }

  const handleReset = () => {
    setFormData(initialFormDataRef.current)
    setErrors({})
    setHasChanges(false)
  }

  const isValid = !errors.timeout && !errors.retryCount && !errors.outboundProxy

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <CardTitle>{t('proxy.advancedConfig')}</CardTitle>
          </div>
          {hasChanges && (
            <Badge variant="secondary" className="text-xs">
              {t('proxy.unsaved')}
            </Badge>
          )}
        </div>
        <CardDescription>{t('proxy.advancedConfigDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h4 className="text-sm font-medium">{t('proxy.requestConfig')}</h4>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timeout" className="flex items-center gap-2">
                {t('proxy.requestTimeout')}
                {errors.timeout && (
                  <span className="text-destructive text-xs flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.timeout}
                  </span>
                )}
                {!errors.timeout && formData.timeout && (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                )}
              </Label>
              <Input
                id="timeout"
                type="number"
                placeholder="60"
                value={formData.timeout}
                onChange={(e) => handleTimeoutChange(e.target.value)}
                className={errors.timeout ? 'border-destructive' : ''}
              />
              <p className="text-xs text-muted-foreground">
                {t('proxy.timeoutHelp')}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="retryCount" className="flex items-center gap-2">
                {t('proxy.retryCount')}
                {errors.retryCount && (
                  <span className="text-destructive text-xs flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.retryCount}
                  </span>
                )}
                {!errors.retryCount && formData.retryCount && (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                )}
              </Label>
              <Input
                id="retryCount"
                type="number"
                placeholder="3"
                value={formData.retryCount}
                onChange={(e) => handleRetryCountChange(e.target.value)}
                className={errors.retryCount ? 'border-destructive' : ''}
              />
              <p className="text-xs text-muted-foreground">
                {t('proxy.retryCountHelp')}
              </p>
            </div>
          </div>

          <h4 className="text-sm font-medium mt-6">{t('proxy.networkConfig', 'Network Config')}</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="outboundProxy" className="flex items-center gap-2">
                {t('proxy.outboundProxy', 'Outbound Proxy (Optional)')}
                {errors.outboundProxy && (
                  <span className="text-destructive text-xs flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.outboundProxy}
                  </span>
                )}
                {!errors.outboundProxy && formData.outboundProxy && (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                )}
              </Label>
              <Input
                id="outboundProxy"
                type="text"
                placeholder="http://127.0.0.1:10808"
                value={formData.outboundProxy}
                onChange={(e) => handleOutboundProxyChange(e.target.value)}
                className={errors.outboundProxy ? 'border-destructive' : ''}
              />
              <p className="text-xs text-muted-foreground">
                {t('proxy.outboundProxyHelp', 'HTTP/SOCKS5 proxy used to access upstream providers (e.g. Perplexity)')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!hasChanges || isLoading}
          >
            {t('common.reset')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || !isValid || isLoading}
          >
            {isLoading ? t('proxy.saving') : t('proxy.saveConfig')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default AdvancedConfig
