export type Row = {
  id: string
  title: string
  link: string
  isRunning: boolean
  lastActivityAt: string
  waiting: boolean
  snippet: string
  unread: boolean
  rc: boolean
  // The window's Remote Control link (claude://claude.ai/code/session_…), '' without Remote Control:
  // it opens the window from the other PC.
  rcLink: string
}

// The windows of another of the user's PCs, as that PC last sent them through the sync server.
export type RemotePc = { pc: string; at: number; rows: Row[] }

declare module 'claude-code' {
  interface PluginState {
    okna: { rows: Row[]; info: string; remote: RemotePc[]; sync: string }
  }
}
