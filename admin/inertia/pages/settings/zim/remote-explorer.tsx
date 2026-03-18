import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import api from '~/lib/api'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import { Head } from '@inertiajs/react'
import {
  ListRemoteZimFilesResponse,
  RemoteZimFileEntry,
  ZimDirectoryEntry,
  ZimRemoteSource,
} from '../../../../types/zim'
import { formatBytes } from '~/lib/util'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import { useNotifications } from '~/context/NotificationContext'
import useInternetStatus from '~/hooks/useInternetStatus'
import Alert from '~/components/Alert'
import useServiceInstalledStatus from '~/hooks/useServiceInstalledStatus'
import Input from '~/components/inputs/Input'
import {
  IconArrowUpLeft,
  IconBooks,
  IconChevronRight,
  IconCompass,
  IconDownload,
  IconFolder,
  IconLink,
  IconSearch,
  IconSparkles,
} from '@tabler/icons-react'
import useDebounce from '~/hooks/useDebounce'
import CategoryCard from '~/components/CategoryCard'
import TierSelectionModal from '~/components/TierSelectionModal'
import WikipediaSelector from '~/components/WikipediaSelector'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import type { CategoryWithStatus, SpecTier } from '../../../../types/collections'
import useDownloads from '~/hooks/useDownloads'
import ActiveDownloads from '~/components/ActiveDownloads'
import { SERVICE_NAMES } from '../../../../constants/service_names'

const CURATED_CATEGORIES_KEY = 'curated-categories'
const WIKIPEDIA_STATE_KEY = 'wikipedia-state'

type ExplorerMode = 'kiwix_catalog' | 'kiwix_directory' | 'manual_url'

