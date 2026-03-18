import classNames from '~/lib/classNames'
import StyledButton from '../StyledButton'
import { router, usePage } from '@inertiajs/react'
import { ChatSession } from '../../../types/chat'
import {
  IconBrain,
  IconChevronDown,
  IconChevronRight,
  IconEdit,
  IconFolder,
  IconFolderPlus,
  IconHome,
  IconMessage,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import { FormEvent, useMemo, useState } from 'react'
import KnowledgeBaseModal from './KnowledgeBaseModal'

interface ChatSidebarProps {
  sessions: ChatSession[]
  folders: string[]
  activeSessionId: string | null
  onSessionSelect: (id: string) => void
  onNewChat: () => void
  onClearHistory: () => void
  onRenameSession: (id: string, title: string) => Promise<void>
  onDeleteSession: (id: string) => Promise<void>
  onCreateFolder: (name: string) => Promise<void>
  onRenameFolder: (currentName: string, nextName: string) => Promise<void>
  onDeleteFolder: (name: string) => Promise<void>
  onMoveSessionToFolder: (sessionId: string, folder: string | null) => Promise<void>
  isInModal?: boolean
}

function sortSessions(sessions: ChatSession[]) {
  return [...sessions].sort((a, b) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    if (orderDiff !== 0) return orderDiff
    return b.timestamp.getTime() - a.timestamp.getTime()
  })
}

