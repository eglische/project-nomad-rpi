import { Head, router, usePage } from '@inertiajs/react'
import { useMemo, useRef, useState } from 'react'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import { NomadOllamaModel } from '../../../types/ollama'
import StyledButton from '~/components/StyledButton'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import Alert from '~/components/Alert'
import { useNotifications } from '~/context/NotificationContext'
import api from '~/lib/api'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import { ModelResponse } from 'ollama'
import { SERVICE_NAMES } from '../../../constants/service_names'
import Switch from '~/components/inputs/Switch'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import { useMutation, useQuery } from '@tanstack/react-query'
import Input from '~/components/inputs/Input'
import { IconSearch, IconRefresh } from '@tabler/icons-react'
import useDebounce from '~/hooks/useDebounce'
import ActiveModelDownloads from '~/components/ActiveModelDownloads'
import { useSystemInfo } from '~/hooks/useSystemInfo'

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border-2 border-gray-200 bg-white p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

export default function ModelsPage(props: {
  models: {
    availableModels: NomadOllamaModel[]
    installedModels: ModelResponse[]
    settings: {
      chatSuggestionsEnabled: boolean
      aiAssistantCustomName: string
      aiAssistantContextPrompt: string
      prewarmOnBoot: boolean
      keepModelWarm: boolean
      defaultChatModel: string
      prewarmDefaultChatModel: boolean
      helperTextModel: string
      helperEmbeddingModel: string
      prewarmHelperModels: boolean
    }
  }
}) {
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const { isInstalled } = useServiceInstalledStatus(SERVICE_NAMES.OLLAMA)
  const { addNotification } = useNotifications()
  const { openModal, closeAllModals } = useModals()
  const { debounce } = useDebounce()
  const { data: systemInfo } = useSystemInfo({})

  const [gpuBannerDismissed, setGpuBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem('nomad:gpu-banner-dismissed') === 'true'
    } catch {
      return false
    }
  })
  const [reinstalling, setReinstalling] = useState(false)

  const handleDismissGpuBanner = () => {
    setGpuBannerDismissed(true)
    try {
      localStorage.setItem('nomad:gpu-banner-dismissed', 'true')
    } catch {}
  }

  const handleForceReinstallOllama = () => {
    openModal(
      <StyledModal
        title="Reinstall AI Assistant?"
        onConfirm={async () => {
          closeAllModals()
          setReinstalling(true)
          try {
            const response = await api.forceReinstallService('nomad_ollama')
            if (!response || !response.success) {
              throw new Error(response?.message || 'Force reinstall failed')
            }
            addNotification({
              message: `${aiAssistantName} is being reinstalled with GPU support. This page will reload shortly.`,
              type: 'success',
            })
            try { localStorage.removeItem('nomad:gpu-banner-dismissed') } catch {}
            setTimeout(() => window.location.reload(), 5000)
          } catch (error) {
            addNotification({
              message: `Failed to reinstall: ${error instanceof Error ? error.message : 'Unknown error'}`,
              type: 'error',
            })
            setReinstalling(false)
          }
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Reinstall"
        cancelText="Cancel"
      >
        <p className="text-gray-700">
          This will recreate the {aiAssistantName} container with GPU support enabled.
          Your downloaded models will be preserved. The service will be briefly
          unavailable during reinstall.
        </p>
      </StyledModal>,
      'gpu-health-force-reinstall-modal'
    )
  }
  const [chatSuggestionsEnabled, setChatSuggestionsEnabled] = useState(
    props.models.settings.chatSuggestionsEnabled
  )
  const [prewarmOnBoot, setPrewarmOnBoot] = useState(props.models.settings.prewarmOnBoot)
  const [keepModelWarm, setKeepModelWarm] = useState(props.models.settings.keepModelWarm)
  const [aiAssistantCustomName, setAiAssistantCustomName] = useState(
    props.models.settings.aiAssistantCustomName
  )
  const [aiAssistantContextPrompt, setAiAssistantContextPrompt] = useState(
    props.models.settings.aiAssistantContextPrompt
  )
  const [defaultChatModel, setDefaultChatModel] = useState(props.models.settings.defaultChatModel)
  const [prewarmDefaultChatModel, setPrewarmDefaultChatModel] = useState(
    props.models.settings.prewarmDefaultChatModel
  )
  const [helperTextModel, setHelperTextModel] = useState(props.models.settings.helperTextModel)
  const [helperEmbeddingModel, setHelperEmbeddingModel] = useState(props.models.settings.helperEmbeddingModel)
  const [prewarmHelperModels, setPrewarmHelperModels] = useState(props.models.settings.prewarmHelperModels)

  const [query, setQuery] = useState('')
  const [queryUI, setQueryUI] = useState('')
  const [limit, setLimit] = useState(15)

  const debouncedSetQuery = debounce((val: string) => {
    setQuery(val)
  }, 300)

  const forceRefreshRef = useRef(false)
  const [isForceRefreshing, setIsForceRefreshing] = useState(false)
  const textModels = useMemo(
    () => props.models.installedModels.filter((model) => !model.name.includes('embed')),
    [props.models.installedModels]
  )
  const embeddingModels = useMemo(
    () => props.models.installedModels.filter((model) => model.name.includes('embed')),
    [props.models.installedModels]
  )

  const { data: availableModelData, isFetching, refetch } = useQuery({
    queryKey: ['ollama', 'availableModels', query, limit],
    queryFn: async () => {
      const force = forceRefreshRef.current
      forceRefreshRef.current = false
      const res = await api.getAvailableModels({
        query,
        recommendedOnly: false,
        limit,
        force: force || undefined,
      })
      if (!res) {
        return {
          models: [],
          hasMore: false,
        }
      }
      return res
    },
    initialData: { models: props.models.availableModels, hasMore: false },
  })

  async function handleForceRefresh() {
    forceRefreshRef.current = true
    setIsForceRefreshing(true)
    await refetch()
    setIsForceRefreshing(false)
    addNotification({ message: 'Model list refreshed from remote.', type: 'success' })
  }

  async function handleInstallModel(modelName: string) {
    try {
      const res = await api.downloadModel(modelName)
      if (res.success) {
        addNotification({
          message: `Model download initiated for ${modelName}. It may take some time to complete.`,
          type: 'success',
        })
      }
    } catch (error) {
      console.error('Error installing model:', error)
      addNotification({
        message: `There was an error installing the model: ${modelName}. Please try again.`,
        type: 'error',
      })
    }
  }

  async function handleInstallRecommendedEmbeddingModel() {
    await handleInstallModel('nomic-embed-text:v1.5')
  }

  async function handleDeleteModel(modelName: string) {
    try {
      const res = await api.deleteModel(modelName)
      if (res.success) {
        addNotification({
          message: `Model deleted: ${modelName}.`,
          type: 'success',
        })
      }
      closeAllModals()
      router.reload()
    } catch (error) {
      console.error('Error deleting model:', error)
      addNotification({
        message: `There was an error deleting the model: ${modelName}. Please try again.`,
        type: 'error',
      })
    }
  }

  async function confirmDeleteModel(model: string) {
    openModal(
      <StyledModal
        title="Delete Model?"
        onConfirm={() => {
          handleDeleteModel(model)
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="primary"
      >
        <p className="text-gray-700">
          Are you sure you want to delete this model? You will need to download it again if you want
          to use it in the future.
        </p>
      </StyledModal>,
      'confirm-delete-model-modal'
    )
  }

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean | string }) => {
      return await api.updateSetting(key, value)
    },
    onSuccess: () => {
      addNotification({
        message: 'Setting updated successfully.',
        type: 'success',
      })
    },
    onError: (error) => {
      console.error('Error updating setting:', error)
      addNotification({
        message: 'There was an error updating the setting. Please try again.',
        type: 'error',
      })
    },
  })

  return (
    <SettingsLayout>
      <Head title={`${aiAssistantName} Settings | Project N.O.M.A.D.`} />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <h1 className="text-4xl font-semibold mb-4">{aiAssistantName}</h1>
          <p className="text-gray-500 mb-4">
            Easily manage the {aiAssistantName}'s settings and installed models. We recommend
            starting with smaller models first to see how they perform on your system before moving
            on to larger ones.
          </p>
          {!isInstalled && (
            <Alert
              title={`${aiAssistantName}'s dependencies are not installed. Please install them to manage AI models.`}
              type="warning"
              variant="solid"
              className="!mt-6"
            />
          )}
          {isInstalled && systemInfo?.gpuHealth?.status === 'passthrough_failed' && !gpuBannerDismissed && (
            <Alert
              type="warning"
              variant="bordered"
              title="GPU Not Accessible"
              message={`Your system has an NVIDIA GPU, but ${aiAssistantName} can't access it. AI is running on CPU only, which is significantly slower.`}
              className="!mt-6"
              dismissible={true}
              onDismiss={handleDismissGpuBanner}
              buttonProps={{
                children: `Fix: Reinstall ${aiAssistantName}`,
                icon: 'IconRefresh',
                variant: 'action',
                size: 'sm',
                onClick: handleForceReinstallOllama,
                loading: reinstalling,
                disabled: reinstalling,
              }}
            />
          )}

          <StyledSectionHeader title="Settings" className="mt-8 mb-4" />
          <div className="space-y-6">
            <SettingsCard
              title="Chat Model"
              description="Choose the main inference model for chat and control how aggressively Nomad keeps it ready."
            >
              <Switch
                checked={chatSuggestionsEnabled}
                onChange={(newVal) => {
                  setChatSuggestionsEnabled(newVal)
                  updateSettingMutation.mutate({ key: 'chat.suggestionsEnabled', value: newVal })
                }}
                label="Chat Suggestions"
                description="Display AI-generated conversation starters in the chat interface"
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Default Chat Model</label>
                <select
                  value={defaultChatModel}
                  onChange={(e) => {
                    const value = e.target.value
                    setDefaultChatModel(value)
                    updateSettingMutation.mutate({ key: 'ollama.defaultChatModel', value })
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-desert-green"
                >
                  <option value="">No explicit default</option>
                  {textModels.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Preferred starting model in chat when there is no last active model to restore.</p>
              </div>
              <Switch
                checked={prewarmDefaultChatModel}
                onChange={(newVal) => {
                  setPrewarmDefaultChatModel(newVal)
                  updateSettingMutation.mutate({ key: 'ollama.prewarmDefaultChatModel', value: newVal })
                }}
                label="Preload Default Chat Model On Boot"
                description="Warm the configured default chat model at startup so the first inference comes back faster."
              />
              <Switch
                checked={prewarmOnBoot}
                onChange={(newVal) => {
                  setPrewarmOnBoot(newVal)
                  updateSettingMutation.mutate({ key: 'ollama.prewarmOnBoot', value: newVal })
                }}
                label="Prewarm Last Active Chat Model On Boot"
                description="Automatically restore the last active chat model after startup."
              />
              <Switch
                checked={keepModelWarm}
                onChange={(newVal) => {
                  setKeepModelWarm(newVal)
                  updateSettingMutation.mutate({ key: 'ollama.keepModelWarm', value: newVal })
                }}
                label="Keep Active Chat Model Warm"
                description="Keep the active chat model resident after use. When you load another chat model, Nomad unloads the old main model while leaving helper models available."
              />
            </SettingsCard>

            <SettingsCard
              title="Text Helper Model"
              description="Used for supporting tasks like query rewriting and chat title generation."
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Helper Text Model</label>
                <select
                  value={helperTextModel}
                  onChange={(e) => {
                    const value = e.target.value
                    setHelperTextModel(value)
                    updateSettingMutation.mutate({ key: 'ollama.helperTextModel', value })
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-desert-green"
                >
                  {textModels.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
              <Switch
                checked={prewarmHelperModels}
                onChange={(newVal) => {
                  setPrewarmHelperModels(newVal)
                  updateSettingMutation.mutate({ key: 'ollama.prewarmHelperModels', value: newVal })
                }}
                label="Preload Helper Models On Boot"
                description="Load the configured helper text and embedding models at startup so helper workflows avoid a cold start."
              />
            </SettingsCard>

            <SettingsCard
              title="Embedding / RAG Helper Model"
              description="Used for document embeddings and semantic retrieval."
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Embedding / RAG Helper Model</label>
                <select
                  value={helperEmbeddingModel}
                  onChange={(e) => {
                    const value = e.target.value
                    setHelperEmbeddingModel(value)
                    updateSettingMutation.mutate({ key: 'ollama.helperEmbeddingModel', value })
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-desert-green"
                >
                  {embeddingModels.length === 0 && <option value="">No embedding model installed</option>}
                  {embeddingModels.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Pick an embedding-capable model here. If none are installed yet, download one first.</p>
              </div>
              {embeddingModels.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm text-amber-900">
                    No embedding model is installed right now. RAG indexing and semantic retrieval will stay limited until one is available.
                  </p>
                  <StyledButton
                    variant="secondary"
                    className="mt-3"
                    onClick={handleInstallRecommendedEmbeddingModel}
                  >
                    Download Recommended Embedding Model
                  </StyledButton>
                </div>
              )}
            </SettingsCard>

            <SettingsCard
              title="Assistant Behavior"
              description="Set the assistant name and add behavioral context that gets injected into the system prompt."
            >
              <Input
                name="aiAssistantCustomName"
                label="Assistant Name"
                helpText='Give your AI assistant a custom name that will be used in the chat interface and other areas of the application.'
                placeholder="AI Assistant"
                value={aiAssistantCustomName}
                onChange={(e) => setAiAssistantCustomName(e.target.value)}
                onBlur={() =>
                  updateSettingMutation.mutate({
                    key: 'ai.assistantCustomName',
                    value: aiAssistantCustomName,
                  })
                }
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Prompt Context Injection</label>
                <textarea
                  value={aiAssistantContextPrompt}
                  onChange={(e) => setAiAssistantContextPrompt(e.target.value)}
                  onBlur={() =>
                    updateSettingMutation.mutate({
                      key: 'ai.assistantContextPrompt',
                      value: aiAssistantContextPrompt,
                    })
                  }
                  rows={5}
                  placeholder="Add tone, behavioral rules, or domain-specific instructions for the assistant."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-desert-green"
                />
                <p className="mt-1 text-xs text-gray-500">This is appended to the assistant system prompt so you can steer personality, format, and behavior.</p>
              </div>
            </SettingsCard>
          </div>
          <ActiveModelDownloads withHeader />

          <StyledSectionHeader title="Models" className="mt-12 mb-4" />
          <div className="flex justify-start items-center gap-3 mt-4">
            <Input
              name="search"
              label=""
              placeholder="Search language models.."
              value={queryUI}
              onChange={(e) => {
                setQueryUI(e.target.value)
                debouncedSetQuery(e.target.value)
              }}
              className="w-1/3"
              leftIcon={<IconSearch className="w-5 h-5 text-gray-400" />}
            />
            <StyledButton
              variant="secondary"
              onClick={handleForceRefresh}
              icon="IconRefresh"
              loading={isForceRefreshing}
              className='mt-1'
            >
              Refresh Models
            </StyledButton>
          </div>
          <StyledTable<NomadOllamaModel>
            className="font-semibold mt-4"
            rowLines={true}
            columns={[
              {
                accessor: 'name',
                title: 'Name',
                render(record) {
                  return (
                    <div className="flex flex-col">
                      <p className="text-lg font-semibold">{record.name}</p>
                      <p className="text-sm text-gray-500">{record.description}</p>
                    </div>
                  )
                },
              },
              {
                accessor: 'estimated_pulls',
                title: 'Estimated Pulls',
              },
              {
                accessor: 'model_last_updated',
                title: 'Last Updated',
              },
            ]}
            data={availableModelData?.models || []}
            loading={isFetching}
            expandable={{
              expandedRowRender: (record) => (
                <div className="pl-14">
                  <div className="bg-white overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Tag
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Input Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Context Size
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Model Size
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {record.tags.map((tag, tagIndex) => {
                          const isInstalled = props.models.installedModels.some(
                            (mod) => mod.name === tag.name
                          )
                          return (
                            <tr key={tagIndex} className="hover:bg-slate-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm font-medium text-gray-900">
                                  {tag.name}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm text-gray-600">{tag.input || 'N/A'}</span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm text-gray-600">
                                  {tag.context || 'N/A'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm text-gray-600">{tag.size || 'N/A'}</span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <StyledButton
                                  variant={isInstalled ? 'danger' : 'primary'}
                                  onClick={() => {
                                    if (!isInstalled) {
                                      handleInstallModel(tag.name)
                                    } else {
                                      confirmDeleteModel(tag.name)
                                    }
                                  }}
                                  icon={isInstalled ? 'IconTrash' : 'IconDownload'}
                                >
                                  {isInstalled ? 'Delete' : 'Install'}
                                </StyledButton>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ),
            }}
          />
          <div className="flex justify-center mt-6">
            {availableModelData?.hasMore && (
              <StyledButton
                variant="primary"
                onClick={() => {
                  setLimit((prev) => prev + 15)
                }}
              >
                Load More
              </StyledButton>
            )}
          </div>
        </main>
      </div>
    </SettingsLayout>
  )
}