function SourceCard(props: {
  source: ZimRemoteSource
  selected: boolean
  onSelect: (sourceId: ExplorerMode) => void
}) {
  return (
    <button
      type="button"
      onClick={() => props.onSelect(props.source.id as ExplorerMode)}
      className={`rounded-2xl border px-5 py-5 text-left transition-all ${
        props.selected
          ? 'border-desert-green bg-desert-sand shadow-md'
          : 'border-desert-stone-light bg-desert-white shadow-sm hover:border-desert-green/40 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full bg-desert-green/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-desert-green">
            {props.source.kind}
          </div>
          <h3 className="mt-3 text-lg font-semibold text-desert-green">{props.source.name}</h3>
          <p className="mt-2 text-sm text-desert-stone-dark">{props.source.description}</p>
        </div>
        {props.selected && <IconSparkles className="h-5 w-5 text-desert-green" />}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {props.source.capabilities.map((capability) => (
          <span
            key={capability}
            className="rounded-full bg-desert-white/80 px-2.5 py-1 text-xs text-desert-stone-dark"
          >
            {capability}
          </span>
        ))}
      </div>
    </button>
  )
}

function DirectoryRow(props: {
  entry: ZimDirectoryEntry
  onOpen: (entry: ZimDirectoryEntry) => void
  onDownload: (entry: ZimDirectoryEntry) => void
}) {
  const isFolder = props.entry.type === 'directory'
  return (
    <div className="rounded-xl border border-desert-stone-light bg-desert-white px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isFolder ? (
              <IconFolder className="h-5 w-5 text-desert-green" />
            ) : (
              <IconBooks className="h-5 w-5 text-desert-sunset" />
            )}
            <p className="truncate text-sm font-semibold text-desert-green">
              {props.entry.inferred_title || props.entry.name}
            </p>
          </div>
          <p className="mt-1 text-xs text-desert-stone-dark break-all">{props.entry.path}</p>
          {props.entry.description && (
            <p className="mt-2 text-sm text-desert-stone-dark">{props.entry.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-desert-stone-dark">
            {props.entry.size && <span>Size: {props.entry.size}</span>}
            {props.entry.last_modified && <span>Updated: {props.entry.last_modified}</span>}
            <span>{isFolder ? 'Folder' : 'ZIM file'}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isFolder ? (
            <StyledButton icon="IconFolder" onClick={() => props.onOpen(props.entry)}>
              Open
            </StyledButton>
          ) : (
            <StyledButton icon="IconDownload" onClick={() => props.onDownload(props.entry)}>
              Download
            </StyledButton>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ZimRemoteExplorer() {
  const queryClient = useQueryClient()
  const tableParentRef = useRef<HTMLDivElement>(null)

  const { openModal, closeAllModals } = useModals()
  const { addNotification } = useNotifications()
  const { isOnline } = useInternetStatus()
  const { isInstalled } = useServiceInstalledStatus(SERVICE_NAMES.KIWIX)
  const { debounce } = useDebounce()

  const [mode, setMode] = useState<ExplorerMode>('kiwix_catalog')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogQueryUI, setCatalogQueryUI] = useState('')
  const [directoryQuery, setDirectoryQuery] = useState('')
  const [directoryQueryUI, setDirectoryQueryUI] = useState('')
  const [directoryPath, setDirectoryPath] = useState('')
  const [manualUrl, setManualUrl] = useState('')

  const [tierModalOpen, setTierModalOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CategoryWithStatus | null>(null)
  const [selectedWikipedia, setSelectedWikipedia] = useState<string | null>(null)
  const [isSubmittingWikipedia, setIsSubmittingWikipedia] = useState(false)
  const [manualSubmitting, setManualSubmitting] = useState(false)

  const debouncedCatalogQuery = debounce((val: string) => setCatalogQuery(val), 400)
  const debouncedDirectoryQuery = debounce((val: string) => setDirectoryQuery(val), 250)

  const { data: categories } = useQuery({
    queryKey: [CURATED_CATEGORIES_KEY],
    queryFn: () => api.listCuratedCategories(),
    refetchOnWindowFocus: false,
  })

  const { data: wikipediaState, isLoading: isLoadingWikipedia } = useQuery({
    queryKey: [WIKIPEDIA_STATE_KEY],
    queryFn: () => api.getWikipediaState(),
    refetchOnWindowFocus: false,
  })

  const { data: sources } = useQuery({
    queryKey: ['zim-sources'],
    queryFn: () => api.listZimSources(),
    refetchOnWindowFocus: false,
  })

  const { data: downloads, invalidate: invalidateDownloads } = useDownloads({
    filetype: 'zim',
    enabled: true,
  })

  const { data, fetchNextPage, isFetching, isLoading } = useInfiniteQuery<ListRemoteZimFilesResponse>({
    queryKey: ['remote-zim-files', catalogQuery],
    queryFn: async ({ pageParam = 0 }) => {
      const pageParsed = parseInt((pageParam as number).toString(), 10)
      const start = isNaN(pageParsed) ? 0 : pageParsed * 12
      const res = await api.listRemoteZimFiles({ start, count: 12, query: catalogQuery || undefined })
      if (!res) {
        throw new Error('Failed to fetch remote ZIM files.')
      }
      return res.data
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => (lastPage.has_more ? pages.length : undefined),
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })

  const { data: directoryListing, isLoading: directoryLoading } = useQuery({
    queryKey: ['zim-directory', directoryPath, directoryQuery],
    queryFn: () => api.browseRemoteZimDirectory({ path: directoryPath, query: directoryQuery || undefined }),
    refetchOnWindowFocus: false,
    enabled: mode === 'kiwix_directory' && isOnline,
  })

  const flatData = useMemo(() => {
    const mapped = data?.pages.flatMap((page) => page.items) || []
    return mapped.filter((item) => {
      const filename = item.download_url.split('/').pop()
      return !downloads?.some((download) => filename && download.filepath.endsWith(filename))
    })
  }, [data, downloads])

  const hasMore = useMemo(() => data?.pages[data.pages.length - 1]?.has_more || false, [data])

  const fetchOnBottomReached = useCallback(
    (parentRef?: HTMLDivElement | null) => {
      if (!parentRef) return
      const { scrollHeight, scrollTop, clientHeight } = parentRef
      if (scrollHeight - scrollTop - clientHeight < 200 && !isFetching && hasMore && flatData.length > 0) {
        fetchNextPage()
      }
    },
    [fetchNextPage, isFetching, hasMore, flatData.length]
  )

  const virtualizer = useVirtualizer({
    count: flatData.length,
    estimateSize: () => 48,
    getScrollElement: () => tableParentRef.current,
    overscan: 5,
  })

  useEffect(() => {
    if (mode === 'kiwix_catalog') {
      fetchOnBottomReached(tableParentRef.current)
    }
  }, [fetchOnBottomReached, mode])

  async function queueDownload(url: string, title?: string, summary?: string) {
    try {
      const response = await api.downloadRemoteZimFile(url, {
        title: title || url.split('/').pop() || url,
        summary,
        author: 'Remote source',
      })
      invalidateDownloads()
      addNotification({
        message: response?.url && response.url !== url
          ? `Source moved. Nomad resolved the current file and started the download.`
          : 'Download started successfully.',
        type: 'success',
      })
      return response
    } catch (error) {
      addNotification({
        message: error instanceof Error ? error.message : 'Download failed',
        type: 'error',
      })
      throw error
    }
  }

  function confirmDownload(props: {
    title: string
    url: string
    summary?: string
    details?: string
  }) {
    openModal(
      <StyledModal
        title="Confirm Download?"
        onConfirm={async () => {
          await queueDownload(props.url, props.title, props.summary)
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Download"
        cancelText="Cancel"
        confirmVariant="primary"
      >
        <p className="text-gray-700">
          <strong>{props.title}</strong> will be queued for download and then indexed for search if supported.
        </p>
        {props.details && <p className="mt-3 text-sm text-gray-500 break-all">{props.details}</p>}
      </StyledModal>,
      'confirm-download-file-modal'
    )
  }

  async function handleManualImport() {
    if (!manualUrl.trim()) return
    setManualSubmitting(true)
    try {
      await queueDownload(manualUrl.trim(), manualUrl.trim(), 'Manual remote URL import')
      setManualUrl('')
    } finally {
      setManualSubmitting(false)
    }
  }

  const handleCategoryClick = (category: CategoryWithStatus) => {
    if (!isOnline) return
    setActiveCategory(category)
    setTierModalOpen(true)
  }

  const handleTierSelect = async (category: CategoryWithStatus, tier: SpecTier) => {
    try {
      await api.downloadCategoryTier(category.slug, tier.slug)
      addNotification({
        message: `Started downloading "${category.name} - ${tier.name}"`,
        type: 'success',
      })
      invalidateDownloads()
      queryClient.invalidateQueries({ queryKey: [CURATED_CATEGORIES_KEY] })
    } catch {
      addNotification({
        message: 'An error occurred while starting downloads.',
        type: 'error',
      })
    }
  }

  const handleWikipediaSubmit = async () => {
    if (!selectedWikipedia) return
    setIsSubmittingWikipedia(true)
    try {
      const result = await api.selectWikipedia(selectedWikipedia)
      if (result?.success) {
        addNotification({
          message: selectedWikipedia === 'none' ? 'Wikipedia removed successfully' : 'Wikipedia download started',
          type: 'success',
        })
        invalidateDownloads()
        queryClient.invalidateQueries({ queryKey: [WIKIPEDIA_STATE_KEY] })
        setSelectedWikipedia(null)
      } else {
        addNotification({
          message: result?.message || 'Failed to change Wikipedia selection',
          type: 'error',
        })
      }
    } finally {
      setIsSubmittingWikipedia(false)
    }
  }

  const refreshManifests = useMutation({
    mutationFn: () => api.refreshManifests(),
    onSuccess: () => {
      addNotification({
        message: 'Successfully refreshed content collections.',
        type: 'success',
      })
      queryClient.invalidateQueries({ queryKey: [CURATED_CATEGORIES_KEY] })
      queryClient.invalidateQueries({ queryKey: [WIKIPEDIA_STATE_KEY] })
    },
  })

  const selectedSource = sources?.find((source) => source.id === mode)
  const breadcrumbs = [
    { label: 'zim', path: '' },
    ...directoryPath.split('/').filter(Boolean).map((_, index, arr) => ({
      label: arr[index],
      path: arr.slice(0, index + 1).join('/'),
    })),
  ]

  return (
    <SettingsLayout>
      <Head title="Content Explorer | Project N.O.M.A.D." />
      <div className="xl:pl-72 w-full">
        <main className="px-6 lg:px-12 py-6 lg:py-8">
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-semibold text-desert-green">Remote Content Explorer</h1>
            <p className="max-w-3xl text-desert-stone-dark">
              Discover, browse, and import offline knowledge sources. Use the Kiwix catalog for guided search,
              the repository browser for full access to the raw archive tree, or paste a direct ZIM URL from a trusted source.
            </p>
          </div>

          {!isOnline && (
            <Alert
              title="No internet connection. Remote content discovery and downloads will be unavailable."
              message=""
              type="warning"
              variant="solid"
              className="!mt-6"
            />
          )}

          {!isInstalled && (
            <Alert
              title="Kiwix is not installed. You can still queue content, but you will need Kiwix to browse downloaded ZIM files locally."
              type="warning"
              variant="solid"
              className="!mt-6"
            />
          )}

          <section className="mt-8">
            <div className="mb-6 flex items-center justify-between">
              <StyledSectionHeader title="Curated Content" className="!mb-0" />
              <StyledButton
                onClick={() => refreshManifests.mutate()}
                disabled={refreshManifests.isPending || !isOnline}
                icon="IconRefresh"
              >
                Force Refresh Collections
              </StyledButton>
            </div>

            {isLoadingWikipedia ? (
              <div className="rounded-lg border border-desert-stone-light bg-desert-white p-6">
                <div className="flex justify-center py-6">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-desert-green"></div>
                </div>
              </div>
            ) : wikipediaState && wikipediaState.options.length > 0 ? (
              <div className="rounded-lg border border-desert-stone-light bg-desert-white p-6">
                <WikipediaSelector
                  options={wikipediaState.options}
                  currentSelection={wikipediaState.currentSelection}
                  selectedOptionId={selectedWikipedia}
                  onSelect={setSelectedWikipedia}
                  disabled={!isOnline}
                  showSubmitButton
                  onSubmit={handleWikipediaSubmit}
                  isSubmitting={isSubmittingWikipedia}
                />
              </div>
            ) : null}

            <div className="mt-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-desert-stone-light bg-desert-white shadow-sm">
                <IconBooks className="h-6 w-6 text-desert-green" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-desert-green">Curated Packs</h3>
                <p className="text-sm text-desert-stone-dark">Ready-made bundles for common offline use cases.</p>
              </div>
            </div>

            {categories && categories.length > 0 ? (
              <>
                <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {categories.map((category) => (
                    <CategoryCard
                      key={category.slug}
                      category={category}
                      selectedTier={null}
                      onClick={handleCategoryClick}
                    />
                  ))}
                </div>
                <TierSelectionModal
                  isOpen={tierModalOpen}
                  onClose={() => {
                    setTierModalOpen(false)
                    setActiveCategory(null)
                  }}
                  category={activeCategory}
                  selectedTierSlug={activeCategory?.installedTierSlug}
                  onSelectTier={handleTierSelect}
                />
              </>
            ) : (
              <p className="mt-4 text-desert-stone-dark">No curated content categories are available.</p>
            )}
          </section>

          <section className="mt-12">
            <StyledSectionHeader title="Remote Sources" className="mb-4" />
            <p className="mb-5 max-w-3xl text-sm text-desert-stone-dark">
              Different sources answer different needs. Catalog search is easiest for most users. Repository browsing exposes the raw upstream tree.
              Direct URL import is best when someone gives you a specific `.zim` link.
            </p>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {(sources || []).map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  selected={mode === source.id}
                  onSelect={setMode}
                />
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-desert-stone-light bg-desert-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-desert-green">
                  {selectedSource?.name || 'Source'}
                </p>
                <p className="mt-1 max-w-3xl text-sm text-desert-stone-dark">
                  {selectedSource?.description}
                </p>
              </div>
              {selectedSource?.base_url && (
                <a
                  href={selectedSource.base_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-desert-green hover:underline"
                >
                  <IconLink className="h-4 w-4" />
                  Open source
                </a>
              )}
            </div>

            {mode === 'kiwix_catalog' && (
              <div className="mt-6">
                <div className="mb-4 rounded-xl border border-desert-stone-light bg-desert-sand/40 px-4 py-4 text-sm text-desert-stone-dark">
                  This is a searchable metadata view of the official Kiwix catalog. It is the easiest way to find well-described content,
                  but it does not expose every folder in the raw repository tree.
                </div>
                <div className="flex justify-start">
                  <Input
                    name="catalog-search"
                    label=""
                    placeholder="Search the Kiwix catalog..."
                    value={catalogQueryUI}
                    onChange={(e) => {
                      setCatalogQueryUI(e.target.value)
                      debouncedCatalogQuery(e.target.value)
                    }}
                    className="w-full lg:w-1/2"
                    leftIcon={<IconSearch className="h-5 w-5 text-gray-400" />}
                  />
                </div>
                <StyledTable<RemoteZimFileEntry & { actions?: unknown }>
                  data={flatData.map((item, idx) => {
                    const row = virtualizer.getVirtualItems().find((v) => v.index === idx)
                    return {
                      ...item,
                      height: `${row?.size || 48}px`,
                      translateY: row?.start || 0,
                    }
                  })}
                  ref={tableParentRef}
                  loading={isLoading}
                  columns={[
                    { accessor: 'title' },
                    { accessor: 'author' },
                    { accessor: 'summary' },
                    {
                      accessor: 'updated',
                      render(record) {
                        return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(record.updated))
                      },
                    },
                    {
                      accessor: 'size_bytes',
                      title: 'Size',
                      render(record) {
                        return formatBytes(record.size_bytes)
                      },
                    },
                    {
                      accessor: 'actions',
                      render(record) {
                        return (
                          <StyledButton
                            icon="IconDownload"
                            onClick={() =>
                              confirmDownload({
                                title: record.title,
                                url: record.download_url,
                                summary: record.summary,
                                details: record.download_url,
                              })
                            }
                          >
                            Download
                          </StyledButton>
                        )
                      },
                    },
                  ]}
                  className="relative mt-4 h-[600px] w-full overflow-x-auto overflow-y-auto"
                  tableBodyStyle={{ position: 'relative', height: `${virtualizer.getTotalSize()}px` }}
                  containerProps={{ onScroll: (e) => fetchOnBottomReached(e.currentTarget as HTMLDivElement) }}
                  compact
                  rowLines
                />
              </div>
            )}

            {mode === 'kiwix_directory' && (
              <div className="mt-6">
                <div className="mb-4 rounded-xl border border-desert-stone-light bg-desert-sand/40 px-4 py-4 text-sm text-desert-stone-dark">
                  This is the raw Kiwix repository tree from <code>download.kiwix.org/zim/</code>. It is more complete than the searchable catalog,
                  but descriptions are inferred and some folders are technical rather than user-friendly.
                </div>
                <div className="flex flex-col gap-4 lg:flex-row">
                  <Input
                    name="directory-search"
                    label=""
                    placeholder="Filter the current repository folder..."
                    value={directoryQueryUI}
                    onChange={(e) => {
                      setDirectoryQueryUI(e.target.value)
                      debouncedDirectoryQuery(e.target.value)
                    }}
                    className="w-full lg:w-1/2"
                    leftIcon={<IconSearch className="h-5 w-5 text-gray-400" />}
                  />
                  <div className="flex items-center gap-2 rounded-xl border border-desert-stone-light bg-desert-sand/30 px-4 py-3 text-sm text-desert-stone-dark">
                    <IconCompass className="h-4 w-4 text-desert-green" />
                    <span>Current folder:</span>
                    <span className="font-semibold text-desert-green">/zim/{directoryListing?.current_path || ''}</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  {directoryListing?.parent_path !== null && directoryListing && (
                    <button
                      type="button"
                      onClick={() => setDirectoryPath(directoryListing.parent_path || '')}
                      className="inline-flex items-center gap-1 rounded-full border border-desert-stone-light bg-white px-3 py-1.5 text-desert-green hover:bg-desert-sand"
                    >
                      <IconArrowUpLeft className="h-4 w-4" />
                      Up
                    </button>
                  )}
                  {breadcrumbs.map((crumb, index) => (
                    <button
                      key={`${crumb.path}-${index}`}
                      type="button"
                      onClick={() => setDirectoryPath(crumb.path)}
                      className="inline-flex items-center gap-1 rounded-full bg-desert-sand/40 px-3 py-1.5 text-desert-stone-dark hover:bg-desert-sand"
                    >
                      {index > 0 && <IconChevronRight className="h-4 w-4" />}
                      {crumb.label}
                    </button>
                  ))}
                </div>
                <div className="mt-5 space-y-4">
                  {directoryLoading ? (
                    <p className="text-sm text-desert-stone-dark">Loading repository entries...</p>
                  ) : directoryListing?.entries.length ? (
                    directoryListing.entries.map((entry) => (
                      <DirectoryRow
                        key={`${entry.type}-${entry.path}`}
                        entry={entry}
                        onOpen={(next) => setDirectoryPath(next.path)}
                        onDownload={(entryToDownload) =>
                          confirmDownload({
                            title: entryToDownload.inferred_title || entryToDownload.name,
                            url: entryToDownload.url,
                            summary: entryToDownload.description,
                            details: entryToDownload.url,
                          })
                        }
                      />
                    ))
                  ) : (
                    <p className="text-sm text-desert-stone-dark">No entries found in this folder.</p>
                  )}
                </div>
              </div>
            )}

            {mode === 'manual_url' && (
              <div className="mt-6">
                <div className="mb-4 rounded-xl border border-desert-stone-light bg-desert-sand/40 px-4 py-4 text-sm text-desert-stone-dark">
                  Paste a direct `.zim` URL from Kiwix or another trusted mirror. Nomad will validate the link,
                  try to resolve moved Kiwix sources automatically, and then queue the download.
                </div>
                <Input
                  name="manual-zim-url"
                  label="Direct ZIM URL"
                  placeholder="https://download.kiwix.org/zim/.../file.zim"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  className="w-full"
                  leftIcon={<IconLink className="h-5 w-5 text-gray-400" />}
                />
                <div className="mt-4 flex items-center gap-3">
                  <StyledButton
                    icon="IconDownload"
                    onClick={handleManualImport}
                    disabled={!manualUrl.trim() || manualSubmitting || !isOnline}
                  >
                    {manualSubmitting ? 'Queueing...' : 'Import URL'}
                  </StyledButton>
                  <p className="text-sm text-desert-stone-dark">
                    Best for links shared in documentation, issue trackers, or custom mirrors.
                  </p>
                </div>
              </div>
            )}
          </section>

          <ActiveDownloads filetype="zim" withHeader />
        </main>
      </div>
    </SettingsLayout>
  )
}