export default function ChatSidebar({
  sessions,
  folders,
  activeSessionId,
  onSessionSelect,
  onNewChat,
  onClearHistory,
  onRenameSession,
  onDeleteSession,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveSessionToFolder,
  isInModal = false,
}: ChatSidebarProps) {
  const { aiAssistantName } = usePage<{ aiAssistantName: string }>().props
  const [isKnowledgeBaseModalOpen, setIsKnowledgeBaseModalOpen] = useState(
    () => new URLSearchParams(window.location.search).get('knowledge_base') === 'true'
  )
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState<string | null>(null)
  const [draftSessionTitle, setDraftSessionTitle] = useState('')
  const [draftFolderTitle, setDraftFolderTitle] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderTitle, setNewFolderTitle] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)

  const groupedSessions = useMemo(() => {
    const grouped = new Map<string | null, ChatSession[]>()
    grouped.set(null, [])
    for (const folder of folders) {
      grouped.set(folder, [])
    }

    for (const session of sessions) {
      const key = session.folder && grouped.has(session.folder) ? session.folder : null
      grouped.set(key, [...(grouped.get(key) || []), session])
    }

    return grouped
  }, [folders, sessions])

  function handleCloseKnowledgeBase() {
    setIsKnowledgeBaseModalOpen(false)
    const params = new URLSearchParams(window.location.search)
    if (params.has('knowledge_base')) {
      params.delete('knowledge_base')
      const newUrl = [window.location.pathname, params.toString()].filter(Boolean).join('?')
      window.history.replaceState(window.history.state, '', newUrl)
    }
  }

  async function submitRenameSession() {
    if (!editingSessionId) return
    const nextTitle = draftSessionTitle.trim()
    if (!nextTitle) return
    await onRenameSession(editingSessionId, nextTitle)
    setEditingSessionId(null)
    setDraftSessionTitle('')
  }

  async function submitCreateFolder(e?: FormEvent) {
    e?.preventDefault()
    const name = newFolderTitle.trim()
    if (!name) return
    await onCreateFolder(name)
    setIsCreatingFolder(false)
    setNewFolderTitle('')
  }

  async function submitRenameFolder() {
    if (!editingFolderName) return
    const nextName = draftFolderTitle.trim()
    if (!nextName) return
    await onRenameFolder(editingFolderName, nextName)
    setEditingFolderName(null)
    setDraftFolderTitle('')
  }

  async function handleSessionDrop(sessionId: string, folder: string | null) {
    setDragOverFolder(null)
    await onMoveSessionToFolder(sessionId, folder)
  }

  function renderSession(session: ChatSession) {
    const isActive = activeSessionId === session.id
    const isEditing = editingSessionId === session.id

    return (
      <div
        key={session.id}
        draggable={!isEditing}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', session.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        className={classNames(
          'group rounded-xl border transition-colors',
          isActive
            ? 'border-desert-green bg-desert-green text-white'
            : 'border-transparent bg-white/80 hover:border-desert-stone-light hover:bg-desert-sand/60'
        )}
      >
        <div className="flex items-start gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => onSessionSelect(session.id)}
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
          >
            <IconMessage
              className={classNames(
                'mt-0.5 h-4 w-4 shrink-0',
                isActive ? 'text-white' : 'text-desert-stone-dark'
              )}
            />
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <input
                  autoFocus
                  value={draftSessionTitle}
                  onChange={(e) => setDraftSessionTitle(e.target.value)}
                  onBlur={() => void submitRenameSession()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void submitRenameSession()
                    }
                    if (e.key === 'Escape') {
                      setEditingSessionId(null)
                    }
                  }}
                  className="w-full rounded-md border border-desert-stone-light bg-white px-2 py-1 text-sm text-desert-green outline-none ring-2 ring-desert-green/20"
                />
              ) : (
                <>
                  <div className="truncate text-sm font-medium">{session.title}</div>
                  {session.lastMessage && (
                    <div
                      className={classNames(
                        'mt-0.5 truncate text-xs',
                        isActive ? 'text-white/75' : 'text-desert-stone-dark'
                      )}
                    >
                      {session.lastMessage}
                    </div>
                  )}
                </>
              )}
            </div>
          </button>

          <div
            className={classNames(
              'flex items-center gap-1 transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setEditingSessionId(session.id)
                setDraftSessionTitle(session.title)
              }}
              className={classNames(
                'rounded-md p-1',
                isActive ? 'hover:bg-white/15' : 'hover:bg-desert-stone-light/60'
              )}
              title="Rename chat"
            >
              <IconEdit className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void onDeleteSession(session.id)
              }}
              className={classNames(
                'rounded-md p-1',
                isActive ? 'hover:bg-white/15' : 'hover:bg-desert-stone-light/60'
              )}
              title="Delete chat"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderFolderSection(folder: string | null) {
    const folderSessions = sortSessions(groupedSessions.get(folder) || [])
    const isCollapsed = folder ? collapsedFolders[folder] : false
    const label = folder ?? 'Ungrouped'
    const isActiveDrop = dragOverFolder === label

    return (
      <div
        key={label}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOverFolder(label)
        }}
        onDragLeave={() => {
          if (dragOverFolder === label) {
            setDragOverFolder(null)
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          const sessionId = e.dataTransfer.getData('text/plain')
          if (sessionId) {
            void handleSessionDrop(sessionId, folder)
          }
        }}
        className={classNames(
          'rounded-2xl border px-2 py-2 transition-colors',
          isActiveDrop ? 'border-desert-green bg-desert-green/5' : 'border-desert-stone-light/70 bg-desert-white/80'
        )}
      >
        <div className="flex items-center gap-2 px-2 py-1">
          {folder ? (
            <button
              type="button"
              onClick={() =>
                setCollapsedFolders((prev) => ({ ...prev, [folder]: !prev[folder] }))
              }
              className="rounded-md p-1 hover:bg-desert-sand"
            >
              {isCollapsed ? (
                <IconChevronRight className="h-4 w-4 text-desert-stone-dark" />
              ) : (
                <IconChevronDown className="h-4 w-4 text-desert-stone-dark" />
              )}
            </button>
          ) : (
            <span className="w-6" />
          )}

          <IconFolder className="h-4 w-4 text-desert-stone-dark" />

          {folder && editingFolderName === folder ? (
            <input
              autoFocus
              value={draftFolderTitle}
              onChange={(e) => setDraftFolderTitle(e.target.value)}
              onBlur={() => void submitRenameFolder()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void submitRenameFolder()
                }
                if (e.key === 'Escape') {
                  setEditingFolderName(null)
                }
              }}
              className="min-w-0 flex-1 rounded-md border border-desert-stone-light bg-white px-2 py-1 text-sm text-desert-green outline-none ring-2 ring-desert-green/20"
            />
          ) : (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-desert-green">{label}</div>
              <div className="text-xs text-desert-stone-dark">
                {folderSessions.length} chat{folderSessions.length === 1 ? '' : 's'}
              </div>
            </div>
          )}

          {folder && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setEditingFolderName(folder)
                  setDraftFolderTitle(folder)
                }}
                className="rounded-md p-1 hover:bg-desert-sand"
                title="Rename folder"
              >
                <IconEdit className="h-4 w-4 text-desert-stone-dark" />
              </button>
              <button
                type="button"
                onClick={() => void onDeleteFolder(folder)}
                className="rounded-md p-1 hover:bg-desert-sand"
                title="Delete folder"
              >
                <IconTrash className="h-4 w-4 text-desert-stone-dark" />
              </button>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <div className="mt-2 space-y-2 px-1 pb-1">
            {folderSessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-desert-stone-light px-3 py-3 text-xs text-desert-stone-dark">
                Drag chats here to organize them.
              </div>
            ) : (
              folderSessions.map(renderSession)
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full w-80 flex-col border-r border-gray-200 bg-gray-50">
      <div className="border-b border-gray-200 px-4 py-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onNewChat}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-desert-green px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-desert-green-dark"
          >
            <IconPlus className="h-4 w-4" />
            New Chat
          </button>
          <button
            type="button"
            onClick={() => setIsCreatingFolder((prev) => !prev)}
            className="inline-flex items-center justify-center rounded-xl border border-desert-stone-light bg-white px-3 py-2.5 text-desert-green transition-colors hover:bg-desert-sand"
            title="New folder"
          >
            <IconFolderPlus className="h-4 w-4" />
          </button>
        </div>
        {isCreatingFolder && (
          <form onSubmit={(e) => void submitCreateFolder(e)} className="mt-3 flex gap-2">
            <input
              autoFocus
              value={newFolderTitle}
              onChange={(e) => setNewFolderTitle(e.target.value)}
              placeholder="Folder name"
              className="min-w-0 flex-1 rounded-xl border border-desert-stone-light bg-white px-3 py-2 text-sm text-desert-green outline-none ring-2 ring-transparent focus:ring-desert-green/20"
            />
            <button
              type="submit"
              className="rounded-xl border border-desert-stone-light bg-white px-3 py-2 text-sm text-desert-green hover:bg-desert-sand"
            >
              Add
            </button>
          </form>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {sessions.length === 0 && folders.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-gray-500">No previous chats</div>
        ) : (
          <div className="space-y-3">
            {renderFolderSection(null)}
            {folders.map((folder) => renderFolderSection(folder))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-y-2 border-t border-gray-200 p-4">
        <StyledButton
          onClick={() => {
            if (isInModal) {
              window.open('/chat', '_blank')
            } else {
              router.visit('/home')
            }
          }}
          icon={isInModal ? 'IconExternalLink' : 'IconHome'}
          variant="outline"
          size="sm"
          fullWidth
        >
          {isInModal ? 'Open in New Tab' : 'Back to Home'}
        </StyledButton>
        <StyledButton
          onClick={() => {
            router.visit('/settings/models')
          }}
          icon="IconDatabase"
          variant="primary"
          size="sm"
          fullWidth
        >
          Models & Settings
        </StyledButton>
        <StyledButton
          onClick={() => {
            setIsKnowledgeBaseModalOpen(true)
          }}
          icon="IconBrain"
          variant="primary"
          size="sm"
          fullWidth
        >
          Knowledge Base
        </StyledButton>
        {sessions.length > 0 && (
          <StyledButton
            onClick={onClearHistory}
            icon="IconTrash"
            variant="danger"
            size="sm"
            fullWidth
          >
            Clear History
          </StyledButton>
        )}
      </div>

      {isKnowledgeBaseModalOpen && (
        <KnowledgeBaseModal aiAssistantName={aiAssistantName} onClose={handleCloseKnowledgeBase} />
      )}
    </div>
  )
}
